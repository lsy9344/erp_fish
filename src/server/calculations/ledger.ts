import { calculateInventoryAmount } from "./inventory.ts";
import { createPolicyUnconfirmedMetric } from "./policy-gates.ts";
import {
  isNonNegativeDecimalInRange,
  isNonNegativeTwoDecimalInRange,
} from "../../lib/validation.ts";

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
  expenseTotal: number,
) {
  return (
    totalSalesAmount -
    calculatePaymentTotal(cashAmount, cardAmount, otherPaymentAmount) -
    expenseTotal
  );
}

export function calculateOperatingSalesAmount(
  totalSalesAmount: number,
  carryoverSalesAmount: number,
) {
  return totalSalesAmount + carryoverSalesAmount;
}

export function calculatePaymentTotal(
  cashAmount: number,
  cardAmount: number,
  otherPaymentAmount: number,
) {
  return cashAmount + cardAmount + otherPaymentAmount;
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

export function calculatePayrollTotal(amounts: number[]) {
  return amounts.reduce(
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
  operatingSalesAmount: number,
  workerCount: number | null,
) {
  if (
    workerCount == null ||
    !Number.isFinite(workerCount) ||
    !Number.isFinite(operatingSalesAmount) ||
    workerCount <= 0
  ) {
    return null;
  }

  return operatingSalesAmount / workerCount;
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
  fifoConsumedAmount?: number | null;
  fifoRemainingAmount?: number | null;
  fifoContainsLegacyOpening?: boolean;
  fifoLots?: {
    sourceType?: string;
    consumedAmount: number;
    remainingAmount: number;
  }[];
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

// point_summary 검토 후속(2026-06-24): 지점장 "아침에 정한 판매가 vs 저녁 실제 결과"
// 비교를 위한 판매한 가격 입력. 품목별 판매수량(전일+매입-당일) × 판매한 가격으로 계획 매출을
// 산출한다. 판매한 가격이 한 품목이라도 빠지면 비교 자체가 왜곡되므로, 비교 지표는 모든
// 판매 품목에 판매한 가격이 있을 때만 "ok"로 노출하고, 일부라도 빠지면 기준 확인 필요로
// 내린다(매입단가로 조용히 메우지 않는다).
export type LedgerReviewPlannedSalesInput = {
  productId?: string;
  previousQuantity: number;
  purchasedQuantity: number;
  // 당일 손실 합계 수량. 판매량은 기준재고(전일+매입-손실)에서 당일재고를 빼야
  // 하므로 손실을 판매로 잘못 잡지 않도록 차감한다. 없으면 0.
  lossQuantity?: number;
  currentQuantity: number | null;
  quantity: number | null;
  // 지점장 판매한 가격(StoreSalesPricePlan.plannedUnitPrice). 없으면 null.
  plannedUnitPrice: number | null;
};

export type LedgerReviewSummaryInput = {
  totalSalesAmount: number;
  carryoverSalesAmount?: number;
  cashAmount: number;
  cardAmount: number;
  otherPaymentAmount: number;
  workerCount: number | null;
  expenseTotal: number;
  inventoryItems: LedgerReviewInventoryInput[];
  inventoryAdjustments?: LedgerReviewInventoryAdjustmentInput[];
  lossItems?: Pick<LedgerReviewLossInput, "amount">[];
  // 판매한 가격 기반 비교 입력. 미제공 시 비교 지표는 "기준 확인 필요"로 노출한다.
  plannedSalesItems?: LedgerReviewPlannedSalesInput[];
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
  /** @deprecated Use operatingSales for business calculations and display. */
  totalSales: LedgerReviewMetric;
  closingTotalSales: LedgerReviewMetric;
  carryoverSales: LedgerReviewMetric;
  operatingSales: LedgerReviewMetric;
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
  // point_summary 검토 후속(2026-06-24): 판매한 가격 대비 실제 비교 지표.
  // plannedSalesTotal: Σ(판매수량 × 판매한 가격)
  // plannedGrossProfit: plannedSalesTotal - 매출원가(COGS)
  // plannedGrossMarginRate: plannedGrossProfit / plannedSalesTotal
  // plannedVsActualSalesDifference: 실제 총매출 - plannedSalesTotal (양수=계획 초과 달성)
  plannedSalesTotal: LedgerReviewMetric;
  plannedGrossProfit: LedgerReviewMetric;
  plannedGrossMarginRate: LedgerReviewMetric;
  plannedVsActualSalesDifference: LedgerReviewMetric;
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

function asPolicyUnconfirmedKrwMetric(
  metricId: string,
  value: number,
  reason: string,
): LedgerReviewMetric {
  if (!isSafeKrwInteger(value)) {
    return calculationUnavailable({
      metricId,
      reason: `${metricId} 계산값이 integer KRW 안전 범위를 벗어났습니다.`,
      logReason: "unsafe-krw-integer",
    });
  }

  return {
    value,
    status: "policy-unconfirmed",
    label: CALCULATION_STATUS_LABELS["policy-unconfirmed"],
    unavailableReason: "계산 기준 확인 필요",
    reason,
  };
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

function asPolicyUnconfirmedRatioMetric(
  metricId: string,
  value: number,
  reason: string,
): LedgerReviewMetric {
  if (!Number.isFinite(value)) {
    return calculationUnavailable({
      metricId,
      reason: `${metricId} 계산값이 유효한 숫자가 아닙니다.`,
      logReason: "invalid-number",
    });
  }

  return {
    value,
    status: "policy-unconfirmed",
    label: CALCULATION_STATUS_LABELS["policy-unconfirmed"],
    unavailableReason: "계산 기준 확인 필요",
    reason,
  };
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

function getFifoConsumedAmount(item: LedgerReviewInventoryInput) {
  if (isUsableNumber(item.fifoConsumedAmount ?? null)) {
    return item.fifoConsumedAmount!;
  }

  if (!item.fifoLots || item.fifoLots.length === 0) {
    return null;
  }

  return item.fifoLots.reduce((sum, lot) => sum + lot.consumedAmount, 0);
}

function getFifoRemainingAmount(item: LedgerReviewInventoryInput) {
  if (isUsableNumber(item.fifoRemainingAmount ?? null)) {
    return item.fifoRemainingAmount!;
  }

  if (!item.fifoLots || item.fifoLots.length === 0) {
    return null;
  }

  return item.fifoLots.reduce((sum, lot) => sum + lot.remainingAmount, 0);
}

function hasLegacyOpeningFifoLot(item: LedgerReviewInventoryInput) {
  return (
    item.fifoContainsLegacyOpening === true ||
    item.fifoLots?.some((lot) => lot.sourceType === "LEGACY_OPENING") === true
  );
}

function canUseFifoConsumedAmounts(items: LedgerReviewInventoryInput[]) {
  return (
    items.length > 0 &&
    items.every((item) => isUsableNumber(getFifoConsumedAmount(item)))
  );
}

function canUseFifoRemainingAmounts(items: LedgerReviewInventoryInput[]) {
  return (
    items.length > 0 &&
    items.every((item) => isUsableNumber(getFifoRemainingAmount(item)))
  );
}

function calculateCostOfGoodsSold(items: LedgerReviewInventoryInput[]) {
  if (items.length === 0) {
    return null;
  }

  const canUseFifo = canUseFifoConsumedAmounts(items);
  let total = 0;

  for (const item of items) {
    if (canUseFifo) {
      total += getFifoConsumedAmount(item)!;
      continue;
    }

    const currentQuantity = getReviewInventoryQuantity(item);

    if (!isUsableNumber(currentQuantity)) {
      return null;
    }

    total += Math.round(
      (item.previousQuantity + item.purchasedQuantity - currentQuantity) *
        item.unitPrice,
    );
  }

  return total;
}

function calculateInventoryTotal(items: LedgerReviewInventoryInput[]) {
  if (items.length === 0) {
    return null;
  }

  const canUseFifo = canUseFifoRemainingAmounts(items);
  let total = 0;

  for (const item of items) {
    if (canUseFifo) {
      total += getFifoRemainingAmount(item)!;
      continue;
    }

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

function getPlannedSalesSoldQuantity(item: LedgerReviewPlannedSalesInput) {
  const currentQuantity = item.currentQuantity ?? item.quantity;

  if (!isUsableNumber(currentQuantity)) {
    return null;
  }

  const soldQuantity =
    item.previousQuantity +
    item.purchasedQuantity -
    (item.lossQuantity ?? 0) -
    currentQuantity;

  return Number.isFinite(soldQuantity) ? soldQuantity : null;
}

// point_summary 검토 후속(2026-06-24): 판매한 가격 기준 계획 매출 합계.
// 판매 수량이 양수인 품목만 합산한다. 판매 품목 중 판매한 가격이 하나라도 빠지면
// 비교가 왜곡되므로 missingPlanCount로 알리고, 합계는 빠진 품목을 제외하고 계산한다.
function calculatePlannedSalesTotal(items: LedgerReviewPlannedSalesInput[]) {
  let total = 0;
  let soldItemCount = 0;
  let missingPlanCount = 0;

  for (const item of items) {
    const soldQuantity = getPlannedSalesSoldQuantity(item);

    if (soldQuantity === null || soldQuantity <= 0) {
      continue;
    }

    soldItemCount += 1;

    if (
      item.plannedUnitPrice === null ||
      !Number.isFinite(item.plannedUnitPrice)
    ) {
      missingPlanCount += 1;
      continue;
    }

    total += Math.round(soldQuantity * item.plannedUnitPrice);
  }

  return { total, soldItemCount, missingPlanCount };
}

export function calculateLedgerReviewSummary({
  totalSalesAmount,
  carryoverSalesAmount = 0,
  cashAmount,
  cardAmount,
  otherPaymentAmount,
  workerCount,
  expenseTotal,
  inventoryItems,
  inventoryAdjustments,
  lossItems,
  plannedSalesItems,
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
  const operatingSalesAmount = calculateOperatingSalesAmount(
    totalSalesAmount,
    carryoverSalesAmount,
  );
  const closingTotalSales = asKrwMetric("closingTotalSales", totalSalesAmount);
  const carryoverSales = asKrwMetric("carryoverSales", carryoverSalesAmount);
  const operatingSales = asKrwMetric("operatingSales", operatingSalesAmount);
  const paymentTotal = cashAmount + cardAmount + otherPaymentAmount;
  const paymentTotalMetric = asKrwMetric("paymentTotal", paymentTotal);
  const expenseTotalMetric = asKrwMetric("expenseTotal", expenseTotal);
  const paymentDifference =
    closingTotalSales.status !== "ok" ||
    paymentTotalMetric.status !== "ok" ||
    expenseTotalMetric.status !== "ok"
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
            expenseTotal,
          ),
        );
  const hasSalesDifferenceContext =
    inventoryAdjustments !== undefined && lossItems !== undefined;
  const hasLegacyFifoOpening = inventoryItems.some((item) =>
    hasLegacyOpeningFifoLot(item),
  );
  const hasIncompleteFifoCostBasis = hasLegacyFifoOpening;
  const fifoSourceIncompleteReason =
    "FIFO 원천 lot 근거가 부족해 계산 기준 확인이 필요합니다.";
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
              totalSalesAmount: operatingSalesAmount,
              costOfGoodsSold,
              inventoryAdjustments,
              lossItems,
            }),
          );
  const salesDifference =
    salesDifferenceResult.kind === "ok" ? salesDifferenceResult.value : null;
  const grossProfit =
    costOfGoodsSold === null ? null : operatingSalesAmount - costOfGoodsSold;
  const grossMarginRate =
    grossProfit === null || operatingSalesAmount <= 0
      ? null
      : grossProfit / operatingSalesAmount;
  const operatingProfit =
    grossProfit === null ? null : grossProfit - expenseTotal;
  const productivity = calculateProductivity(operatingSalesAmount, workerCount);

  const inventoryUnavailableReason =
    inventoryItems.length === 0
      ? "재고 입력이 없어 계산할 수 없습니다."
      : "재고 수량 또는 단가 입력이 부족합니다.";

  // point_summary 검토 후속(2026-06-24): 판매한 가격 대비 실제 비교 지표.
  // 판매한 가격 입력이 없으면(plannedSalesItems === undefined) "기준 확인 필요"로 노출한다.
  const plannedSalesResult = plannedSalesItems
    ? calculatePlannedSalesTotal(plannedSalesItems)
    : null;
  const plannedSalesMissingReason =
    "판매한 가격이 입력되지 않아 계획 대비 비교를 계산할 수 없습니다.";
  // 일부 품목 판매가 미입력은 정책(OQ) 게이트가 아니라 입력 부족이다. status는
  // policy-unconfirmed("기준 확인 필요") 대신 data-insufficient로 노출하고, 값은
  // 그대로 계산해 "과소 추정"임을 알린다. (3단계 매입 화면에 없던 전일 이월 품목 등)
  const plannedSalesPartialReason = "일부 품목 판매가 미입력 — 과소 추정";

  const plannedSalesNotEnteredMetric = dataInsufficient(
    plannedSalesMissingReason,
  );

  function buildPlannedKrwMetric(
    metricId: string,
    value: number | null,
  ): LedgerReviewMetric {
    if (plannedSalesResult === null) {
      return plannedSalesNotEnteredMetric;
    }

    if (value === null) {
      return dataInsufficient(
        "판매 수량을 계산할 수 있는 품목이 없어 계획 매출을 산출할 수 없습니다.",
      );
    }

    if (plannedSalesResult.soldItemCount === 0) {
      return dataInsufficient(
        "판매 수량을 계산할 수 있는 품목이 없어 계획 매출을 산출할 수 없습니다.",
      );
    }

    if (plannedSalesResult.missingPlanCount > 0) {
      return dataInsufficient(plannedSalesPartialReason);
    }

    return asKrwMetric(metricId, value);
  }

  const plannedSalesTotalValue = plannedSalesResult?.total ?? null;
  const plannedGrossProfitValue =
    plannedSalesResult === null || costOfGoodsSold === null
      ? null
      : plannedSalesResult.total - costOfGoodsSold;
  const plannedGrossMarginRateValue =
    plannedGrossProfitValue === null ||
    plannedSalesResult === null ||
    plannedSalesResult.total <= 0
      ? null
      : plannedGrossProfitValue / plannedSalesResult.total;
  const plannedVsActualSalesDifferenceValue =
    plannedSalesResult === null
      ? null
      : operatingSalesAmount - plannedSalesResult.total;

  return {
    totalSales: operatingSales,
    closingTotalSales,
    carryoverSales,
    operatingSales,
    paymentTotal: paymentTotalMetric,
    expenseTotal: expenseTotalMetric,
    workerCount: asCountMetric("workerCount", workerCount),
    costOfGoodsSold:
      costOfGoodsSoldResult.kind === "error"
        ? costOfGoodsSoldResult.metric
        : costOfGoodsSold === null
          ? dataInsufficient(inventoryUnavailableReason)
          : hasIncompleteFifoCostBasis
            ? asPolicyUnconfirmedKrwMetric(
                "costOfGoodsSold",
                costOfGoodsSold,
                fifoSourceIncompleteReason,
              )
            : asKrwMetric("costOfGoodsSold", costOfGoodsSold),
    grossProfit:
      costOfGoodsSoldResult.kind === "error"
        ? dependentCalculationUnavailable(
            "매출원가 계산 오류로 매출이익을 계산할 수 없습니다.",
          )
        : grossProfit === null
          ? dataInsufficient("매출원가 계산에 필요한 재고 입력이 부족합니다.")
          : hasIncompleteFifoCostBasis
            ? asPolicyUnconfirmedKrwMetric(
                "grossProfit",
                grossProfit,
                fifoSourceIncompleteReason,
              )
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
          : hasIncompleteFifoCostBasis
            ? asPolicyUnconfirmedRatioMetric(
                "grossMarginRate",
                grossMarginRate,
                fifoSourceIncompleteReason,
              )
            : asRatioMetric("grossMarginRate", grossMarginRate),
    operatingProfit:
      costOfGoodsSoldResult.kind === "error"
        ? dependentCalculationUnavailable(
            "매출원가 계산 오류로 영업이익을 계산할 수 없습니다.",
          )
        : operatingProfit === null
          ? dataInsufficient("매출이익이 부족해 영업이익을 계산할 수 없습니다.")
          : hasIncompleteFifoCostBasis
            ? asPolicyUnconfirmedKrwMetric(
                "operatingProfit",
                operatingProfit,
                fifoSourceIncompleteReason,
              )
            : asKrwMetric("operatingProfit", operatingProfit),
    productivity:
      productivity === null
        ? dataInsufficient("근무인원이 입력되지 않았거나 1명 미만입니다.")
        : asKrwMetric("productivity", productivity),
    // OQ-7/OQ-17 결정 반영: FIFO 재고금액은 더 이상 정책 gate로 막지 않는다.
    // 매출원가 기반 지표는 원천 lot 근거가 부족한 경우에만 기준 확인 상태로 남긴다.
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
          : hasIncompleteFifoCostBasis
            ? asPolicyUnconfirmedKrwMetric(
                "salesDifference",
                salesDifference,
                fifoSourceIncompleteReason,
              )
            : asKrwMetric("salesDifference", salesDifference),
    plannedSalesTotal: buildPlannedKrwMetric(
      "plannedSalesTotal",
      plannedSalesTotalValue,
    ),
    // 계획 매출과 매출원가(COGS)를 모두 알아야 계획 마진을 낼 수 있다.
    // FIFO 원천 lot 근거가 부족하면 그 표시를 우선 따른다.
    plannedGrossProfit:
      plannedSalesResult === null
        ? plannedSalesNotEnteredMetric
        : costOfGoodsSoldResult.kind === "error"
          ? dependentCalculationUnavailable(
              "매출원가 계산 오류로 계획 매출이익을 계산할 수 없습니다.",
            )
          : plannedGrossProfitValue === null
            ? dataInsufficient(
                "매출원가 또는 계획 매출이 부족해 계획 매출이익을 계산할 수 없습니다.",
              )
            : plannedSalesResult.missingPlanCount > 0
              ? dataInsufficient(plannedSalesPartialReason)
              : hasIncompleteFifoCostBasis
                ? asPolicyUnconfirmedKrwMetric(
                    "plannedGrossProfit",
                    plannedGrossProfitValue,
                    fifoSourceIncompleteReason,
                  )
                : asKrwMetric("plannedGrossProfit", plannedGrossProfitValue),
    plannedGrossMarginRate:
      plannedSalesResult === null
        ? plannedSalesNotEnteredMetric
        : costOfGoodsSoldResult.kind === "error"
          ? dependentCalculationUnavailable(
              "매출원가 계산 오류로 판매가 기준 마진율을 계산할 수 없습니다.",
            )
          : plannedGrossMarginRateValue === null
            ? dataInsufficient(
                "계획 매출 또는 매출이익이 부족해 판매가 기준 마진율을 계산할 수 없습니다.",
              )
            : plannedSalesResult.missingPlanCount > 0
              ? dataInsufficient(plannedSalesPartialReason)
              : hasIncompleteFifoCostBasis
                ? asPolicyUnconfirmedRatioMetric(
                    "plannedGrossMarginRate",
                    plannedGrossMarginRateValue,
                    fifoSourceIncompleteReason,
                  )
                : asRatioMetric(
                    "plannedGrossMarginRate",
                    plannedGrossMarginRateValue,
                  ),
    plannedVsActualSalesDifference:
      plannedSalesResult === null
        ? plannedSalesNotEnteredMetric
        : plannedVsActualSalesDifferenceValue === null
          ? dataInsufficient(plannedSalesMissingReason)
          : plannedSalesResult.soldItemCount === 0
            ? dataInsufficient(
                "판매 수량을 계산할 수 있는 품목이 없어 계획 대비 차이를 산출할 수 없습니다.",
              )
            : plannedSalesResult.missingPlanCount > 0
              ? dataInsufficient(plannedSalesPartialReason)
              : asKrwMetric(
                  "plannedVsActualSalesDifference",
                  plannedVsActualSalesDifferenceValue,
                ),
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
    case "carryoverSalesAmount":
      reviewInput.carryoverSalesAmount = value;
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
        "one-decimal",
      );

      if (value === null) {
        return "unapplied";
      }

      item.currentQuantity = value;
      item.quantity = value;
      item.fifoConsumedAmount = null;
      item.fifoRemainingAmount = null;
      item.fifoContainsLegacyOpening = false;
      item.fifoLots = undefined;
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
        "two-decimal",
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

function getCorrectionNumber(
  value: unknown,
  kind: "money" | "quantity",
  quantityPrecision: "integer" | "one-decimal" | "two-decimal" = "integer",
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !("kind" in value) ||
    !("value" in value) ||
    value.kind !== kind ||
    typeof value.value !== "number"
  ) {
    return null;
  }

  const isValidNumber =
    kind === "quantity" && quantityPrecision === "one-decimal"
      ? isNonNegativeDecimalInRange(value.value)
      : kind === "quantity" && quantityPrecision === "two-decimal"
        ? isNonNegativeTwoDecimalInRange(value.value)
        : Number.isSafeInteger(value.value) &&
          value.value >= 0 &&
          value.value <= MAX_CORRECTION_INTEGER;

  if (!isValidNumber) {
    return null;
  }

  return value.value;
}
