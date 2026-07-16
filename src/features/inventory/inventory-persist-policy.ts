import { roundToTwoDecimals } from "../../lib/validation.ts";
import { calculateSystemInventoryQuantity } from "../../server/calculations/inventory.ts";

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
 * - 월초 스냅샷/직전 장부 seed 행: 수량이 그대로여도 근거가 있는 이월값이므로
 *   다시 기록한다.
 * - 매입/손실 seed 행에 사용자가 당일재고를 명시 입력한 경우: 값이 내부 seed
 *   기본값(예: 0)과 같아도 "입력 완료" 기록이므로 기록한다.
 * - currentQuantity/quantity가 기존 저장값과 다르면: 변경된 행이므로 기록한다.
 * - 그 외(아직 저장된 적 없는 seed 행을 빈 채로 둔 경우): 기록하지 않는다.
 *
 * 본사(saveHqLedgerInventoryItems)와 지점장(saveLedgerInventoryItems) 저장
 * 경로가 동일한 영속화 정책을 공유하도록 한 곳에 둔다.
 */
const groundedCarryoverSources = new Set([
  "OPENING_SNAPSHOT",
  "PREVIOUS_CLOSED_LEDGER",
  "PREVIOUS_SAVED_LEDGER",
]);

export function shouldPersistInventoryLine(
  item: {
    id: string;
    productId: string;
    currentQuantity: number | null;
    quantity: number | null;
    purchasedQuantity?: number;
    lossQuantity?: number;
    carryoverSource?: string;
  },
  currentQuantity: number | null,
  quantity: number | null,
  options: { hasExplicitCurrentQuantityInput?: boolean } = {},
) {
  const requiredSeedEntryWasEntered =
    options.hasExplicitCurrentQuantityInput === true &&
    item.id === item.productId &&
    ((item.purchasedQuantity ?? 0) > 0 || (item.lossQuantity ?? 0) > 0);
  const hasGroundedCarryover =
    item.id === item.productId &&
    groundedCarryoverSources.has(item.carryoverSource ?? "");

  return (
    item.id !== item.productId ||
    hasGroundedCarryover ||
    requiredSeedEntryWasEntered ||
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

export type InventoryQuantityRelation = "NORMAL" | "OVERSTOCK" | "UNAVAILABLE";

/** 기준재고 이하(판매/동일)는 정상이고, 기준재고를 넘는 실사 수량만 조정 대상이다. */
export function getInventoryQuantityRelation(item: {
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number;
  currentQuantity: number | null;
}): InventoryQuantityRelation {
  const systemQuantity = calculateSystemInventoryQuantity(item);

  if (
    systemQuantity === null ||
    item.currentQuantity === null ||
    !Number.isFinite(item.currentQuantity) ||
    item.currentQuantity < 0
  ) {
    return "UNAVAILABLE";
  }

  const currentQuantity = calculateSystemInventoryQuantity({
    previousQuantity: roundToTwoDecimals(item.currentQuantity),
    purchasedQuantity: 0,
  });

  if (currentQuantity === null) {
    return "UNAVAILABLE";
  }

  return currentQuantity <= systemQuantity ? "NORMAL" : "OVERSTOCK";
}
