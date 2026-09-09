export const FROZEN_CONVERSION_PRODUCT_PREFIX = "활냉)";

export function toFrozenConversionProductName(sourceProductName: string) {
  return `${FROZEN_CONVERSION_PRODUCT_PREFIX}${sourceProductName}`;
}
