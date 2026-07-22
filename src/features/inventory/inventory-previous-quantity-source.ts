/**
 * 재고/손실 가용 계산에서 전일(또는 월초) 수량 원본을 고르는 공통 정책.
 * getCarryoverBases와 손실 가용 previousQuantity 조회가 같은 분기를 쓰도록 한다.
 */
export type InventoryPreviousQuantitySource =
  | "SAME_MONTH_PRIOR_LEDGER"
  | "OPENING_SNAPSHOT"
  | "CROSS_MONTH_PRIOR_LEDGER"
  | "NONE";

export function resolveInventoryPreviousQuantitySource({
  closingYearMonth,
  priorLedgerClosingYearMonth,
  hasOpeningSnapshots,
}: {
  closingYearMonth: string;
  priorLedgerClosingYearMonth: string | null;
  hasOpeningSnapshots: boolean;
}): InventoryPreviousQuantitySource {
  if (
    priorLedgerClosingYearMonth != null &&
    priorLedgerClosingYearMonth === closingYearMonth
  ) {
    return "SAME_MONTH_PRIOR_LEDGER";
  }

  if (hasOpeningSnapshots) {
    return "OPENING_SNAPSHOT";
  }

  if (priorLedgerClosingYearMonth != null) {
    return "CROSS_MONTH_PRIOR_LEDGER";
  }

  return "NONE";
}
