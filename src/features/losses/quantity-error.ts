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
    return `${productLabel} 재고 흐름을 확인할 수 없습니다. 재고 단계에서 해당 품목의 전일재고 또는 오늘매입을 확인해 주세요.`;
  }

  const availableQuantity = previousQuantity + purchasedQuantity;

  return `${productLabel} 손실 수량을 저장할 수 없습니다. 입력한 총 손실 수량 ${requestedLossQuantity}이(가) 현재 차감 가능 수량 ${availableQuantity}보다 큽니다. 재고 흐름: 전일재고 ${previousQuantity} + 오늘매입 ${purchasedQuantity}.`;
}
