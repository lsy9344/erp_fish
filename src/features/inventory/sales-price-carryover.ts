export const SALES_PRICE_CARRYOVER_LEDGER_STATUSES = [
  "IN_REVIEW",
  "HEADQUARTERS_CLOSED",
] as const;

export type SalesPriceCarryoverLedgerStatus =
  (typeof SALES_PRICE_CARRYOVER_LEDGER_STATUSES)[number];

export type PlannedUnitPriceSource = "CURRENT" | "CARRYOVER";

export type PlannedUnitPriceDisplay = {
  plannedUnitPrice: number | null;
  plannedUnitPriceSource: PlannedUnitPriceSource | null;
};

export function isSalesPriceCarryoverLedgerStatus(
  status: string,
): status is SalesPriceCarryoverLedgerStatus {
  return (SALES_PRICE_CARRYOVER_LEDGER_STATUSES as readonly string[]).includes(
    status,
  );
}

/**
 * 판매한 가격 이월 원본 영업일을 고른다.
 * - 당일보다 이전 장부만 후보
 * - IN_REVIEW / HEADQUARTERS_CLOSED만 허용 (IN_PROGRESS·HOLIDAY 제외)
 * - 월 경계 필터는 두지 않는다 (전월 제출 장부도 허용)
 */
export function selectSalesPriceCarryoverSourceDate(
  currentClosingDate: Date,
  candidates: readonly { closingDate: Date; status: string }[],
): Date | null {
  const currentTime = currentClosingDate.getTime();
  let best: { closingDate: Date; time: number } | null = null;

  for (const candidate of candidates) {
    if (!isSalesPriceCarryoverLedgerStatus(candidate.status)) {
      continue;
    }

    const time = candidate.closingDate.getTime();
    if (!(time < currentTime)) {
      continue;
    }

    if (!best || time > best.time) {
      best = { closingDate: candidate.closingDate, time };
    }
  }

  return best?.closingDate ?? null;
}

export function resolvePlannedUnitPriceDisplay({
  currentPlannedUnitPrice,
  carryoverPlannedUnitPrice,
}: {
  currentPlannedUnitPrice: number | null | undefined;
  carryoverPlannedUnitPrice: number | null | undefined;
}): PlannedUnitPriceDisplay {
  if (currentPlannedUnitPrice != null) {
    return {
      plannedUnitPrice: currentPlannedUnitPrice,
      plannedUnitPriceSource: "CURRENT",
    };
  }

  if (carryoverPlannedUnitPrice != null) {
    return {
      plannedUnitPrice: carryoverPlannedUnitPrice,
      plannedUnitPriceSource: "CARRYOVER",
    };
  }

  return {
    plannedUnitPrice: null,
    plannedUnitPriceSource: null,
  };
}

export function formatInventoryConflictSalePrice({
  plannedUnitPrice,
  plannedUnitPriceSource,
}: PlannedUnitPriceDisplay): string {
  if (plannedUnitPrice == null) {
    return "-";
  }

  if (plannedUnitPriceSource === "CURRENT") {
    return `${plannedUnitPrice}(당일)`;
  }

  if (plannedUnitPriceSource === "CARRYOVER") {
    return `${plannedUnitPrice}(이월)`;
  }

  return String(plannedUnitPrice);
}

export function buildInventoryConflictServerValues(
  items: readonly {
    productName: string;
    currentQuantity: number | null;
    quantity: number | null;
    plannedUnitPrice: number | null;
    plannedUnitPriceSource: PlannedUnitPriceSource | null;
  }[],
): Record<string, string> {
  return Object.fromEntries(
    items.map((item) => [
      item.productName,
      `당일재고 ${item.currentQuantity ?? "-"} / 표시재고 ${item.quantity ?? "-"} / 판매한 가격 ${formatInventoryConflictSalePrice(
        {
          plannedUnitPrice: item.plannedUnitPrice,
          plannedUnitPriceSource: item.plannedUnitPriceSource,
        },
      )}`,
    ]),
  );
}

export function applySalesPriceCarryoverFallback<
  T extends { productId: string; plannedUnitPrice: number | null },
>(
  rows: readonly T[],
  carryoverByProductId: ReadonlyMap<string, number>,
): Array<T & PlannedUnitPriceDisplay> {
  return rows.map((row) => {
    const resolved = resolvePlannedUnitPriceDisplay({
      currentPlannedUnitPrice: row.plannedUnitPrice,
      carryoverPlannedUnitPrice:
        carryoverByProductId.get(row.productId) ?? null,
    });

    return {
      ...row,
      plannedUnitPrice: resolved.plannedUnitPrice,
      plannedUnitPriceSource: resolved.plannedUnitPriceSource,
    };
  });
}
