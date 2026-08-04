import type { InventoryPurchasePrice } from "./types";

export type InventoryPurchasePriceRow = {
  productId: string | null;
  businessDate: string;
  quantity: number;
  amount: number;
};

export type InventoryCarryoverWeightedAverageRow = {
  productId: string | null;
  currentPreviousQuantity: number | null;
  sourceClosingQuantity: number | null;
  sourceInventoryAmount: number | null;
  purchasedQuantity: number;
  purchaseAmount: number;
};

function toQuantityHundredths(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return null;
  }

  const hundredths = Math.round(value * 100);

  return Number.isSafeInteger(hundredths) &&
    Math.abs(value * 100 - hundredths) < 1e-7
    ? hundredths
    : null;
}

function isValidAmount(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}

/**
 * 표시 전용 수량가중평균의 원 단위 단가를 계산한다.
 *
 * sourceClosingQuantity는 원천 장부의 마감수량이며, 현재 화면의 전일수량과
 * 일치할 때만 원천 inventoryAmount를 신뢰한다. 저장 단가·FIFO 금액에는
 * 이 결과를 사용하지 않는다.
 */
export function calculateInventoryCarryoverWeightedAveragePrice({
  currentPreviousQuantity,
  sourceClosingQuantity,
  sourceInventoryAmount,
  purchasedQuantity,
  purchaseAmount,
}: Omit<InventoryCarryoverWeightedAverageRow, "productId">) {
  const previousHundredths = toQuantityHundredths(currentPreviousQuantity);
  const sourceHundredths = toQuantityHundredths(sourceClosingQuantity);
  const purchasedHundredths = toQuantityHundredths(purchasedQuantity);

  if (
    previousHundredths === null ||
    sourceHundredths === null ||
    previousHundredths !== sourceHundredths ||
    previousHundredths <= 0 ||
    purchasedHundredths === null ||
    purchasedHundredths <= 0 ||
    !isValidAmount(sourceInventoryAmount) ||
    !isValidAmount(purchaseAmount)
  ) {
    return null;
  }

  const totalHundredths = previousHundredths + purchasedHundredths;
  const totalAmount = sourceInventoryAmount + purchaseAmount;
  const scaledTotalAmount = totalAmount * 100;

  if (
    !Number.isSafeInteger(totalHundredths) ||
    totalHundredths <= 0 ||
    !Number.isSafeInteger(totalAmount) ||
    !Number.isSafeInteger(scaledTotalAmount)
  ) {
    return null;
  }

  const unitPrice = Math.round(scaledTotalAmount / totalHundredths);

  return Number.isSafeInteger(unitPrice) && unitPrice >= 0 ? unitPrice : null;
}

export function resolveInventoryCarryoverWeightedAveragePrices(
  rows: InventoryCarryoverWeightedAverageRow[],
) {
  const prices = new Map<string, InventoryPurchasePrice | null>();

  for (const row of rows) {
    if (!row.productId) {
      continue;
    }

    prices.set(row.productId, null);

    const unitPrice = calculateInventoryCarryoverWeightedAveragePrice(row);

    if (unitPrice === null) {
      continue;
    }

    prices.set(row.productId, {
      kind: "AVERAGE",
      unitPrice,
    });
  }

  return prices;
}

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
