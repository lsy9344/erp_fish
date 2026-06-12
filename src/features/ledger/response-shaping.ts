import type {
  LedgerReviewStepMetric,
  LedgerReviewStepData,
  StoreManagerLedgerReviewStepData,
} from "./review-types";
import type {
  LedgerCostStepData,
  StoreManagerLedgerCostStepData,
} from "./types";

export function toStoreManagerLedgerCostStepData(
  data: LedgerCostStepData,
): StoreManagerLedgerCostStepData {
  const { grossProfit, productivity, ...safeLedger } = data;

  void grossProfit;
  void productivity;

  return safeLedger;
}

const storeManagerReviewMetricIds = new Set([
  "totalSales",
  "paymentTotal",
  "paymentDifference",
  "expenseCount",
  "purchaseCount",
  "inventoryCount",
  "reviewStatus",
  "lossCount",
  "workerCount",
]);

function toStoreManagerReviewStepMetrics(
  metrics: LedgerReviewStepMetric[],
): LedgerReviewStepMetric[] {
  return metrics.filter((metric) => storeManagerReviewMetricIds.has(metric.id));
}

export function toStoreManagerLedgerReviewStepData(
  data: LedgerReviewStepData,
): StoreManagerLedgerReviewStepData {
  const signals = data.signals.map(({ amount, ...signal }) => {
    void amount;

    return signal;
  });
  const stepSummaries = data.stepSummaries.map((stepSummary) => ({
    ...stepSummary,
    metrics: toStoreManagerReviewStepMetrics(stepSummary.metrics),
  }));

  return {
    ...data,
    signals,
    stepSummaries,
    summary: {
      totalSales: data.summary.totalSales,
      paymentDifference: data.summary.paymentDifference,
    },
  };
}
