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

      const signal: LedgerReviewSignal = {
        id: `inventory-${item.productId}`,
        label: "재고 확인 필요",
        detail: buildInventorySignalDetail(
          item.productName,
          differenceQuantity,
          item.lossQuantity,
        ),
        amount: differenceAmount,
      };

      if (differenceQuantity !== 0) {
        signal.quantity = differenceQuantity;
      }

      return [signal];
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

function buildInventorySignalDetail(
  productName: string,
  differenceQuantity: number,
  lossQuantity: number,
) {
  if (differenceQuantity < 0) {
    const estimatedSalesQuantity = Math.abs(differenceQuantity);

    if (lossQuantity > 0) {
      return `${productName} ${estimatedSalesQuantity}개 판매로 계산됩니다. 손실 ${lossQuantity}개를 뺀 뒤, 남은 재고 기준으로 ${estimatedSalesQuantity}개가 판매 추정됩니다.`;
    }

    return `${productName} 기준보다 ${estimatedSalesQuantity}개 부족합니다.`;
  }

  if (differenceQuantity > 0) {
    return `${productName} 기준보다 ${differenceQuantity}개 많습니다.`;
  }

  return `${productName} 재고 금액 기준 확인이 필요합니다.`;
}
