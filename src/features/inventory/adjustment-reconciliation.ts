import type { Prisma } from "../../../generated/prisma";

import {
  calculateInventoryAdjustment,
  calculateInventoryAmount,
  calculateSystemInventoryQuantity,
} from "../../server/calculations/inventory.ts";
import {
  getInventoryQuantityRelation,
  isManualFirstInventoryEntry,
} from "./inventory-persist-policy.ts";
import { decimalToNumber, type DecimalNumber } from "../../lib/decimal.ts";

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
  carryoverSource: true,
  carryoverStatus: true,
  carryoverLedgerId: true,
} as const;

function aggregatePurchasedQuantity(
  purchases: Array<{ productId: string | null; quantity: DecimalNumber }>,
) {
  const quantities = new Map<string, number>();

  for (const purchase of purchases) {
    if (!purchase.productId) {
      continue;
    }

    quantities.set(
      purchase.productId,
      (quantities.get(purchase.productId) ?? 0) +
        decimalToNumber(purchase.quantity),
    );
  }

  return quantities;
}

function aggregateLossQuantity(
  losses: Array<{ productId: string; quantity: DecimalNumber }>,
) {
  const quantities = new Map<string, number>();

  for (const loss of losses) {
    quantities.set(
      loss.productId,
      (quantities.get(loss.productId) ?? 0) + decimalToNumber(loss.quantity),
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

    if (decimalToNumber(item.purchasedQuantity) === purchasedQuantity) {
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
    const currentQuantity =
      item.currentQuantity === null
        ? null
        : decimalToNumber(item.currentQuantity);
    const previousQuantity = decimalToNumber(item.previousQuantity);

    if (!reason || currentQuantity === null) {
      continue;
    }

    const purchasedQuantity =
      purchasedQuantityByProductId.get(item.productId) ?? 0;
    const lossQuantity = lossQuantityByProductId.get(item.productId) ?? 0;

    if (
      isManualFirstInventoryEntry({
        ...item,
        previousQuantity,
        purchasedQuantity,
        lossQuantity,
      })
    ) {
      continue;
    }

    if (
      getInventoryQuantityRelation({
        previousQuantity,
        purchasedQuantity,
        lossQuantity,
        currentQuantity,
      }) !== "OVERSTOCK"
    ) {
      continue;
    }

    const beforeQuantity = calculateSystemInventoryQuantity({
      previousQuantity,
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
      afterQuantity: currentQuantity,
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
    const currentQuantity =
      item?.currentQuantity === null || item === undefined
        ? null
        : decimalToNumber(item.currentQuantity);

    if (currentQuantity === null || item === undefined) {
      await tx.ledgerInventoryAdjustment.delete({
        where: { id: adjustment.id },
      });
      continue;
    }

    const previousQuantity = decimalToNumber(item.previousQuantity);
    const quantity =
      item.quantity === null ? null : decimalToNumber(item.quantity);
    const purchasedQuantity =
      purchasedQuantityByProductId.get(item.productId) ?? 0;
    const lossQuantity = lossQuantityByProductId.get(item.productId) ?? 0;

    if (
      isManualFirstInventoryEntry({
        ...item,
        previousQuantity,
        purchasedQuantity,
        lossQuantity,
      })
    ) {
      await tx.ledgerInventoryAdjustment.delete({
        where: { id: adjustment.id },
      });
      continue;
    }

    const relation = getInventoryQuantityRelation({
      previousQuantity,
      purchasedQuantity,
      lossQuantity,
      currentQuantity,
    });

    if (relation === "NORMAL") {
      await tx.ledgerInventoryAdjustment.delete({
        where: { id: adjustment.id },
      });
      continue;
    }

    if (relation === "UNAVAILABLE") {
      continue;
    }

    const beforeQuantity = calculateSystemInventoryQuantity({
      previousQuantity,
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
      afterQuantity: currentQuantity,
      unitPrice: item.unitPrice,
    });

    if (!nextAdjustment) {
      continue;
    }
    const isModified =
      (currentQuantity !== null && currentQuantity !== previousQuantity) ||
      (quantity !== null && quantity !== previousQuantity);

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
