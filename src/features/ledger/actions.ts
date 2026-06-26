"use server";

import { Prisma } from "../../../generated/prisma";
import {
  actionError,
  actionOk,
  type ActionConflictValue,
  type ActionResult,
} from "~/lib/action-result";
import {
  reconcileLedgerInventoryAdjustments,
  syncLedgerInventoryPurchasedQuantitiesInTx,
} from "~/features/inventory/adjustment-reconciliation";
import { refreshLedgerInventoryFifoLots } from "~/features/inventory/fifo-lots";
import { resolveValidEmployeeIdsInTx } from "~/features/labor/employees-queries";
import { syncLedgerLossItemsWithSalesPricePlansInTx } from "~/features/losses/planned-price-sync";
import { writeAuditLog } from "~/server/audit";
import { requireStoreManagerLedgerEditAccess } from "~/server/authz";
import { db } from "~/server/db";
import {
  revalidateDashboardAndReports,
  revalidateStoreEntryPaths,
} from "~/server/revalidation";
import {
  getLedgerConflictMetaInTx,
  ledgerConflictErrorFromMeta,
  type LedgerConflictMeta,
} from "./conflicts";
import { assertStoreManagerClosingDateIsToday } from "./date";
import {
  fillPurchasePlannedUnitPricesInTx,
  getLedgerCostStepDataByIdInTx,
  ledgerSelect,
  getStoreLedger,
  getStoreLedgerInTx,
  syncEcountImportLineBackPointersInTx,
  toLedgerAuditPayload,
  toStoreManagerLedgerCostStepData,
} from "./queries";
import { getStoreEcountPurchaseEditErrors } from "./purchase-edit-policy";
import {
  editableLedgerStatuses,
  getLedgerEditBlockReason,
  isLedgerEditable,
} from "./status-policy";
import {
  ledgerSalesPaymentSchema,
  ledgerExpenseSchema,
  ledgerLaborSchema,
  ledgerPurchaseSchema,
  ledgerStoreAccessSchema,
  ledgerSubmitSchema,
  ledgerWorkInfoSchema,
  toFieldErrors,
  type LedgerStoreAccessInput,
  type LedgerSalesPaymentInput,
  type LedgerExpensesInput,
  type LedgerLaborInput,
  type LedgerPurchasesInput,
  type LedgerSubmitInput,
  type LedgerWorkInfoInput,
} from "./schemas";
import { getLedgerReviewMissingItems } from "./review-validation";
import { type LedgerSubmitForReviewResult } from "./review-types";
import { type StoreManagerLedgerCostStepData } from "./types";

type LedgerRecord = Awaited<ReturnType<typeof getStoreLedgerInTx>>;

function isPrismaUniqueError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function revalidateLedgerSalesPaths() {
  revalidateStoreEntryPaths(["root"]);
  revalidateDashboardAndReports();
}

function revalidateLedgerSubmitPaths() {
  revalidateStoreEntryPaths();
  revalidateDashboardAndReports();
}

// WO-A(2026-06-22): store-manager action entrypoint에서 과거 날짜 저장/제출을 차단한다.
function guardStoreManagerClosingDate<T>(
  closingDate: string,
): ActionResult<T> | null {
  const guard = assertStoreManagerClosingDateIsToday(closingDate);

  if (!guard.ok) {
    return actionError<T>(guard.code, guard.message);
  }

  return null;
}

function parseLedgerSalesInput(
  input: unknown,
): ActionResult<LedgerSalesPaymentInput> {
  const parsed = ledgerSalesPaymentSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function parseLedgerStoreAccessInput(
  input: unknown,
): ActionResult<LedgerStoreAccessInput> {
  const parsed = ledgerStoreAccessSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function parseLedgerExpenseInput(
  input: unknown,
): ActionResult<LedgerExpensesInput> {
  const parsed = ledgerExpenseSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function parseLedgerPurchaseInput(
  input: unknown,
): ActionResult<LedgerPurchasesInput> {
  const parsed = ledgerPurchaseSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function parseLedgerWorkInfoInput(
  input: unknown,
): ActionResult<LedgerWorkInfoInput> {
  const parsed = ledgerWorkInfoSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function parseLedgerLaborInput(input: unknown): ActionResult<LedgerLaborInput> {
  const parsed = ledgerLaborSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function parseLedgerSubmitInput(
  input: unknown,
): ActionResult<LedgerSubmitInput> {
  const parsed = ledgerSubmitSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function mapStoreActionError(): ActionResult<never> {
  return actionError(
    "LEDGER_SAVE_FAILED",
    "저장에 실패했습니다. 다시 시도해 주세요.",
  );
}

class OriginalLedgerBlockedError extends Error {
  constructor(
    readonly code: "LEDGER_CLOSED" | "LEDGER_NOT_EDITABLE",
    message: string,
  ) {
    super(message);
  }
}

function originalLedgerBlockedError(status: string) {
  const reason = getLedgerEditBlockReason(status);

  return new OriginalLedgerBlockedError(reason.code, reason.message);
}

type LedgerConflictSection = Parameters<
  typeof ledgerConflictErrorFromMeta
>[0]["section"];

type StoreLedgerConflictInput =
  | LedgerSalesPaymentInput
  | LedgerExpensesInput
  | LedgerPurchasesInput
  | LedgerWorkInfoInput
  | LedgerLaborInput
  | LedgerSubmitInput;

function toStoreLedgerConflictValues(
  section: LedgerConflictSection,
  data: StoreManagerLedgerCostStepData,
): Record<string, ActionConflictValue> {
  switch (section) {
    case "sales":
      // WO-B(2026-06-22): 작성자 표시명은 최초 작성자 보존 정책에 따라
      // 매출 저장에서 덮어쓰지 않으므로 충돌 후보로 노출하지 않는다.
      return {
        총매출: data.totalSalesAmount,
        현금: data.cashAmount,
        카드: data.cardAmount,
        "기타 결제수단": data.otherPaymentAmount,
      };
    case "expenses":
      return Object.fromEntries(
        data.expenseItems.map((item, index) => [
          `비용 ${index + 1}`,
          `${item.ledgerInputCodeName} ${item.amount}원${item.memo ? ` / ${item.memo}` : ""}`,
        ]),
      );
    case "purchases":
      return Object.fromEntries(
        data.purchaseItems.map((item, index) => [
          `매입 ${index + 1}`,
          `${item.productName} ${item.quantity}개 ${item.amount}원`,
        ]),
      );
    case "work":
      return {
        근무인원: data.workerCount,
        특이사항: data.workMemo,
      };
    case "labor":
      return Object.fromEntries(
        data.laborItems.map((item, index) => [
          `급여 ${index + 1}`,
          `${item.workerName} ${item.amount}원`,
        ]),
      );
    case "review":
      return {
        제출상태: data.status,
        제출시각: data.submittedAt,
      };
    default:
      return {};
  }
}

function toStoreLedgerClientValues(
  section: LedgerConflictSection,
  input: StoreLedgerConflictInput,
): Record<string, ActionConflictValue> {
  switch (section) {
    case "sales": {
      const sales = input as LedgerSalesPaymentInput;
      // WO-B(2026-06-22): 작성자 표시명은 최초 작성자 보존 정책에 따라
      // 매출 저장에서 덮어쓰지 않으므로 충돌 후보로 노출하지 않는다.
      return {
        총매출: sales.totalSalesAmount,
        현금: sales.cashAmount,
        카드: sales.cardAmount,
        "기타 결제수단": sales.otherPaymentAmount,
      };
    }
    case "expenses":
      return Object.fromEntries(
        (input as LedgerExpensesInput).expenses.map((item, index) => [
          `비용 ${index + 1}`,
          `${item.ledgerInputCodeId} ${item.amount}원${item.memo ? ` / ${item.memo}` : ""}`,
        ]),
      );
    case "purchases":
      return Object.fromEntries(
        (input as LedgerPurchasesInput).purchases.map((item, index) => [
          `매입 ${index + 1}`,
          `${item.productName ?? item.productId ?? "품목 미선택"} ${item.quantity}개 ${item.unitPrice}원`,
        ]),
      );
    case "work": {
      const work = input as LedgerWorkInfoInput;
      return {
        근무인원: work.workerCount,
        특이사항: work.workMemo,
      };
    }
    case "labor":
      return Object.fromEntries(
        (input as LedgerLaborInput).labor.map((item, index) => [
          `급여 ${index + 1}`,
          `${item.workerName} ${item.amount}원`,
        ]),
      );
    case "review":
      return { 제출상태: "검토 대기 제출 시도" };
    default:
      return {};
  }
}

async function mapLedgerConflictError(
  section: LedgerConflictSection,
  input: StoreLedgerConflictInput,
): Promise<ActionResult<never>> {
  const snapshot = await db.$transaction(async (tx) => {
    const ledger = await getLedgerCostStepDataByIdInTx(tx, input.ledgerId);
    const meta = await getLedgerConflictMetaInTx(tx, input.ledgerId);

    return {
      ledger,
      meta,
    };
  });
  const meta: LedgerConflictMeta | null = snapshot.meta;

  return ledgerConflictErrorFromMeta({
    meta,
    ledgerId: input.ledgerId,
    section,
    clientToken: input.version,
    clientValues: toStoreLedgerClientValues(section, input),
    serverValues: snapshot.ledger
      ? toStoreLedgerConflictValues(section, snapshot.ledger)
      : {},
    reloadRequired: true,
  });
}

class LedgerPurchaseValidationError extends Error {
  constructor(readonly fieldErrors: Record<string, string[]>) {
    super("LEDGER_PURCHASE_VALIDATION_ERROR");
  }
}

function ledgerPurchaseValidationError(
  index: number,
  field: "productId" | "purchaseStandardId",
  message: string,
) {
  return new LedgerPurchaseValidationError({
    [`purchases.${index}.${field}`]: [message],
  });
}

async function validateActiveExpenseCodesInTx(
  tx: Prisma.TransactionClient,
  expenses: LedgerExpensesInput["expenses"],
): Promise<ActionResult<Set<string>>> {
  const activeExpenseCodes = await tx.ledgerInputCode.findMany({
    where: {
      group: "EXPENSE_ITEM",
      isActive: true,
    },
    select: {
      id: true,
    },
  });
  const activeExpenseCodeIds = new Set(
    activeExpenseCodes.map((code) => code.id),
  );

  if (activeExpenseCodeIds.size === 0) {
    return actionError(
      "VALIDATION_ERROR",
      "비용 항목 코드가 등록된 뒤 저장할 수 있습니다.",
      {
        expenses: ["비용 항목 코드가 등록된 뒤 저장할 수 있습니다."],
      },
    );
  }

  const invalidExpenseIndex = expenses.findIndex(
    (expense) => !activeExpenseCodeIds.has(expense.ledgerInputCodeId),
  );

  if (invalidExpenseIndex !== -1) {
    return actionError("VALIDATION_ERROR", "비용 항목을 확인해 주세요.", {
      [`expenses.${invalidExpenseIndex}.ledgerInputCodeId`]: [
        "활성 비용 항목만 저장할 수 있습니다.",
      ],
    });
  }

  return actionOk(activeExpenseCodeIds);
}

async function updateEditableDailyLedgerInTx(
  tx: Prisma.TransactionClient,
  ledgerId: string,
  version: number,
  data: Prisma.DailyLedgerUncheckedUpdateManyInput,
) {
  const updated = await tx.dailyLedger.updateMany({
    where: {
      id: ledgerId,
      version,
      status: { in: [...editableLedgerStatuses] },
    },
    data: {
      ...data,
      version: { increment: 1 },
    },
  });

  if (updated.count !== 1) {
    throw new Error("LEDGER_CONFLICT");
  }
}

function hasLedgerContextChanged(
  ledger: LedgerRecord,
  input: {
    ledgerId: string;
    version: number;
  },
) {
  return ledger.id !== input.ledgerId || ledger.version !== input.version;
}

function toLedgerSubmitResult(
  ledger: LedgerRecord,
  status: LedgerSubmitForReviewResult["status"],
): LedgerSubmitForReviewResult {
  return {
    status,
    ledger: {
      id: ledger.id,
      storeId: ledger.storeId,
      closingDate: ledger.closingDate.toISOString(),
      version: ledger.version,
      updatedAt: ledger.updatedAt.toISOString(),
      authorDisplayName: ledger.authorDisplayName ?? null,
      status: ledger.status,
      submittedById: ledger.submittedById ?? null,
      submittedAt: ledger.submittedAt?.toISOString() ?? null,
    },
  };
}

async function validateLedgerSubmitRequirementsInTx(
  tx: Prisma.TransactionClient,
  ledger: LedgerRecord,
) {
  const inventoryItems = await tx.ledgerInventoryItem.findMany({
    where: { dailyLedgerId: ledger.id },
    select: {
      currentQuantity: true,
      quantity: true,
      inventoryAmount: true,
    },
  });
  const missingItems = getLedgerReviewMissingItems({
    storeId: ledger.storeId,
    closingDate: ledger.closingDate.toISOString(),
    totalSalesAmount: ledger.totalSalesAmount,
    paymentTotal:
      ledger.cashAmount + ledger.cardAmount + ledger.otherPaymentAmount,
    expenseCount: ledger.ledgerExpenses.length,
    purchaseCount: ledger.ledgerPurchaseItems.length,
    hasInventoryUnavailable: inventoryItems.some(
      (item) =>
        (item.currentQuantity ?? item.quantity) === null ||
        item.inventoryAmount === null,
    ),
    inventoryCount: inventoryItems.length,
    lossCount: ledger._count.ledgerLossItems,
    workerCount: ledger.workerCount,
  }).filter((item) => item.status === "missing");

  if (missingItems.length === 0) {
    return actionOk(null);
  }

  return actionError(
    "VALIDATION_ERROR",
    "필수 입력을 완료한 뒤 제출해 주세요.",
    Object.fromEntries(
      missingItems.map((item) => [item.id, [`${item.label}: ${item.detail}`]]),
    ),
  );
}

function isExistingSnapshotPurchase(
  purchase: LedgerPurchasesInput["purchases"][number],
  existing:
    | { productId: string | null; purchaseStandardId: string | null }
    | undefined,
) {
  return (
    existing?.productId === purchase.productId &&
    existing.purchaseStandardId === purchase.purchaseStandardId
  );
}

// WO(2026-06-25): 3단계 매입 화면에 통합한 판매 예정가(StoreSalesPricePlan)를 매입 저장
// 트랜잭션 안에서 함께 반영한다. sales-plan/actions.ts의 저장 정책(품목당 1행 upsert,
// 빈 값=계획 삭제)과 동일하되, 대상 범위는 "매입 화면에 나타난 품목"으로 한정한다. 매입
// 화면에 없는 품목의 그날 계획은 건드리지 않는다(전체 동기화가 아니라 부분 반영).
async function saveStoreSalesPricePlansForPurchasesInTx(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    businessDate: Date;
    purchases: LedgerPurchasesInput["purchases"];
    actorId: string;
  },
): Promise<void> {
  // 매입 화면에 등장한 품목 행만 계획 반영 대상이다(productId 없는 자유 입력 행은 제외).
  const plannedByProductId = new Map<string, number>();
  const productIdsOnScreen = new Set<string>();
  for (const purchase of input.purchases) {
    if (!purchase.productId) {
      continue;
    }

    productIdsOnScreen.add(purchase.productId);

    // 스키마 superRefine이 같은 품목의 서로 다른 값을 이미 막으므로 첫 값만 채택한다.
    if (
      typeof purchase.plannedUnitPrice === "number" &&
      !plannedByProductId.has(purchase.productId)
    ) {
      plannedByProductId.set(purchase.productId, purchase.plannedUnitPrice);
    }
  }

  if (productIdsOnScreen.size === 0) {
    return;
  }

  // 매입 화면 품목 중 값이 비어 있는 품목(계획 없음)은 그날 기존 계획을 삭제한다.
  const productIdsToDelete = [...productIdsOnScreen].filter(
    (productId) => !plannedByProductId.has(productId),
  );

  if (productIdsToDelete.length > 0) {
    await tx.storeSalesPricePlan.deleteMany({
      where: {
        storeId: input.storeId,
        businessDate: input.businessDate,
        productId: { in: productIdsToDelete },
      },
    });
  }

  if (plannedByProductId.size > 0) {
    // 판매 예정가는 active 품목에만 저장한다(매입 스냅샷 productId가 비활성일 수 있어 방어).
    const activeProducts = await tx.product.findMany({
      where: { id: { in: [...plannedByProductId.keys()] }, isActive: true },
      select: { id: true },
    });

    for (const { id: productId } of activeProducts) {
      const plannedUnitPrice = plannedByProductId.get(productId)!;

      await tx.storeSalesPricePlan.upsert({
        where: {
          storeId_businessDate_productId: {
            storeId: input.storeId,
            businessDate: input.businessDate,
            productId,
          },
        },
        update: {
          plannedUnitPrice,
          updatedById: input.actorId,
        },
        create: {
          storeId: input.storeId,
          businessDate: input.businessDate,
          productId,
          plannedUnitPrice,
          memo: null,
          createdById: input.actorId,
          updatedById: input.actorId,
        },
      });
    }
  }

  await syncLedgerLossItemsWithSalesPricePlansInTx(tx, {
    storeId: input.storeId,
    businessDate: input.businessDate,
    productIds: [...productIdsOnScreen],
    actorId: input.actorId,
  });
}

export async function submitLedgerForReview(
  input: unknown,
): Promise<ActionResult<LedgerSubmitForReviewResult>> {
  const access = parseLedgerStoreAccessInput(input);

  if (!access.ok) {
    return access;
  }

  const actor = await requireStoreManagerLedgerEditAccess(access.data.storeId);

  const parsed = parseLedgerSubmitInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const dateGuard = guardStoreManagerClosingDate<LedgerSubmitForReviewResult>(
    parsed.data.closingDate,
  );

  if (dateGuard) {
    return dateGuard;
  }

  let result: ActionResult<LedgerSubmitForReviewResult>;

  try {
    result = await db.$transaction<ActionResult<LedgerSubmitForReviewResult>>(
      async (tx) => {
        const beforeLedger = await getStoreLedgerInTx(
          tx,
          parsed.data.storeId,
          parsed.data.closingDate,
          actor.user.id,
        );

        if (hasLedgerContextChanged(beforeLedger, parsed.data)) {
          const meta = await getLedgerConflictMetaInTx(tx, beforeLedger.id);
          return ledgerConflictErrorFromMeta<LedgerSubmitForReviewResult>({
            meta,
            ledgerId: parsed.data.ledgerId,
            section: "review",
            clientToken: parsed.data.version,
            clientValues: toStoreLedgerClientValues("review", parsed.data),
            serverValues: toStoreLedgerConflictValues(
              "review",
              toStoreManagerLedgerCostStepData(beforeLedger),
            ),
            reloadRequired: true,
          });
        }

        if (beforeLedger.status === "IN_REVIEW") {
          return actionOk(
            toLedgerSubmitResult(beforeLedger, "already-in-review"),
          );
        }

        if (beforeLedger.status !== "IN_PROGRESS") {
          const reason = getLedgerEditBlockReason(
            beforeLedger.status,
            "submit-review",
          );

          return actionError(reason.code, reason.message);
        }

        const validation = await validateLedgerSubmitRequirementsInTx(
          tx,
          beforeLedger,
        );

        if (!validation.ok) {
          return validation;
        }

        const submittedAt = new Date();
        const updated = await tx.dailyLedger.updateMany({
          where: {
            id: beforeLedger.id,
            version: parsed.data.version,
            status: "IN_PROGRESS",
          },
          data: {
            status: "IN_REVIEW",
            submittedById: actor.user.id,
            submittedAt: submittedAt,
            updatedById: actor.user.id,
            version: { increment: 1 },
          },
        });

        if (updated.count !== 1) {
          const currentLedger = await tx.dailyLedger.findUnique({
            where: { id: beforeLedger.id },
            select: ledgerSelect,
          });

          if (currentLedger?.status === "IN_REVIEW") {
            return actionOk(
              toLedgerSubmitResult(currentLedger, "already-in-review"),
            );
          }

          const meta = await getLedgerConflictMetaInTx(tx, beforeLedger.id);
          return ledgerConflictErrorFromMeta<LedgerSubmitForReviewResult>({
            meta,
            ledgerId: parsed.data.ledgerId,
            section: "review",
            clientToken: parsed.data.version,
            clientValues: toStoreLedgerClientValues("review", parsed.data),
            serverValues: currentLedger
              ? toStoreLedgerConflictValues(
                  "review",
                  toStoreManagerLedgerCostStepData(currentLedger),
                )
              : {},
            reloadRequired: true,
          });
        }

        const afterLedger = await tx.dailyLedger.findUniqueOrThrow({
          where: { id: beforeLedger.id },
          select: ledgerSelect,
        });

        await writeAuditLog(tx, {
          action: "ledger.review.submitted",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: toLedgerAuditPayload(beforeLedger),
          after: toLedgerAuditPayload(afterLedger),
        });

        return actionOk(toLedgerSubmitResult(afterLedger, "submitted"));
      },
    );
  } catch {
    return actionError(
      "LEDGER_SUBMIT_FAILED",
      "제출에 실패했습니다. 다시 시도해 주세요.",
    );
  }

  if (result.ok && result.data.status === "submitted") {
    try {
      revalidateLedgerSubmitPaths();
    } catch {
      // Revalidation runs after commit; keep the committed submit result.
    }
  }

  return result;
}

export async function saveLedgerSalesPayment(
  input: unknown,
): Promise<ActionResult<StoreManagerLedgerCostStepData>> {
  const access = parseLedgerStoreAccessInput(input);

  if (!access.ok) {
    return access;
  }

  const actor = await requireStoreManagerLedgerEditAccess(access.data.storeId);

  const parsed = parseLedgerSalesInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const dateGuard =
    guardStoreManagerClosingDate<StoreManagerLedgerCostStepData>(
      parsed.data.closingDate,
    );

  if (dateGuard) {
    return dateGuard;
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const beforeLedger = await getStoreLedgerInTx(
        tx,
        parsed.data.storeId,
        parsed.data.closingDate,
        actor.user.id,
      );

      if (hasLedgerContextChanged(beforeLedger, parsed.data)) {
        throw new Error("LEDGER_CONFLICT");
      }

      if (!isLedgerEditable(beforeLedger.status)) {
        throw originalLedgerBlockedError(beforeLedger.status);
      }

      // WO-B(2026-06-22): authorDisplayName은 최초 작성자 표시명이다.
      // 이미 값이 있으면 store-manager 매출 저장에서 덮어쓰지 않고 보존한다.
      // 최초 저장(값 없음)에서만 클라이언트 입력값으로 기록한다.
      const existingAuthorDisplayName = beforeLedger.authorDisplayName?.trim();
      const authorDisplayNameToPersist =
        existingAuthorDisplayName && existingAuthorDisplayName.length > 0
          ? existingAuthorDisplayName
          : parsed.data.authorDisplayName;

      await updateEditableDailyLedgerInTx(
        tx,
        beforeLedger.id,
        parsed.data.version,
        {
          authorDisplayName: authorDisplayNameToPersist,
          totalSalesAmount: parsed.data.totalSalesAmount,
          cashAmount: parsed.data.cashAmount,
          cardAmount: parsed.data.cardAmount,
          otherPaymentAmount: parsed.data.otherPaymentAmount,
          updatedById: actor.user.id,
        },
      );

      const afterLedger = await tx.dailyLedger.findUniqueOrThrow({
        where: { id: beforeLedger.id },
        select: ledgerSelect,
      });

      await writeAuditLog(tx, {
        action: "ledger.sales_payment.updated",
        targetType: "DailyLedger",
        targetId: afterLedger.id,
        actorId: actor.user.id,
        before: toLedgerAuditPayload(beforeLedger),
        after: toLedgerAuditPayload(afterLedger),
      });

      return toStoreManagerLedgerCostStepData(afterLedger);
    });

    revalidateLedgerSalesPaths();

    return actionOk(result);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "LEDGER_CONFLICT") {
      return await mapLedgerConflictError("sales", parsed.data);
    }

    if (isPrismaUniqueError(error)) {
      const current = await getStoreLedger(
        parsed.data.storeId,
        parsed.data.closingDate,
        actor.user.id,
      );
      return actionOk(current);
    }

    if (error instanceof OriginalLedgerBlockedError) {
      return actionError(error.code, error.message);
    }

    return mapStoreActionError();
  }
}

export async function saveLedgerExpenses(
  input: unknown,
): Promise<ActionResult<StoreManagerLedgerCostStepData>> {
  const access = parseLedgerStoreAccessInput(input);

  if (!access.ok) {
    return access;
  }

  const actor = await requireStoreManagerLedgerEditAccess(access.data.storeId);

  const parsed = parseLedgerExpenseInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const dateGuard =
    guardStoreManagerClosingDate<StoreManagerLedgerCostStepData>(
      parsed.data.closingDate,
    );

  if (dateGuard) {
    return dateGuard;
  }

  try {
    const result = await db.$transaction<
      ActionResult<StoreManagerLedgerCostStepData>
    >(async (tx) => {
      const beforeLedger = await getStoreLedgerInTx(
        tx,
        parsed.data.storeId,
        parsed.data.closingDate,
        actor.user.id,
      );

      if (hasLedgerContextChanged(beforeLedger, parsed.data)) {
        throw new Error("LEDGER_CONFLICT");
      }

      if (!isLedgerEditable(beforeLedger.status)) {
        throw originalLedgerBlockedError(beforeLedger.status);
      }

      const expenseCodeValidation = await validateActiveExpenseCodesInTx(
        tx,
        parsed.data.expenses,
      );

      if (!expenseCodeValidation.ok) {
        return expenseCodeValidation;
      }

      await updateEditableDailyLedgerInTx(
        tx,
        beforeLedger.id,
        parsed.data.version,
        {
          updatedById: actor.user.id,
        },
      );

      await tx.ledgerExpense.deleteMany({
        where: { dailyLedgerId: beforeLedger.id },
      });

      if (parsed.data.expenses.length > 0) {
        await tx.ledgerExpense.createMany({
          data: parsed.data.expenses.map((expense) => ({
            dailyLedgerId: beforeLedger.id,
            ledgerInputCodeId: expense.ledgerInputCodeId,
            amount: expense.amount,
            memo: expense.memo,
            createdById: actor.user.id,
            updatedById: actor.user.id,
          })),
        });
      }

      const afterLedger = await tx.dailyLedger.findUniqueOrThrow({
        where: { id: beforeLedger.id },
        select: ledgerSelect,
      });

      await writeAuditLog(tx, {
        action: "ledger.expenses.saved",
        targetType: "DailyLedger",
        targetId: afterLedger.id,
        actorId: actor.user.id,
        before: toLedgerAuditPayload(beforeLedger),
        after: toLedgerAuditPayload(afterLedger),
      });

      return actionOk(toStoreManagerLedgerCostStepData(afterLedger));
    });

    if (result.ok) {
      revalidateLedgerSalesPaths();
    }

    return result;
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "LEDGER_CONFLICT") {
      return await mapLedgerConflictError("expenses", parsed.data);
    }

    if (error instanceof OriginalLedgerBlockedError) {
      return actionError(error.code, error.message);
    }

    return mapStoreActionError();
  }
}

export async function saveLedgerPurchases(
  input: unknown,
): Promise<ActionResult<StoreManagerLedgerCostStepData>> {
  const access = parseLedgerStoreAccessInput(input);

  if (!access.ok) {
    return access;
  }

  const actor = await requireStoreManagerLedgerEditAccess(access.data.storeId);

  const parsed = parseLedgerPurchaseInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const dateGuard =
    guardStoreManagerClosingDate<StoreManagerLedgerCostStepData>(
      parsed.data.closingDate,
    );

  if (dateGuard) {
    return dateGuard;
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const beforeLedger = await getStoreLedgerInTx(
        tx,
        parsed.data.storeId,
        parsed.data.closingDate,
        actor.user.id,
      );

      if (hasLedgerContextChanged(beforeLedger, parsed.data)) {
        throw new Error("LEDGER_CONFLICT");
      }

      if (!isLedgerEditable(beforeLedger.status)) {
        throw originalLedgerBlockedError(beforeLedger.status);
      }

      await updateEditableDailyLedgerInTx(
        tx,
        beforeLedger.id,
        parsed.data.version,
        {
          updatedById: actor.user.id,
          lossReviewedById: null,
          lossReviewedAt: null,
        },
      );

      // carryover 행(전일 이월 품목)은 매입 행이 아니라 판매 예정가만 받는 행이다.
      // ledgerPurchaseItem 생성/검증에서는 제외하고, 판매 예정가 저장에만 포함한다.
      const realPurchases = parsed.data.purchases.filter(
        (purchase) => purchase.kind !== "carryover",
      );

      const existingPurchaseItemsById = new Map(
        beforeLedger.ledgerPurchaseItems.map((item) => [item.id, item]),
      );
      const ecountPurchaseEditErrors = getStoreEcountPurchaseEditErrors(
        beforeLedger.ledgerPurchaseItems,
        realPurchases,
      );

      if (Object.keys(ecountPurchaseEditErrors).length > 0) {
        throw new LedgerPurchaseValidationError(ecountPurchaseEditErrors);
      }

      const standardIds = [
        ...new Set(
          realPurchases
            .map((purchase) => purchase.purchaseStandardId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const productIds = [
        ...new Set(
          realPurchases
            .map((purchase) => purchase.productId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const standards = await tx.purchaseStandard.findMany({
        where: {
          id: { in: standardIds },
          isActive: true,
          product: { isActive: true },
        },
        select: {
          id: true,
          standardUnitPrice: true,
          referenceInfo: true,
          product: {
            select: {
              id: true,
              name: true,
              category: true,
              spec: true,
            },
          },
        },
      });
      const standardsById = new Map(
        standards.map((standard) => [standard.id, standard]),
      );
      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          category: true,
          spec: true,
        },
      });
      const productsById = new Map(
        products.map((product) => [product.id, product]),
      );

      await tx.ledgerPurchaseItem.deleteMany({
        where: { dailyLedgerId: beforeLedger.id },
      });

      if (realPurchases.length > 0) {
        await tx.ledgerPurchaseItem.createMany({
          data: realPurchases.map((purchase, index) => {
            const standard = purchase.purchaseStandardId
              ? standardsById.get(purchase.purchaseStandardId)
              : null;
            const product = purchase.productId
              ? productsById.get(purchase.productId)
              : null;
            const existing = existingPurchaseItemsById.get(purchase.id);
            const isExistingSnapshot = isExistingSnapshotPurchase(
              purchase,
              existing,
            );

            if (
              purchase.purchaseStandardId &&
              !standard &&
              !isExistingSnapshot
            ) {
              throw ledgerPurchaseValidationError(
                index,
                "purchaseStandardId",
                "참고 단가를 확인해 주세요.",
              );
            }

            if (
              standard &&
              purchase.productId &&
              standard.product.id !== purchase.productId
            ) {
              throw ledgerPurchaseValidationError(
                index,
                "purchaseStandardId",
                "참고 단가와 품목이 일치하지 않습니다.",
              );
            }

            if (
              purchase.productId &&
              !product &&
              !standard &&
              !isExistingSnapshot
            ) {
              throw ledgerPurchaseValidationError(
                index,
                "productId",
                "품목을 확인해 주세요.",
              );
            }

            const unitPrice = purchase.unitPrice;
            const quantity = purchase.quantity;
            const snapshot = standard
              ? {
                  productId: standard.product.id,
                  purchaseStandardId: standard.id,
                  sourceType: purchase.sourceType,
                  productName: purchase.productName || standard.product.name,
                  productCategory:
                    purchase.productCategory || standard.product.category,
                  productSpec: purchase.productSpec || standard.product.spec,
                  referenceInfo:
                    purchase.referenceInfo ?? standard.referenceInfo,
                }
              : product
                ? {
                    productId: product.id,
                    purchaseStandardId: null,
                    sourceType: purchase.sourceType,
                    productName: purchase.productName || product.name,
                    productCategory:
                      purchase.productCategory || product.category,
                    productSpec: purchase.productSpec || product.spec,
                    referenceInfo: purchase.referenceInfo,
                  }
                : purchase.productId && existing
                  ? {
                      productId: existing.productId,
                      purchaseStandardId: existing.purchaseStandardId,
                      sourceType: purchase.sourceType,
                      productName: purchase.productName || existing.productName,
                      productCategory:
                        purchase.productCategory || existing.productCategory,
                      productSpec: purchase.productSpec || existing.productSpec,
                      referenceInfo: purchase.referenceInfo,
                    }
                  : {
                      productId: null,
                      purchaseStandardId: null,
                      sourceType: purchase.sourceType,
                      productName: purchase.productName,
                      productCategory: purchase.productCategory,
                      productSpec: purchase.productSpec,
                      referenceInfo: purchase.referenceInfo,
                    };

            // 이카운트 원본 추적 + 적용 단가 override 메타 보존.
            // delete+recreate로 행이 재생성되므로 기존 행(existing)에서 source linkage를
            // 이월하고, 적용 단가(unitPrice)가 바뀐 경우에만 override 메타를 갱신한다.
            // NOTE: EcountImportLine.ledgerPurchaseItemId back-pointer는 이 시점에 stale 해진다
            //       (삭제된 행 id를 가리킴). 권위 있는 링크는 LedgerPurchaseItem.ecountImportLineId
            //       이므로 여기서는 EcountImportLine을 갱신하지 않는다.
            const isEcountUpload = existing?.sourceType === "ECOUNT_UPLOAD";
            // 수동 행은 기존에 값이 있을 때만 유지된다(없으면 null).
            const ecountImportLineId = existing?.ecountImportLineId ?? null;
            const sourceUnitPrice = isEcountUpload
              ? (existing?.sourceUnitPrice ?? existing?.unitPrice ?? null)
              : (existing?.sourceUnitPrice ?? null);
            const unitPriceChanged = Boolean(
              existing && existing.unitPrice !== unitPrice,
            );
            const unitPriceUpdatedById = unitPriceChanged
              ? actor.user.id
              : (existing?.unitPriceUpdatedById ?? null);
            const unitPriceUpdatedAt = unitPriceChanged
              ? new Date()
              : (existing?.unitPriceUpdatedAt ?? null);
            const unitPriceOverrideReason =
              existing?.unitPriceOverrideReason ?? null;

            return {
              dailyLedgerId: beforeLedger.id,
              productId: snapshot.productId,
              purchaseStandardId: snapshot.purchaseStandardId,
              sourceType: snapshot.sourceType,
              productName: snapshot.productName,
              productCategory: snapshot.productCategory,
              productSpec: snapshot.productSpec,
              unitPrice,
              quantity,
              amount: unitPrice * quantity,
              referenceInfo: snapshot.referenceInfo,
              ecountImportLineId,
              sourceUnitPrice,
              unitPriceOverrideReason,
              unitPriceUpdatedById,
              unitPriceUpdatedAt,
              createdById: actor.user.id,
              updatedById: actor.user.id,
            };
          }),
        });
      }

      // WO(2026-06-25): 3단계 매입 화면에 통합한 "오늘 팔 가격(예상)"을 매입 저장과 같은
      // 트랜잭션에서 StoreSalesPricePlan에 함께 반영한다(부분 저장 방지). 저장 대상은 productId가
      // 있는 행만이고, 같은 품목은 하루 1개 값으로 정리한다. 같은 품목의 모든 행이 비어 있으면
      // 그 품목의 기존 계획을 삭제한다. 매입 화면에 없는 품목의 계획은 건드리지 않는다.
      await saveStoreSalesPricePlansForPurchasesInTx(tx, {
        storeId: beforeLedger.storeId,
        businessDate: beforeLedger.closingDate,
        purchases: parsed.data.purchases,
        actorId: actor.user.id,
      });

      // WO(2026-06-24) Task 8/9: delete+recreate로 행 id가 바뀌므로 이카운트 원본 행의
      // back-pointer(EcountImportLine.ledgerPurchaseItemId)를 재생성된 장부 행으로 재동기화한다.
      await syncEcountImportLineBackPointersInTx(tx, beforeLedger.id);

      await syncLedgerInventoryPurchasedQuantitiesInTx(
        tx,
        beforeLedger.id,
        actor.user.id,
      );

      await reconcileLedgerInventoryAdjustments(
        tx,
        beforeLedger.id,
        actor.user.id,
      );

      // WO-02(2026-06-22): 매입 저장 후 FIFO lot snapshot과 inventoryAmount를 최신화한다.
      await refreshLedgerInventoryFifoLots(tx, beforeLedger.id);

      const afterLedger = await tx.dailyLedger.findUniqueOrThrow({
        where: { id: beforeLedger.id },
        select: ledgerSelect,
      });

      await writeAuditLog(tx, {
        action: "ledger.purchases.saved",
        targetType: "DailyLedger",
        targetId: afterLedger.id,
        actorId: actor.user.id,
        before: toLedgerAuditPayload(beforeLedger),
        after: toLedgerAuditPayload(afterLedger),
      });

      // 저장 응답도 GET 경로(getStoreLedger)와 동일하게 매입 행에 판매 예정가를 채운다.
      // 그러지 않으면 클라이언트가 plannedUnitPrice=null로 덮어써, 저장 직후 dirty 상태가
      // 남아 "저장하지 않은 변경이 있습니다" 경고가 잘못 뜬다.
      return fillPurchasePlannedUnitPricesInTx(
        tx,
        toStoreManagerLedgerCostStepData(afterLedger),
        afterLedger.storeId,
        afterLedger.closingDate,
        afterLedger.id,
      );
    });

    revalidateLedgerSalesPaths();
    // 매입 저장은 손실 검토 표시를 지우고 재고 기준도 바꾸므로 후속 단계들을 갱신한다.
    revalidateStoreEntryPaths(["losses", "inventory"]);

    return actionOk(result);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "LEDGER_CONFLICT") {
      return await mapLedgerConflictError("purchases", parsed.data);
    }

    if (error instanceof LedgerPurchaseValidationError) {
      return actionError(
        "VALIDATION_ERROR",
        "입력값을 확인해 주세요.",
        error.fieldErrors,
      );
    }

    if (error instanceof OriginalLedgerBlockedError) {
      return actionError(error.code, error.message);
    }

    return mapStoreActionError();
  }
}

export async function saveLedgerWorkInfo(
  input: unknown,
): Promise<ActionResult<StoreManagerLedgerCostStepData>> {
  const access = parseLedgerStoreAccessInput(input);

  if (!access.ok) {
    return access;
  }

  const actor = await requireStoreManagerLedgerEditAccess(access.data.storeId);

  const parsed = parseLedgerWorkInfoInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const dateGuard =
    guardStoreManagerClosingDate<StoreManagerLedgerCostStepData>(
      parsed.data.closingDate,
    );

  if (dateGuard) {
    return dateGuard;
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const beforeLedger = await getStoreLedgerInTx(
        tx,
        parsed.data.storeId,
        parsed.data.closingDate,
        actor.user.id,
      );

      if (hasLedgerContextChanged(beforeLedger, parsed.data)) {
        throw new Error("LEDGER_CONFLICT");
      }

      if (!isLedgerEditable(beforeLedger.status)) {
        throw originalLedgerBlockedError(beforeLedger.status);
      }

      await updateEditableDailyLedgerInTx(
        tx,
        beforeLedger.id,
        parsed.data.version,
        {
          workerCount: parsed.data.workerCount,
          workMemo: parsed.data.workMemo,
          updatedById: actor.user.id,
        },
      );

      const afterLedger = await tx.dailyLedger.findUniqueOrThrow({
        where: { id: beforeLedger.id },
        select: ledgerSelect,
      });

      await writeAuditLog(tx, {
        action: "ledger.work_info.saved",
        targetType: "DailyLedger",
        targetId: afterLedger.id,
        actorId: actor.user.id,
        before: toLedgerAuditPayload(beforeLedger),
        after: toLedgerAuditPayload(afterLedger),
      });

      return toStoreManagerLedgerCostStepData(afterLedger);
    });

    revalidateLedgerSalesPaths();

    return actionOk(result);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "LEDGER_CONFLICT") {
      return await mapLedgerConflictError("work", parsed.data);
    }

    if (error instanceof OriginalLedgerBlockedError) {
      return actionError(error.code, error.message);
    }

    return mapStoreActionError();
  }
}

export async function saveLedgerLaborInfo(
  input: unknown,
): Promise<ActionResult<StoreManagerLedgerCostStepData>> {
  const access = parseLedgerStoreAccessInput(input);

  if (!access.ok) {
    return access;
  }

  const actor = await requireStoreManagerLedgerEditAccess(access.data.storeId);

  const parsed = parseLedgerLaborInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const dateGuard =
    guardStoreManagerClosingDate<StoreManagerLedgerCostStepData>(
      parsed.data.closingDate,
    );

  if (dateGuard) {
    return dateGuard;
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const beforeLedger = await getStoreLedgerInTx(
        tx,
        parsed.data.storeId,
        parsed.data.closingDate,
        actor.user.id,
      );

      if (hasLedgerContextChanged(beforeLedger, parsed.data)) {
        throw new Error("LEDGER_CONFLICT");
      }

      if (!isLedgerEditable(beforeLedger.status)) {
        throw originalLedgerBlockedError(beforeLedger.status);
      }

      await updateEditableDailyLedgerInTx(
        tx,
        beforeLedger.id,
        parsed.data.version,
        {
          updatedById: actor.user.id,
        },
      );

      await tx.ledgerLaborItem.deleteMany({
        where: { dailyLedgerId: beforeLedger.id },
      });

      if (parsed.data.labor.length > 0) {
        // WO-05(2026-06-22): 선택된 employeeId가 실제 직원 마스터에 존재할 때만 연결한다.
        const validEmployeeIds = await resolveValidEmployeeIdsInTx(
          tx,
          parsed.data.labor,
        );

        await tx.ledgerLaborItem.createMany({
          data: parsed.data.labor.map((item) => ({
            dailyLedgerId: beforeLedger.id,
            employeeId:
              item.employeeId && validEmployeeIds.has(item.employeeId)
                ? item.employeeId
                : null,
            workerName: item.workerName,
            amount: item.amount,
            lateMemo: item.lateMemo,
            earlyLeaveMemo: item.earlyLeaveMemo,
            specialMemo: item.specialMemo,
            createdById: actor.user.id,
            updatedById: actor.user.id,
          })),
        });
      }

      const afterLedger = await tx.dailyLedger.findUniqueOrThrow({
        where: { id: beforeLedger.id },
        select: ledgerSelect,
      });

      await writeAuditLog(tx, {
        action: "ledger.labor.saved",
        targetType: "DailyLedger",
        targetId: afterLedger.id,
        actorId: actor.user.id,
        before: toLedgerAuditPayload(beforeLedger),
        after: toLedgerAuditPayload(afterLedger),
      });

      return toStoreManagerLedgerCostStepData(afterLedger);
    });

    revalidateLedgerSalesPaths();

    return actionOk(result);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "LEDGER_CONFLICT") {
      return await mapLedgerConflictError("labor", parsed.data);
    }

    if (error instanceof OriginalLedgerBlockedError) {
      return actionError(error.code, error.message);
    }

    return mapStoreActionError();
  }
}
