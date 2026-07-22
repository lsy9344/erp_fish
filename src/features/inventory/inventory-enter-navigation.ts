export function getNextInventoryQuantityTarget(
  orderedProductIds: readonly string[],
  currentProductId: string,
  pageSize: number,
) {
  const currentIndex = orderedProductIds.indexOf(currentProductId);
  const nextIndex = currentIndex + 1;

  if (currentIndex < 0 || nextIndex >= orderedProductIds.length) {
    return null;
  }

  return {
    productId: orderedProductIds[nextIndex]!,
    page: Math.floor(nextIndex / pageSize) + 1,
  };
}
