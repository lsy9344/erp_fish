import type { InventoryPurchasePrice } from "./types";

export type InventoryPurchasePriceRow = {
  productId: string | null;
  businessDate: string;
  quantity: number;
  amount: number;
};

export function resolveInventoryPurchasePrices(
  targetDate: string,
  rows: InventoryPurchasePriceRow[],
) {
  const prices = new Map<string, InventoryPurchasePrice | null>();
  const selectedByProduct = new Map<
    string,
    { businessDate: string; quantity: number; amount: number }
  >();

  for (const row of rows) {
    if (!row.productId) {
      continue;
    }
    prices.set(row.productId, null);
    if (row.businessDate > targetDate || row.quantity <= 0) {
      continue;
    }

    const selected = selectedByProduct.get(row.productId);
    if (!selected || row.businessDate > selected.businessDate) {
      selectedByProduct.set(row.productId, {
        businessDate: row.businessDate,
        quantity: row.quantity,
        amount: row.amount,
      });
    } else if (row.businessDate === selected.businessDate) {
      selected.quantity += row.quantity;
      selected.amount += row.amount;
    }
  }

  for (const [productId, selected] of selectedByProduct) {
    prices.set(
      productId,
      selected.quantity > 0
        ? {
            kind: selected.businessDate === targetDate ? "TODAY" : "RECENT",
            businessDate: selected.businessDate,
            unitPrice: Math.round(selected.amount / selected.quantity),
          }
        : null,
    );
  }

  return prices;
}
