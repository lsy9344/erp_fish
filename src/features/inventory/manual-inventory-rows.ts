import {
  InventoryCarryoverSource,
  InventoryCarryoverStatus,
} from "../../../generated/prisma/index.js";
import type { Prisma } from "../../../generated/prisma/index.js";

import { calculateInventoryAmount } from "../../server/calculations/inventory.ts";

const missingManualInventoryUnitPriceMessage =
  "직접 추가한 품목의 매입단가를 입력해 주세요.";
const invalidManualInventoryAmountMessage =
  "재고금액을 계산할 수 없습니다. 수량과 매입단가를 확인해 주세요.";

type ManualInventoryInputItem = {
  productId: string;
  currentQuantity: number | null;
  quantity: number | null;
  unitPrice: number | null;
};

export function getManualInventoryUnitPriceErrors(
  existingProductIds: ReadonlySet<string>,
  inputItems: ManualInventoryInputItem[],
) {
  const errors: Record<string, string[]> = {};

  inputItems.forEach((item, index) => {
    const willPersist = item.currentQuantity !== null || item.quantity !== null;
    const effectiveQuantity = item.currentQuantity ?? item.quantity;

    if (
      !existingProductIds.has(item.productId) &&
      willPersist &&
      item.unitPrice === null
    ) {
      errors[`items.${index}.unitPrice`] = [
        missingManualInventoryUnitPriceMessage,
      ];
      return;
    }

    if (
      !existingProductIds.has(item.productId) &&
      effectiveQuantity !== null &&
      item.unitPrice !== null &&
      calculateInventoryAmount(effectiveQuantity, item.unitPrice) === null
    ) {
      errors[`items.${index}.unitPrice`] = [
        invalidManualInventoryAmountMessage,
      ];
    }
  });

  return errors;
}

/**
 * "품목 추가"로 직접 넣은 행을 저장할 수 있게 보강한다.
 *
 * 재고 저장 경로는 서버가 다시 계산한 before.items만 재기록한다. 근거(저장행/당일
 * 매입/손실/이월) 없는 활성 품목은 더 이상 before.items에 자동으로 들어가지 않으므로,
 * 사용자가 화면에서 추가해 값을 입력한 품목은 before.items에 없어 그대로 버려진다.
 *
 * 이 helper는 before.items에 없으면서 입력값(currentQuantity)이 있는 입력 행만 골라
 * 실제 활성 품목인지 DB로 확인한 뒤 저장용 행으로 만든다. 빈 값(추가만 하고 미입력)인
 * 행은 제외해, 추가했다는 이유만으로 0개 재고가 저장되지 않게 한다.
 *
 * 이월 근거가 없는 수동 행이므로 previousQuantity/purchasedQuantity=0,
 * carryover는 MANUAL/CARRYOVER_EMPTY로 두고, 사용자가 입력한 단가를 저장한다.
 * carryover detail은 저장하지 않는다. 재조회 시 저장행 경로가 detail 부재를 보강한다.
 */
export async function buildManualInventoryRows(
  tx: Prisma.TransactionClient,
  dailyLedgerId: string,
  existingProductIds: ReadonlySet<string>,
  inputItems: ManualInventoryInputItem[],
  actorId: string,
) {
  const manualInputs = inputItems.filter(
    (item) =>
      !existingProductIds.has(item.productId) &&
      (item.currentQuantity !== null || item.quantity !== null),
  );

  if (manualInputs.length === 0) {
    return [];
  }

  const products = await tx.product.findMany({
    where: {
      id: { in: manualInputs.map((item) => item.productId) },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      category: true,
      spec: true,
    },
  });
  const productById = new Map(products.map((product) => [product.id, product]));

  return manualInputs.flatMap((item) => {
    const product = productById.get(item.productId);

    if (!product) {
      return [];
    }

    const currentQuantity = item.currentQuantity;
    const quantity = item.quantity;
    const unitPrice = item.unitPrice!;

    return [
      {
        dailyLedgerId,
        productId: product.id,
        productName: product.name,
        productCategory: product.category,
        productSpec: product.spec,
        unitPrice,
        previousQuantity: 0,
        purchasedQuantity: 0,
        currentQuantity,
        quantity,
        inventoryAmount: calculateInventoryAmount(quantity, unitPrice),
        isModified:
          (currentQuantity !== null && currentQuantity !== 0) ||
          (quantity !== null && quantity !== 0),
        carryoverSource: InventoryCarryoverSource.MANUAL,
        carryoverStatus: InventoryCarryoverStatus.CARRYOVER_EMPTY,
        carryoverLedgerId: null,
        createdById: actorId,
        updatedById: actorId,
      },
    ];
  });
}
