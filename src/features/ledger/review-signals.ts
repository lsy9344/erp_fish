import { isPurchaseDrivenSale } from "../inventory/inventory-persist-policy.ts";
import type { LedgerReviewSignal } from "./review-types";

export type LedgerReviewSignalInventoryItem = {
  productId: string;
  productName: string;
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number;
  currentQuantity: number | null;
  adjustment?: {
    differenceQuantity?: number | null;
    differenceAmount?: number | null;
  } | null;
};

export type LedgerReviewSignalLossCandidate = {
  productId: string;
  productName: string;
  quantity: number;
  amount: number;
};

export function buildLedgerReviewSignals({
  inventoryItems,
  lossSignalCandidates,
}: {
  inventoryItems: LedgerReviewSignalInventoryItem[];
  lossSignalCandidates: LedgerReviewSignalLossCandidate[];
}): LedgerReviewSignal[] {
  const inventorySignals = inventoryItems.flatMap<LedgerReviewSignal>(
    (item) => {
      const differenceQuantity = item.adjustment?.differenceQuantity ?? 0;
      const differenceAmount = item.adjustment?.differenceAmount ?? 0;

      if (differenceQuantity === 0 && differenceAmount === 0) {
        return [];
      }

      if (isPurchaseDrivenSale(item)) {
        return [];
      }

      return [buildInventorySignal(item, differenceQuantity, differenceAmount)];
    },
  );

  const lossSignals = lossSignalCandidates.map<LedgerReviewSignal>((item) => ({
    id: `loss-${item.productId}`,
    label: "손실 기록 있음",
    detail: `${item.productName} 손실 항목이 기록되어 제출 전 확인해 주세요.`,
    quantity: item.quantity,
    amount: item.amount,
  }));

  return [...inventorySignals, ...lossSignals];
}

// 손실이 섞인 부족 방향은 재고 실사 차이가 아니라 "손실 제외 후 남은 재고 기준 판매
// 추정"으로 읽는다(2026-06-26 WO). 원시 quantity 부호는 본사/리포트와 공유하므로 그대로
// 두고, 지점장 표시용 라벨/문구만 quantityLabel·quantityText로 분리해 덧붙인다.
function buildInventorySignal(
  item: LedgerReviewSignalInventoryItem,
  differenceQuantity: number,
  differenceAmount: number,
): LedgerReviewSignal {
  if (differenceQuantity < 0 && item.lossQuantity > 0) {
    const estimatedSalesQuantity = Math.abs(differenceQuantity);

    return {
      id: `inventory-${item.productId}`,
      label: "판매 추정 확인",
      detail: `${item.productName}는 손실 ${item.lossQuantity}개를 제외한 뒤, 남은 재고를 기준으로 ${estimatedSalesQuantity}개 판매로 계산됩니다.`,
      quantity: differenceQuantity,
      quantityLabel: "판매 추정",
      quantityText: `${estimatedSalesQuantity}개`,
      amount: differenceAmount,
    };
  }

  const signal: LedgerReviewSignal = {
    id: `inventory-${item.productId}`,
    label: "재고 확인 필요",
    detail: buildInventorySignalDetail(item.productName, differenceQuantity),
    amount: differenceAmount,
  };

  if (differenceQuantity !== 0) {
    signal.quantity = differenceQuantity;
  }

  return signal;
}

function buildInventorySignalDetail(
  productName: string,
  differenceQuantity: number,
) {
  if (differenceQuantity < 0) {
    return `${productName} 기준보다 ${Math.abs(differenceQuantity)}개 부족합니다.`;
  }

  if (differenceQuantity > 0) {
    return `${productName} 기준보다 ${differenceQuantity}개 많습니다.`;
  }

  return `${productName} 재고 금액 기준 확인이 필요합니다.`;
}
