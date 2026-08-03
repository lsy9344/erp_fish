import type { CorrectionAppliedValue } from "../corrections/types.ts";
import type { InventoryStepData } from "../inventory/types.ts";
import type { LossStepData } from "../losses/types.ts";
import type { LedgerCostStepData } from "./types.ts";

type CorrectionValueResult =
  | { found: false }
  | { found: true; value: number | string | null };

function getCorrectionValue(
  corrections: Iterable<CorrectionAppliedValue>,
  targetType: CorrectionAppliedValue["targetType"],
  targetId: string,
  fieldKey: string,
  kind: "money" | "quantity" | "text",
): CorrectionValueResult {
  for (const correction of corrections) {
    if (
      correction.targetType !== targetType ||
      correction.targetId !== targetId ||
      correction.fieldKey !== fieldKey
    ) {
      continue;
    }

    const appliedValue = correction.latestAppliedValue;

    if (
      !appliedValue ||
      typeof appliedValue !== "object" ||
      Array.isArray(appliedValue) ||
      appliedValue.kind !== kind ||
      !("value" in appliedValue)
    ) {
      return { found: false };
    }

    const value = appliedValue.value;

    if (kind === "text") {
      return value === null || typeof value === "string"
        ? { found: true, value }
        : { found: false };
    }

    return typeof value === "number" && Number.isFinite(value)
      ? { found: true, value }
      : { found: false };
  }

  return { found: false };
}

function correctedNumber(
  corrections: Iterable<CorrectionAppliedValue>,
  targetType: CorrectionAppliedValue["targetType"],
  targetId: string,
  fieldKey: string,
  kind: "money" | "quantity",
  fallback: number,
) {
  const result = getCorrectionValue(
    corrections,
    targetType,
    targetId,
    fieldKey,
    kind,
  );

  return result.found && typeof result.value === "number"
    ? result.value
    : fallback;
}

function correctedNullableText(
  corrections: Iterable<CorrectionAppliedValue>,
  targetType: CorrectionAppliedValue["targetType"],
  targetId: string,
  fieldKey: string,
  fallback: string | null,
) {
  const result = getCorrectionValue(
    corrections,
    targetType,
    targetId,
    fieldKey,
    "text",
  );

  return result.found ? (result.value as string | null) : fallback;
}

export function applyActiveCorrectionsToLedgerEditData(
  ledger: LedgerCostStepData,
  corrections: Iterable<CorrectionAppliedValue>,
): LedgerCostStepData {
  const activeCorrections = [...corrections];
  const expenseItems = ledger.expenseItems.map((item) => ({
    ...item,
    amount: correctedNumber(
      activeCorrections,
      "EXPENSE_ROW",
      item.id,
      "amount",
      "money",
      item.amount,
    ),
    memo: correctedNullableText(
      activeCorrections,
      "EXPENSE_ROW",
      item.id,
      "memo",
      item.memo,
    ),
  }));
  const expenseTotal = expenseItems.reduce((sum, item) => sum + item.amount, 0);
  const totalSalesAmount = correctedNumber(
    activeCorrections,
    "PAYMENT_FIELD",
    ledger.id,
    "totalSalesAmount",
    "money",
    ledger.totalSalesAmount,
  );
  const carryoverSalesAmount = correctedNumber(
    activeCorrections,
    "PAYMENT_FIELD",
    ledger.id,
    "carryoverSalesAmount",
    "money",
    ledger.carryoverSalesAmount,
  );
  const cashAmount = correctedNumber(
    activeCorrections,
    "PAYMENT_FIELD",
    ledger.id,
    "cashAmount",
    "money",
    ledger.cashAmount,
  );
  const cardAmount = correctedNumber(
    activeCorrections,
    "PAYMENT_FIELD",
    ledger.id,
    "cardAmount",
    "money",
    ledger.cardAmount,
  );
  const otherPaymentAmount = correctedNumber(
    activeCorrections,
    "PAYMENT_FIELD",
    ledger.id,
    "otherPaymentAmount",
    "money",
    ledger.otherPaymentAmount,
  );
  const workerCountResult = getCorrectionValue(
    activeCorrections,
    "LEDGER_FIELD",
    ledger.id,
    "workerCount",
    "quantity",
  );
  const workerCount =
    workerCountResult.found && typeof workerCountResult.value === "number"
      ? workerCountResult.value
      : ledger.workerCount;
  const operatingSalesAmount = totalSalesAmount + carryoverSalesAmount;

  return {
    ...ledger,
    totalSalesAmount,
    carryoverSalesAmount,
    operatingSalesAmount,
    cashAmount,
    cardAmount,
    otherPaymentAmount,
    paymentDifferenceAmount:
      totalSalesAmount -
      cashAmount -
      cardAmount -
      otherPaymentAmount -
      expenseTotal,
    workerCount,
    workMemo: correctedNullableText(
      activeCorrections,
      "LEDGER_FIELD",
      ledger.id,
      "workMemo",
      ledger.workMemo,
    ),
    expenseItems,
    expenseTotal,
    grossProfit: operatingSalesAmount - expenseTotal,
    productivity:
      workerCount === null || workerCount === 0
        ? null
        : operatingSalesAmount / workerCount,
  };
}

export function applyActiveCorrectionsToInventoryEditData(
  data: InventoryStepData,
  corrections: Iterable<CorrectionAppliedValue>,
): InventoryStepData {
  const activeCorrections = [...corrections];

  return {
    ...data,
    items: data.items.map((item) => {
      const currentQuantityResult = getCorrectionValue(
        activeCorrections,
        "INVENTORY_ROW",
        item.id,
        "currentQuantity",
        "quantity",
      );
      const quantityResult = getCorrectionValue(
        activeCorrections,
        "INVENTORY_ROW",
        item.id,
        "quantity",
        "quantity",
      );
      const currentQuantity =
        currentQuantityResult.found &&
        typeof currentQuantityResult.value === "number"
          ? currentQuantityResult.value
          : item.currentQuantity;
      const quantity =
        quantityResult.found && typeof quantityResult.value === "number"
          ? quantityResult.value
          : item.quantity;

      return {
        ...item,
        currentQuantity,
        quantity,
      };
    }),
  };
}

export function applyActiveCorrectionsToLossEditData(
  data: LossStepData,
  corrections: Iterable<CorrectionAppliedValue>,
): LossStepData {
  const activeCorrections = [...corrections];
  const lossItems = data.lossItems.map((item) => ({
    ...item,
    quantity: correctedNumber(
      activeCorrections,
      "LOSS_ROW",
      item.id,
      "quantity",
      "quantity",
      item.quantity,
    ),
    amount: correctedNumber(
      activeCorrections,
      "LOSS_ROW",
      item.id,
      "amount",
      "money",
      item.amount,
    ),
    reason:
      correctedNullableText(
        activeCorrections,
        "LOSS_ROW",
        item.id,
        "reason",
        item.reason,
      ) ?? "",
  }));

  return {
    ...data,
    lossItems,
    summary: {
      totalQuantity: lossItems.reduce((sum, item) => sum + item.quantity, 0),
      totalAmount: lossItems.reduce((sum, item) => sum + item.amount, 0),
      byProduct: Array.from(
        lossItems
          .reduce((byProduct, item) => {
            const current = byProduct.get(item.productId);

            byProduct.set(item.productId, {
              productId: item.productId,
              productName: item.productName,
              quantity: (current?.quantity ?? 0) + item.quantity,
              amount: (current?.amount ?? 0) + item.amount,
            });

            return byProduct;
          }, new Map<string, LossStepData["summary"]["byProduct"][number]>())
          .values(),
      ),
    },
  };
}
