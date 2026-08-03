"use server";

import { z } from "zod";

import type { Prisma } from "../../../generated/prisma";
import {
  supersedeActiveCorrectionsForTargetsInTx,
  type ActiveCorrectionSupersedeTarget,
} from "~/features/corrections/actions";
import {
  getActiveCorrectionsForLedgerInTx,
  getLatestCorrectionValueMap,
} from "~/features/corrections/queries";
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
import { writeAuditLog } from "~/server/audit";
import {
  hasLedgerClosedEditAccess,
  requireLedgerHqEditAccess,
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
  getLedgerEditBlockReason,
  isLedgerEditableByHeadquarters,
} from "./status-policy";
import {
  invalidateCarryoverDependentsInTx,
  updateHqLedgerMutationTokenInTx,
} from "./hq-mutation";
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

function toHqLedgerAuditPayload(
  ledger: LedgerRecord,
  metadata: {
    ledgerStatusAtEdit?: LedgerRecord["status"];
    closedEdit?: boolean;
    supersededCorrectionCount?: number;
  } = {},
) {
  const ledgerStatusAtEdit = metadata.ledgerStatusAtEdit ?? ledger.status;
  const closedEdit =
    metadata.closedEdit ?? ledgerStatusAtEdit === "HEADQUARTERS_CLOSED";

  return {
    ...toLedgerAuditPayload(ledger),
    ledgerStatusAtEdit,
    closedEdit,
    hqEditContext: {
      closedLedgerEdit: closedEdit,
      supersededCorrectionCount: metadata.supersededCorrectionCount ?? 0,
    },
  };
}

function getCorrectionPrimitive(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return "value" in value ? value.value : undefined;
}

async function getEffectiveHqLedgerAuditBeforeInTx(
  tx: Prisma.TransactionClient,
  ledger: LedgerRecord,
  section: HqLedgerConflictSection,
) {
  const activeCorrections = await getActiveCorrectionsForLedgerInTx(
    tx,
    ledger.id,
  );
  const latestCorrections = getLatestCorrectionValueMap(activeCorrections);
  const effectiveLedger: LedgerRecord = {
    ...ledger,
    ledgerExpenses: ledger.ledgerExpenses.map((expense) => ({ ...expense })),
  };

  for (const correction of latestCorrections.values()) {
    const value = getCorrectionPrimitive(correction.latestAppliedValue);

    if (
      section === "sales" &&
      correction.targetType === "PAYMENT_FIELD" &&
      correction.targetId === ledger.id &&
      typeof value === "number" &&
      [
        "totalSalesAmount",
        "carryoverSalesAmount",
        "cashAmount",
        "cardAmount",
        "otherPaymentAmount",
      ].includes(correction.fieldKey)
    ) {
      const fieldKey = correction.fieldKey as
        | "totalSalesAmount"
        | "carryoverSalesAmount"
        | "cashAmount"
        | "cardAmount"
        | "otherPaymentAmount";

      effectiveLedger[fieldKey] = value;
      continue;
    }

    if (
      section === "work" &&
      correction.targetType === "LEDGER_FIELD" &&
      correction.targetId === ledger.id
    ) {
      if (
        correction.fieldKey === "workerCount" &&
        (typeof value === "number" || value === null)
      ) {
        effectiveLedger.workerCount = value;
      } else if (
        correction.fieldKey === "workMemo" &&
        (typeof value === "string" || value === null)
      ) {
        effectiveLedger.workMemo = value;
      }

      continue;
    }

    if (section === "expenses" && correction.targetType === "EXPENSE_ROW") {
      const expense = effectiveLedger.ledgerExpenses.find(
        (item) => item.id === correction.targetId,
      );

      if (!expense) {
        continue;
      }

      if (correction.fieldKey === "amount" && typeof value === "number") {
        expense.amount = value;
      } else if (
        correction.fieldKey === "memo" &&
        (typeof value === "string" || value === null)
      ) {
        expense.memo = value;
      }
    }
  }

  return toHqLedgerAuditPayload(effectiveLedger, {
    ledgerStatusAtEdit: ledger.status,
    closedEdit: ledger.status === "HEADQUARTERS_CLOSED",
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

  return ledgerConflictErrorFromMeta<T>({
    meta,
    ledgerId: input.ledgerId,
    section,
    clientToken: input.ledgerUpdatedAt,
    serverToken:
      ledger?.updatedAt.toISOString() ??
      meta?.updatedAt.toISOString() ??
      "unknown",
    clientValues: toHqLedgerClientConflictValues(section, input),
    serverValues: ledger
      ? toHqLedgerServerConflictValues(section, toLedgerCostStepData(ledger))
      : {},
    lastModifiedAt: ledger?.updatedAt.toISOString(),
    reloadRequired: true,
    hqEditing: true,
  });
}

function notEditableError(status: LedgerRecord["status"]): ActionResult<never> {
  const reason = getLedgerEditBlockReason(status);

  return actionError(reason.code, reason.message);
}

function ensureTargetLedger(
  ledger: LedgerRecord | null,
  storeId: string,
  allowClosedEdit: boolean,
): ActionResult<LedgerRecord> {
  if (ledger?.storeId !== storeId) {
    return notFoundError();
  }

  if (!isLedgerEditableByHeadquarters(ledger.status, allowClosedEdit)) {
    return notEditableError(ledger.status);
  }

  return actionOk(ledger);
}

async function getHqLedgerMutationActor() {
  const user = await requireLedgerHqEditAccess();
  const allowClosedEdit = await hasLedgerClosedEditAccess(user.id);

  return { user, allowClosedEdit };
}

function calculatedMetricCorrectionTargets(
  ledgerId: string,
  fieldKeys: Array<"grossMarginRate" | "salesDifference" | "lossAmount">,
): ActiveCorrectionSupersedeTarget[] {
  return fieldKeys.map((fieldKey) => ({
    targetType: "CALCULATED_METRIC",
    targetId: ledgerId,
    fieldKey,
  }));
}

async function integrateHqDirectEditCorrectionsInTx(
  tx: Prisma.TransactionClient,
  input: {
    ledgerId: string;
    actorId: string;
    targets: ActiveCorrectionSupersedeTarget[];
    calculatedMetricFieldKeys?: Array<
      "grossMarginRate" | "salesDifference" | "lossAmount"
    >;
  },
) {
  return supersedeActiveCorrectionsForTargetsInTx(tx, {
    dailyLedgerId: input.ledgerId,
    supersededById: input.actorId,
    targets: [
      ...input.targets,
      ...calculatedMetricCorrectionTargets(
        input.ledgerId,
        input.calculatedMetricFieldKeys ?? [],
      ),
    ],
  });
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

function getChangedPurchaseProductIds(
  before: LedgerRecord["ledgerPurchaseItems"],
  after: LedgerRecord["ledgerPurchaseItems"],
) {
  function fingerprints(items: LedgerRecord["ledgerPurchaseItems"]) {
    const byProductId = new Map<string, string[]>();

    for (const item of items) {
      if (!item.productId) continue;

      const values = byProductId.get(item.productId) ?? [];
      values.push(
        [
          item.sourceType,
          item.purchaseStandardId ?? "",
          item.unitPrice,
          decimalToNumber(item.quantity),
          item.amount,
        ].join(":"),
      );
      byProductId.set(item.productId, values);
    }

    return new Map(
      [...byProductId].map(([productId, values]) => [
        productId,
        values.sort().join("|"),
      ]),
    );
  }

  const beforeByProductId = fingerprints(before);
  const afterByProductId = fingerprints(after);

  return [...new Set([...beforeByProductId.keys(), ...afterByProductId.keys()])]
    .filter(
      (productId) =>
        beforeByProductId.get(productId) !== afterByProductId.get(productId),
    )
    .sort();
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

  const actor = await getHqLedgerMutationActor();
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
          actor.allowClosedEdit,
        );

        if (!beforeLedgerResult.ok) {
          return beforeLedgerResult;
        }

        const beforeLedger = beforeLedgerResult.data;
        const beforeAuditPayload = await getEffectiveHqLedgerAuditBeforeInTx(
          tx,
          beforeLedger,
          "sales",
        );
        const updated = await updateHqLedgerMutationTokenInTx(tx, {
          ledgerId,
          expectedUpdatedAt,
          actorId: actor.user.id,
          allowClosedEdit: actor.allowClosedEdit,
          data: {
            totalSalesAmount: parsed.data.totalSalesAmount,
            carryoverSalesAmount: parsed.data.carryoverSalesAmount,
            cashAmount: parsed.data.cashAmount,
            cardAmount: parsed.data.cardAmount,
            otherPaymentAmount: parsed.data.otherPaymentAmount,
          },
        });

        if (!updated) {
          return await hqConflictError(tx, "sales", parsed.data);
        }

        const afterLedger = await tx.dailyLedger.findUniqueOrThrow({
          where: { id: ledgerId },
          select: ledgerSelect,
        });
        const salesBasisChanged =
          beforeLedger.totalSalesAmount !== parsed.data.totalSalesAmount ||
          beforeLedger.carryoverSalesAmount !==
            parsed.data.carryoverSalesAmount;
        const supersededCorrectionCount =
          await integrateHqDirectEditCorrectionsInTx(tx, {
            ledgerId,
            actorId: actor.user.id,
            targets: [
              "totalSalesAmount",
              "carryoverSalesAmount",
              "cashAmount",
              "cardAmount",
              "otherPaymentAmount",
            ].map((fieldKey) => ({
              targetType: "PAYMENT_FIELD" as const,
              targetId: ledgerId,
              fieldKey,
            })),
            calculatedMetricFieldKeys: salesBasisChanged
              ? ["grossMarginRate", "salesDifference"]
              : [],
          });
        await writeAuditLog(tx, {
          action: "ledger.hq.sales_payment.updated",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: beforeAuditPayload,
          after: toHqLedgerAuditPayload(afterLedger, {
            ledgerStatusAtEdit: beforeLedger.status,
            closedEdit: beforeLedger.status === "HEADQUARTERS_CLOSED",
            supersededCorrectionCount,
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

  const actor = await getHqLedgerMutationActor();
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
          actor.allowClosedEdit,
        );

        if (!beforeLedgerResult.ok) {
          return beforeLedgerResult;
        }

        const beforeLedger = beforeLedgerResult.data;
        const beforeAuditPayload = await getEffectiveHqLedgerAuditBeforeInTx(
          tx,
          beforeLedger,
          "expenses",
        );
        const expenseCodeValidation = await validateActiveExpenseCodesInTx(
          tx,
          parsed.data.expenses,
        );

        if (!expenseCodeValidation.ok) {
          return expenseCodeValidation;
        }

        const updated = await updateHqLedgerMutationTokenInTx(tx, {
          ledgerId,
          expectedUpdatedAt,
          actorId: actor.user.id,
          allowClosedEdit: actor.allowClosedEdit,
        });

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

        const supersededCorrectionCount =
          await integrateHqDirectEditCorrectionsInTx(tx, {
            ledgerId,
            actorId: actor.user.id,
            targets: beforeLedger.ledgerExpenses.map((expense) => ({
              targetType: "EXPENSE_ROW",
              targetId: expense.id,
            })),
          });

        const afterLedger = await tx.dailyLedger.findUniqueOrThrow({
          where: { id: ledgerId },
          select: ledgerSelect,
        });
        await writeAuditLog(tx, {
          action: "ledger.hq.expenses.saved",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: beforeAuditPayload,
          after: toHqLedgerAuditPayload(afterLedger, {
            ledgerStatusAtEdit: beforeLedger.status,
            closedEdit: beforeLedger.status === "HEADQUARTERS_CLOSED",
            supersededCorrectionCount,
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

  const actor = await getHqLedgerMutationActor();
  const { ledgerId } = parsed.data;
  await requireHeadquartersStoreScope(parsed.data.storeId);
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsed.data.ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return await db.$transaction((tx) =>
      hqConflictError(tx, "purchases", parsed.data),
    );
  }

  let invalidatedTargetLedgerIds: string[] = [];

  try {
    const result = await db.$transaction<ActionResult<LedgerCostStepData>>(
      async (tx) => {
        const beforeLedgerResult = ensureTargetLedger(
          await getLedgerByIdInTx(tx, ledgerId),
          parsed.data.storeId,
          actor.allowClosedEdit,
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

        const updated = await updateHqLedgerMutationTokenInTx(tx, {
          ledgerId,
          expectedUpdatedAt,
          actorId: actor.user.id,
          allowClosedEdit: actor.allowClosedEdit,
        });

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
        const fifoAffectedProductIds = getChangedPurchaseProductIds(
          beforeLedger.ledgerPurchaseItems,
          afterLedger.ledgerPurchaseItems,
        );
        const invalidation = await invalidateCarryoverDependentsInTx(tx, {
          sourceLedgerId: beforeLedger.id,
          productIds: fifoAffectedProductIds,
          actorId: actor.user.id,
          reason: parsed.data.reason,
        });
        invalidatedTargetLedgerIds = invalidation.targetLedgerIds;
        const supersededCorrectionCount =
          await integrateHqDirectEditCorrectionsInTx(tx, {
            ledgerId,
            actorId: actor.user.id,
            targets: beforeLedger.ledgerPurchaseItems.map((purchase) => ({
              targetType: "PURCHASE_ROW",
              targetId: purchase.id,
            })),
            calculatedMetricFieldKeys:
              fifoAffectedProductIds.length > 0
                ? ["grossMarginRate", "salesDifference"]
                : [],
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

        await writeAuditLog(tx, {
          action: "ledger.hq.purchases.saved",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: toHqLedgerAuditPayload(beforeLedger),
          after: toHqLedgerAuditPayload(afterLedger, {
            supersededCorrectionCount,
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
              ledgerStatusAtEdit: beforeLedger.status,
              closedEdit: beforeLedger.status === "HEADQUARTERS_CLOSED",
              productName: override.productName,
              productSpec: override.productSpec,
              sourceType: override.sourceType,
              sourceUnitPrice: override.sourceUnitPrice,
              appliedUnitPrice: override.previousUnitPrice,
            },
            after: {
              ledgerStatusAtEdit: beforeLedger.status,
              closedEdit: beforeLedger.status === "HEADQUARTERS_CLOSED",
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
      invalidatedTargetLedgerIds.forEach(revalidateLedgerDetailPath);
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

  const actor = await getHqLedgerMutationActor();
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
          actor.allowClosedEdit,
        );

        if (!beforeLedgerResult.ok) {
          return beforeLedgerResult;
        }

        const beforeLedger = beforeLedgerResult.data;
        const beforeAuditPayload = await getEffectiveHqLedgerAuditBeforeInTx(
          tx,
          beforeLedger,
          "work",
        );
        const updated = await updateHqLedgerMutationTokenInTx(tx, {
          ledgerId,
          expectedUpdatedAt,
          actorId: actor.user.id,
          allowClosedEdit: actor.allowClosedEdit,
          data: {
            workerCount: parsed.data.workerCount,
            workMemo: parsed.data.workMemo,
          },
        });

        if (!updated) {
          return await hqConflictError(tx, "work", parsed.data);
        }

        const afterLedger = await tx.dailyLedger.findUniqueOrThrow({
          where: { id: ledgerId },
          select: ledgerSelect,
        });
        const supersededCorrectionCount =
          await integrateHqDirectEditCorrectionsInTx(tx, {
            ledgerId,
            actorId: actor.user.id,
            targets: ["workerCount", "workMemo"].map((fieldKey) => ({
              targetType: "LEDGER_FIELD" as const,
              targetId: ledgerId,
              fieldKey,
            })),
          });

        await writeAuditLog(tx, {
          action: "ledger.hq.work_info.saved",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: beforeAuditPayload,
          after: toHqLedgerAuditPayload(afterLedger, {
            ledgerStatusAtEdit: beforeLedger.status,
            closedEdit: beforeLedger.status === "HEADQUARTERS_CLOSED",
            supersededCorrectionCount,
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

  const actor = await getHqLedgerMutationActor();
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
          actor.allowClosedEdit,
        );

        if (!beforeLedgerResult.ok) {
          return beforeLedgerResult;
        }

        const beforeLedger = beforeLedgerResult.data;
        const updated = await updateHqLedgerMutationTokenInTx(tx, {
          ledgerId,
          expectedUpdatedAt,
          actorId: actor.user.id,
          allowClosedEdit: actor.allowClosedEdit,
        });

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

        await writeAuditLog(tx, {
          action: "ledger.hq.labor.saved",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: toHqLedgerAuditPayload(beforeLedger),
          after: toHqLedgerAuditPayload(afterLedger),
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
