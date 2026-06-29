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

/**
 * 지점장 일반 재고 저장 경로에서, 당일재고가 기준재고와 다른 행에 "고친 이유"가 함께 들어오면
 * 조정 레코드를 생성/갱신한다. 단독 본사 전용 조정 액션(saveHqLedgerInventoryAdjustment)과 별개로,
 * 지점 실사 차이 사유를 일반 저장과 함께 남기는 경로다(정책 반전 후에도 지점장이 사유를 저장할 수
 * 있게 하는 핵심). 금액/차이 계산은 reconcile과 같은 기준(calculateInventoryAdjustment)을 쓴다.
 * 정상 판매 소진/차이 0은 조정 대상이 아니므로 만들지 않는다.
 */
export async function applyInventoryAdjustmentReasonsInTx(
  tx: Prisma.TransactionClient,
  dailyLedgerId: string,
  reasonByProductId: Map<string, string | null>,
  actorId: string,
) {
  const productIds = [...reasonByProductId.entries()]
    .filter(([, reason]) => Boolean(reason))
    .map(([productId]) => productId);

  if (productIds.length === 0) {
    return;
  }

  const [items, purchases, losses, existingAdjustments] = await Promise.all([
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
    tx.ledgerInventoryAdjustment.findMany({
      where: { dailyLedgerId, productId: { in: productIds } },
      select: { id: true, productId: true },
    }),
  ]);
  const purchasedQuantityByProductId = aggregatePurchasedQuantity(purchases);
  const lossQuantityByProductId = aggregateLossQuantity(losses);
  const existingByProductId = new Map(
    existingAdjustments.map((adjustment) => [adjustment.productId, adjustment]),
  );

  for (const item of items) {
    const reason = reasonByProductId.get(item.productId);
    if (!reason || item.currentQuantity === null) {
      continue;
    }

    const purchasedQuantity =
      purchasedQuantityByProductId.get(item.productId) ?? 0;
    const lossQuantity = lossQuantityByProductId.get(item.productId) ?? 0;

    // 정상 판매 소진은 실사 차이가 아니므로 사유가 있어도 조정으로 만들지 않는다.
    if (
      isPurchaseDrivenSale({
        previousQuantity: item.previousQuantity,
        purchasedQuantity,
        lossQuantity,
        currentQuantity: item.currentQuantity,
      })
    ) {
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

    const adjustment = calculateInventoryAdjustment({
      beforeQuantity,
      beforeAmount,
      afterQuantity: item.currentQuantity,
      unitPrice: item.unitPrice,
    });

    // 차이가 없으면(0) 조정 레코드를 만들지 않는다. 기존 레코드가 있으면 reconcile이 정리한다.
    if (!adjustment || adjustment.differenceQuantity === 0) {
      continue;
    }

    const data = {
      ledgerInventoryItemId: item.id,
      productName: item.productName,
      productCategory: item.productCategory,
      productSpec: item.productSpec,
      unitPrice: item.unitPrice,
      beforeQuantity: adjustment.beforeQuantity,
      beforeAmount: adjustment.beforeAmount,
      afterQuantity: adjustment.afterQuantity,
      afterAmount: adjustment.afterAmount,
      differenceQuantity: adjustment.differenceQuantity,
      differenceAmount: adjustment.differenceAmount,
      amountStatus: "POLICY_UNCONFIRMED" as const,
      reason,
      updatedById: actorId,
    };
    const existing = existingByProductId.get(item.productId);

    if (existing) {
      await tx.ledgerInventoryAdjustment.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await tx.ledgerInventoryAdjustment.create({
        data: {
          dailyLedgerId,
          productId: item.productId,
          createdById: actorId,
          ...data,
        },
      });
    }
  }
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
