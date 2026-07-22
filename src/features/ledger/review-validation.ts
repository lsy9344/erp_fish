import { getKstLedgerDateParam } from "./date.ts";
import type { LedgerReviewMissingItem } from "./review-types";
import { calculateOperatingSalesAmount } from "../../server/calculations/ledger.ts";

export function getLedgerReviewStepHref(
  storeId: string,
  closingDate: string,
  step: "sales" | "expenses" | "purchases" | "inventory" | "losses" | "work",
) {
  if (step === "inventory" || step === "losses") {
    const params = new URLSearchParams({
      storeId,
      date: getKstLedgerDateParam(closingDate),
    });

    return `/app/store-entry/${step}?${params.toString()}`;
  }

  const storeEntryStep =
    step === "expenses" ? "cost" : step === "purchases" ? "purchase" : step;
  const params = new URLSearchParams({
    storeId,
    date: getKstLedgerDateParam(closingDate),
    step: storeEntryStep,
  });

  return `/app/store-entry?${params.toString()}`;
}

export function getLedgerReviewMissingItems({
  storeId,
  closingDate,
  totalSalesAmount,
  carryoverSalesAmount = 0,
  paymentTotal,
  expenseCount,
  purchaseCount,
  hasInventoryUnavailable,
  inventoryCount,
  missingInventoryPlanCount = 0,
  lossCount,
  workerCount,
}: {
  storeId: string;
  closingDate: string;
  totalSalesAmount: number;
  carryoverSalesAmount?: number;
  paymentTotal: number;
  expenseCount: number;
  purchaseCount: number;
  hasInventoryUnavailable: boolean;
  inventoryCount: number;
  missingInventoryPlanCount?: number;
  lossCount: number;
  workerCount: number | null;
}): LedgerReviewMissingItem[] {
  const items: LedgerReviewMissingItem[] = [];

  // 단계 순서 변경(2026-07-02): 누락/확인 항목도 지점 입력 순서
  // (매입>손실>재고>지출>근무>매출)와 동일하게 정렬한다.
  if (purchaseCount === 0) {
    items.push({
      id: "purchases",
      label: "매입",
      href: getLedgerReviewStepHref(storeId, closingDate, "purchases"),
      status: "missing",
      detail: "매입 항목이 아직 입력되지 않았습니다.",
    });
  }

  items.push({
    id: "losses",
    label: "손실/폐기",
    href: getLedgerReviewStepHref(storeId, closingDate, "losses"),
    status: "review",
    detail:
      lossCount === 0
        ? "손실 항목 없음으로 검토할 수 있습니다."
        : `손실 항목 ${lossCount}건이 저장되어 있습니다.`,
  });

  if (inventoryCount === 0 || hasInventoryUnavailable) {
    items.push({
      id: "inventory",
      label: "재고",
      href: getLedgerReviewStepHref(storeId, closingDate, "inventory"),
      status: "missing",
      detail:
        inventoryCount === 0
          ? "재고 항목이 아직 저장되지 않았습니다."
          : "재고 수량 또는 금액 중 계산할 수 없는 항목이 있습니다.",
    });
  }

  if (missingInventoryPlanCount > 0) {
    items.push({
      id: "inventory-plans",
      label: "판매한 가격",
      href: getLedgerReviewStepHref(storeId, closingDate, "inventory"),
      status: "missing",
      detail: `3단계 재고에서 판매한 가격이 누락된 품목 ${missingInventoryPlanCount}건을 입력해 주세요.`,
    });
  }

  if (expenseCount === 0) {
    items.push({
      id: "expenses",
      label: "지출",
      href: getLedgerReviewStepHref(storeId, closingDate, "expenses"),
      status: "missing",
      detail: "지출 항목이 아직 입력되지 않았습니다.",
    });
  }

  if (workerCount === null || workerCount <= 0) {
    items.push({
      id: "work",
      label: "근무인원",
      href: getLedgerReviewStepHref(storeId, closingDate, "work"),
      status: "missing",
      detail:
        workerCount === null
          ? "근무인원이 아직 입력되지 않았습니다."
          : "근무인원은 1명 이상이어야 제출할 수 있습니다.",
    });
  }

  if (
    calculateOperatingSalesAmount(totalSalesAmount, carryoverSalesAmount) ===
      0 &&
    paymentTotal === 0
  ) {
    items.push({
      id: "sales",
      label: "영업 매출/결제",
      href: getLedgerReviewStepHref(storeId, closingDate, "sales"),
      status: "missing",
      detail: "영업 매출 합계와 결제 금액이 아직 입력되지 않았습니다.",
    });
  }

  return items;
}
