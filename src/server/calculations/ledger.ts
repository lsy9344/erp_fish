export function calculatePaymentDifference(
  totalSalesAmount: number,
  cashAmount: number,
  cardAmount: number,
  otherPaymentAmount: number,
) {
  return totalSalesAmount - (cashAmount + cardAmount + otherPaymentAmount);
}

export function calculateExpenseTotal(expenses: number[]) {
  return expenses.reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0,
  );
}

export function calculatePurchaseTotal(purchases: number[]) {
  return purchases.reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0,
  );
}

export function calculateGrossProfit(
  totalSalesAmount: number,
  expenseTotal: number,
) {
  return totalSalesAmount - expenseTotal;
}

export function calculateProductivity(
  grossProfit: number,
  workerCount: number | null,
) {
  if (
    workerCount == null ||
    !Number.isFinite(workerCount) ||
    !Number.isFinite(grossProfit) ||
    workerCount <= 0
  ) {
    return null;
  }

  return grossProfit / workerCount;
}

export type LedgerReviewMetric = {
  value: number | null;
  unavailableReason?: "계산 불가" | "계산 기준 확인 필요";
};

export type LedgerReviewInventoryInput = {
  previousQuantity: number;
  purchasedQuantity: number;
  currentQuantity: number | null;
  quantity: number | null;
  unitPrice: number;
  inventoryAmount: number | null;
};

export type LedgerReviewSummaryInput = {
  totalSalesAmount: number;
  cashAmount: number;
  cardAmount: number;
  otherPaymentAmount: number;
  workerCount: number | null;
  expenseTotal: number;
  inventoryItems: LedgerReviewInventoryInput[];
};

export type LedgerReviewSummary = {
  totalSales: LedgerReviewMetric;
  costOfGoodsSold: LedgerReviewMetric;
  grossProfit: LedgerReviewMetric;
  grossMarginRate: LedgerReviewMetric;
  operatingProfit: LedgerReviewMetric;
  productivity: LedgerReviewMetric;
  inventoryAmount: LedgerReviewMetric;
  paymentDifference: LedgerReviewMetric;
  salesDifference: LedgerReviewMetric;
};

const unavailable = (
  unavailableReason: LedgerReviewMetric["unavailableReason"],
): LedgerReviewMetric => ({
  value: null,
  unavailableReason,
});

const available = (value: number): LedgerReviewMetric => ({ value });

function isUsableNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function getReviewInventoryQuantity(item: LedgerReviewInventoryInput) {
  return item.currentQuantity ?? item.quantity;
}

function calculateCostOfGoodsSold(items: LedgerReviewInventoryInput[]) {
  if (items.length === 0) {
    return null;
  }

  let total = 0;

  for (const item of items) {
    const currentQuantity = getReviewInventoryQuantity(item);

    if (!isUsableNumber(currentQuantity)) {
      return null;
    }

    total +=
      (item.previousQuantity + item.purchasedQuantity - currentQuantity) *
      item.unitPrice;
  }

  return total;
}

function calculateInventoryTotal(items: LedgerReviewInventoryInput[]) {
  if (items.length === 0) {
    return null;
  }

  let total = 0;

  for (const item of items) {
    const quantity = getReviewInventoryQuantity(item);
    const inventoryAmount = calculateInventoryAmount(quantity, item.unitPrice);

    if (inventoryAmount === null) {
      return null;
    }

    total += inventoryAmount;
  }

  return total;
}

export function calculateLedgerReviewSummary({
  totalSalesAmount,
  cashAmount,
  cardAmount,
  otherPaymentAmount,
  workerCount,
  expenseTotal,
  inventoryItems,
}: LedgerReviewSummaryInput): LedgerReviewSummary {
  const costOfGoodsSold = calculateCostOfGoodsSold(inventoryItems);
  const inventoryAmount = calculateInventoryTotal(inventoryItems);
  const grossProfit =
    costOfGoodsSold === null ? null : totalSalesAmount - costOfGoodsSold;
  const grossMarginRate =
    grossProfit === null || totalSalesAmount <= 0
      ? null
      : grossProfit / totalSalesAmount;
  const operatingProfit =
    grossProfit === null ? null : grossProfit - expenseTotal;
  const productivity =
    workerCount === null || !Number.isFinite(workerCount) || workerCount <= 0
      ? null
      : totalSalesAmount / workerCount;

  return {
    totalSales: available(totalSalesAmount),
    costOfGoodsSold:
      costOfGoodsSold === null
        ? unavailable("계산 불가")
        : available(costOfGoodsSold),
    grossProfit:
      grossProfit === null ? unavailable("계산 불가") : available(grossProfit),
    grossMarginRate:
      grossMarginRate === null
        ? unavailable("계산 불가")
        : available(grossMarginRate),
    operatingProfit:
      operatingProfit === null
        ? unavailable("계산 불가")
        : available(operatingProfit),
    productivity:
      productivity === null
        ? unavailable("계산 불가")
        : available(productivity),
    inventoryAmount:
      inventoryAmount === null
        ? unavailable("계산 불가")
        : available(inventoryAmount),
    paymentDifference: available(
      calculatePaymentDifference(
        totalSalesAmount,
        cashAmount,
        cardAmount,
        otherPaymentAmount,
      ),
    ),
    salesDifference: unavailable("계산 기준 확인 필요"),
  };
}
import { calculateInventoryAmount } from "./inventory.ts";
