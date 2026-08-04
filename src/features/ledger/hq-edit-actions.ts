"use server";

import { z } from "zod";

import type { Prisma } from "../../../generated/prisma";
import {
  reconcileLedgerInventoryAdjustments,
  syncLedgerInventoryPurchasedQuantitiesInTx,
} from "~/features/inventory/adjustment-reconciliation";
import { refreshLedgerInventoryFifoLots } from "~/features/inventory/fifo-lots";
import { resolveValidEmployeeIdsInTx } from "~/features/labor/employees-queries";
import {
  actionError,
  actionOk,
  type ActionConflictValue,
  type ActionResult,
} from "~/lib/action-result";
import { decimalToNumber } from "~/lib/decimal";
import {
  consumeStoredPurchaseQuantity,
  getPurchaseQuantityIdentity,
  validatePurchaseAmount,
} from "~/lib/validation";
import { withLedgerEditContext, writeAuditLog } from "~/server/audit";
import {
  getCorrectionRecordsForLedgerInTx,
  getLatestCorrectionValueMap,
  supersedeCorrectionRecordsInTx,
} from "~/features/corrections/queries";
import {
  applyCorrectionOverlayToLedgerFields,
  applyExpenseRowOverlay,
} from "~/features/corrections/edit-overlay";
import {
  requireLedgerHqEditContext,
  requireHeadquartersStoreScope,
} from "~/server/authz";
import { calculateInventoryAmount } from "~/server/calculations/inventory";
import { db } from "~/server/db";
import {
  revalidateDashboardAndReports,
  revalidateLedgerDetailPath,
  revalidateStoreEntryPaths,
} from "~/server/revalidation";
import {
  getLedgerConflictMetaInTx,
  ledgerConflictErrorFromMeta,
} from "./conflicts";
import {
  ledgerSelect,
  syncEcountImportLineBackPointersInTx,
  toLedgerAuditPayload,
  toLedgerCostStepData,
} from "./queries";
import {
  ledgerExpenseSchema,
  ledgerLaborSchema,
  ledgerPurchaseSchema,
  ledgerSalesPaymentSchema,
  ledgerWorkInfoSchema,
  toFieldErrors,
  type LedgerExpensesInput,
  type LedgerLaborInput,
  type LedgerPurchasesInput,
  type LedgerSalesPaymentInput,
  type LedgerWorkInfoInput,
} from "./schemas";

// WO(2026-06-24) Task 15: 적용 단가 보정 감사 로그 1건의 입력.
type UnitPriceOverrideAudit = {
  ecountImportLineId: string;
  productName: string;
  productSpec: string;
  sourceType: "ECOUNT_UPLOAD";
  sourceUnitPrice: number | null;
  previousUnitPrice: number;
  nextUnitPrice: number;
  reason: string | null;
};
import {
  getEditableLedgerStatusesForActor,
  getLedgerEditBlockReason,
  isLedgerEditableForActor,
  type LedgerEditActorContext,
} from "./status-policy";
import { type LedgerCostStepData } from "./types";

type LedgerRecord = Prisma.DailyLedgerGetPayload<{
  select: typeof ledgerSelect;
}>;

const ledgerIdInputSchema = z.object({
  ledgerId: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "장부를 확인해 주세요.")),
  ledgerUpdatedAt: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "장부 상태를 확인해 주세요.")),
});

const hqEditReasonSchema = z.object({
  reason: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "본사 수정 사유를 입력해 주세요.")
        .max(500, "본사 수정 사유는 500자 이하여야 합니다."),
    ),
});

function parseHqLedgerInput<T>(
  input: unknown,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): ActionResult<
  T & { ledgerId: string; ledgerUpdatedAt: string; reason: string }
> {
  const parsed = schema.safeParse(input);
  const parsedLedgerId = ledgerIdInputSchema.safeParse(input);
  const parsedReason = hqEditReasonSchema.safeParse(input);

  if (!parsed.success || !parsedLedgerId.success || !parsedReason.success) {
    return actionError("VALIDATION_ERROR", "입력값을 확인해 주세요.", {
      ...(!parsed.success ? toFieldErrors(parsed.error) : {}),
      ...(!parsedLedgerId.success ? toFieldErrors(parsedLedgerId.error) : {}),
      ...(!parsedReason.success ? toFieldErrors(parsedReason.error) : {}),
    });
  }

  return actionOk({
    ...parsed.data,
    ledgerId: parsedLedgerId.data.ledgerId,
    ledgerUpdatedAt: parsedLedgerId.data.ledgerUpdatedAt,
    reason: parsedReason.data.reason,
  });
}

function revalidateHqLedgerPaths(ledgerId: string) {
  revalidateLedgerDetailPath(ledgerId);
  revalidateStoreEntryPaths();
  revalidateDashboardAndReports();
}

function mapHqActionError(): ActionResult<never> {
  return actionError(
    "LEDGER_SAVE_FAILED",
    "저장에 실패했습니다. 다시 시도해 주세요.",
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
    return actionError("VALIDATION_ERROR", "입력값을 확인해 주세요.", {
      expenses: ["지출 항목 코드가 등록된 뒤 저장할 수 있습니다."],
    });
  }

  const expenseCodeErrors: Record<string, string[]> = {};

  expenses.forEach((expense, index) => {
    if (!activeExpenseCodeIds.has(expense.ledgerInputCodeId)) {
      expenseCodeErrors[`expenses.${index}.ledgerInputCodeId`] = [
        "활성 지출 항목만 저장할 수 있습니다.",
      ];
    }
  });

  if (Object.keys(expenseCodeErrors).length > 0) {
    return actionError("VALIDATION_ERROR", "입력값을 확인해 주세요.", {
      ...expenseCodeErrors,
    });
  }

  return actionOk(activeExpenseCodeIds);
}

function notFoundError(): ActionResult<never> {
  return actionError("LEDGER_NOT_FOUND", "장부를 찾을 수 없습니다.");
}

type HqLedgerConflictSection =
  | "sales"
  | "expenses"
  | "purchases"
  | "work"
  | "labor";

type HqLedgerConflictInput =
  | (LedgerSalesPaymentInput & { ledgerId: string; ledgerUpdatedAt: string })
  | (LedgerExpensesInput & { ledgerId: string; ledgerUpdatedAt: string })
  | (LedgerPurchasesInput & { ledgerId: string; ledgerUpdatedAt: string })
  | (LedgerWorkInfoInput & { ledgerId: string; ledgerUpdatedAt: string })
  | (LedgerLaborInput & { ledgerId: string; ledgerUpdatedAt: string });

function toHqLedgerServerConflictValues(
  section: HqLedgerConflictSection,
  data: LedgerCostStepData,
): Record<string, ActionConflictValue> {
  switch (section) {
    case "sales":
      // WO-B(2026-06-22): 작성자 표시명은 최초 작성자 보존 정책에 따라 본사 수정에서도
      // 변경하지 않으므로 충돌 후보로 노출하지 않는다.
      return {
        총매출: data.totalSalesAmount,
        "이월 매출": data.carryoverSalesAmount,
        현금: data.cashAmount,
        카드: data.cardAmount,
        "기타 결제수단": data.otherPaymentAmount,
      };
    case "expenses":
      return Object.fromEntries(
        data.expenseItems.map((item, index) => [
          `지출 ${index + 1}`,
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
  }
}

function toHqLedgerClientConflictValues(
  section: HqLedgerConflictSection,
  input: HqLedgerConflictInput,
): Record<string, ActionConflictValue> {
  switch (section) {
    case "sales": {
      const sales = input as LedgerSalesPaymentInput;
      // WO-B(2026-06-22): 작성자 표시명은 최초 작성자 보존 정책에 따라 본사 수정에서도
      // 변경하지 않으므로 충돌 후보로 노출하지 않는다.
      return {
        총매출: sales.totalSalesAmount,
        "이월 매출": sales.carryoverSalesAmount,
        현금: sales.cashAmount,
        카드: sales.cardAmount,
        "기타 결제수단": sales.otherPaymentAmount,
      };
    }
    case "expenses":
      return Object.fromEntries(
        (input as LedgerExpensesInput).expenses.map((item, index) => [
          `지출 ${index + 1}`,
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
  }
}

async function hqConflictError<T = never>(
  tx: Prisma.TransactionClient,
  section: HqLedgerConflictSection,
  input: HqLedgerConflictInput,
): Promise<ActionResult<T>> {
  const [ledger, meta] = await Promise.all([
    getLedgerByIdInTx(tx, input.ledgerId),
    getLedgerConflictMetaInTx(tx, input.ledgerId),
  ]);
  // Conflict payloads can be requested before the normal target-ledger gate (for
  // example, with an invalid token). Never echo a ledger from another store even
  // when the caller's requested store is within their allowed headquarters scope.
  const scopedLedger = ledger?.storeId === input.storeId ? ledger : null;
  const scopedMeta = scopedLedger ? meta : null;

  return ledgerConflictErrorFromMeta<T>({
    meta: scopedMeta,
    ledgerId: input.ledgerId,
    section,
    clientToken: input.ledgerUpdatedAt,
    serverToken:
      scopedLedger?.updatedAt.toISOString() ??
      scopedMeta?.updatedAt.toISOString() ??
      "unknown",
    clientValues: toHqLedgerClientConflictValues(section, input),
    serverValues: scopedLedger
      ? toHqLedgerServerConflictValues(
          section,
          toLedgerCostStepData(scopedLedger),
        )
      : {},
    lastModifiedAt: scopedLedger?.updatedAt.toISOString() ?? "unknown",
    reloadRequired: true,
    hqEditing: true,
  });
}

function notEditableError(status: LedgerRecord["status"]): ActionResult<never> {
  const reason = getLedgerEditBlockReason(status);

  return actionError(reason.code, reason.message);
}

/**
 * DESIGN.md D8: 감사 before/after는 사용자에게 실제 적용된 유효값 기준이다.
 * 시점(직접 저장 전/후)의 활성 정정 overlay를 장부 스냅샷에 입혀서 payload를 만든다.
 * 정정이 없으면 원본 스냅샷 그대로다.
 */
async function toEffectiveLedgerAuditPayloadInTx(
  tx: Prisma.TransactionClient,
  ledger: LedgerRecord,
) {
  const values = getLatestCorrectionValueMap(
    await getCorrectionRecordsForLedgerInTx(tx, ledger.id),
  );
  const overlaidLedger = applyCorrectionOverlayToLedgerFields(
    ledger,
    values.values(),
    { includeDerivedTotal: true },
  );

  return toLedgerAuditPayload({
    ...overlaidLedger,
    ledgerExpenses: applyExpenseRowOverlay(
      ledger.ledgerExpenses,
      ledger.id,
      values.values(),
    ),
  });
}

function ensureTargetLedger(
  ledger: LedgerRecord | null,
  storeId: string,
  actor: LedgerEditActorContext,
): ActionResult<LedgerRecord> {
  if (ledger?.storeId !== storeId) {
    return notFoundError();
  }

  // DESIGN.md D5: HEADQUARTERS_CLOSED는 LEDGER_CLOSED_EDIT 보유 액터 문맥에서만
  // 허용하고, 그 외 상태는 기존 정책을 그대로 따른다.
  if (!isLedgerEditableForActor(ledger.status, actor)) {
    return notEditableError(ledger.status);
  }

  return actionOk(ledger);
}

async function updateEditableDailyLedgerInTx(
  tx: Prisma.TransactionClient,
  ledgerId: string,
  expectedUpdatedAt: Date,
  expectedVersion: number,
  actor: LedgerEditActorContext,
  data: Prisma.DailyLedgerUncheckedUpdateManyInput,
) {
  // DESIGN.md D7: update data에는 status/closedAt/closedById를 절대 넣지 않아
  // 마감 상태와 최초 마감 정보가 보존된다. CAS는 updatedAt·version·편집 가능 상태를
  // 본다. version을 함께 올려 지점장 저장(version CAS)과 하나의 충돌 토큰을 공유한다.
  const updated = await tx.dailyLedger.updateMany({
    where: {
      id: ledgerId,
      status: { in: [...getEditableLedgerStatusesForActor(actor)] },
      updatedAt: expectedUpdatedAt,
      version: expectedVersion,
    },
    data: {
      ...data,
      version: { increment: 1 },
    },
  });

  return updated.count === 1;
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

async function getLedgerByIdInTx(
  tx: Prisma.TransactionClient,
  ledgerId: string,
) {
  return tx.dailyLedger.findUnique({
    where: { id: ledgerId },
    select: ledgerSelect,
  });
}

function parseExpectedUpdatedAt(value: string): Date | null {
  const expectedUpdatedAt = new Date(value);

  return Number.isNaN(expectedUpdatedAt.getTime()) ? null : expectedUpdatedAt;
}

export async function saveHqLedgerSalesPayment(
  input: unknown,
): Promise<ActionResult<LedgerCostStepData>> {
  const parsed = parseHqLedgerInput<LedgerSalesPaymentInput>(
    input,
    ledgerSalesPaymentSchema,
  );

  if (!parsed.ok) {
    return parsed;
  }

  const actor = await requireLedgerHqEditContext();
  const { ledgerId } = parsed.data;
  await requireHeadquartersStoreScope(parsed.data.storeId);
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsed.data.ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return await db.$transaction((tx) =>
      hqConflictError(tx, "sales", parsed.data),
    );
  }

  try {
    const result = await db.$transaction<ActionResult<LedgerCostStepData>>(
      async (tx) => {
        const beforeLedgerResult = ensureTargetLedger(
          await getLedgerByIdInTx(tx, ledgerId),
          parsed.data.storeId,
          actor,
        );

        if (!beforeLedgerResult.ok) {
          return beforeLedgerResult;
        }

        const beforeLedger = beforeLedgerResult.data;
        const updated = await updateEditableDailyLedgerInTx(
          tx,
          ledgerId,
          expectedUpdatedAt,
          parsed.data.version,
          actor,
          {
            totalSalesAmount: parsed.data.totalSalesAmount,
            carryoverSalesAmount: parsed.data.carryoverSalesAmount,
            cashAmount: parsed.data.cashAmount,
            cardAmount: parsed.data.cardAmount,
            otherPaymentAmount: parsed.data.otherPaymentAmount,
            updatedById: actor.user.id,
          },
        );

        if (!updated) {
          return await hqConflictError(tx, "sales", parsed.data);
        }

        const afterLedger = await tx.dailyLedger.findUniqueOrThrow({
          where: { id: ledgerId },
          select: ledgerSelect,
        });

        const beforeAuditPayload =
          await toEffectiveLedgerAuditPayloadInTx(tx, beforeLedger);

        const paymentFieldKeys = [
          "totalSalesAmount",
          "carryoverSalesAmount",
          "cashAmount",
          "cardAmount",
          "otherPaymentAmount",
        ] as const;
        // 총매출은 결제수단 합계에서 파생되는 값이다. 직접 저장의 파생 총매출이
        // 기존 원본과 같으면 결제수단을 저장해도 총매출이 실질적으로 바뀐 것이
        // 아니므로, 폼에 표시하지 않는 총매출 정정을 유지한다. 합계가 달라진
        // 경우에만 직접 저장이 총매출 정정을 의도적으로 대체한다.
        const paymentFieldKeysToSupersede = paymentFieldKeys.filter(
          (fieldKey) =>
            fieldKey !== "totalSalesAmount" ||
            parsed.data.totalSalesAmount !== beforeLedger.totalSalesAmount,
        );

        await supersedeCorrectionRecordsInTx(tx, {
          dailyLedgerId: beforeLedger.id,
          targetTypes: ["PAYMENT_FIELD"],
          targetIds: [beforeLedger.id],
          fieldKeys: paymentFieldKeysToSupersede,
        });

        const afterAuditPayload =
          await toEffectiveLedgerAuditPayloadInTx(tx, afterLedger);

        await writeAuditLog(tx, {
          action: "ledger.hq.sales_payment.updated",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: beforeAuditPayload,
          after: withLedgerEditContext(afterAuditPayload, {
            ledgerStatusAtEdit: beforeLedger.status,
            closedEdit: beforeLedger.status === "HEADQUARTERS_CLOSED",
          }),
          reason: parsed.data.reason,
        });

        return actionOk(toLedgerCostStepData(afterLedger));
      },
    );

    if (result.ok) {
      revalidateHqLedgerPaths(ledgerId);
    }

    return result;
  } catch {
    return mapHqActionError();
  }
}

export async function saveHqLedgerExpenses(
  input: unknown,
): Promise<ActionResult<LedgerCostStepData>> {
  const parsed = parseHqLedgerInput<LedgerExpensesInput>(
    input,
    ledgerExpenseSchema,
  );

  if (!parsed.ok) {
    return parsed;
  }

  const actor = await requireLedgerHqEditContext();
  const { ledgerId } = parsed.data;
  await requireHeadquartersStoreScope(parsed.data.storeId);
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsed.data.ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return await db.$transaction((tx) =>
      hqConflictError(tx, "expenses", parsed.data),
    );
  }

  try {
    const result = await db.$transaction<ActionResult<LedgerCostStepData>>(
      async (tx) => {
        const beforeLedgerResult = ensureTargetLedger(
          await getLedgerByIdInTx(tx, ledgerId),
          parsed.data.storeId,
          actor,
        );

        if (!beforeLedgerResult.ok) {
          return beforeLedgerResult;
        }

        const beforeLedger = beforeLedgerResult.data;
        const expenseCodeValidation = await validateActiveExpenseCodesInTx(
          tx,
          parsed.data.expenses,
        );

        if (!expenseCodeValidation.ok) {
          return expenseCodeValidation;
        }

        const updated = await updateEditableDailyLedgerInTx(
          tx,
          ledgerId,
          expectedUpdatedAt,
          parsed.data.version,
          actor,
          {
            updatedById: actor.user.id,
          },
        );

        if (!updated) {
          return await hqConflictError(tx, "expenses", parsed.data);
        }

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
          where: { id: ledgerId },
          select: ledgerSelect,
        });

        const beforeAuditPayload =
          await toEffectiveLedgerAuditPayloadInTx(tx, beforeLedger);

        await supersedeCorrectionRecordsInTx(tx, {
          dailyLedgerId: beforeLedger.id,
          // 지출 행 목록은 전체 삭제 후 재저장된다. 갱신·삭제된 기존 행의 정정을
          // 모두 대체하되 기존 행 id로 범위를 한정한다.
          targetTypes: ["EXPENSE_ROW"],
          targetIds: beforeLedger.ledgerExpenses.map((expense) => expense.id),
        });

        const afterAuditPayload =
          await toEffectiveLedgerAuditPayloadInTx(tx, afterLedger);

        await writeAuditLog(tx, {
          action: "ledger.hq.expenses.saved",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: beforeAuditPayload,
          after: withLedgerEditContext(afterAuditPayload, {
            ledgerStatusAtEdit: beforeLedger.status,
            closedEdit: beforeLedger.status === "HEADQUARTERS_CLOSED",
          }),
          reason: parsed.data.reason,
        });

        return actionOk(toLedgerCostStepData(afterLedger));
      },
    );

    if (result.ok) {
      revalidateHqLedgerPaths(ledgerId);
    }

    return result;
  } catch {
    return mapHqActionError();
  }
}

export async function saveHqLedgerPurchases(
  input: unknown,
): Promise<ActionResult<LedgerCostStepData>> {
  const parsed = parseHqLedgerInput<LedgerPurchasesInput>(
    input,
    ledgerPurchaseSchema,
  );

  if (!parsed.ok) {
    return parsed;
  }

  const actor = await requireLedgerHqEditContext();
  const { ledgerId } = parsed.data;
  await requireHeadquartersStoreScope(parsed.data.storeId);
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsed.data.ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return await db.$transaction((tx) =>
      hqConflictError(tx, "purchases", parsed.data),
    );
  }

  try {
    const result = await db.$transaction<ActionResult<LedgerCostStepData>>(
      async (tx) => {
        const beforeLedgerResult = ensureTargetLedger(
          await getLedgerByIdInTx(tx, ledgerId),
          parsed.data.storeId,
          actor,
        );

        if (!beforeLedgerResult.ok) {
          return beforeLedgerResult;
        }

        const beforeLedger = beforeLedgerResult.data;
        const existingPurchaseItemsById = new Map(
          beforeLedger.ledgerPurchaseItems.map((item) => [item.id, item]),
        );
        const storedQuantityById = new Map(
          beforeLedger.ledgerPurchaseItems.map((item) => [
            item.id,
            {
              quantity: decimalToNumber(item.quantity),
              identity: getPurchaseQuantityIdentity(item),
            },
          ]),
        );
        const consumedStoredPurchaseIds = new Set<string>();
        const existingEcountPurchaseIds = new Set(
          beforeLedger.ledgerPurchaseItems
            .filter((item) => item.sourceType === "ECOUNT_UPLOAD")
            .map((item) => item.id),
        );
        const incomingExistingIds = new Set(
          parsed.data.purchases
            .map((purchase) => purchase.id)
            .filter((id) => existingPurchaseItemsById.has(id)),
        );
        const missingEcountPurchaseIds = [...existingEcountPurchaseIds].filter(
          (id) => !incomingExistingIds.has(id),
        );

        if (missingEcountPurchaseIds.length > 0) {
          return actionError<LedgerCostStepData>(
            "VALIDATION_ERROR",
            "입력값을 확인해 주세요.",
            {
              purchases: ["이카운트 원본 행은 삭제할 수 없습니다."],
            },
          );
        }

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
          },
        });
        const productsById = new Map(
          products.map((product) => [product.id, product]),
        );
        const purchaseRows = [];
        const unitPriceOverrides: UnitPriceOverrideAudit[] = [];

        for (let index = 0; index < parsed.data.purchases.length; index += 1) {
          const purchase = parsed.data.purchases[index]!;
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

          if (purchase.purchaseStandardId && !standard && !isExistingSnapshot) {
            return actionError<LedgerCostStepData>(
              "VALIDATION_ERROR",
              "입력값을 확인해 주세요.",
              {
                [`purchases.${index}.purchaseStandardId`]: [
                  "참고 단가를 확인해 주세요.",
                ],
              },
            );
          }

          if (
            standard &&
            purchase.productId &&
            standard.product.id !== purchase.productId
          ) {
            return actionError<LedgerCostStepData>(
              "VALIDATION_ERROR",
              "입력값을 확인해 주세요.",
              {
                [`purchases.${index}.purchaseStandardId`]: [
                  "참고 단가와 품목이 일치하지 않습니다.",
                ],
              },
            );
          }

          if (
            purchase.productId &&
            !product &&
            !standard &&
            !isExistingSnapshot
          ) {
            return actionError<LedgerCostStepData>(
              "VALIDATION_ERROR",
              "입력값을 확인해 주세요.",
              {
                [`purchases.${index}.productId`]: ["품목을 확인해 주세요."],
              },
            );
          }

          // WO(2026-06-24) Task 14/15: 본사 보정은 이카운트 원본 행을 직접 바꾸지 않는다.
          // 적용 단가(unitPrice)만 보정 가능하고, 품목/구분/규격/수량/원본 거래처(referenceInfo)
          // 등 원본 식별 정보는 기존 행(existing)에서 그대로 가져온다. 입력값이 달라도 무시한다.
          const isEcountUpload = existing?.sourceType === "ECOUNT_UPLOAD";

          if (purchase.sourceType === "ECOUNT_UPLOAD" && !isEcountUpload) {
            return actionError<LedgerCostStepData>(
              "VALIDATION_ERROR",
              "입력값을 확인해 주세요.",
              {
                [`purchases.${index}.sourceType`]: [
                  "이카운트 업로드 행은 업로드/반영으로만 만들 수 있습니다.",
                ],
              },
            );
          }

          const snapshot = isEcountUpload
            ? {
                productId: existing.productId,
                purchaseStandardId: existing.purchaseStandardId,
                sourceType: existing.sourceType,
                productName: existing.productName,
                productCategory: existing.productCategory,
                productSpec: existing.productSpec,
                referenceInfo: existing.referenceInfo,
              }
            : standard
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
          // 재생성 후 EcountImportLine.ledgerPurchaseItems back-pointer는 별도로 재동기화한다
          // (syncEcountImportLineBackPointersInTx). 권위 있는 링크는
          // LedgerPurchaseItem.ecountImportLineId이다.
          // 수동 행은 기존에 값이 있을 때만 유지된다(없으면 null).
          const ecountImportLineId = existing?.ecountImportLineId ?? null;
          const sourceUnitPrice = isEcountUpload
            ? (existing?.sourceUnitPrice ?? existing?.unitPrice ?? null)
            : (existing?.sourceUnitPrice ?? null);
          // 이카운트 행은 수량도 원본 식별 정보이므로 기존 행에서 가져온다.
          // 그 외 기존 행의 null은 클라이언트가 손대지 않은 레거시 수량을 뜻하며,
          // 현재 장부에 같은 id가 있을 때만 DB 값을 보존한다.
          const quantity = isEcountUpload
            ? decimalToNumber(existing.quantity)
            : purchase.quantity;
          const resolvedQuantity = consumeStoredPurchaseQuantity(
            purchase.id,
            isEcountUpload ? null : quantity,
            purchase,
            storedQuantityById,
            consumedStoredPurchaseIds,
          );

          if (resolvedQuantity === null) {
            return actionError<LedgerCostStepData>(
              "VALIDATION_ERROR",
              "입력값을 확인해 주세요.",
              {
                [`purchases.${index}.quantity`]: [
                  "수량은 0 이상이고 소수점 첫째 자리까지 입력할 수 있습니다.",
                ],
              },
            );
          }
          const amount = calculateInventoryAmount(
            resolvedQuantity,
            purchase.unitPrice,
          );
          const amountResult = validatePurchaseAmount(index, amount);

          if (!amountResult.ok) {
            return actionError<LedgerCostStepData>(
              "VALIDATION_ERROR",
              "입력값을 확인해 주세요.",
              amountResult.fieldErrors,
            );
          }
          const unitPriceChanged = Boolean(
            existing && existing.unitPrice !== purchase.unitPrice,
          );
          const unitPriceUpdatedById = unitPriceChanged
            ? actor.user.id
            : (existing?.unitPriceUpdatedById ?? null);
          const unitPriceUpdatedAt = unitPriceChanged
            ? new Date()
            : (existing?.unitPriceUpdatedAt ?? null);
          // 적용 단가가 바뀌면 본사 수정 사유(parsed.data.reason)를 override 사유로 남긴다.
          // 변경이 없으면 기존 값을 이월한다.
          const unitPriceOverrideReason = unitPriceChanged
            ? (parsed.data.reason ?? existing?.unitPriceOverrideReason ?? null)
            : (existing?.unitPriceOverrideReason ?? null);

          // WO(2026-06-24) Task 15: 적용 단가 보정은 원본 단가 / 변경 전 적용 단가 /
          // 변경 후 적용 단가 / 수정자 / 사유를 구분해 감사 로그에 남긴다.
          if (isEcountUpload && unitPriceChanged && ecountImportLineId) {
            unitPriceOverrides.push({
              ecountImportLineId,
              productName: snapshot.productName,
              productSpec: snapshot.productSpec,
              sourceType: "ECOUNT_UPLOAD",
              sourceUnitPrice,
              previousUnitPrice: existing.unitPrice,
              nextUnitPrice: purchase.unitPrice,
              reason: parsed.data.reason ?? null,
            });
          }

          purchaseRows.push({
            dailyLedgerId: beforeLedger.id,
            productId: snapshot.productId,
            purchaseStandardId: snapshot.purchaseStandardId,
            sourceType: snapshot.sourceType,
            productName: snapshot.productName,
            productCategory: snapshot.productCategory,
            productSpec: snapshot.productSpec,
            unitPrice: purchase.unitPrice,
            quantity: resolvedQuantity,
            amount: amountResult.amount,
            referenceInfo: snapshot.referenceInfo,
            ecountImportLineId,
            sourceUnitPrice,
            unitPriceOverrideReason,
            unitPriceUpdatedById,
            unitPriceUpdatedAt,
            createdById: actor.user.id,
            updatedById: actor.user.id,
          });
        }

        const updated = await updateEditableDailyLedgerInTx(
          tx,
          ledgerId,
          expectedUpdatedAt,
          parsed.data.version,
          actor,
          {
            updatedById: actor.user.id,
          },
        );

        if (!updated) {
          return await hqConflictError(tx, "purchases", parsed.data);
        }

        await tx.ledgerPurchaseItem.deleteMany({
          where: { dailyLedgerId: beforeLedger.id },
        });

        if (purchaseRows.length > 0) {
          await tx.ledgerPurchaseItem.createMany({ data: purchaseRows });
        }

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

        // WO-02(2026-06-22): 본사 매입 수정 후에도 FIFO lot snapshot과 inventoryAmount를 최신화한다.
        await refreshLedgerInventoryFifoLots(tx, beforeLedger.id);

        const afterLedger = await tx.dailyLedger.findUniqueOrThrow({
          where: { id: ledgerId },
          select: ledgerSelect,
        });
        const overrideImportLineIds = [
          ...new Set(
            unitPriceOverrides.map((override) => override.ecountImportLineId),
          ),
        ];
        const newEcountPurchaseItemsByImportLineId = new Map<string, string>();

        if (overrideImportLineIds.length > 0) {
          const newEcountPurchaseItems = await tx.ledgerPurchaseItem.findMany({
            where: {
              dailyLedgerId: beforeLedger.id,
              ecountImportLineId: { in: overrideImportLineIds },
            },
            select: { id: true, ecountImportLineId: true },
          });

          for (const item of newEcountPurchaseItems) {
            if (item.ecountImportLineId) {
              newEcountPurchaseItemsByImportLineId.set(
                item.ecountImportLineId,
                item.id,
              );
            }
          }
        }

        const beforeAuditPayload =
          await toEffectiveLedgerAuditPayloadInTx(tx, beforeLedger);
        const afterAuditPayload =
          await toEffectiveLedgerAuditPayloadInTx(tx, afterLedger);

        await writeAuditLog(tx, {
          action: "ledger.hq.purchases.saved",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: beforeAuditPayload,
          after: withLedgerEditContext(afterAuditPayload, {
            ledgerStatusAtEdit: beforeLedger.status,
            closedEdit: beforeLedger.status === "HEADQUARTERS_CLOSED",
          }),
          reason: parsed.data.reason,
        });

        // WO(2026-06-24) Task 15: 적용 단가 보정 라인마다 원본 단가/변경 전·후 적용 단가/
        // 수정자/사유를 구분해 "이카운트 출고/입고" 기준 감사 로그로 남긴다.
        for (const override of unitPriceOverrides) {
          const targetId = newEcountPurchaseItemsByImportLineId.get(
            override.ecountImportLineId,
          );

          if (!targetId) {
            continue;
          }

          await writeAuditLog(tx, {
            action: "ledger.hq.ecount_unit_price.overridden",
            targetType: "LedgerPurchaseItem",
            targetId,
            actorId: actor.user.id,
            before: {
              productName: override.productName,
              productSpec: override.productSpec,
              sourceType: override.sourceType,
              sourceUnitPrice: override.sourceUnitPrice,
              appliedUnitPrice: override.previousUnitPrice,
            },
            after: {
              productName: override.productName,
              productSpec: override.productSpec,
              sourceType: override.sourceType,
              sourceUnitPrice: override.sourceUnitPrice,
              appliedUnitPrice: override.nextUnitPrice,
            },
            reason: override.reason,
          });
        }

        return actionOk(toLedgerCostStepData(afterLedger));
      },
    );

    if (result.ok) {
      revalidateHqLedgerPaths(ledgerId);
    }

    return result;
  } catch {
    return mapHqActionError();
  }
}

export async function saveHqLedgerWorkInfo(
  input: unknown,
): Promise<ActionResult<LedgerCostStepData>> {
  const parsed = parseHqLedgerInput<LedgerWorkInfoInput>(
    input,
    ledgerWorkInfoSchema,
  );

  if (!parsed.ok) {
    return parsed;
  }

  const actor = await requireLedgerHqEditContext();
  const { ledgerId } = parsed.data;
  await requireHeadquartersStoreScope(parsed.data.storeId);
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsed.data.ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return await db.$transaction((tx) =>
      hqConflictError(tx, "work", parsed.data),
    );
  }

  try {
    const result = await db.$transaction<ActionResult<LedgerCostStepData>>(
      async (tx) => {
        const beforeLedgerResult = ensureTargetLedger(
          await getLedgerByIdInTx(tx, ledgerId),
          parsed.data.storeId,
          actor,
        );

        if (!beforeLedgerResult.ok) {
          return beforeLedgerResult;
        }

        const beforeLedger = beforeLedgerResult.data;
        const updated = await updateEditableDailyLedgerInTx(
          tx,
          ledgerId,
          expectedUpdatedAt,
          parsed.data.version,
          actor,
          {
            workerCount: parsed.data.workerCount,
            workMemo: parsed.data.workMemo,
            updatedById: actor.user.id,
          },
        );

        if (!updated) {
          return await hqConflictError(tx, "work", parsed.data);
        }

        const afterLedger = await tx.dailyLedger.findUniqueOrThrow({
          where: { id: ledgerId },
          select: ledgerSelect,
        });

        const beforeAuditPayload =
          await toEffectiveLedgerAuditPayloadInTx(tx, beforeLedger);

        await supersedeCorrectionRecordsInTx(tx, {
          dailyLedgerId: beforeLedger.id,
          // 근무 저장은 근무인원과 특이사항만 덮어쓴다. 해당 필드 정정만 대체한다.
          targetTypes: ["LEDGER_FIELD"],
          targetIds: [beforeLedger.id],
          fieldKeys: ["workerCount", "workMemo"],
        });

        const afterAuditPayload =
          await toEffectiveLedgerAuditPayloadInTx(tx, afterLedger);

        await writeAuditLog(tx, {
          action: "ledger.hq.work_info.saved",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: beforeAuditPayload,
          after: withLedgerEditContext(afterAuditPayload, {
            ledgerStatusAtEdit: beforeLedger.status,
            closedEdit: beforeLedger.status === "HEADQUARTERS_CLOSED",
          }),
          reason: parsed.data.reason,
        });

        return actionOk(toLedgerCostStepData(afterLedger));
      },
    );

    if (result.ok) {
      revalidateHqLedgerPaths(ledgerId);
    }

    return result;
  } catch {
    return mapHqActionError();
  }
}

export async function saveHqLedgerLaborInfo(
  input: unknown,
): Promise<ActionResult<LedgerCostStepData>> {
  const parsed = parseHqLedgerInput<LedgerLaborInput>(input, ledgerLaborSchema);

  if (!parsed.ok) {
    return parsed;
  }

  const actor = await requireLedgerHqEditContext();
  const { ledgerId } = parsed.data;
  await requireHeadquartersStoreScope(parsed.data.storeId);
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsed.data.ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return await db.$transaction((tx) =>
      hqConflictError(tx, "labor", parsed.data),
    );
  }

  try {
    const result = await db.$transaction<ActionResult<LedgerCostStepData>>(
      async (tx) => {
        const beforeLedgerResult = ensureTargetLedger(
          await getLedgerByIdInTx(tx, ledgerId),
          parsed.data.storeId,
          actor,
        );

        if (!beforeLedgerResult.ok) {
          return beforeLedgerResult;
        }

        const beforeLedger = beforeLedgerResult.data;
        const updated = await updateEditableDailyLedgerInTx(
          tx,
          ledgerId,
          expectedUpdatedAt,
          parsed.data.version,
          actor,
          {
            updatedById: actor.user.id,
          },
        );

        if (!updated) {
          return await hqConflictError(tx, "labor", parsed.data);
        }

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
          where: { id: ledgerId },
          select: ledgerSelect,
        });

        const beforeAuditPayload =
          await toEffectiveLedgerAuditPayloadInTx(tx, beforeLedger);
        const afterAuditPayload =
          await toEffectiveLedgerAuditPayloadInTx(tx, afterLedger);

        await writeAuditLog(tx, {
          action: "ledger.hq.labor.saved",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: beforeAuditPayload,
          after: withLedgerEditContext(afterAuditPayload, {
            ledgerStatusAtEdit: beforeLedger.status,
            closedEdit: beforeLedger.status === "HEADQUARTERS_CLOSED",
          }),
          reason: parsed.data.reason,
        });

        return actionOk(toLedgerCostStepData(afterLedger));
      },
    );

    if (result.ok) {
      revalidateHqLedgerPaths(ledgerId);
    }

    return result;
  } catch {
    return mapHqActionError();
  }
}
