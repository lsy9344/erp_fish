export function calculatePlannedMarginRate(
  purchaseUnitPrice: number | null,
  plannedUnitPrice: number | null,
) {
  if (
    purchaseUnitPrice === null ||
    !Number.isFinite(purchaseUnitPrice) ||
    purchaseUnitPrice < 0 ||
    plannedUnitPrice === null ||
    !Number.isFinite(plannedUnitPrice) ||
    plannedUnitPrice <= 0
  ) {
    return null;
  }

  return ((plannedUnitPrice - purchaseUnitPrice) / plannedUnitPrice) * 100;
}

export function formatPlannedMarginRate(rate: number | null) {
  return rate === null || !Number.isFinite(rate) ? "계산 불가" : `${rate.toFixed(1)}%`;
}
