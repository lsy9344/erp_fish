type InventoryFlow = {
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity?: number;
  currentQuantity: number | null;
  quantity?: number | null;
};

const QUANTITY_EPSILON = 0.000001;

export function getInventoryFlowSoldQuantity(item: InventoryFlow) {
  const currentQuantity = item.currentQuantity ?? item.quantity ?? null;

  if (currentQuantity === null || !Number.isFinite(currentQuantity)) {
    return null;
  }

  const soldQuantity =
    item.previousQuantity +
    item.purchasedQuantity -
    (item.lossQuantity ?? 0) -
    currentQuantity;

  return Number.isFinite(soldQuantity) ? soldQuantity : null;
}

/**
 * 새 FIFO 행은 판매량과 손실량이 나뉘어 저장된다. 마이그레이션 전 행은 새 판매량
 * 필드가 0인 채로 남을 수 있으므로, 품목 재고 흐름과 합계가 맞을 때만 입고분 판매량을
 * 사용한다. 맞지 않으면 기존 품목별 판매량/판매가 계산으로 되돌아간다.
 */
export function hasCompleteLotSalesAllocation(
  item: InventoryFlow,
  lots: readonly { soldQuantity: number }[],
) {
  if (lots.length === 0) return false;

  const itemSoldQuantity = getInventoryFlowSoldQuantity(item);
  if (itemSoldQuantity === null) return false;

  let lotSoldQuantity = 0;
  for (const lot of lots) {
    if (!Number.isFinite(lot.soldQuantity)) return false;
    lotSoldQuantity += lot.soldQuantity;
  }

  return Math.abs(lotSoldQuantity - itemSoldQuantity) < QUANTITY_EPSILON;
}
