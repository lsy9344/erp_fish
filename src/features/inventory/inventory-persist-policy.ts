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
