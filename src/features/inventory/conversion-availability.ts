function roundToTwoDecimals(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getFrozenConversionAvailableQuantity(item: {
  id: string;
  productId: string;
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number;
  conversionInQuantity: number;
  conversionOutQuantity: number;
  currentQuantity: number | null;
  quantity: number | null;
}) {
  const storedRemaining = item.currentQuantity ?? item.quantity;
  const isUnconfirmedPurchaseSeed =
    item.id === item.productId && item.purchasedQuantity > 0;

  if (isUnconfirmedPurchaseSeed) {
    return Math.max(
      0,
      roundToTwoDecimals(
        item.previousQuantity +
          item.purchasedQuantity +
          item.conversionInQuantity -
          item.lossQuantity -
          item.conversionOutQuantity,
      ),
    );
  }

  return storedRemaining ?? 0;
}
