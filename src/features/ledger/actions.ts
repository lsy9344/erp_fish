"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "../../../generated/prisma";
import {
  actionError,
  actionOk,
  type ActionConflictValue,
  type ActionResult,
} from "~/lib/action-result";
import { reconcileLedgerInventoryAdjustments } from "~/features/inventory/adjustment-reconciliation";
import { writeAuditLog } from "~/server/audit";
import { requireStoreAccess } from "~/server/authz";
import { db } from "~/server/db";
import {
  getLedgerConflictMetaInTx,
  ledgerConflictErrorFromMeta,
  type LedgerConflictMeta,
} from "./conflicts";
import {
  getLedgerCostStepDataByIdInTx,
  ledgerSelect,
  getStoreLedger,
  getStoreLedgerInTx,
  toLedgerAuditPayload,
  toStoreManagerLedgerCostStepData,
} from "./queries";
import {
  ledgerSalesPaymentSchema,
  ledgerExpenseSchema,
  ledgerPurchaseSchema,
  ledgerStoreAccessSchema,
  ledgerSubmitSchema,
  ledgerWorkInfoSchema,
  toFieldErrors,
  type LedgerStoreAccessInput,
  type LedgerSalesPaymentInput,
  type LedgerExpensesInput,
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

const ledgerSalesPath = "/app/store-entry";
const dashboardPath = "/app/dashboard";
const editableLedgerStatuses = ["IN_PROGRESS", "IN_REVIEW"] as const;

function revalidateLedgerSalesPaths() {
  revalidatePath(ledgerSalesPath);
  revalidatePath(dashboardPath);
  revalidatePath("/app/reports/daily");
  revalidatePath("/app/reports/comparison");
  revalidatePath("/app/reports/monthly");
}

function revalidateLedgerSubmitPaths() {
  revalidatePath("/app/store-entry");
  revalidatePath("/app/store-entry/inventory");
  revalidatePath("/app/store-entry/losses");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/reports/daily");
  revalidatePath("/app/reports/comparison");
  revalidatePath("/app/reports/monthly");
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
  if (status === "HEADQUARTERS_CLOSED") {
    return new OriginalLedgerBlockedError(
      "LEDGER_CLOSED",
      "본사 마감된 장부는 원본 항목으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.",
    );
  }

  if (status === "HOLIDAY") {
    return new OriginalLedgerBlockedError(
      "LEDGER_NOT_EDITABLE",
      "휴무 장부는 원본 항목으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.",
    );
  }

  return new OriginalLedgerBlockedError(
    "LEDGER_NOT_EDITABLE",
    "수정할 수 없는 장부 상태입니다.",
  );
}

type LedgerConflictSection = Parameters<
  typeof ledgerConflictErrorFromMeta
>[0]["section"];

type StoreLedgerConflictInput =
  | LedgerSalesPaymentInput
  | LedgerExpensesInput
  | LedgerPurchasesInput
  | LedgerWorkInfoInput
  | LedgerSubmitInput;

function toStoreLedgerConflictValues(
  section: LedgerConflictSection,
  data: StoreManagerLedgerCostStepData,
): Record<string, ActionConflictValue> {
  switch (section) {
    case "sales":
      return {
        "작성자 표시명": data.authorDisplayName,
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
      return {
        "작성자 표시명": sales.authorDisplayName,
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

function isEditableLedgerStatus(status: string) {
  return editableLedgerStatuses.some(
    (editableStatus) => editableStatus === status,
  );
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
  existing: StoreManagerLedgerCostStepData["purchaseItems"][number] | undefined,
) {
  return (
    existing?.productId === purchase.productId &&
    existing.purchaseStandardId === purchase.purchaseStandardId
  );
}

export async function submitLedgerForReview(
  input: unknown,
): Promise<ActionResult<LedgerSubmitForReviewResult>> {
  const access = parseLedgerStoreAccessInput(input);

  if (!access.ok) {
    return access;
  }

  const actor = await requireStoreAccess(access.data.storeId);

  const parsed = parseLedgerSubmitInput(input);

  if (!parsed.ok) {
    return parsed;
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

        if (beforeLedger.status === "HEADQUARTERS_CLOSED") {
          return actionError(
            "LEDGER_CLOSED",
            "본사 마감된 장부는 검토 대기로 제출할 수 없습니다.",
          );
        }

        if (beforeLedger.status === "HOLIDAY") {
          return actionError(
            "LEDGER_NOT_EDITABLE",
            "휴무 장부는 검토 대기로 제출할 수 없습니다.",
          );
        }

        if (beforeLedger.status !== "IN_PROGRESS") {
          return actionError(
            "LEDGER_NOT_EDITABLE",
            "제출할 수 없는 장부 상태입니다.",
          );
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

  const actor = await requireStoreAccess(access.data.storeId);

  const parsed = parseLedgerSalesInput(input);

  if (!parsed.ok) {
    return parsed;
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

      if (!isEditableLedgerStatus(beforeLedger.status)) {
        throw originalLedgerBlockedError(beforeLedger.status);
      }

      await updateEditableDailyLedgerInTx(
        tx,
        beforeLedger.id,
        parsed.data.version,
        {
          authorDisplayName: parsed.data.authorDisplayName,
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

  const actor = await requireStoreAccess(access.data.storeId);

  const parsed = parseLedgerExpenseInput(input);

  if (!parsed.ok) {
    return parsed;
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

      if (!isEditableLedgerStatus(beforeLedger.status)) {
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

  const actor = await requireStoreAccess(access.data.storeId);

  const parsed = parseLedgerPurchaseInput(input);

  if (!parsed.ok) {
    return parsed;
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

      if (!isEditableLedgerStatus(beforeLedger.status)) {
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

      const existingPurchaseItemsById = new Map(
        beforeLedger.ledgerPurchaseItems.map((item) => [item.id, item]),
      );
      const standardIds = [
        ...new Set(
          parsed.data.purchases
            .map((purchase) => purchase.purchaseStandardId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const productIds = [
        ...new Set(
          parsed.data.purchases
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
          defaultUnitPrice: true,
        },
      });
      const productsById = new Map(
        products.map((product) => [product.id, product]),
      );

      await tx.ledgerPurchaseItem.deleteMany({
        where: { dailyLedgerId: beforeLedger.id },
      });

      if (parsed.data.purchases.length > 0) {
        await tx.ledgerPurchaseItem.createMany({
          data: parsed.data.purchases.map((purchase, index) => {
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
                "매입 기준을 확인해 주세요.",
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
                "매입 기준과 품목이 일치하지 않습니다.",
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
                  sourceType: "MANUAL" as const,
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
                    sourceType: "MANUAL" as const,
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
                      sourceType: "MANUAL" as const,
                      productName: purchase.productName || existing.productName,
                      productCategory:
                        purchase.productCategory || existing.productCategory,
                      productSpec: purchase.productSpec || existing.productSpec,
                      referenceInfo: purchase.referenceInfo,
                    }
                  : {
                      productId: null,
                      purchaseStandardId: null,
                      sourceType: "MANUAL" as const,
                      productName: purchase.productName,
                      productCategory: purchase.productCategory,
                      productSpec: purchase.productSpec,
                      referenceInfo: purchase.referenceInfo,
                    };

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
              createdById: actor.user.id,
              updatedById: actor.user.id,
            };
          }),
        });
      }

      await reconcileLedgerInventoryAdjustments(
        tx,
        beforeLedger.id,
        actor.user.id,
      );

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

      return toStoreManagerLedgerCostStepData(afterLedger);
    });

    revalidateLedgerSalesPaths();

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

  const actor = await requireStoreAccess(access.data.storeId);

  const parsed = parseLedgerWorkInfoInput(input);

  if (!parsed.ok) {
    return parsed;
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

      if (!isEditableLedgerStatus(beforeLedger.status)) {
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
