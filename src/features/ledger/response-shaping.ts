import type {
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

export function toStoreManagerLedgerReviewStepData(
  data: LedgerReviewStepData,
): StoreManagerLedgerReviewStepData {
  const signals = data.signals.map(({ amount, ...signal }) => {
    void amount;

    return signal;
  });

  return {
    ...data,
    signals,
    summary: {
      totalSales: data.summary.totalSales,
      paymentDifference: data.summary.paymentDifference,
    },
  };
}
