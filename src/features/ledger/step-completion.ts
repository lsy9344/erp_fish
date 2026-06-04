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
  inventoryItemCount?: number;
  lossItemCount?: number;
};

export function getStoreEntryStepCompletion({
  totalSalesAmount,
  workerCount,
  ledgerExpenses,
  ledgerPurchaseItems,
  inventoryItemCount = 0,
  lossItemCount = 0,
}: StoreEntryStepCompletionInput): StoreEntryStepCompletion {
  return {
    sales: totalSalesAmount > 0,
    cost: ledgerExpenses.length > 0,
    purchase: ledgerPurchaseItems.length > 0,
    inventory: inventoryItemCount > 0,
    losses: lossItemCount > 0,
    work: workerCount !== null,
  };
}
