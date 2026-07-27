// 2026-07-27 정책 변경: 제출 안 된 날(IN_PROGRESS)의 판매한 가격도 이월한다.
// StoreSalesPricePlan은 지점장이 재고 단계를 저장해야만 생기는 명시 입력값이라
// 장부 제출 여부와 신뢰도가 무관하다. 제출만 기준으로 삼았을 때는 장부가 하루라도
// IN_PROGRESS로 남으면 그날 넣은 가격이 통째로 증발해, 지점이 매일 다시 입력하거나
// 아무 숫자나 넣어 통과시키는 일이 실제로 발생했다(666666 등).
// HOLIDAY만 제외한다 — 휴무 장부는 저장 자체가 불가해 계획이 존재할 수 없고,
// 원천 후보로 뽑히면 그 아래 실제 영업일까지 가려버린다.
export const SALES_PRICE_CARRYOVER_LEDGER_STATUSES = [
  "IN_PROGRESS",
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
 * - HOLIDAY만 제외 (제출 전 IN_PROGRESS 장부도 허용)
 * - 월 경계 필터는 두지 않는다 (전월 장부도 허용)
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
