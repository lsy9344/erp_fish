"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "../../../generated/prisma";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { reconcileLedgerInventoryAdjustments } from "~/features/inventory/adjustment-reconciliation";
import { writeAuditLog } from "~/server/audit";
import { requireStoreAccess } from "~/server/authz";
import { db } from "~/server/db";
import {
  ledgerSelect,
  getTodayStoreLedger,
  getTodayStoreLedgerInTx,
  toLedgerAuditPayload,
  toLedgerCostStepData,
} from "./queries";
import {
  ledgerSalesPaymentSchema,
  ledgerExpenseSchema,
  ledgerPurchaseSchema,
  ledgerSubmitSchema,
  ledgerWorkInfoSchema,
  toFieldErrors,
  type LedgerSalesPaymentInput,
  type LedgerExpensesInput,
  type LedgerPurchasesInput,
  type LedgerSubmitInput,
  type LedgerWorkInfoInput,
} from "./schemas";
import { type LedgerSubmitForReviewResult } from "./review-types";
import { type LedgerCostStepData } from "./types";

type LedgerRecord = Awaited<ReturnType<typeof getTodayStoreLedgerInTx>>;

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
  revalidatePath("/app/reports/monthly");
}

function revalidateLedgerSubmitPaths() {
  revalidatePath("/app/store-entry");
  revalidatePath("/app/store-entry/inventory");
  revalidatePath("/app/store-entry/losses");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/reports/daily");
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

function isEditableLedgerStatus(status: string) {
  return editableLedgerStatuses.some(
    (editableStatus) => editableStatus === status,
  );
}

async function updateEditableDailyLedgerInTx(
  tx: Prisma.TransactionClient,
  ledgerId: string,
  data: Prisma.DailyLedgerUncheckedUpdateManyInput,
) {
  const updated = await tx.dailyLedger.updateMany({
    where: {
      id: ledgerId,
      status: { in: [...editableLedgerStatuses] },
    },
    data,
  });

  if (updated.count !== 1) {
    throw new Error("Ledger is not editable");
  }
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
      status: ledger.status,
      submittedById: ledger.submittedById ?? null,
      submittedAt: ledger.submittedAt?.toISOString() ?? null,
    },
  };
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

export async function submitLedgerForReview(
  input: unknown,
): Promise<ActionResult<LedgerSubmitForReviewResult>> {
  const parsed = parseLedgerSubmitInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const actor = await requireStoreAccess(parsed.data.storeId);

  let result: ActionResult<LedgerSubmitForReviewResult>;

  try {
    result = await db.$transaction<
      ActionResult<LedgerSubmitForReviewResult>
    >(async (tx) => {
      const beforeLedger = await getTodayStoreLedgerInTx(
        tx,
        parsed.data.storeId,
        actor.user.id,
      );

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

      if (beforeLedger.status !== "IN_PROGRESS") {
        return actionError(
          "LEDGER_NOT_EDITABLE",
          "제출할 수 없는 장부 상태입니다.",
        );
      }

      const submittedAt = new Date();
      const updated = await tx.dailyLedger.updateMany({
        where: {
          id: beforeLedger.id,
          status: "IN_PROGRESS",
        },
        data: {
          status: "IN_REVIEW",
          submittedById: actor.user.id,
          submittedAt: submittedAt,
          updatedById: actor.user.id,
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

        return actionError(
          "LEDGER_CONFLICT",
          "장부 상태가 변경됐습니다. 새로고침 후 다시 시도해 주세요.",
        );
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
    });
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
): Promise<ActionResult<LedgerCostStepData>> {
  const parsed = parseLedgerSalesInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const actor = await requireStoreAccess(parsed.data.storeId);

  try {
    const result = await db.$transaction(async (tx) => {
      const beforeLedger = await getTodayStoreLedgerInTx(
        tx,
        parsed.data.storeId,
        actor.user.id,
      );

      if (!isEditableLedgerStatus(beforeLedger.status)) {
        throw new Error("Ledger is not editable");
      }

      await updateEditableDailyLedgerInTx(tx, beforeLedger.id, {
        totalSalesAmount: parsed.data.totalSalesAmount,
        cashAmount: parsed.data.cashAmount,
        cardAmount: parsed.data.cardAmount,
        otherPaymentAmount: parsed.data.otherPaymentAmount,
        updatedById: actor.user.id,
      });

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

      return toLedgerCostStepData(afterLedger);
    });

    revalidateLedgerSalesPaths();

    return actionOk(result);
  } catch (error: unknown) {
    if (isPrismaUniqueError(error)) {
      const current = await getTodayStoreLedger(
        parsed.data.storeId,
        actor.user.id,
      );
      return actionOk(current);
    }

    return mapStoreActionError();
  }
}

export async function saveLedgerExpenses(
  input: unknown,
): Promise<ActionResult<LedgerCostStepData>> {
  const parsed = parseLedgerExpenseInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const actor = await requireStoreAccess(parsed.data.storeId);

  try {
    const result = await db.$transaction(async (tx) => {
      const beforeLedger = await getTodayStoreLedgerInTx(
        tx,
        parsed.data.storeId,
        actor.user.id,
      );

      if (!isEditableLedgerStatus(beforeLedger.status)) {
        throw new Error("Ledger is not editable");
      }

      await updateEditableDailyLedgerInTx(tx, beforeLedger.id, {
        updatedById: actor.user.id,
      });

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

      return toLedgerCostStepData(afterLedger);
    });

    revalidateLedgerSalesPaths();

    return actionOk(result);
  } catch {
    return mapStoreActionError();
  }
}

export async function saveLedgerPurchases(
  input: unknown,
): Promise<ActionResult<LedgerCostStepData>> {
  const parsed = parseLedgerPurchaseInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const actor = await requireStoreAccess(parsed.data.storeId);

  try {
    const result = await db.$transaction(async (tx) => {
      const beforeLedger = await getTodayStoreLedgerInTx(
        tx,
        parsed.data.storeId,
        actor.user.id,
      );

      if (!isEditableLedgerStatus(beforeLedger.status)) {
        throw new Error("Ledger is not editable");
      }

      await updateEditableDailyLedgerInTx(tx, beforeLedger.id, {
        updatedById: actor.user.id,
      });

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

      await tx.ledgerPurchaseItem.deleteMany({
        where: { dailyLedgerId: beforeLedger.id },
      });

      if (parsed.data.purchases.length > 0) {
        await tx.ledgerPurchaseItem.createMany({
          data: parsed.data.purchases.map((purchase) => {
            const standard = standardsById.get(purchase.purchaseStandardId);
            const existing = existingPurchaseItemsById.get(purchase.id);

            if (
              standard?.product.id !== purchase.productId &&
              !isExistingSnapshotPurchase(purchase, existing)
            ) {
              throw new Error("Invalid purchase standard");
            }

            const unitPrice = purchase.unitPrice;
            const quantity = purchase.quantity;
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

            return {
              dailyLedgerId: beforeLedger.id,
              productId: snapshot.productId,
              purchaseStandardId: snapshot.purchaseStandardId,
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

      return toLedgerCostStepData(afterLedger);
    });

    revalidateLedgerSalesPaths();

    return actionOk(result);
  } catch {
    return mapStoreActionError();
  }
}

export async function saveLedgerWorkInfo(
  input: unknown,
): Promise<ActionResult<LedgerCostStepData>> {
  const parsed = parseLedgerWorkInfoInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const actor = await requireStoreAccess(parsed.data.storeId);

  try {
    const result = await db.$transaction(async (tx) => {
      const beforeLedger = await getTodayStoreLedgerInTx(
        tx,
        parsed.data.storeId,
        actor.user.id,
      );

      if (!isEditableLedgerStatus(beforeLedger.status)) {
        throw new Error("Ledger is not editable");
      }

      await updateEditableDailyLedgerInTx(tx, beforeLedger.id, {
        workerCount: parsed.data.workerCount,
        workMemo: parsed.data.workMemo,
        updatedById: actor.user.id,
      });

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

      return toLedgerCostStepData(afterLedger);
    });

    revalidateLedgerSalesPaths();

    return actionOk(result);
  } catch {
    return mapStoreActionError();
  }
}
