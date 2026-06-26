/**
 * 재고 행을 다시 기록(delete+recreate)해야 하는지 판단한다.
 *
 * 저장 경로는 모든 행을 deleteMany 후 createMany로 재기록하는데, 입력이 빈
 * 행은 currentQuantity/quantity가 null로 직렬화된다(빈 문자열→null). 가드 없이
 * 무조건 재기록하면 미입력 행이 기존 저장값을 null로 덮어쓰고, 다음 날 장부의
 * 전일재고 이월(toPreviousQuantity = currentQuantity ?? quantity ?? 0)이 0이
 * 되어 "전일 재고가 0으로 변함" 데이터 손실로 이어진다.
 *
 * - item.id !== item.productId: 이미 DB에 존재하는 실제 행(cuid id). 사용자가
 *   값을 바꾸지 않아도 기존 값을 보존하기 위해 그대로 다시 기록한다.
 * - currentQuantity/quantity가 기존 저장값과 다르면: 변경된 행이므로 기록한다.
 * - 그 외(아직 저장된 적 없는 seed 행을 빈 채로 둔 경우): 기록하지 않는다.
 *
 * 본사(saveHqLedgerInventoryItems)와 지점장(saveLedgerInventoryItems) 저장
 * 경로가 동일한 영속화 정책을 공유하도록 한 곳에 둔다.
 */
export function shouldPersistInventoryLine(
  item: {
    id: string;
    productId: string;
    currentQuantity: number | null;
    quantity: number | null;
  },
  currentQuantity: number | null,
  quantity: number | null,
) {
  return (
    item.id !== item.productId ||
    currentQuantity !== item.currentQuantity ||
    quantity !== item.quantity
  );
}

/**
 * 전일/월초/매입/손실 근거 없이 사용자가 "품목 추가"로 처음 입력한 재고 행.
 * 기준 수량과 실제 수량 차이를 재고 조정으로 보지 않는다.
 */
export function isManualFirstInventoryEntry(item: {
  carryoverSource: string;
  carryoverStatus: string;
  carryoverLedgerId: string | null;
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number;
}) {
  return (
    item.carryoverSource === "MANUAL" &&
    item.carryoverStatus === "CARRYOVER_EMPTY" &&
    item.carryoverLedgerId === null &&
    item.previousQuantity === 0 &&
    item.purchasedQuantity === 0 &&
    item.lossQuantity === 0
  );
}

/**
 * 당일 매입이 있고 손실이 없으며 당일재고가 기준재고(전일+매입-손실) 이하인 정상 판매
 * 소진. 이 경우 기준재고와의 차이는 실사 차이(재고조정)가 아니라 판매로 본다.
 *
 * 매입 6개 중 2개 남음(4개 판매)을 "4개 차이→조정 사유 요구"로 막던 동작을 면제한다.
 * 단, 면제는 정상 판매(부족 방향)에 한한다:
 * - 매입 없음(purchasedQuantity===0): 이월 품목의 차이는 진짜 실사 차이 → 조정 요구.
 * - 손실 있음(lossQuantity>0): "정상 판매 + 추가 차이" 구분 불가 → 조정 요구.
 * - 초과(currentQuantity > systemQuantity): 재고가 매입보다 많은 이상 입력 → 조정 요구.
 *
 * 서버 조정 가드와 클라이언트 검증/표시가 같은 기준을 쓰도록 한 곳에 둔다.
 */
export function isPurchaseDrivenSale(item: {
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number;
  currentQuantity: number | null;
}) {
  if (item.purchasedQuantity <= 0 || item.lossQuantity > 0) {
    return false;
  }

  if (item.currentQuantity === null) {
    return false;
  }

  const systemQuantity =
    item.previousQuantity + item.purchasedQuantity - item.lossQuantity;

  return item.currentQuantity <= systemQuantity;
}

/**
 * 판매수량은 재고 역산(전일+매입-손실-당일재고)으로 추정한다. 이 모델의 유일한
 * 빈틈: 점주가 폐기/떨이를 손실 단계에서 빼먹으면 그 손실이 "판매"로 둔갑한다.
 * isPurchaseDrivenSale이 손실 0·정상 소진 품목을 조정 사유 없이 통과시키면서
 * 이 빼먹음을 잡던 마지막 관문도 사라졌다.
 *
 * "확인된 손실 0"과 "손실 단계 건너뜀"은 데이터로 구분되지 않으므로, 매입분이
 * 손실 없이 전량(또는 기준 이하로) 소진된 품목이 하나라도 있으면 저장 전에 점주가
 * "폐기/떨이를 확인했다"고 한 번 명시하게 한다. 면제 품목(isPurchaseDrivenSale)
 * 중 정확히 이 위험 케이스만 골라낸다.
 */
export function needsLossOmissionConfirmation(item: {
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number;
  currentQuantity: number | null;
}) {
  return isPurchaseDrivenSale(item) && item.currentQuantity !== null;
}
