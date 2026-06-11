const defaultSensitiveFieldKeys = new Set([
  "costOfGoodsSold",
  "grossProfit",
  "grossMarginRate",
  "operatingProfit",
  "productivity",
  "inventoryAmount",
  "unitPrice",
  "beforeAmount",
  "afterAmount",
  "differenceAmount",
  "lot",
  "fixedCost",
  "comparisonStore",
]);

export function omitSensitiveFields(
  value: unknown,
  sensitiveFieldKeys = defaultSensitiveFieldKeys,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => omitSensitiveFields(item, sensitiveFieldKeys));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const safeEntries = Object.entries(value).flatMap(([key, nestedValue]) => {
    if (sensitiveFieldKeys.has(key)) {
      return [];
    }

    return [[key, omitSensitiveFields(nestedValue, sensitiveFieldKeys)]];
  });

  return Object.fromEntries(safeEntries);
}
