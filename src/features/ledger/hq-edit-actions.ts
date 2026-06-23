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
import { writeAuditLog } from "~/server/audit";
import {
  requireLedgerHqEditAccess,
  requireHeadquartersStoreScope,
} from "~/server/authz";
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
import {
  editableLedgerStatuses,
  getLedgerEditBlockReason,
  isLedgerEditable,
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
      expenses: ["비용 항목 코드가 등록된 뒤 저장할 수 있습니다."],
    });
  }

  const expenseCodeErrors: Record<string, string[]> = {};

  expenses.forEach((expense, index) => {
    if (!activeExpenseCodeIds.has(expense.ledgerInputCodeId)) {
      expenseCodeErrors[`expenses.${index}.ledgerInputCodeId`] = [
        "활성 비용 항목만 저장할 수 있습니다.",
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
): ActionResult<LedgerRecord> {
  if (ledger?.storeId !== storeId) {
    return notFoundError();
  }

  if (!isLedgerEditable(ledger.status)) {
    return notEditableError(ledger.status);
  }

  return actionOk(ledger);
}

async function updateEditableDailyLedgerInTx(
  tx: Prisma.TransactionClient,
  ledgerId: string,
  expectedUpdatedAt: Date,
  data: Prisma.DailyLedgerUncheckedUpdateManyInput,
) {
  const updated = await tx.dailyLedger.updateMany({
    where: {
      id: ledgerId,
      status: { in: [...editableLedgerStatuses] },
      updatedAt: expectedUpdatedAt,
    },
    data,
  });

  return updated.count === 1;
}

function isExistingSnapshotPurchase(
  purchase: LedgerPurchasesInput["purchases"][number],
  existing: LedgerCostStepData["purchaseItems"][number] | undefined,
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

  const actor = { user: await requireLedgerHqEditAccess() };
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
        );

        if (!beforeLedgerResult.ok) {
          return beforeLedgerResult;
        }

        const beforeLedger = beforeLedgerResult.data;
        const updated = await updateEditableDailyLedgerInTx(
          tx,
          ledgerId,
          expectedUpdatedAt,
          {
            totalSalesAmount: parsed.data.totalSalesAmount,
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

        await writeAuditLog(tx, {
          action: "ledger.hq.sales_payment.updated",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: toLedgerAuditPayload(beforeLedger),
          after: toLedgerAuditPayload(afterLedger),
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

  const actor = { user: await requireLedgerHqEditAccess() };
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

        await writeAuditLog(tx, {
          action: "ledger.hq.expenses.saved",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: toLedgerAuditPayload(beforeLedger),
          after: toLedgerAuditPayload(afterLedger),
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

  const actor = { user: await requireLedgerHqEditAccess() };
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
        );

        if (!beforeLedgerResult.ok) {
          return beforeLedgerResult;
        }

        const beforeLedger = beforeLedgerResult.data;
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
        const purchaseRows = [];

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
                  "매입 기준을 확인해 주세요.",
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
                  "매입 기준과 품목이 일치하지 않습니다.",
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

          const snapshot = standard
            ? {
                productId: standard.product.id,
                purchaseStandardId: standard.id,
                sourceType: purchase.sourceType,
                productName: purchase.productName || standard.product.name,
                productCategory:
                  purchase.productCategory || standard.product.category,
                productSpec: purchase.productSpec || standard.product.spec,
                referenceInfo: purchase.referenceInfo ?? standard.referenceInfo,
              }
            : product
              ? {
                  productId: product.id,
                  purchaseStandardId: null,
                  sourceType: purchase.sourceType,
                  productName: purchase.productName || product.name,
                  productCategory: purchase.productCategory || product.category,
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

          purchaseRows.push({
            dailyLedgerId: beforeLedger.id,
            productId: snapshot.productId,
            purchaseStandardId: snapshot.purchaseStandardId,
            sourceType: snapshot.sourceType,
            productName: snapshot.productName,
            productCategory: snapshot.productCategory,
            productSpec: snapshot.productSpec,
            unitPrice: purchase.unitPrice,
            quantity: purchase.quantity,
            amount: purchase.unitPrice * purchase.quantity,
            referenceInfo: snapshot.referenceInfo,
            createdById: actor.user.id,
            updatedById: actor.user.id,
          });
        }

        const updated = await updateEditableDailyLedgerInTx(
          tx,
          ledgerId,
          expectedUpdatedAt,
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

        await writeAuditLog(tx, {
          action: "ledger.hq.purchases.saved",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: toLedgerAuditPayload(beforeLedger),
          after: toLedgerAuditPayload(afterLedger),
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

  const actor = { user: await requireLedgerHqEditAccess() };
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
        );

        if (!beforeLedgerResult.ok) {
          return beforeLedgerResult;
        }

        const beforeLedger = beforeLedgerResult.data;
        const updated = await updateEditableDailyLedgerInTx(
          tx,
          ledgerId,
          expectedUpdatedAt,
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

        await writeAuditLog(tx, {
          action: "ledger.hq.work_info.saved",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: toLedgerAuditPayload(beforeLedger),
          after: toLedgerAuditPayload(afterLedger),
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

  const actor = { user: await requireLedgerHqEditAccess() };
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
        );

        if (!beforeLedgerResult.ok) {
          return beforeLedgerResult;
        }

        const beforeLedger = beforeLedgerResult.data;
        const updated = await updateEditableDailyLedgerInTx(
          tx,
          ledgerId,
          expectedUpdatedAt,
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

        await writeAuditLog(tx, {
          action: "ledger.hq.labor.saved",
          targetType: "DailyLedger",
          targetId: afterLedger.id,
          actorId: actor.user.id,
          before: toLedgerAuditPayload(beforeLedger),
          after: toLedgerAuditPayload(afterLedger),
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
