import { calculateInventoryAmount } from "./inventory.ts";
import { createPolicyUnconfirmedMetric } from "./policy-gates.ts";

const MAX_CORRECTION_INTEGER = 2_147_483_647;
const CALCULATION_LOG_PREFIX = "ledger calculation unavailable";

export const CALCULATION_STATUS_LABELS = {
  ok: "정상",
  "data-insufficient": "데이터 부족",
  "policy-unconfirmed": "확인 필요",
  "calculation-unavailable": "계산 불가",
} as const;

export type CalculationStatus = keyof typeof CALCULATION_STATUS_LABELS;
export type CalculationStatusLabel =
  (typeof CALCULATION_STATUS_LABELS)[CalculationStatus];
export type LedgerReviewUnavailableReason = "계산 불가" | "계산 기준 확인 필요";

export type CalculationMetric = {
  value: number | null;
  status: CalculationStatus;
  label?: CalculationStatusLabel;
  reason?: string;
};

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

export type LedgerReviewMetric = CalculationMetric & {
  unavailableReason?: LedgerReviewUnavailableReason;
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
  paymentTotal: LedgerReviewMetric;
  expenseTotal: LedgerReviewMetric;
  workerCount: LedgerReviewMetric;
  costOfGoodsSold: LedgerReviewMetric;
  grossProfit: LedgerReviewMetric;
  grossMarginRate: LedgerReviewMetric;
  operatingProfit: LedgerReviewMetric;
  productivity: LedgerReviewMetric;
  inventoryAmount: LedgerReviewMetric;
  paymentDifference: LedgerReviewMetric;
  salesDifference: LedgerReviewMetric;
};

const available = (value: number): LedgerReviewMetric => ({
  value,
  status: "ok",
});

const unavailable = ({
  status,
  reason,
  metricId,
  logReason,
}: {
  status: Exclude<CalculationStatus, "ok">;
  reason?: string;
  metricId?: string;
  logReason?: string;
}): LedgerReviewMetric => {
  if (status === "calculation-unavailable" && metricId && logReason) {
    console.error(CALCULATION_LOG_PREFIX, { metricId, reason: logReason });
  }

  return {
    value: null,
    status,
    label: CALCULATION_STATUS_LABELS[status],
    unavailableReason:
      status === "policy-unconfirmed" ? "계산 기준 확인 필요" : "계산 불가",
    ...(reason ? { reason } : {}),
  };
};

const dataInsufficient = (reason?: string): LedgerReviewMetric =>
  unavailable({ status: "data-insufficient", reason });

const calculationUnavailable = ({
  metricId,
  reason,
  logReason = "calculation-unavailable",
}: {
  metricId: string;
  reason?: string;
  logReason?: string;
}): LedgerReviewMetric =>
  unavailable({
    status: "calculation-unavailable",
    reason,
    metricId,
    logReason,
  });

const dependentCalculationUnavailable = (reason: string): LedgerReviewMetric =>
  unavailable({ status: "calculation-unavailable", reason });

function isUsableNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function isSafeKrwInteger(value: number) {
  return Number.isSafeInteger(value);
}

function asKrwMetric(metricId: string, value: number): LedgerReviewMetric {
  if (!isSafeKrwInteger(value)) {
    return calculationUnavailable({
      metricId,
      reason: `${metricId} 계산값이 integer KRW 안전 범위를 벗어났습니다.`,
      logReason: "unsafe-krw-integer",
    });
  }

  return available(value);
}

function asRatioMetric(metricId: string, value: number): LedgerReviewMetric {
  if (!Number.isFinite(value)) {
    return calculationUnavailable({
      metricId,
      reason: `${metricId} 계산값이 유효한 숫자가 아닙니다.`,
      logReason: "invalid-number",
    });
  }

  return available(value);
}

function asCountMetric(
  metricId: string,
  value: number | null,
): LedgerReviewMetric {
  if (value === null) {
    return dataInsufficient(`${metricId} 입력값이 없습니다.`);
  }

  if (!Number.isSafeInteger(value)) {
    return calculationUnavailable({
      metricId,
      reason: `${metricId} 계산값이 유효한 정수가 아닙니다.`,
      logReason: "invalid-integer",
    });
  }

  return available(value);
}

type NumberCalculationResult =
  | { kind: "ok"; value: number | null }
  | { kind: "error"; metric: LedgerReviewMetric };

function safelyCalculateNumber(
  metricId: string,
  calculate: () => number | null,
): NumberCalculationResult {
  try {
    return { kind: "ok", value: calculate() };
  } catch (error) {
    return {
      kind: "error",
      metric: calculationUnavailable({
        metricId,
        reason: `${metricId} 계산 중 예상하지 못한 오류가 발생했습니다.`,
        logReason:
          error instanceof Error
            ? `unexpected-error:${error.name}`
            : "unexpected-error",
      }),
    };
  }
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
  const costOfGoodsSoldResult = safelyCalculateNumber("costOfGoodsSold", () =>
    calculateCostOfGoodsSold(inventoryItems),
  );
  const inventoryAmountResult = safelyCalculateNumber("inventoryAmount", () =>
    calculateInventoryTotal(inventoryItems),
  );
  const costOfGoodsSold =
    costOfGoodsSoldResult.kind === "ok" ? costOfGoodsSoldResult.value : null;
  const inventoryAmount =
    inventoryAmountResult.kind === "ok" ? inventoryAmountResult.value : null;
  const totalSales = asKrwMetric("totalSales", totalSalesAmount);
  const paymentTotal = cashAmount + cardAmount + otherPaymentAmount;
  const paymentTotalMetric = asKrwMetric("paymentTotal", paymentTotal);
  const expenseTotalMetric = asKrwMetric("expenseTotal", expenseTotal);
  const paymentDifference =
    totalSales.status !== "ok" || paymentTotalMetric.status !== "ok"
      ? calculationUnavailable({
          metricId: "paymentDifference",
          reason:
            "paymentDifference 계산값이 integer KRW 안전 범위를 벗어났습니다.",
          logReason: "unsafe-krw-integer",
        })
      : asKrwMetric(
          "paymentDifference",
          calculatePaymentDifference(
            totalSalesAmount,
            cashAmount,
            cardAmount,
            otherPaymentAmount,
          ),
        );
  const hasSalesDifferenceContext =
    inventoryAdjustments !== undefined && lossItems !== undefined;
  const salesDifferenceResult =
    costOfGoodsSoldResult.kind === "error" && hasSalesDifferenceContext
      ? ({
          kind: "error",
          metric: dependentCalculationUnavailable(
            "매출원가 계산 오류로 매출차액을 계산할 수 없습니다.",
          ),
        } as const)
      : costOfGoodsSold === null || !hasSalesDifferenceContext
        ? ({ kind: "ok", value: null } as const)
        : safelyCalculateNumber("salesDifference", () =>
            calculateSalesDifference({
              totalSalesAmount,
              costOfGoodsSold,
              inventoryAdjustments,
              lossItems,
            }),
          );
  const salesDifference =
    salesDifferenceResult.kind === "ok" ? salesDifferenceResult.value : null;
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

  const inventoryUnavailableReason =
    inventoryItems.length === 0
      ? "재고 입력이 없어 계산할 수 없습니다."
      : "재고 수량 또는 단가 입력이 부족합니다.";

  return {
    totalSales,
    paymentTotal: paymentTotalMetric,
    expenseTotal: expenseTotalMetric,
    workerCount: asCountMetric("workerCount", workerCount),
    costOfGoodsSold:
      costOfGoodsSoldResult.kind === "error"
        ? costOfGoodsSoldResult.metric
        : costOfGoodsSold === null
          ? dataInsufficient(inventoryUnavailableReason)
          : asKrwMetric("costOfGoodsSold", costOfGoodsSold),
    grossProfit:
      costOfGoodsSoldResult.kind === "error"
        ? dependentCalculationUnavailable(
            "매출원가 계산 오류로 매출이익을 계산할 수 없습니다.",
          )
        : grossProfit === null
          ? dataInsufficient("매출원가 계산에 필요한 재고 입력이 부족합니다.")
          : asKrwMetric("grossProfit", grossProfit),
    grossMarginRate:
      costOfGoodsSoldResult.kind === "error"
        ? dependentCalculationUnavailable(
            "매출원가 계산 오류로 마진율을 계산할 수 없습니다.",
          )
        : grossMarginRate === null
          ? dataInsufficient(
              "총매출 또는 매출이익이 부족해 마진율을 계산할 수 없습니다.",
            )
          : asRatioMetric("grossMarginRate", grossMarginRate),
    operatingProfit:
      costOfGoodsSoldResult.kind === "error"
        ? dependentCalculationUnavailable(
            "매출원가 계산 오류로 영업이익을 계산할 수 없습니다.",
          )
        : operatingProfit === null
          ? dataInsufficient("매출이익이 부족해 영업이익을 계산할 수 없습니다.")
          : asKrwMetric("operatingProfit", operatingProfit),
    productivity:
      productivity === null
        ? dataInsufficient("근무인원이 입력되지 않았거나 1명 미만입니다.")
        : asKrwMetric("productivity", productivity),
    inventoryAmount:
      inventoryAmountResult.kind === "error"
        ? inventoryAmountResult.metric
        : inventoryAmount === null
          ? dataInsufficient(inventoryUnavailableReason)
          : asKrwMetric("inventoryAmount", inventoryAmount),
    paymentDifference,
    salesDifference: !hasSalesDifferenceContext
      ? createPolicyUnconfirmedMetric("salesDifferenceMeaningChange")
      : salesDifferenceResult.kind === "error"
        ? salesDifferenceResult.metric
        : salesDifference === null
          ? dataInsufficient("매출차액 계산에 필요한 재고 입력이 부족합니다.")
          : asKrwMetric("salesDifference", salesDifference),
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
