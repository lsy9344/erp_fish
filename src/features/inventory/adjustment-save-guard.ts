import { calculateSystemInventoryQuantity } from "../../server/calculations/inventory.ts";

export const missingAdjustmentReasonMessage =
  "재고 차이를 고친 이유를 먼저 저장해 주세요.";

export type InventorySaveAdjustmentGuardItem = {
  productId: string;
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number;
  currentQuantity: number | null;
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
