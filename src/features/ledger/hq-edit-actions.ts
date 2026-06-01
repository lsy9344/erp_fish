"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "../../../generated/prisma";
import { reconcileLedgerInventoryAdjustments } from "~/features/inventory/adjustment-reconciliation";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireHeadquartersUser } from "~/server/authz";
import { db } from "~/server/db";
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

function parseHqLedgerInput<T>(
  input: unknown,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): ActionResult<T & { ledgerId: string; ledgerUpdatedAt: string }> {
  const parsed = schema.safeParse(input);
  const parsedLedgerId = ledgerIdInputSchema.safeParse(input);

  if (!parsed.success || !parsedLedgerId.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      {
        ...(!parsed.success ? toFieldErrors(parsed.error) : {}),
        ...(!parsedLedgerId.success
          ? toFieldErrors(parsedLedgerId.error)
          : {}),
      },
    );
  }

  return actionOk({
    ...parsed.data,
    ledgerId: parsedLedgerId.data.ledgerId,
    ledgerUpdatedAt: parsedLedgerId.data.ledgerUpdatedAt,
  });
}

function revalidateHqLedgerPaths(ledgerId: string) {
  revalidatePath(`/app/ledgers/${ledgerId}`);
  revalidatePath("/app/dashboard");
  revalidatePath("/app/store-entry");
  revalidatePath("/app/store-entry/inventory");
  revalidatePath("/app/store-entry/losses");
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

function conflictError(): ActionResult<never> {
  return actionError(
    "LEDGER_CONFLICT",
    "장부가 다른 화면에서 변경됐습니다. 새로고침 후 다시 시도해 주세요.",
  );
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
    (!purchase.purchaseStandardId ||
      existing.purchaseStandardId === purchase.purchaseStandardId)
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

  const actor = { user: await requireHeadquartersUser() };
  const { ledgerId } = parsed.data;
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsed.data.ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return conflictError();
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
          return conflictError();
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

  const actor = { user: await requireHeadquartersUser() };
  const { ledgerId } = parsed.data;
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsed.data.ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return conflictError();
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

        const updated = await updateEditableDailyLedgerInTx(tx, ledgerId, expectedUpdatedAt, {
          updatedById: actor.user.id,
        });

        if (!updated) {
          return conflictError();
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

  const actor = { user: await requireHeadquartersUser() };
  const { ledgerId } = parsed.data;
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsed.data.ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return conflictError();
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
              .filter((id) => id.length > 0),
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
        const purchaseRows = [];

        for (let index = 0; index < parsed.data.purchases.length; index += 1) {
          const purchase = parsed.data.purchases[index]!;
          const standard = standardsById.get(purchase.purchaseStandardId);
          const existing = existingPurchaseItemsById.get(purchase.id);

          if (
            standard?.product.id !== purchase.productId &&
            !isExistingSnapshotPurchase(purchase, existing)
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

          const snapshot = standard
            ? {
                productId: standard.product.id,
                purchaseStandardId: standard.id,
                productName: standard.product.name,
                productCategory: standard.product.category,
                productSpec: standard.product.spec,
                referenceInfo: standard.referenceInfo,
              }
            : {
                productId: existing!.productId,
                purchaseStandardId: existing!.purchaseStandardId,
                productName: existing!.productName,
                productCategory: existing!.productCategory,
                productSpec: existing!.productSpec,
                referenceInfo: existing!.referenceInfo,
              };

          purchaseRows.push({
            dailyLedgerId: beforeLedger.id,
            productId: snapshot.productId,
            purchaseStandardId: snapshot.purchaseStandardId,
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
          return conflictError();
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

  const actor = { user: await requireHeadquartersUser() };
  const { ledgerId } = parsed.data;
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsed.data.ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return conflictError();
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
          return conflictError();
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
