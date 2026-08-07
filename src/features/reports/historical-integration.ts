import type { LedgerReviewMetric } from "../../server/calculations/ledger.ts";
import type {
  DailyMeetingReportMetricEvidence,
  DailyMeetingReportMetricKind,
  StoreComparisonReportRow,
} from "./types.ts";

export type HistoricalFactForReport = {
  businessDate: string;
  salesAmount: number | null;
  grossProfit: number | null;
  grossMarginRate: number | null;
  productivity: number | null;
  workerCount: number | null;
  metricStatus: unknown;
};

function available(value: number): LedgerReviewMetric {
  return { value, status: "ok" };
}

function missing(reason: string): LedgerReviewMetric {
  return {
    value: null,
    status: "data-insufficient",
    label: "데이터 부족",
    unavailableReason: "계산 불가",
    reason,
  };
}

function strictSum(
  facts: HistoricalFactForReport[],
  key: "salesAmount" | "grossProfit" | "workerCount",
): number | null {
  if (facts.length === 0 || facts.some((fact) => fact[key] === null)) {
    return null;
  }
  return facts.reduce((sum, fact) => sum + (fact[key] ?? 0), 0);
}

function combineTotal({
  operational,
  operationalDayCount,
  historical,
  hasHistoricalBusinessDay,
  label,
}: {
  operational: LedgerReviewMetric;
  operationalDayCount: number;
  historical: number | null;
  hasHistoricalBusinessDay: boolean;
  label: string;
}): LedgerReviewMetric {
  if (historical === null) {
    // 휴무/공란 원본만 있고 실제 과거 영업일이 없으면 운영 합계를 훼손하지 않는다.
    if (!hasHistoricalBusinessDay && operationalDayCount > 0) {
      return operational;
    }
    return missing(`과거 Excel ${label}에 공란 또는 원본 오류가 있습니다.`);
  }
  if (operationalDayCount === 0) return available(historical);
  if (operational.value === null) {
    return missing(`운영 자료와 과거 Excel ${label}을 합산할 수 없습니다.`);
  }
  return available(operational.value + historical);
}

function withIntegratedEvidence({
  evidence,
  originalMetric,
  appliedMetric,
  kind,
  sourceLabel,
}: {
  evidence: DailyMeetingReportMetricEvidence;
  originalMetric: LedgerReviewMetric;
  appliedMetric: LedgerReviewMetric;
  kind: DailyMeetingReportMetricKind;
  sourceLabel: string;
}): DailyMeetingReportMetricEvidence {
  return {
    ...evidence,
    original: { ...originalMetric, kind },
    applied: { ...appliedMetric, kind },
    status:
      appliedMetric.value === null
        ? "data-insufficient"
        : evidence.isCorrected
          ? "corrected"
          : "original",
    statusLabel:
      appliedMetric.value === null
        ? `${sourceLabel} · 자료 없음/원본 오류`
        : sourceLabel,
    unavailableReason:
      appliedMetric.value === null
        ? (appliedMetric.reason ??
          appliedMetric.unavailableReason ??
          "자료 없음")
        : null,
  };
}

export function mergeHistoricalStoreComparisonRow({
  operationalRow,
  operationalLedgerCount,
  operationalBusinessDayCount,
  historicalFacts,
  excludedHistoricalOverlapCount,
  dateCount,
}: {
  operationalRow: StoreComparisonReportRow;
  operationalLedgerCount: number;
  operationalBusinessDayCount: number;
  historicalFacts: HistoricalFactForReport[];
  excludedHistoricalOverlapCount: number;
  dateCount: number;
}): StoreComparisonReportRow {
  if (historicalFacts.length === 0) {
    return {
      ...operationalRow,
      sourceSummary: {
        source: operationalLedgerCount > 0 ? "operational" : "none",
        operationalDayCount: operationalBusinessDayCount,
        historicalDayCount: 0,
        historicalCoverageDayCount: excludedHistoricalOverlapCount,
        excludedHistoricalOverlapCount,
        missingMetrics: [],
      },
    };
  }

  // 고객 Excel의 영업일수는 매출이 0/공란이 아닌 행을 센다. 휴무·미입력 행을
  // 합계에 넣으면 공란 하나 때문에 월 전체가 계산 불가가 되고 평균 분모도 틀어진다.
  const historicalBusinessFacts = historicalFacts.filter(
    (fact) => fact.salesAmount !== null && fact.salesAmount !== 0,
  );
  const hasHistoricalBusinessDay = historicalBusinessFacts.length > 0;
  const hasExplicitZeroSales = historicalFacts.some(
    (fact) => fact.salesAmount === 0,
  );
  const historicalSales = hasHistoricalBusinessDay
    ? strictSum(historicalBusinessFacts, "salesAmount")
    : hasExplicitZeroSales
      ? 0
      : null;
  const historicalGrossProfit = hasHistoricalBusinessDay
    ? strictSum(historicalBusinessFacts, "grossProfit")
    : null;
  const historicalWorkers = strictSum(historicalBusinessFacts, "workerCount");
  const salesAmount = combineTotal({
    operational: operationalRow.salesAmount,
    operationalDayCount: operationalBusinessDayCount,
    historical: historicalSales,
    hasHistoricalBusinessDay,
    label: "매출",
  });
  const grossProfit = combineTotal({
    operational: operationalRow.grossProfit,
    operationalDayCount: operationalBusinessDayCount,
    historical: historicalGrossProfit,
    hasHistoricalBusinessDay,
    label: "매출이익",
  });
  const originalSalesAmount = combineTotal({
    operational: operationalRow.metricEvidence.salesAmount.original,
    operationalDayCount: operationalBusinessDayCount,
    historical: historicalSales,
    hasHistoricalBusinessDay,
    label: "매출",
  });
  const originalGrossProfit = combineTotal({
    operational: operationalRow.metricEvidence.grossProfit.original,
    operationalDayCount: operationalBusinessDayCount,
    historical: historicalGrossProfit,
    hasHistoricalBusinessDay,
    label: "매출이익",
  });
  const operationalWorkers =
    operationalBusinessDayCount === 0
      ? 0
      : operationalRow.averageWorkerCount.value === null
        ? null
        : operationalRow.averageWorkerCount.value * operationalBusinessDayCount;
  const workerTotal =
    operationalWorkers === null || historicalWorkers === null
      ? null
      : operationalWorkers + historicalWorkers;
  const originalOperationalWorkers =
    operationalBusinessDayCount === 0
      ? 0
      : operationalRow.metricEvidence.salesAmount.original.value !== null &&
          operationalRow.metricEvidence.productivity.original.value !== null &&
          operationalRow.metricEvidence.productivity.original.value > 0
        ? operationalRow.metricEvidence.salesAmount.original.value /
          operationalRow.metricEvidence.productivity.original.value
        : !operationalRow.metricEvidence.productivity.isCorrected
          ? operationalWorkers
          : null;
  const originalWorkerTotal =
    originalOperationalWorkers === null || historicalWorkers === null
      ? null
      : originalOperationalWorkers + historicalWorkers;
  const businessDayCount =
    operationalBusinessDayCount + historicalBusinessFacts.length;
  const grossMarginRate =
    salesAmount.value !== null &&
    grossProfit.value !== null &&
    salesAmount.value > 0
      ? available(grossProfit.value / salesAmount.value)
      : missing("통합 이익률 계산에 필요한 매출 또는 매출이익이 없습니다.");
  const originalGrossMarginRate =
    originalSalesAmount.value !== null &&
    originalGrossProfit.value !== null &&
    originalSalesAmount.value > 0
      ? available(originalGrossProfit.value / originalSalesAmount.value)
      : missing(
          "통합 원본 이익률 계산에 필요한 매출 또는 매출이익이 없습니다.",
        );
  const averageWorkerCount =
    workerTotal !== null && businessDayCount > 0
      ? available(workerTotal / businessDayCount)
      : missing("과거 Excel 근무인원에 공란 또는 원본 오류가 있습니다.");
  const productivity =
    salesAmount.value !== null && workerTotal !== null && workerTotal > 0
      ? available(salesAmount.value / workerTotal)
      : missing("통합 인당생산성 계산에 필요한 매출 또는 근무인원이 없습니다.");
  const originalProductivity =
    originalSalesAmount.value !== null &&
    originalWorkerTotal !== null &&
    originalWorkerTotal > 0
      ? available(originalSalesAmount.value / originalWorkerTotal)
      : missing(
          "통합 원본 인당생산성 계산에 필요한 매출 또는 근무인원이 없습니다.",
        );
  const averageSales =
    salesAmount.value !== null && businessDayCount > 0
      ? available(salesAmount.value / businessDayCount)
      : missing("통합 평균매출 계산에 필요한 매출이 없습니다.");
  const originalAverageSales =
    originalSalesAmount.value !== null && businessDayCount > 0
      ? available(originalSalesAmount.value / businessDayCount)
      : missing("통합 원본 평균매출 계산에 필요한 매출이 없습니다.");
  // 고객 workbook의 재고 참조는 #REF!다. 운영 값이 있더라도 과거 구간을 0으로
  // 간주해 섞지 않고 누락으로 표시한다.
  const averageInventory = missing(
    "과거 Excel 평균재고는 원본 참조 오류로 계산할 수 없습니다.",
  );
  const inventoryToSalesRatio = missing(
    "과거 Excel 재고 값이 없어 매출대비 재고비율을 계산할 수 없습니다.",
  );
  // 고객의 영업이익은 인건비 차감 의미라 운영 영업이익과 정의가 다르다.
  const operatingProfit = missing(
    "과거 Excel 영업이익은 운영 리포트와 정의가 달라 합산하지 않습니다.",
  );
  const source = operationalBusinessDayCount > 0 ? "mixed" : "historical";
  const sourceLabel = source === "mixed" ? "운영 + 과거 Excel" : "과거 Excel";
  const missingMetrics = [
    ...(salesAmount.value === null ? ["매출"] : []),
    ...(grossProfit.value === null ? ["매출이익"] : []),
    ...(averageWorkerCount.value === null ? ["평균 근무인원"] : []),
    ...(productivity.value === null ? ["인당생산성"] : []),
    "평균재고",
    "매출대비 재고비율",
    "영업이익(정의 상이)",
  ];

  return {
    ...operationalRow,
    statusCounts: {
      ...operationalRow.statusCounts,
      missingDayCount: Math.max(
        0,
        dateCount - operationalLedgerCount - historicalFacts.length,
      ),
    },
    salesAmount,
    operatingSalesAmount: salesAmount,
    grossProfit,
    grossMarginRate,
    operatingProfit,
    averageWorkerCount,
    productivity,
    averageInventory,
    averageSales,
    inventoryToSalesRatio,
    hasLoss: operationalBusinessDayCount > 0 ? operationalRow.hasLoss : null,
    sourceSummary: {
      source,
      operationalDayCount: operationalBusinessDayCount,
      historicalDayCount: historicalBusinessFacts.length,
      historicalCoverageDayCount:
        historicalFacts.length + excludedHistoricalOverlapCount,
      excludedHistoricalOverlapCount,
      missingMetrics,
    },
    metricEvidence: {
      ...operationalRow.metricEvidence,
      salesAmount: withIntegratedEvidence({
        evidence: operationalRow.metricEvidence.salesAmount,
        originalMetric: originalSalesAmount,
        appliedMetric: salesAmount,
        kind: "money",
        sourceLabel,
      }),
      grossProfit: withIntegratedEvidence({
        evidence: operationalRow.metricEvidence.grossProfit,
        originalMetric: originalGrossProfit,
        appliedMetric: grossProfit,
        kind: "money",
        sourceLabel,
      }),
      grossMarginRate: withIntegratedEvidence({
        evidence: operationalRow.metricEvidence.grossMarginRate,
        originalMetric: originalGrossMarginRate,
        appliedMetric: grossMarginRate,
        kind: "percent",
        sourceLabel,
      }),
      operatingProfit: withIntegratedEvidence({
        evidence: operationalRow.metricEvidence.operatingProfit,
        originalMetric: operatingProfit,
        appliedMetric: operatingProfit,
        kind: "money",
        sourceLabel,
      }),
      productivity: withIntegratedEvidence({
        evidence: operationalRow.metricEvidence.productivity,
        originalMetric: originalProductivity,
        appliedMetric: productivity,
        kind: "money",
        sourceLabel,
      }),
      averageInventory: withIntegratedEvidence({
        evidence: operationalRow.metricEvidence.averageInventory,
        originalMetric: averageInventory,
        appliedMetric: averageInventory,
        kind: "money",
        sourceLabel,
      }),
      averageSales: withIntegratedEvidence({
        evidence: operationalRow.metricEvidence.averageSales,
        originalMetric: originalAverageSales,
        appliedMetric: averageSales,
        kind: "money",
        sourceLabel,
      }),
      inventoryToSalesRatio: withIntegratedEvidence({
        evidence: operationalRow.metricEvidence.inventoryToSalesRatio,
        originalMetric: inventoryToSalesRatio,
        appliedMetric: inventoryToSalesRatio,
        kind: "percent",
        sourceLabel,
      }),
    },
  };
}

export function historicalSourceLabel(
  source: StoreComparisonReportRow["sourceSummary"]["source"],
) {
  if (source === "historical") return "과거 Excel";
  if (source === "mixed") return "운영 + 과거 Excel";
  if (source === "operational") return "운영 장부";
  return "자료 없음";
}
