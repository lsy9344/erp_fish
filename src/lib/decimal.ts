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
const storeInventoryQuantityInputPattern = /^\d+(?:\.\d{1,2})?$/;
const legacyStockQuantityPattern = /^\d+\.\d{2}$/;
const maxStoreInventoryQuantity = 9_999_999_999.99;

function parseTwoDecimalQuantityDraft(value: string) {
  const trimmed = value.trim();

  if (!storeInventoryQuantityInputPattern.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) && parsed <= maxStoreInventoryQuantity
    ? parsed
    : null;
}

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

export function parseLossQuantityDraft(value: string) {
  return parseTwoDecimalQuantityDraft(value);
}

export function toLossQuantitySaveInput(value: string) {
  return value.trim();
}

export function parseStoreInventoryQuantityDraft(value: string) {
  return parseTwoDecimalQuantityDraft(value);
}

export function toStoreInventoryQuantitySaveInput(value: string) {
  return value.trim();
}
