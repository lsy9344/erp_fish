"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "../../../generated/prisma";
import { reconcileLedgerInventoryAdjustments } from "~/features/inventory/adjustment-reconciliation";
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
  ledgerPurchaseSchema,
  ledgerSalesPaymentSchema,
  ledgerWorkInfoSchema,
  toFieldErrors,
  type LedgerExpensesInput,
  type LedgerPurchasesInput,
  type LedgerSalesPaymentInput,
  type LedgerWorkInfoInput,
} from "./schemas";
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
  revalidatePath(`/app/ledgers/${ledgerId}`);
  revalidatePath("/app/dashboard");
  revalidatePath("/app/store-entry");
  revalidatePath("/app/store-entry/inventory");
  revalidatePath("/app/store-entry/losses");
  revalidatePath("/app/reports/daily");
  revalidatePath("/app/reports/monthly");
}

function mapHqActionError(): ActionResult<never> {
  return actionError(
    "LEDGER_SAVE_FAILED",
    "저장에 실패했습니다. 다시 시도해 주세요.",
  );
}

function notFoundError(): ActionResult<never> {
  return actionError("LEDGER_NOT_FOUND", "장부를 찾을 수 없습니다.");
}

type HqLedgerConflictSection = "sales" | "expenses" | "purchases" | "work";

type HqLedgerConflictInput =
  | (LedgerSalesPaymentInput & { ledgerId: string; ledgerUpdatedAt: string })
  | (LedgerExpensesInput & { ledgerId: string; ledgerUpdatedAt: string })
  | (LedgerPurchasesInput & { ledgerId: string; ledgerUpdatedAt: string })
  | (LedgerWorkInfoInput & { ledgerId: string; ledgerUpdatedAt: string });

function toHqLedgerServerConflictValues(
  section: HqLedgerConflictSection,
  data: LedgerCostStepData,
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
  }
}

function toHqLedgerClientConflictValues(
  section: HqLedgerConflictSection,
  input: HqLedgerConflictInput,
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
    serverToken: ledger?.updatedAt.toISOString() ?? meta?.updatedAt.toISOString() ?? "unknown",
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
  if (status === "HEADQUARTERS_CLOSED") {
    return actionError(
      "LEDGER_CLOSED",
      "본사 마감된 장부는 원본 항목으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.",
    );
  }

  if (status === "HOLIDAY") {
    return actionError(
      "LEDGER_NOT_EDITABLE",
      "휴무 장부는 원본 항목으로 수정할 수 없습니다.",
    );
  }

  return actionError("LEDGER_NOT_EDITABLE", "수정할 수 없는 장부 상태입니다.");
}

function isEditableLedgerStatus(status: LedgerRecord["status"]) {
  return status === "IN_PROGRESS" || status === "IN_REVIEW";
}

function ensureTargetLedger(
  ledger: LedgerRecord | null,
  storeId: string,
): ActionResult<LedgerRecord> {
  if (ledger?.storeId !== storeId) {
    return notFoundError();
  }

  if (!isEditableLedgerStatus(ledger.status)) {
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
      status: { in: ["IN_PROGRESS", "IN_REVIEW"] },
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
        const validExpenseCodeIds = new Set(
          (
            await tx.ledgerInputCode.findMany({
              where: {
                id: {
                  in: parsed.data.expenses.map(
                    (expense) => expense.ledgerInputCodeId,
                  ),
                },
                group: "EXPENSE_ITEM",
                isActive: true,
              },
              select: { id: true },
            })
          ).map((code) => code.id),
        );
        const expenseCodeErrors: Record<string, string[]> = {};

        parsed.data.expenses.forEach((expense, index) => {
          if (!validExpenseCodeIds.has(expense.ledgerInputCodeId)) {
            expenseCodeErrors[`expenses.${index}.ledgerInputCodeId`] = [
              "비용 항목을 확인해 주세요.",
            ];
          }
        });

        if (Object.keys(expenseCodeErrors).length > 0) {
          return actionError<LedgerCostStepData>(
            "VALIDATION_ERROR",
            "입력값을 확인해 주세요.",
            expenseCodeErrors,
          );
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

          if (
            purchase.purchaseStandardId &&
            !standard &&
            !isExistingSnapshot
          ) {
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
                sourceType: "MANUAL" as const,
                productName: standard.product.name,
                productCategory: standard.product.category,
                productSpec: standard.product.spec,
                referenceInfo: standard.referenceInfo,
              }
            : product
              ? {
                  productId: product.id,
                  purchaseStandardId: null,
                  sourceType: "MANUAL" as const,
                  productName: purchase.productName || product.name,
                  productCategory: purchase.productCategory || product.category,
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

        await reconcileLedgerInventoryAdjustments(
          tx,
          beforeLedger.id,
          actor.user.id,
        );

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
