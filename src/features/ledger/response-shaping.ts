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
  return {
    ...data,
    summary: {
      totalSales: data.summary.totalSales,
      grossMarginRate: data.summary.grossMarginRate,
      inventoryAmount: data.summary.inventoryAmount,
      paymentDifference: data.summary.paymentDifference,
    },
  };
}
