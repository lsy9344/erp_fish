import type { Prisma } from "../../../generated/prisma";

import {
  calculateInventoryAdjustment,
  calculateInventoryAmount,
  calculateSystemInventoryQuantity,
} from "~/server/calculations/inventory";
import { isPurchaseDrivenSale } from "~/features/inventory/inventory-persist-policy";

const adjustmentSelect = {
  id: true,
  productId: true,
  reason: true,
} as const;

const inventoryItemSelect = {
  id: true,
  productId: true,
  productName: true,
  productCategory: true,
  productSpec: true,
  unitPrice: true,
  previousQuantity: true,
  currentQuantity: true,
  quantity: true,
} as const;

function aggregatePurchasedQuantity(
  purchases: Array<{ productId: string | null; quantity: number }>,
) {
  const quantities = new Map<string, number>();

  for (const purchase of purchases) {
    if (!purchase.productId) {
      continue;
    }

    quantities.set(
      purchase.productId,
      (quantities.get(purchase.productId) ?? 0) + purchase.quantity,
    );
  }

  return quantities;
}

function aggregateLossQuantity(
  losses: Array<{ productId: string; quantity: number }>,
) {
  const quantities = new Map<string, number>();

  for (const loss of losses) {
    quantities.set(
      loss.productId,
      (quantities.get(loss.productId) ?? 0) + loss.quantity,
    );
  }

  return quantities;
}

export async function syncLedgerInventoryPurchasedQuantitiesInTx(
  tx: Prisma.TransactionClient,
  dailyLedgerId: string,
  actorId: string,
) {
  const [items, purchases] = await Promise.all([
    tx.ledgerInventoryItem.findMany({
      where: { dailyLedgerId },
      select: { id: true, productId: true, purchasedQuantity: true },
    }),
    tx.ledgerPurchaseItem.findMany({
      where: { dailyLedgerId, productId: { not: null } },
      select: { productId: true, quantity: true },
    }),
  ]);
  const purchasedQuantityByProductId = aggregatePurchasedQuantity(purchases);
  const updates = items.flatMap((item) => {
    const purchasedQuantity =
      purchasedQuantityByProductId.get(item.productId) ?? 0;

    if (item.purchasedQuantity === purchasedQuantity) {
      return [];
    }

    return [
      tx.ledgerInventoryItem.update({
        where: { id: item.id },
        data: {
          purchasedQuantity,
          updatedById: actorId,
        },
      }),
    ];
  });

  await Promise.all(updates);
}

export async function reconcileLedgerInventoryAdjustments(
  tx: Prisma.TransactionClient,
  dailyLedgerId: string,
  actorId: string,
) {
  const adjustments = await tx.ledgerInventoryAdjustment.findMany({
    where: { dailyLedgerId },
    select: adjustmentSelect,
  });

  if (adjustments.length === 0) {
    return;
  }

  const productIds = adjustments.map((adjustment) => adjustment.productId);
  const [items, purchases, losses] = await Promise.all([
    tx.ledgerInventoryItem.findMany({
      where: { dailyLedgerId, productId: { in: productIds } },
      select: inventoryItemSelect,
    }),
    tx.ledgerPurchaseItem.findMany({
      where: { dailyLedgerId, productId: { in: productIds } },
      select: { productId: true, quantity: true },
    }),
    tx.ledgerLossItem.findMany({
      where: { dailyLedgerId, productId: { in: productIds } },
      select: { productId: true, quantity: true },
    }),
  ]);
  const itemByProductId = new Map(items.map((item) => [item.productId, item]));
  const purchasedQuantityByProductId = aggregatePurchasedQuantity(purchases);
  const lossQuantityByProductId = aggregateLossQuantity(losses);

  for (const adjustment of adjustments) {
    const item = itemByProductId.get(adjustment.productId);

    if (item?.currentQuantity === null || item === undefined) {
      await tx.ledgerInventoryAdjustment.delete({
        where: { id: adjustment.id },
      });
      continue;
    }

    const purchasedQuantity =
      purchasedQuantityByProductId.get(item.productId) ?? 0;
    const lossQuantity = lossQuantityByProductId.get(item.productId) ?? 0;

    // 정상 판매 소진(매입 있음·손실 없음·기준재고 이하)은 실사 차이가 아니므로,
    // 매입 반영 후 정상 판매로 바뀐 기존 조정 레코드는 삭제한다. 남겨두면
    // salesDifference에 계속 합산돼 이번 정책("정상 판매는 조정 아님")이 깨진다.
    if (
      isPurchaseDrivenSale({
        previousQuantity: item.previousQuantity,
        purchasedQuantity,
        lossQuantity,
        currentQuantity: item.currentQuantity,
      })
    ) {
      await tx.ledgerInventoryAdjustment.delete({
        where: { id: adjustment.id },
      });
      continue;
    }

    const beforeQuantity = calculateSystemInventoryQuantity({
      previousQuantity: item.previousQuantity,
      purchasedQuantity,
      lossQuantity,
    });
    const beforeAmount =
      beforeQuantity === null
        ? null
        : calculateInventoryAmount(beforeQuantity, item.unitPrice);
    if (beforeQuantity === null || beforeAmount === null) {
      continue;
    }

    const nextAdjustment = calculateInventoryAdjustment({
      beforeQuantity,
      beforeAmount,
      afterQuantity: item.currentQuantity,
      unitPrice: item.unitPrice,
    });

    if (!nextAdjustment) {
      continue;
    }
    const isModified =
      (item.currentQuantity !== null &&
        item.currentQuantity !== item.previousQuantity) ||
      (item.quantity !== null && item.quantity !== item.previousQuantity);

    await tx.ledgerInventoryItem.update({
      where: { id: item.id },
      data: {
        purchasedQuantity,
        isModified,
        updatedById: actorId,
      },
    });

    if (nextAdjustment.differenceQuantity === 0) {
      await tx.ledgerInventoryAdjustment.delete({
        where: { id: adjustment.id },
      });
      continue;
    }

    await tx.ledgerInventoryAdjustment.update({
      where: { id: adjustment.id },
      data: {
        ledgerInventoryItemId: item.id,
        productName: item.productName,
        productCategory: item.productCategory,
        productSpec: item.productSpec,
        unitPrice: item.unitPrice,
        beforeQuantity: nextAdjustment.beforeQuantity,
        beforeAmount: nextAdjustment.beforeAmount,
        afterQuantity: nextAdjustment.afterQuantity,
        afterAmount: nextAdjustment.afterAmount,
        differenceQuantity: nextAdjustment.differenceQuantity,
        differenceAmount: nextAdjustment.differenceAmount,
        amountStatus: "POLICY_UNCONFIRMED",
        reason: adjustment.reason,
        updatedById: actorId,
      },
    });
  }
}
