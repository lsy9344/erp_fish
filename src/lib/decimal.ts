type DecimalLike = {
  toNumber(): number;
};

export type DecimalNumber = number | DecimalLike;

export function decimalToNumber(value: DecimalNumber) {
  return typeof value === "number" ? value : value.toNumber();
}

export function nullableDecimalToNumber(value: DecimalNumber | null) {
  return value === null ? null : decimalToNumber(value);
}

const stockQuantityInputPattern = /^\d+(?:\.\d)?$/;
const legacyStockQuantityPattern = /^\d+\.\d{2}$/;

export function parseStockQuantityDraft(
  value: string,
  storedQuantity: number | null | undefined,
) {
  const trimmed = value.trim();
  const isOneDecimalInput = stockQuantityInputPattern.test(trimmed);
  const isExactStoredLegacyValue =
    storedQuantity !== null &&
    storedQuantity !== undefined &&
    value === String(storedQuantity) &&
    legacyStockQuantityPattern.test(value);

  if (!isOneDecimalInput && !isExactStoredLegacyValue) {
    return null;
  }

  const parsed = Number(isOneDecimalInput ? trimmed : value);

  return Number.isFinite(parsed) ? parsed : null;
}

export function toStockQuantitySaveInput(
  value: string,
  storedQuantity: number | null | undefined,
) {
  return storedQuantity !== null &&
    storedQuantity !== undefined &&
    value === String(storedQuantity) &&
    legacyStockQuantityPattern.test(value)
    ? null
    : value;
}
