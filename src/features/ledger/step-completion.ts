import { calculateOperatingSalesAmount } from "../../server/calculations/ledger.ts";

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
  carryoverSalesAmount?: number;
  cashAmount?: number;
  cardAmount?: number;
  otherPaymentAmount?: number;
  workerCount: number | null;
  ledgerExpenses: readonly unknown[];
  ledgerPurchaseItems: readonly unknown[];
  /** @deprecated Inventory completion must come from InventoryPlanGate. */
  inventoryItemCount?: number;
  inventoryComplete?: boolean;
  lossItemCount?: number;
  lossReviewedAt?: Date | string | null;
};

export function getStoreEntryStepCompletion({
  totalSalesAmount,
  carryoverSalesAmount = 0,
  cashAmount = 0,
  cardAmount = 0,
  otherPaymentAmount = 0,
  workerCount,
  ledgerExpenses,
  ledgerPurchaseItems,
  inventoryComplete = false,
  lossItemCount = 0,
  lossReviewedAt = null,
}: StoreEntryStepCompletionInput): StoreEntryStepCompletion {
  return {
    sales:
      calculateOperatingSalesAmount(totalSalesAmount, carryoverSalesAmount) >
        0 ||
      cashAmount > 0 ||
      cardAmount > 0 ||
      otherPaymentAmount > 0,
    cost: ledgerExpenses.length > 0,
    purchase: ledgerPurchaseItems.length > 0,
    inventory: inventoryComplete,
    losses: lossItemCount > 0 || lossReviewedAt !== null,
    work: workerCount !== null,
  };
}
