import {
  CALCULATION_STATUS_LABELS,
  type LedgerReviewMetric,
} from "./ledger.ts";

// 대시보드가 보여주는 실제/예상 마진율과 그 근거.
// 품목 estimatedGrossMarginRate(판매분 원가만 쓴 추정)는 이 쌍이 아니다.
export type MarginPairBasis = {
  operatingSales: LedgerReviewMetric;
  expectedSales: LedgerReviewMetric;
  costOfGoodsSold: LedgerReviewMetric;
  plannedVsActualSalesDifference: LedgerReviewMetric;
  actualMarginRate: LedgerReviewMetric;
  expectedMarginRate: LedgerReviewMetric;
};

function insufficient(
  reason: string,
  source?: LedgerReviewMetric,
): LedgerReviewMetric {
  return {
    value: null,
    status: "data-insufficient",
    label: source?.label ?? CALCULATION_STATUS_LABELS["data-insufficient"],
    unavailableReason: source?.unavailableReason ?? "계산 불가",
    reason: source?.reason ?? reason,
  };
}

function withHeldStatus(
  value: number,
  source: LedgerReviewMetric,
): LedgerReviewMetric {
  if (source.status === "policy-unconfirmed") {
    return {
      value,
      status: "policy-unconfirmed",
      label: source.label ?? CALCULATION_STATUS_LABELS["policy-unconfirmed"],
      unavailableReason: source.unavailableReason ?? "계산 기준 확인 필요",
      reason: source.reason,
    };
  }

  if (source.status === "calculation-unavailable") {
    return {
      value,
      status: "calculation-unavailable",
      label:
        source.label ?? CALCULATION_STATUS_LABELS["calculation-unavailable"],
      unavailableReason: source.unavailableReason ?? "계산 불가",
      reason: source.reason,
    };
  }

  return { value, status: "ok" };
}

function heldSource(metrics: LedgerReviewMetric[]) {
  return (
    metrics.find((metric) => metric.status === "policy-unconfirmed") ??
    metrics.find((metric) => metric.status === "calculation-unavailable") ??
    null
  );
}

function finiteAmount(metric: LedgerReviewMetric) {
  if (metric.value === null || !Number.isFinite(metric.value)) {
    return null;
  }

  return metric.value;
}

function marginRate(
  sales: LedgerReviewMetric,
  costOfGoodsSold: LedgerReviewMetric,
  missingSalesReason: string,
  missingCostReason: string,
  zeroSalesReason: string,
): LedgerReviewMetric {
  const salesAmount = finiteAmount(sales);
  const costAmount = finiteAmount(costOfGoodsSold);

  if (salesAmount === null) {
    return insufficient(sales.reason ?? missingSalesReason);
  }

  if (costAmount === null) {
    return insufficient(costOfGoodsSold.reason ?? missingCostReason);
  }

  if (salesAmount <= 0) {
    return insufficient(zeroSalesReason);
  }

  const value = (salesAmount - costAmount) / salesAmount;
  const held = heldSource([sales, costOfGoodsSold]);

  return held ? withHeldStatus(value, held) : { value, status: "ok" };
}

/**
 * 실제 마진율 = (영업 매출 − 매출원가) / 영업 매출.
 * 예상 마진율 = (예상 매출 − 같은 매출원가) / 예상 매출.
 * 매출 차이 = 영업 매출 − 예상 매출.
 */
export function buildMarginPairBasis({
  operatingSales,
  expectedSales,
  costOfGoodsSold,
}: {
  operatingSales: LedgerReviewMetric;
  expectedSales: LedgerReviewMetric;
  costOfGoodsSold: LedgerReviewMetric;
}): MarginPairBasis {
  const operatingAmount = finiteAmount(operatingSales);
  const expectedAmount = finiteAmount(expectedSales);

  return {
    operatingSales,
    expectedSales,
    costOfGoodsSold,
    actualMarginRate: marginRate(
      operatingSales,
      costOfGoodsSold,
      "영업 매출이 없어 실제 마진율을 계산할 수 없습니다.",
      "매출원가가 없어 실제 마진율을 계산할 수 없습니다.",
      "영업 매출이 없어 실제 마진율을 계산할 수 없습니다.",
    ),
    expectedMarginRate: marginRate(
      expectedSales,
      costOfGoodsSold,
      "예상 매출이 없어 예상 마진율을 계산할 수 없습니다.",
      "매출원가가 없어 예상 마진율을 계산할 수 없습니다.",
      "계획 매출 또는 매출이익이 부족해 판매가 기준 마진율을 계산할 수 없습니다.",
    ),
    plannedVsActualSalesDifference:
      operatingAmount === null
        ? insufficient(
            "영업 매출이 없어 매출 차이를 계산할 수 없습니다.",
            operatingSales,
          )
        : expectedAmount === null
          ? insufficient(
              "예상 매출이 없어 매출 차이를 계산할 수 없습니다.",
              expectedSales,
            )
          : (() => {
              const held = heldSource([operatingSales, expectedSales]);
              const value = operatingAmount - expectedAmount;

              return held
                ? withHeldStatus(value, held)
                : { value, status: "ok" as const };
            })(),
  };
}

function sumMoney(
  metrics: LedgerReviewMetric[],
  emptyReason: string,
): LedgerReviewMetric {
  if (metrics.length === 0) {
    return insufficient(emptyReason);
  }

  const missingMetric = metrics.find((metric) => finiteAmount(metric) === null);

  if (missingMetric) {
    return insufficient(
      missingMetric.reason ?? "합계 계산에 필요한 장부 데이터가 부족합니다.",
      missingMetric,
    );
  }

  const total = metrics.reduce((sum, metric) => sum + (metric.value ?? 0), 0);
  const held = heldSource(metrics);

  return held ? withHeldStatus(total, held) : { value: total, status: "ok" };
}

/** 기간 쌍은 하루 마진율을 평균하지 않고, 합산한 입력으로 다시 한 번만 낸다. */
export function aggregateMarginPairBasis(
  days: MarginPairBasis[],
): MarginPairBasis {
  const emptyReason = "합계 계산 대상 장부가 없습니다.";

  return buildMarginPairBasis({
    operatingSales: sumMoney(
      days.map((day) => day.operatingSales),
      emptyReason,
    ),
    expectedSales: sumMoney(
      days.map((day) => day.expectedSales),
      emptyReason,
    ),
    costOfGoodsSold: sumMoney(
      days.map((day) => day.costOfGoodsSold),
      emptyReason,
    ),
  });
}
