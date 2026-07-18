import { lossTerms } from "./terms.ts";

type LossQuantityErrorInput = {
  productName: string;
  productSpec: string;
  previousQuantity: number | null;
  purchasedQuantity: number | null;
  requestedLossQuantity: number;
};

function formatProductLabel(productName: string, productSpec: string) {
  return productSpec.trim().length > 0
    ? `${productName} / ${productSpec}`
    : productName;
}

export function getLossQuantityErrorMessage({
  productName,
  productSpec,
  previousQuantity,
  purchasedQuantity,
  requestedLossQuantity,
}: LossQuantityErrorInput) {
  const productLabel = formatProductLabel(productName, productSpec);

  if (previousQuantity === null || purchasedQuantity === null) {
    return `${productLabel} 재고 흐름을 확인할 수 없습니다. 1단계 매입에서 해당 품목의 오늘매입 저장 여부를 확인해 주세요.`;
  }

  const availableQuantity = previousQuantity + purchasedQuantity;

  // WO-09: 사용자 피드백대로 쉬운 단어와 구체적 숫자로 다듬은 안내 문구.
  return `${productLabel} 박스단위 손실 수량이 재고보다 많습니다. 입력 ${lossTerms.quantity} ${requestedLossQuantity}개, 손실 가능 수량 ${availableQuantity}개입니다. 전일재고 ${previousQuantity}개 + 오늘매입 ${purchasedQuantity}개를 확인해 주세요.`;
}
