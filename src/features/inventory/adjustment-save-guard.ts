import {
  getInventoryQuantityRelation,
  isManualFirstInventoryEntry,
} from "./inventory-persist-policy.ts";

export const missingAdjustmentReasonMessage =
  "재고 차이를 고친 이유를 먼저 저장해 주세요.";

/**
 * 조정 사유를 왜 묻는지 숫자로 설명한다. 손실은 이미 별도로 잡혀 있으므로,
 * 기준재고(전일+매입−손실)와 당일재고의 차이는 "손실 외 추가 차이"다 — 판매로 나간
 * 건지 실사 재고 오차인지는 사람만 알기에 사유를 남겨야 한다.
 */
export function describeAdjustmentReason(
  systemQuantity: number,
  currentQuantity: number,
  lossQuantity: number,
) {
  const difference = currentQuantity - systemQuantity;
  const lossNote = lossQuantity > 0 ? `손실 ${lossQuantity}개 반영 후 ` : "";

  return `기준재고 ${systemQuantity}개인데 당일재고가 ${currentQuantity}개입니다(${lossNote}기준보다 ${difference}개 많음). 차이가 생긴 사유를 남겨 주세요.`;
}

export const missingRequiredCurrentQuantityMessage =
  "당일재고를 입력하지 않은 매입·손실 품목이 있습니다. 남은 재고를 입력해 주세요.";

export const missingLossReviewMessage =
  "2단계 손실/폐기 단계를 먼저 저장해 주세요.";

export type InventoryRequiredEntryGuardItem = {
  id: string;
  productId: string;
  purchasedQuantity: number;
  lossQuantity: number;
  currentQuantity: number | null;
};

/**
 * before.items + 제출 입력맵으로 필수입력 가드 아이템을 만든다. 핵심: 입력 행의
 * currentQuantity를 seed 값(beforeItem.currentQuantity)으로 ?? 폴백하면 안 된다.
 * 폴백하면 입력이 null(미입력)이어도 seed의 0/기존값으로 되살아나 미입력을 못 잡는다.
 * 입력 행이 없거나 currentQuantity가 null이면 그대로 null로 넘겨 빈칸을 확실히 잡는다.
 *
 * 조정 사유 가드(getInventorySaveAdjustmentErrors)는 미제출 행을 "변경 없음"으로 보고
 * seed 값을 써야 하므로 폴백을 유지한다 — 이 함수는 필수입력 가드 전용이다.
 */
export function buildRequiredEntryGuardItems(
  beforeItems: Array<{
    id: string;
    productId: string;
    purchasedQuantity: number;
    lossQuantity: number;
  }>,
  inputByProductId: Map<string, { currentQuantity: number | null }>,
): InventoryRequiredEntryGuardItem[] {
  return beforeItems.map((item) => {
    const inputItem = inputByProductId.get(item.productId);

    return {
      id: item.id,
      productId: item.productId,
      purchasedQuantity: item.purchasedQuantity,
      lossQuantity: item.lossQuantity,
      currentQuantity: inputItem ? inputItem.currentQuantity : null,
    };
  });
}

/**
 * 매입·손실로 판매량이 잡히는 seed 행(id===productId)은 당일재고를 직접 입력해야 한다.
 * 빈칸(null)으로 두면 판매량이 전일+매입으로 잡혀 "전량 판매"로 오해되므로 저장을 막는다.
 * 클라이언트 validateRequiredCurrentQuantities와 같은 규칙을 서버에서도 강제해,
 * 직접 action 호출/본사 경로에서도 미입력 저장을 차단한다.
 */
export function getRequiredCurrentQuantityErrors(
  items: InventoryRequiredEntryGuardItem[],
) {
  const errors: Record<string, string[]> = {};

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const requiresEntry =
      item.id === item.productId &&
      (item.purchasedQuantity > 0 || item.lossQuantity > 0);

    if (requiresEntry && item.currentQuantity === null) {
      errors[`items.${index}.currentQuantity`] = [
        "당일재고를 입력해 주세요. 매입·손실이 있는 품목은 남은 재고를 직접 확인해야 합니다.",
      ];
    }
  }

  return errors;
}

export type InventorySaveAdjustmentGuardItem = {
  productId: string;
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number;
  currentQuantity: number | null;
  carryoverSource?: string;
  carryoverStatus?: string;
  carryoverLedgerId?: string | null;
};

export type InventorySaveAdjustmentGuardRecord = {
  productId: string;
  afterQuantity: number;
};

export function getInventorySaveAdjustmentErrors(
  items: InventorySaveAdjustmentGuardItem[],
  adjustments: InventorySaveAdjustmentGuardRecord[],
  // 이번 저장에 함께 들어온 행별 "고친 이유"(productId→reason). 빈/없음이면 미제공.
  // 차이가 있는 행이라도 사유가 들어오면 통과시키고, 서버가 그 사유로 조정을 생성한다.
  incomingReasonByProductId = new Map<string, string | null>(),
) {
  const adjustmentByProductId = new Map(
    adjustments.map((adjustment) => [adjustment.productId, adjustment]),
  );
  const errors: Record<string, string[]> = {};

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const isManualFirstEntry =
      item.carryoverSource !== undefined &&
      item.carryoverStatus !== undefined &&
      item.carryoverLedgerId !== undefined &&
      isManualFirstInventoryEntry({
        ...item,
        carryoverSource: item.carryoverSource,
        carryoverStatus: item.carryoverStatus,
        carryoverLedgerId: item.carryoverLedgerId,
      });

    if (isManualFirstEntry) {
      continue;
    }

    if (getInventoryQuantityRelation(item) !== "OVERSTOCK") {
      continue;
    }

    const adjustment = adjustmentByProductId.get(item.productId);

    if (adjustment?.afterQuantity === item.currentQuantity) {
      continue;
    }

    // 이번 저장에 사유가 함께 들어왔으면 통과(서버가 그 사유로 조정을 만든다).
    if (incomingReasonByProductId.get(item.productId)) {
      continue;
    }

    errors[`items.${index}.adjustmentReason`] = [
      missingAdjustmentReasonMessage,
    ];
  }

  return errors;
}
