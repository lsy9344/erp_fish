import { InventoryCarryoverStatus } from "../../../generated/prisma";

/**
 * DESIGN.md D10: 다음 날 이월 재확인은 수량뿐 아니라 FIFO 원가 근거 변화도 잡아야
 * 한다. 과거 매입 단가 수정으로 이월 수량이 같아도 원가 근거가 바뀔 수 있기
 * 때문이다. 비교는 순수 함수로 분리해 단위 테스트가 DB 없이 검증할 수 있게 한다.
 *
 * - previousRemainingCost: 원천(이전) 장부의 "현재" FIFO 잔액 원가 합(품목별).
 *   lot 근거가 아예 없으면 null(비교 불가 → 재확인을 강제로 띄우지 않는다).
 * - recordedCarryoverCost: 다음 장부가 마지막 저장 시점에 기록한 이월 lot 원가 합
 *   (PURCHASE 제외 lot의 originalAmount). 기록이 없으면 null.
 */
export function isCarryoverCostBasisChanged(input: {
  previousRemainingCost: number | null;
  recordedCarryoverCost: number | null;
}): boolean {
  if (input.previousRemainingCost === null) {
    return false;
  }

  if (input.recordedCarryoverCost === null) {
    return false;
  }

  return input.previousRemainingCost !== input.recordedCarryoverCost;
}

/**
 * 기존 수량 비교에서 쓰던 판정과 원가 근거 판정을 합쳐 다음 장부 품목의 이월
 * 상태를 결정한다. 실제 입력값은 절대 덮어쓰지 않고 상태 표시만 승격한다.
 */
export function resolveCarryoverRecheckStatus(input: {
  currentStatus: InventoryCarryoverStatus;
  isReviewRequiredCarryover: boolean;
  previousLedgerClosed: boolean;
  quantityMatches: boolean;
  previousRemainingCost: number | null;
  recordedCarryoverCost: number | null;
}): InventoryCarryoverStatus {
  if (input.isReviewRequiredCarryover && input.previousLedgerClosed) {
    return InventoryCarryoverStatus.CARRYOVER_RECHECK_REQUIRED;
  }

  if (!input.quantityMatches) {
    return InventoryCarryoverStatus.CARRYOVER_RECHECK_REQUIRED;
  }

  if (
    isCarryoverCostBasisChanged({
      previousRemainingCost: input.previousRemainingCost,
      recordedCarryoverCost: input.recordedCarryoverCost,
    })
  ) {
    return InventoryCarryoverStatus.CARRYOVER_RECHECK_REQUIRED;
  }

  return input.currentStatus;
}
