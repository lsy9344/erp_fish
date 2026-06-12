const defaultSensitiveFieldKeys = [
  "costOfGoodsSold",
  "fifoCostOfGoodsSold",
  "fifoInventoryAmount",
  "grossProfit",
  "grossMarginRate",
  "hopedSalePriceLossAmount",
  "operatingProfit",
  "productivity",
  "inventoryAmount",
  "salesDifference",
  "salesDifferenceMeaningChange",
  "salesDifferenceThresholdAnomaly",
  "storeManagerSensitiveDerivedMetrics",
  "30%단가",
  "30단가",
  "thirtyPercent",
  "thirtyPercentUnitPrice",
  "price30",
  "margin30",
  "unitPrice",
  "beforeAmount",
  "afterAmount",
  "differenceAmount",
  "amountDifference",
  "marginRate",
  "lot",
  "fixedCost",
  "comparisonStore",
  "comparisonStoreValue",
] as const;

function isSensitiveFieldKey(
  key: string,
  sensitiveFieldKeys: readonly string[],
) {
  const normalizedKey = key.toLowerCase();
  const compactKey = compactFieldKey(key);
  const keyParts = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/)
    .filter(Boolean);

  return sensitiveFieldKeys.some((sensitiveKey) => {
    const normalizedSensitiveKey = sensitiveKey.toLowerCase();
    const compactSensitiveKey = compactFieldKey(sensitiveKey);

    if (normalizedSensitiveKey.length <= 3) {
      return keyParts.includes(normalizedSensitiveKey);
    }

    return (
      normalizedKey.includes(normalizedSensitiveKey) ||
      compactKey.includes(compactSensitiveKey)
    );
  });
}

function compactFieldKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "");
}

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
    if (isSensitiveFieldKey(key, sensitiveFieldKeys)) {
      return [];
    }

    return [[key, omitSensitiveFields(nestedValue, sensitiveFieldKeys)]];
  });

  return Object.fromEntries(safeEntries);
}
