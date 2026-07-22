import { calculateSystemInventoryQuantity } from "../../server/calculations/inventory.ts";

export type LossInventoryAvailabilityLine = {
  productId: string;
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number;
};

export type LossInventoryAvailabilityExistingItem = {
  productId: string;
  previousQuantity: number;
  purchasedQuantity: number;
};

export function buildLossInventoryAvailabilityLines({
  existingItems,
  purchaseQuantities,
  lossQuantities,
  previousQuantities,
}: {
  existingItems: readonly LossInventoryAvailabilityExistingItem[];
  purchaseQuantities: ReadonlyMap<string, number>;
  lossQuantities: ReadonlyMap<string, number>;
  previousQuantities?: ReadonlyMap<string, number>;
}): LossInventoryAvailabilityLine[] {
  if (existingItems.length > 0) {
    const existingProductIds = new Set(
      existingItems.map((item) => item.productId),
    );
    const lines: LossInventoryAvailabilityLine[] = existingItems.map(
      (item) => ({
        productId: item.productId,
        previousQuantity: item.previousQuantity,
        purchasedQuantity:
          purchaseQuantities.get(item.productId) ?? item.purchasedQuantity,
        lossQuantity: lossQuantities.get(item.productId) ?? 0,
      }),
    );

    for (const productId of new Set([
      ...purchaseQuantities.keys(),
      ...lossQuantities.keys(),
    ])) {
      if (existingProductIds.has(productId)) {
        continue;
      }

      lines.push({
        productId,
        previousQuantity: 0,
        purchasedQuantity: purchaseQuantities.get(productId) ?? 0,
        lossQuantity: lossQuantities.get(productId) ?? 0,
      });
    }

    return lines;
  }

  const previousByProductId = previousQuantities ?? new Map<string, number>();
  const productIds = new Set([
    ...previousByProductId.keys(),
    ...purchaseQuantities.keys(),
    ...lossQuantities.keys(),
  ]);

  return [...productIds].map((productId) => ({
    productId,
    previousQuantity: previousByProductId.get(productId) ?? 0,
    purchasedQuantity: purchaseQuantities.get(productId) ?? 0,
    lossQuantity: lossQuantities.get(productId) ?? 0,
  }));
}

export function getAvailableLossProductIds(
  lines: readonly LossInventoryAvailabilityLine[],
) {
  return new Set(
    lines.flatMap((line) => {
      const availableQuantity = calculateSystemInventoryQuantity({
        previousQuantity: line.previousQuantity,
        purchasedQuantity: line.purchasedQuantity,
        lossQuantity: line.lossQuantity,
      });

      return availableQuantity !== null && availableQuantity > 0
        ? [line.productId]
        : [];
    }),
  );
}

/** 기존 저장 행은 재고 소진·비활성 후에도 수량/사유 수정·삭제를 허용한다. */
export function canSelectLossProduct({
  productId,
  existingProductId,
  availableProductIds,
}: {
  productId: string;
  existingProductId: string | null | undefined;
  availableProductIds: ReadonlySet<string>;
}) {
  return existingProductId === productId || availableProductIds.has(productId);
}
