export function calculatePreviousDaySalesQuantity({
  previousQuantity,
  purchasedQuantity,
  lossQuantity,
  closingQuantity,
}: {
  previousQuantity: number | null;
  purchasedQuantity: number | null;
  lossQuantity: number | null;
  closingQuantity: number | null;
}) {
  if (
    previousQuantity === null ||
    purchasedQuantity === null ||
    closingQuantity === null
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.round(
      (previousQuantity +
        purchasedQuantity -
        (lossQuantity ?? 0) -
        closingQuantity +
        Number.EPSILON) *
        100,
    ) / 100,
  );
}

export function getLatestArrivalDate(values: readonly (Date | null)[]) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) {
      return latest;
    }

    return !latest || value > latest ? value : latest;
  }, null);
}
