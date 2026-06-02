import { calculateInventoryAmount } from "./inventory.ts";

const MAX_CORRECTION_INTEGER = 2_147_483_647;

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
  id?: string;
  productId?: string;
  productName?: string;
  previousQuantity: number;
  purchasedQuantity: number;
  currentQuantity: number | null;
  quantity: number | null;
  unitPrice: number;
  inventoryAmount: number | null;
};

export type LedgerReviewExpenseInput = {
  id?: string;
  amount: number;
};

export type LedgerReviewLossInput = {
  id?: string;
  productId: string;
  productName: string;
  quantity: number;
  amount: number;
};

export type LedgerReviewInventoryAdjustmentInput = {
  differenceAmount: number;
};

export type LedgerReviewSummaryInput = {
  totalSalesAmount: number;
  cashAmount: number;
  cardAmount: number;
  otherPaymentAmount: number;
  workerCount: number | null;
  expenseTotal: number;
  inventoryItems: LedgerReviewInventoryInput[];
  inventoryAdjustments?: LedgerReviewInventoryAdjustmentInput[];
  lossItems?: Pick<LedgerReviewLossInput, "amount">[];
};

export type LedgerReviewCorrectionValue = {
  kind?: unknown;
  value?: unknown;
};

export type LedgerReviewCorrection = {
  targetType: string;
  targetId: string;
  fieldKey: string;
  latestAppliedValue: unknown;
};

export type LedgerReviewCorrectionState = {
  appliedCorrectionCount: number;
  hasAppliedCorrections: boolean;
  hasUnappliedCorrections: boolean;
};

export type LedgerReviewCorrectionOverlayResult = {
  reviewInput: LedgerReviewSummaryInput;
  expenseItems: LedgerReviewExpenseInput[];
  lossItems: LedgerReviewLossInput[];
  appliedInventoryItemIds: Set<string>;
  appliedLossProductIds: Set<string>;
  appliedCorrectionKeys: Set<string>;
  unappliedCorrectionKeys: Set<string>;
  correctionState: LedgerReviewCorrectionState;
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

function calculateLossTotal(
  items: Pick<LedgerReviewLossInput, "amount">[] = [],
) {
  return items.reduce(
    (sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0),
    0,
  );
}

function calculateInventoryAdjustmentTotal(
  items: LedgerReviewInventoryAdjustmentInput[] = [],
) {
  return items.reduce(
    (sum, item) =>
      sum +
      (Number.isFinite(item.differenceAmount) ? item.differenceAmount : 0),
    0,
  );
}

function calculateSalesDifference({
  totalSalesAmount,
  costOfGoodsSold,
  inventoryAdjustments,
  lossItems,
}: {
  totalSalesAmount: number;
  costOfGoodsSold: number;
  inventoryAdjustments: LedgerReviewInventoryAdjustmentInput[];
  lossItems: Pick<LedgerReviewLossInput, "amount">[];
}) {
  const productSalesAmount =
    costOfGoodsSold +
    calculateInventoryAdjustmentTotal(inventoryAdjustments) -
    calculateLossTotal(lossItems);

  return totalSalesAmount - productSalesAmount;
}

export function calculateLedgerReviewSummary({
  totalSalesAmount,
  cashAmount,
  cardAmount,
  otherPaymentAmount,
  workerCount,
  expenseTotal,
  inventoryItems,
  inventoryAdjustments,
  lossItems,
}: LedgerReviewSummaryInput): LedgerReviewSummary {
  const costOfGoodsSold = calculateCostOfGoodsSold(inventoryItems);
  const inventoryAmount = calculateInventoryTotal(inventoryItems);
  const hasSalesDifferenceContext =
    inventoryAdjustments !== undefined && lossItems !== undefined;
  const salesDifference =
    costOfGoodsSold === null || !hasSalesDifferenceContext
      ? null
      : calculateSalesDifference({
          totalSalesAmount,
          costOfGoodsSold,
          inventoryAdjustments,
          lossItems,
        });
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
    salesDifference:
      !hasSalesDifferenceContext
        ? unavailable("계산 기준 확인 필요")
        : salesDifference === null
          ? unavailable("계산 불가")
        : available(salesDifference),
  };
}

export function applyCorrectionValuesToLedgerReviewInput({
  ledgerId,
  reviewInput,
  expenseItems = [],
  lossItems = [],
  corrections,
}: {
  ledgerId: string;
  reviewInput: LedgerReviewSummaryInput;
  expenseItems?: LedgerReviewExpenseInput[];
  lossItems?: LedgerReviewLossInput[];
  corrections: Iterable<LedgerReviewCorrection>;
}): LedgerReviewCorrectionOverlayResult {
  const correctedReviewInput: LedgerReviewSummaryInput = {
    ...reviewInput,
    inventoryItems: reviewInput.inventoryItems.map((item) => ({ ...item })),
  };
  const correctedExpenseItems = expenseItems.map((item) => ({ ...item }));
  const correctedLossItems = lossItems.map((item) => ({ ...item }));
  const expenseById = new Map(
    correctedExpenseItems
      .filter((item) => item.id)
      .map((item) => [item.id, item]),
  );
  const inventoryById = new Map(
    correctedReviewInput.inventoryItems
      .filter((item) => item.id)
      .map((item) => [item.id, item]),
  );
  const lossById = new Map(
    correctedLossItems.filter((item) => item.id).map((item) => [item.id, item]),
  );
  let appliedCorrectionCount = 0;
  let hasUnappliedCorrections = false;
  const appliedInventoryItemIds = new Set<string>();
  const appliedLossProductIds = new Set<string>();
  const appliedCorrectionKeys = new Set<string>();
  const unappliedCorrectionKeys = new Set<string>();

  for (const correction of corrections) {
    const correctionKey = [
      ledgerId,
      correction.targetType,
      correction.targetId,
      correction.fieldKey,
    ].join(":");
    const result = applySingleCorrection({
      ledgerId,
      correction,
      reviewInput: correctedReviewInput,
      expenseById,
      inventoryById,
      lossById,
    });

    if (result === "applied") {
      appliedCorrectionCount += 1;
      appliedCorrectionKeys.add(correctionKey);
      if (correction.targetType === "INVENTORY_ROW") {
        appliedInventoryItemIds.add(correction.targetId);
      }
      if (
        correction.targetType === "LOSS_ROW" &&
        correction.fieldKey === "quantity"
      ) {
        const lossItem = lossById.get(correction.targetId);

        if (lossItem) {
          appliedLossProductIds.add(lossItem.productId);
        }
      }
    } else {
      hasUnappliedCorrections = true;
      unappliedCorrectionKeys.add(correctionKey);
    }
  }

  if (correctedExpenseItems.length > 0) {
    correctedReviewInput.expenseTotal = calculateExpenseTotal(
      correctedExpenseItems.map((item) => item.amount),
    );
  }

  return {
    reviewInput: correctedReviewInput,
    expenseItems: correctedExpenseItems,
    lossItems: correctedLossItems,
    appliedInventoryItemIds,
    appliedLossProductIds,
    appliedCorrectionKeys,
    unappliedCorrectionKeys,
    correctionState: {
      appliedCorrectionCount,
      hasAppliedCorrections: appliedCorrectionCount > 0,
      hasUnappliedCorrections,
    },
  };
}

function applySingleCorrection({
  ledgerId,
  correction,
  reviewInput,
  expenseById,
  inventoryById,
  lossById,
}: {
  ledgerId: string;
  correction: LedgerReviewCorrection;
  reviewInput: LedgerReviewSummaryInput;
  expenseById: Map<string | undefined, LedgerReviewExpenseInput>;
  inventoryById: Map<string | undefined, LedgerReviewInventoryInput>;
  lossById: Map<string | undefined, LedgerReviewLossInput>;
}) {
  if (correction.targetType === "PAYMENT_FIELD") {
    if (correction.targetId !== ledgerId) {
      return "unapplied";
    }

    return applyPaymentCorrection(reviewInput, correction);
  }

  if (correction.targetType === "EXPENSE_ROW") {
    const item = expenseById.get(correction.targetId);

    if (!item || correction.fieldKey !== "amount") {
      return "unapplied";
    }

    const value = getCorrectionNumber(correction.latestAppliedValue, "money");

    if (value === null) {
      return "unapplied";
    }

    item.amount = value;
    return "applied";
  }

  if (correction.targetType === "LEDGER_FIELD") {
    if (
      correction.targetId !== ledgerId ||
      correction.fieldKey !== "workerCount"
    ) {
      return "unapplied";
    }

    const value = getCorrectionNumber(
      correction.latestAppliedValue,
      "quantity",
    );

    if (value === null) {
      return "unapplied";
    }

    reviewInput.workerCount = value;
    return "applied";
  }

  if (correction.targetType === "INVENTORY_ROW") {
    const item = inventoryById.get(correction.targetId);

    if (!item) {
      return "unapplied";
    }

    return applyInventoryCorrection(item, correction);
  }

  if (correction.targetType === "LOSS_ROW") {
    const item = lossById.get(correction.targetId);

    if (!item) {
      return "unapplied";
    }

    return applyLossCorrection(item, correction);
  }

  return "unapplied";
}

function applyPaymentCorrection(
  reviewInput: LedgerReviewSummaryInput,
  correction: LedgerReviewCorrection,
) {
  const value = getCorrectionNumber(correction.latestAppliedValue, "money");

  if (value === null) {
    return "unapplied";
  }

  switch (correction.fieldKey) {
    case "totalSalesAmount":
      reviewInput.totalSalesAmount = value;
      return "applied";
    case "cashAmount":
      reviewInput.cashAmount = value;
      return "applied";
    case "cardAmount":
      reviewInput.cardAmount = value;
      return "applied";
    case "otherPaymentAmount":
      reviewInput.otherPaymentAmount = value;
      return "applied";
    default:
      return "unapplied";
  }
}

function applyInventoryCorrection(
  item: LedgerReviewInventoryInput,
  correction: LedgerReviewCorrection,
) {
  switch (correction.fieldKey) {
    case "currentQuantity":
    case "quantity": {
      const value = getCorrectionNumber(
        correction.latestAppliedValue,
        "quantity",
      );

      if (value === null) {
        return "unapplied";
      }

      item.currentQuantity = value;
      item.quantity = value;
      return "applied";
    }
    default:
      return "unapplied";
  }
}

function applyLossCorrection(
  item: LedgerReviewLossInput,
  correction: LedgerReviewCorrection,
) {
  switch (correction.fieldKey) {
    case "quantity": {
      const value = getCorrectionNumber(
        correction.latestAppliedValue,
        "quantity",
      );

      if (value === null) {
        return "unapplied";
      }

      item.quantity = value;
      return "applied";
    }
    case "amount": {
      const value = getCorrectionNumber(correction.latestAppliedValue, "money");

      if (value === null) {
        return "unapplied";
      }

      item.amount = value;
      return "applied";
    }
    default:
      return "unapplied";
  }
}

function getCorrectionNumber(value: unknown, kind: "money" | "quantity") {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("kind" in value) ||
    !("value" in value) ||
    value.kind !== kind ||
    typeof value.value !== "number" ||
    !Number.isSafeInteger(value.value) ||
    value.value < 0 ||
    value.value > MAX_CORRECTION_INTEGER
  ) {
    return null;
  }

  return value.value;
}
