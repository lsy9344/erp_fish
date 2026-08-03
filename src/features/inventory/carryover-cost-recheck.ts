import type { InventoryCarryoverStatus } from "../../../generated/prisma";

// enum 값 문자열을 리터럴로 사용해 이 모듈이 런타임 prisma import 없이
// 단위 테스트에서 바로 import될 수 있게 한다.
const CARRYOVER_RECHECK_REQUIRED: InventoryCarryoverStatus =
  "CARRYOVER_RECHECK_REQUIRED";

export type CarryoverCostBasisComparison =
  | "unchanged"
  | "changed"
  | "basis-lost";

export type CarryoverLotSignatureInput = {
  unitPrice: number;
  quantity: number;
  sortOrder: number;
};

/**
 * DESIGN.md D10: 다음 날 이월 재확인은 수량뿐 아니라 FIFO 원가 근거 변화도 잡아야
 * 한다. 과거 매입 단가 수정으로 이월 수량이 같아도 원가 근거가 바뀔 수 있기
 * 때문이다.
 *
 * 원가 근거는 금액 합계 하나가 아니라 lot 구성 자체로 비교한다. 합계가 같아도
 * 단가/수량 구성이 다르면(예: 1개×100원+1개×200원 vs 1개×150원+1개×150원) 다음 날
 * 판매 소진 순서에 따라 매출원가가 달라지므로 재확인이 필요하다.
 *
 * FIFO는 lot 순서대로 원가를 소진하므로 같은 구성이라도 순서가 다르면 매출원가가
 * 달라진다(예: 100원 lot 선소진 vs 200원 lot 선소진). 따라서 시그니처는
 * `단가:수량` 항목을 FIFO sortOrder 순서로 결합한 문자열이다. DB 조회 순서와
 * 무관하게 sortOrder로 정렬하지만, sortOrder 자체가 다르면(순서 변경) 다른
 * 시그니처가 되어 재확인으로 이어진다. 수량이 0 이하인 lot은 이월 대상이
 * 아니므로 제외한다(이월 복사도 양수 lot만 수행한다).
 */
export function toCarryoverLotSignature(
  lots: Iterable<CarryoverLotSignatureInput>,
): string {
  const ordered: CarryoverLotSignatureInput[] = [];

  for (const lot of lots) {
    if (
      !Number.isFinite(lot.unitPrice) ||
      !Number.isFinite(lot.quantity) ||
      lot.quantity <= 0
    ) {
      continue;
    }

    ordered.push(lot);
  }

  // 입력 배열 순서 대신 FIFO sortOrder로 정렬해 DB 반환 순서와 무관하게 같은
  // 구성·같은 순서는 같은 시그니처가 된다. 정렬은 안정 정렬이라 sortOrder가
  // 같은 lot은 입력 순서를 유지한다.
  ordered.sort((a, b) => a.sortOrder - b.sortOrder);

  return ordered.map((lot) => `${lot.unitPrice}:${lot.quantity}`).join("|");
}

/**
 * 원천 장부의 현재 lot 시그니처와 다음 장부가 저장 시점에 기록한 lot 시그니처를
 * 비교한다.
 *
 * - recordedLotSignature === null: 다음 장부에 기록된 이월 근거가 없어 비교 불가.
 *   기존 상태를 유지한다(오탐 방지).
 * - sourceLotSignature === null: 원천 장부에서 품목 행 자체가 사라졌다. 기록된
 *   근거가 있으면 근거 소실이라 재확인으로 승격한다.
 * - sourceLotSignature === "": 품목 행은 있지만 남은 lot이 없다(전부 소진 등).
 *   기록된 근거가 있으면 이 역시 근거 소실이다.
 */
export function compareCarryoverCostBasis(input: {
  sourceLotSignature: string | null;
  recordedLotSignature: string | null;
}): CarryoverCostBasisComparison {
  if (input.recordedLotSignature === null) {
    return "unchanged";
  }

  if (input.sourceLotSignature === null || input.sourceLotSignature === "") {
    return "basis-lost";
  }

  return input.sourceLotSignature === input.recordedLotSignature
    ? "unchanged"
    : "changed";
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
  costBasisComparison: CarryoverCostBasisComparison;
}): InventoryCarryoverStatus {
  if (input.isReviewRequiredCarryover && input.previousLedgerClosed) {
    return CARRYOVER_RECHECK_REQUIRED;
  }

  if (!input.quantityMatches) {
    return CARRYOVER_RECHECK_REQUIRED;
  }

  if (input.costBasisComparison !== "unchanged") {
    return CARRYOVER_RECHECK_REQUIRED;
  }

  return input.currentStatus;
}
