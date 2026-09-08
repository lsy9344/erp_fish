import type { LedgerReviewMetric } from "~/server/calculations/ledger";
import type {
  PeriodAnalysisMetric,
  PeriodContrastDelta,
} from "../period-analysis";
import { formatPeriodAbsoluteDelta } from "../period-analysis";

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});
const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});
const signedPercentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
const headcountFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPeriodMetricValue(
  kind: PeriodAnalysisMetric["kind"],
  metric: LedgerReviewMetric | null,
) {
  if (metric?.value == null) {
    return metric?.label ?? metric?.unavailableReason ?? "-";
  }

  if (kind === "percent") {
    return percentFormatter.format(metric.value);
  }

  if (kind === "headcount") {
    return `${headcountFormatter.format(metric.value)}명`;
  }

  return krwFormatter.format(metric.value);
}

// 비율 지표는 %p 차분, 평균 근무인원은 사람 수 차이, 나머지는 % 비율이다.
export function formatPeriodDelta(delta: PeriodContrastDelta) {
  if (delta.value === null) {
    return delta.unavailableReason ?? "-";
  }

  if (delta.kind === "point") {
    const points = delta.value * 100;

    return `${points > 0 ? "+" : ""}${points.toFixed(1)}%p`;
  }

  if (delta.kind === "absolute") {
    return formatPeriodAbsoluteDelta(delta.value);
  }

  return signedPercentFormatter.format(delta.value);
}

// 재고비율은 "높을수록 좋음"이 아니므로 색을 뒤집는다.
export function getPeriodDeltaToneClass(
  metricKey: string,
  delta: PeriodContrastDelta,
) {
  if (delta.value === null || delta.value === 0) {
    return "text-muted-foreground";
  }

  const isGood =
    metricKey === "inventoryToSalesRatio" ? delta.value < 0 : delta.value > 0;

  return isGood
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";
}
