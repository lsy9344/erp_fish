import type { Prisma } from "../../../generated/prisma";
import {
  calculateInventoryAmount,
  calculateSystemInventoryQuantity,
} from "../../server/calculations/inventory.ts";
import { decimalToNumber } from "../../lib/decimal.ts";
import { roundToTwoDecimals } from "../../lib/validation.ts";

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
  // WO-G(2026-06-22): 이월 lot의 원천 영업 기준일. 이월 시에도 그대로 보존한다.
  sourceBusinessDate: Date | null;
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
  sourceBusinessDate: Date | null;
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
  return Number.isFinite(value) && value > 0;
}

export function calculateFifoLotSnapshots({
  previousLots,
  legacyOpening,
  purchases,
  closingQuantity,
  businessDate = null,
}: {
  previousLots: FifoPreviousLotInput[];
  legacyOpening: FifoLegacyOpeningInput;
  purchases: FifoPurchaseLotInput[];
  closingQuantity: number;
  // WO-G(2026-06-22): 현재 장부의 영업 기준일(closingDate). PURCHASE lot과
  // 원천 영업일이 없는 기초/LEGACY lot의 fallback 기준일로 쓴다.
  businessDate?: Date | null;
}) {
  const sourceLots: Array<{
    sourceType: InventoryLotSourceValue;
    sourceLedgerId: string | null;
    sourcePurchaseItemId: string | null;
    sourceBusinessDate: Date | null;
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
        // 이월 lot은 원천 영업일을 보존한다. 없으면 현재 영업일로 보정한다.
        sourceBusinessDate: lot.sourceBusinessDate ?? businessDate,
        unitPrice: lot.unitPrice,
        quantity: lot.remainingQuantity,
      });
    }
  } else if (positiveQuantity(legacyOpening.quantity)) {
    sourceLots.push({
      sourceType: "LEGACY_OPENING",
      sourceLedgerId: null,
      sourcePurchaseItemId: null,
      sourceBusinessDate: businessDate,
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
      // 매입 lot의 영업일은 매입이 기록된 현재 장부의 closingDate다.
      sourceBusinessDate: businessDate,
      unitPrice: purchase.unitPrice,
      quantity: purchase.quantity,
    });
  }

  const availableQuantity = roundToTwoDecimals(
    sourceLots.reduce((sum, lot) => sum + lot.quantity, 0),
  );

  if (closingQuantity > availableQuantity) {
    sourceLots.push({
      sourceType: "LEGACY_OPENING",
      sourceLedgerId: null,
      sourcePurchaseItemId: null,
      sourceBusinessDate: businessDate,
      unitPrice: legacyOpening.unitPrice,
      quantity: roundToTwoDecimals(closingQuantity - availableQuantity),
    });
  }

  let quantityToConsume = roundToTwoDecimals(
    Math.max(0, availableQuantity - closingQuantity),
  );
  let consumedAmount = 0;
  let remainingAmount = 0;
  const lots: FifoLotSnapshot[] = sourceLots.map((lot, index) => {
    const consumedQuantity = roundToTwoDecimals(
      Math.min(lot.quantity, quantityToConsume),
    );
    const remainingQuantity = roundToTwoDecimals(
      lot.quantity - consumedQuantity,
    );
    const lotConsumedAmount = amount(consumedQuantity, lot.unitPrice);
    const lotRemainingAmount = amount(remainingQuantity, lot.unitPrice);
    quantityToConsume = roundToTwoDecimals(
      quantityToConsume - consumedQuantity,
    );
    consumedAmount += lotConsumedAmount;
    remainingAmount += lotRemainingAmount;

    return {
      sourceType: lot.sourceType,
      sourceLedgerId: lot.sourceLedgerId,
      sourcePurchaseItemId: lot.sourcePurchaseItemId,
      sourceBusinessDate: lot.sourceBusinessDate,
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

export type InventoryFifoLotView = {
  sourceType: InventoryLotSourceValue;
  sourceLedgerId: string | null;
  sourcePurchaseItemId: string | null;
  // purchaseDate는 매입 레코드 생성 시각(createdAt)이라 "며칠 자 입고분"을 정확히
  // 나타내지 못한다. sourceBusinessDate는 입고 영업일(매입 장부 closingDate / 이월 원천 영업일)을
  // 보존하므로, 팝업에서 "며칠 자에 입고된 물량인지"(point_summary.md:56) 추적의 근거로 쓴다.
  purchaseDate: string | null;
  sourceBusinessDate: string | null;
  unitPrice: number;
  originalQuantity: number;
  consumedQuantity: number;
  remainingQuantity: number;
  originalAmount: number;
  consumedAmount: number;
  remainingAmount: number;
  sortOrder: number;
};

const fifoLotViewSelect = {
  ledgerInventoryItemId: true,
  productId: true,
  sourceType: true,
  sourceLedgerId: true,
  sourcePurchaseItemId: true,
  sourceBusinessDate: true,
  unitPrice: true,
  originalQuantity: true,
  consumedQuantity: true,
  remainingQuantity: true,
  originalAmount: true,
  consumedAmount: true,
  remainingAmount: true,
  sortOrder: true,
  sourcePurchaseItem: {
    select: {
      createdAt: true,
    },
  },
} as const;

// 재고 화면의 "어떤 lot을 팔았는지" 판매 lot 이력 팝업용 read 경로.
// 품목별로 매입(또는 이월) lot의 단가·원수량·소진수량·잔량을 sortOrder(FIFO 순서)대로 반환한다.
export async function getLedgerInventoryFifoLotsByProductId(
  tx: Prisma.TransactionClient,
  dailyLedgerId: string,
): Promise<Map<string, InventoryFifoLotView[]>> {
  const lots = await tx.ledgerInventoryFifoLot.findMany({
    where: { dailyLedgerId },
    select: fifoLotViewSelect,
    orderBy: [{ productId: "asc" }, { sortOrder: "asc" }],
  });

  const byProductId = new Map<string, InventoryFifoLotView[]>();

  for (const lot of lots) {
    const rows = byProductId.get(lot.productId) ?? [];

    rows.push({
      sourceType: lot.sourceType,
      sourceLedgerId: lot.sourceLedgerId,
      sourcePurchaseItemId: lot.sourcePurchaseItemId,
      purchaseDate: lot.sourcePurchaseItem?.createdAt.toISOString() ?? null,
      sourceBusinessDate: lot.sourceBusinessDate?.toISOString() ?? null,
      unitPrice: lot.unitPrice,
      originalQuantity: decimalToNumber(lot.originalQuantity),
      consumedQuantity: decimalToNumber(lot.consumedQuantity),
      remainingQuantity: decimalToNumber(lot.remainingQuantity),
      originalAmount: lot.originalAmount,
      consumedAmount: lot.consumedAmount,
      remainingAmount: lot.remainingAmount,
      sortOrder: lot.sortOrder,
    });
    byProductId.set(lot.productId, rows);
  }

  return byProductId;
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
  // WO-G(2026-06-22): lot의 영업 기준일은 현재 장부의 closingDate를 사용한다.
  const currentLedger = await tx.dailyLedger.findUnique({
    where: { id: dailyLedgerId },
    select: { closingDate: true },
  });
  const businessDate = currentLedger?.closingDate ?? null;

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

  const itemInputs = items.map((item) => ({
    ...item,
    previousQuantity: decimalToNumber(item.previousQuantity),
    currentQuantity:
      item.currentQuantity === null
        ? null
        : decimalToNumber(item.currentQuantity),
    quantity: item.quantity === null ? null : decimalToNumber(item.quantity),
  }));
  const productIds = itemInputs.map((item) => item.productId);
  const carryoverLedgerIds = [
    ...new Set(
      itemInputs
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
            sourceBusinessDate: true,
            unitPrice: true,
            remainingQuantity: true,
            sortOrder: true,
          },
          orderBy: [{ dailyLedgerId: "asc" }, { sortOrder: "asc" }],
        }),
  ]);

  const purchasesByProductId = groupByProductId(
    purchases.flatMap((purchase) =>
      purchase.productId
        ? [
            {
              ...purchase,
              productId: purchase.productId,
              quantity: decimalToNumber(purchase.quantity),
            },
          ]
        : [],
    ),
  );
  const lossesByProductId = groupByProductId(
    losses.map((loss) => ({
      ...loss,
      quantity: decimalToNumber(loss.quantity),
    })),
  );
  const previousLotsByProductId = groupByProductId(
    previousLots.map((lot) => ({
      productId: lot.productId,
      sourceType: lot.sourceType as FifoPreviousLotInput["sourceType"],
      sourceLedgerId: lot.dailyLedgerId,
      sourcePurchaseItemId: lot.sourcePurchaseItemId,
      sourceBusinessDate: lot.sourceBusinessDate,
      unitPrice: lot.unitPrice,
      remainingQuantity: decimalToNumber(lot.remainingQuantity),
    })),
  );
  const rowsToCreate: Array<Prisma.LedgerInventoryFifoLotCreateManyInput> = [];

  for (const item of itemInputs) {
    const productPurchases = purchasesByProductId.get(item.productId) ?? [];
    const purchasedQuantity = sumQuantity(productPurchases);
    const lossQuantity = sumQuantity(
      lossesByProductId.get(item.productId) ?? [],
    );
    const systemQuantity = calculateSystemInventoryQuantity({
      previousQuantity: item.previousQuantity,
      purchasedQuantity,
      lossQuantity,
    });
    const closingQuantity =
      item.currentQuantity ??
      item.quantity ??
      systemQuantity ??
      item.previousQuantity;
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
      businessDate,
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
        sourceBusinessDate: lot.sourceBusinessDate,
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
