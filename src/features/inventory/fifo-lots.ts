import type { Prisma } from "../../../generated/prisma";
import {
  calculateInventoryAmount,
  calculateSystemInventoryQuantity,
} from "../../server/calculations/inventory.ts";

type InventoryLotSourceValue =
  | "OPENING"
  | "PREVIOUS_CARRYOVER"
  | "PURCHASE"
  | "LEGACY_OPENING";

export type FifoPreviousLotInput = {
  sourceType: "OPENING" | "PREVIOUS_CARRYOVER" | "LEGACY_OPENING";
  sourceLedgerId: string | null;
  sourcePurchaseItemId: string | null;
  unitPrice: number;
  remainingQuantity: number;
};

export type FifoPurchaseLotInput = {
  id: string;
  unitPrice: number;
  quantity: number;
};

export type FifoLegacyOpeningInput = {
  unitPrice: number;
  quantity: number;
};

export type FifoLotSnapshot = {
  sourceType: InventoryLotSourceValue;
  sourceLedgerId: string | null;
  sourcePurchaseItemId: string | null;
  unitPrice: number;
  originalQuantity: number;
  consumedQuantity: number;
  remainingQuantity: number;
  originalAmount: number;
  consumedAmount: number;
  remainingAmount: number;
  sortOrder: number;
};

function amount(quantity: number, unitPrice: number) {
  const result = calculateInventoryAmount(quantity, unitPrice);

  if (result === null) {
    throw new Error("FIFO_AMOUNT_UNAVAILABLE");
  }

  return result;
}

function positiveQuantity(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

export function calculateFifoLotSnapshots({
  previousLots,
  legacyOpening,
  purchases,
  closingQuantity,
}: {
  previousLots: FifoPreviousLotInput[];
  legacyOpening: FifoLegacyOpeningInput;
  purchases: FifoPurchaseLotInput[];
  closingQuantity: number;
}) {
  const sourceLots: Array<{
    sourceType: InventoryLotSourceValue;
    sourceLedgerId: string | null;
    sourcePurchaseItemId: string | null;
    unitPrice: number;
    quantity: number;
  }> = [];

  if (previousLots.length > 0) {
    for (const lot of previousLots) {
      if (!positiveQuantity(lot.remainingQuantity)) continue;

      sourceLots.push({
        sourceType: lot.sourceType,
        sourceLedgerId: lot.sourceLedgerId,
        sourcePurchaseItemId: lot.sourcePurchaseItemId,
        unitPrice: lot.unitPrice,
        quantity: lot.remainingQuantity,
      });
    }
  } else if (positiveQuantity(legacyOpening.quantity)) {
    sourceLots.push({
      sourceType: "LEGACY_OPENING",
      sourceLedgerId: null,
      sourcePurchaseItemId: null,
      unitPrice: legacyOpening.unitPrice,
      quantity: legacyOpening.quantity,
    });
  }

  for (const purchase of purchases) {
    if (!positiveQuantity(purchase.quantity)) continue;

    sourceLots.push({
      sourceType: "PURCHASE",
      sourceLedgerId: null,
      sourcePurchaseItemId: purchase.id,
      unitPrice: purchase.unitPrice,
      quantity: purchase.quantity,
    });
  }

  const availableQuantity = sourceLots.reduce(
    (sum, lot) => sum + lot.quantity,
    0,
  );

  if (closingQuantity > availableQuantity) {
    sourceLots.push({
      sourceType: "LEGACY_OPENING",
      sourceLedgerId: null,
      sourcePurchaseItemId: null,
      unitPrice: legacyOpening.unitPrice,
      quantity: closingQuantity - availableQuantity,
    });
  }

  let quantityToConsume = Math.max(0, availableQuantity - closingQuantity);
  let consumedAmount = 0;
  let remainingAmount = 0;
  const lots: FifoLotSnapshot[] = sourceLots.map((lot, index) => {
    const consumedQuantity = Math.min(lot.quantity, quantityToConsume);
    const remainingQuantity = lot.quantity - consumedQuantity;
    const lotConsumedAmount = amount(consumedQuantity, lot.unitPrice);
    const lotRemainingAmount = amount(remainingQuantity, lot.unitPrice);
    quantityToConsume -= consumedQuantity;
    consumedAmount += lotConsumedAmount;
    remainingAmount += lotRemainingAmount;

    return {
      sourceType: lot.sourceType,
      sourceLedgerId: lot.sourceLedgerId,
      sourcePurchaseItemId: lot.sourcePurchaseItemId,
      unitPrice: lot.unitPrice,
      originalQuantity: lot.quantity,
      consumedQuantity,
      remainingQuantity,
      originalAmount: amount(lot.quantity, lot.unitPrice),
      consumedAmount: lotConsumedAmount,
      remainingAmount: lotRemainingAmount,
      sortOrder: index,
    };
  });

  return {
    lots,
    consumedAmount,
    remainingAmount,
    containsLegacyOpening: lots.some(
      (lot) => lot.sourceType === "LEGACY_OPENING",
    ),
  };
}

function groupByProductId<T extends { productId: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const current = grouped.get(item.productId) ?? [];
    current.push(item);
    grouped.set(item.productId, current);
  }

  return grouped;
}

function sumQuantity(items: Array<{ quantity: number }>) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export async function refreshLedgerInventoryFifoLots(
  tx: Prisma.TransactionClient,
  dailyLedgerId: string,
) {
  const items = await tx.ledgerInventoryItem.findMany({
    where: { dailyLedgerId },
    select: {
      id: true,
      productId: true,
      unitPrice: true,
      previousQuantity: true,
      currentQuantity: true,
      quantity: true,
      carryoverLedgerId: true,
    },
    orderBy: [{ productName: "asc" }, { productId: "asc" }],
  });

  await tx.ledgerInventoryFifoLot.deleteMany({
    where: { dailyLedgerId },
  });

  if (items.length === 0) {
    return;
  }

  const productIds = items.map((item) => item.productId);
  const carryoverLedgerIds = [
    ...new Set(
      items
        .map((item) => item.carryoverLedgerId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [purchases, losses, previousLots] = await Promise.all([
    tx.ledgerPurchaseItem.findMany({
      where: { dailyLedgerId, productId: { in: productIds } },
      select: {
        id: true,
        productId: true,
        unitPrice: true,
        quantity: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.ledgerLossItem.findMany({
      where: { dailyLedgerId, productId: { in: productIds } },
      select: {
        productId: true,
        quantity: true,
      },
    }),
    carryoverLedgerIds.length === 0
      ? Promise.resolve([])
      : tx.ledgerInventoryFifoLot.findMany({
          where: {
            dailyLedgerId: { in: carryoverLedgerIds },
            productId: { in: productIds },
            remainingQuantity: { gt: 0 },
          },
          select: {
            dailyLedgerId: true,
            productId: true,
            sourceType: true,
            sourcePurchaseItemId: true,
            unitPrice: true,
            remainingQuantity: true,
            sortOrder: true,
          },
          orderBy: [{ dailyLedgerId: "asc" }, { sortOrder: "asc" }],
        }),
  ]);

  const purchasesByProductId = groupByProductId(
    purchases.flatMap((purchase) =>
      purchase.productId ? [{ ...purchase, productId: purchase.productId }] : [],
    ),
  );
  const lossesByProductId = groupByProductId(losses);
  const previousLotsByProductId = groupByProductId(
    previousLots.map((lot) => ({
      productId: lot.productId,
      sourceType: lot.sourceType as FifoPreviousLotInput["sourceType"],
      sourceLedgerId: lot.dailyLedgerId,
      sourcePurchaseItemId: lot.sourcePurchaseItemId,
      unitPrice: lot.unitPrice,
      remainingQuantity: lot.remainingQuantity,
    })),
  );
  const rowsToCreate: Array<Prisma.LedgerInventoryFifoLotCreateManyInput> = [];

  for (const item of items) {
    const productPurchases = purchasesByProductId.get(item.productId) ?? [];
    const purchasedQuantity = sumQuantity(productPurchases);
    const lossQuantity = sumQuantity(lossesByProductId.get(item.productId) ?? []);
    const systemQuantity = calculateSystemInventoryQuantity({
      previousQuantity: item.previousQuantity,
      purchasedQuantity,
      lossQuantity,
    });
    const closingQuantity =
      item.currentQuantity ?? item.quantity ?? systemQuantity ?? item.previousQuantity;
    const fifo = calculateFifoLotSnapshots({
      previousLots: previousLotsByProductId.get(item.productId) ?? [],
      legacyOpening: {
        unitPrice: item.unitPrice,
        quantity: item.previousQuantity,
      },
      purchases: productPurchases.map((purchase) => ({
        id: purchase.id,
        unitPrice: purchase.unitPrice,
        quantity: purchase.quantity,
      })),
      closingQuantity,
    });

    await tx.ledgerInventoryItem.update({
      where: { id: item.id },
      data: {
        purchasedQuantity,
        inventoryAmount: fifo.remainingAmount,
      },
    });

    rowsToCreate.push(
      ...fifo.lots.map((lot) => ({
        dailyLedgerId,
        ledgerInventoryItemId: item.id,
        productId: item.productId,
        sourceType: lot.sourceType,
        sourceLedgerId: lot.sourceLedgerId,
        sourcePurchaseItemId: lot.sourcePurchaseItemId,
        unitPrice: lot.unitPrice,
        originalQuantity: lot.originalQuantity,
        consumedQuantity: lot.consumedQuantity,
        remainingQuantity: lot.remainingQuantity,
        originalAmount: lot.originalAmount,
        consumedAmount: lot.consumedAmount,
        remainingAmount: lot.remainingAmount,
        sortOrder: lot.sortOrder,
      })),
    );
  }

  if (rowsToCreate.length > 0) {
    await tx.ledgerInventoryFifoLot.createMany({
      data: rowsToCreate,
    });
  }
}
