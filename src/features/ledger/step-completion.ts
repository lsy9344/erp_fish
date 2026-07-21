export type StoreEntryStep =
  | "sales"
  | "cost"
  | "purchase"
  | "inventory"
  | "losses"
  | "work"
  | "review";

export type StoreEntryStepCompletion = Partial<Record<StoreEntryStep, boolean>>;

type StoreEntryStepCompletionInput = {
  totalSalesAmount: number;
  workerCount: number | null;
  ledgerExpenses: readonly unknown[];
  ledgerPurchaseItems: readonly unknown[];
  inventoryComplete?: boolean;
  lossItemCount?: number;
  lossReviewedAt?: Date | string | null;
};

export function getStoreEntryStepCompletion({
  totalSalesAmount,
  workerCount,
  ledgerExpenses,
  ledgerPurchaseItems,
  inventoryComplete = false,
  lossItemCount = 0,
  lossReviewedAt = null,
}: StoreEntryStepCompletionInput): StoreEntryStepCompletion {
  return {
    sales: totalSalesAmount > 0,
    cost: ledgerExpenses.length > 0,
    purchase: ledgerPurchaseItems.length > 0,
    inventory: inventoryComplete,
    losses: lossItemCount > 0 || lossReviewedAt !== null,
    work: workerCount !== null,
  };
}
