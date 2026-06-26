import { calculateSystemInventoryQuantity } from "../../server/calculations/inventory.ts";
import {
  isManualFirstInventoryEntry,
  isPurchaseDrivenSale,
} from "./inventory-persist-policy.ts";

export const missingAdjustmentReasonMessage =
  "재고 차이를 고친 이유를 먼저 저장해 주세요.";

export const missingRequiredCurrentQuantityMessage =
  "당일재고를 입력하지 않은 매입·손실 품목이 있습니다. 남은 재고를 입력해 주세요.";

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

    if (isPurchaseDrivenSale(item)) {
      continue;
    }

    const systemQuantity = calculateSystemInventoryQuantity({
      previousQuantity: item.previousQuantity,
      purchasedQuantity: item.purchasedQuantity,
      lossQuantity: item.lossQuantity,
    });

    if (
      systemQuantity === null ||
      item.currentQuantity === null ||
      item.currentQuantity === systemQuantity
    ) {
      continue;
    }

    const adjustment = adjustmentByProductId.get(item.productId);

    if (adjustment?.afterQuantity === item.currentQuantity) {
      continue;
    }

    errors[`items.${index}.currentQuantity`] = [missingAdjustmentReasonMessage];
  }

  return errors;
}
