import type { Prisma } from "../../../generated/prisma";

import {
  calculateInventoryAdjustment,
  calculateInventoryAmount,
  calculateSystemInventoryQuantity,
} from "~/server/calculations/inventory";

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
  purchases: Array<{ productId: string; quantity: number }>,
) {
  const quantities = new Map<string, number>();

  for (const purchase of purchases) {
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
        reason: adjustment.reason,
        updatedById: actorId,
      },
    });
  }
}
