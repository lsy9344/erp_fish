import type { Prisma } from "../../../generated/prisma";
import {
  calculateInventoryAmount,
  calculateSystemInventoryQuantity,
} from "../../server/calculations/inventory.ts";
import { decimalToNumber } from "../../lib/decimal.ts";
import {
  MAX_VALIDATION_INTEGER,
  roundToTwoDecimals,
} from "../../lib/validation.ts";
import {
  loadResolvedLotSalesPricesInTx,
  lotSalesPriceKey,
  type LotPlannedUnitPriceSource,
} from "./lot-sales-price.ts";

type InventoryLotSourceValue =
  | "OPENING"
  | "PREVIOUS_CARRYOVER"
  | "PURCHASE"
  | "LEGACY_OPENING";

export type FifoPreviousLotInput = {
  lotOriginKey: string;
  sourceType: InventoryLotSourceValue;
  sourceLedgerId: string | null;
  sourcePurchaseItemId: string | null;
  unitPrice: number;
  remainingQuantity: number;
  // WO-G(2026-06-22): 이월 lot의 원천 영업 기준일. 이월 시에도 그대로 보존한다.
  sourceBusinessDate: Date | null;
};

export type FifoPurchaseLotInput = {
  id: string;
  lotOriginKey: string;
  unitPrice: number;
  quantity: number;
};

export type FifoLegacyOpeningInput = {
  lotOriginKey: string;
  unitPrice: number;
  quantity: number;
};

export type FifoLossInput = {
  id: string;
  quantity: number;
};

export type FifoLossLotAllocation = {
  ledgerLossItemId: string;
  lotOriginKey: string;
  quantity: number;
  unitCost: number;
  costAmount: number;
};

export type FifoLotSnapshot = {
  lotOriginKey: string;
  sourceType: InventoryLotSourceValue;
  sourceLedgerId: string | null;
  sourcePurchaseItemId: string | null;
  sourceBusinessDate: Date | null;
  unitPrice: number;
  originalQuantity: number;
  consumedQuantity: number;
  lossQuantity: number;
  soldQuantity: number;
  remainingQuantity: number;
  originalAmount: number;
  consumedAmount: number;
  lossAmount: number;
  soldAmount: number;
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

function addBoundedAmount(total: number, value: number) {
  const result = total + value;

  if (!Number.isSafeInteger(result) || result > MAX_VALIDATION_INTEGER) {
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
  losses = [],
  closingQuantity,
  businessDate = null,
}: {
  previousLots: FifoPreviousLotInput[];
  legacyOpening: FifoLegacyOpeningInput;
  purchases: FifoPurchaseLotInput[];
  losses?: FifoLossInput[];
  closingQuantity: number;
  // WO-G(2026-06-22): 현재 장부의 영업 기준일(closingDate). PURCHASE lot과
  // 원천 영업일이 없는 기초/LEGACY lot의 fallback 기준일로 쓴다.
  businessDate?: Date | null;
}) {
  const sourceLots: Array<{
    lotOriginKey: string;
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
        lotOriginKey: lot.lotOriginKey,
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
      lotOriginKey: legacyOpening.lotOriginKey,
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
      lotOriginKey: purchase.lotOriginKey,
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

  const lossQuantityByLot = sourceLots.map(() => 0);
  const availableAfterLoss = sourceLots.map((lot) => lot.quantity);
  const lossAllocations: FifoLossLotAllocation[] = [];
  let lossLotIndex = 0;

  for (const loss of losses) {
    let remainingLoss = roundToTwoDecimals(Math.max(0, loss.quantity));

    while (remainingLoss > 0 && lossLotIndex < sourceLots.length) {
      const lot = sourceLots[lossLotIndex]!;
      const allocatedQuantity = roundToTwoDecimals(
        Math.min(availableAfterLoss[lossLotIndex] ?? 0, remainingLoss),
      );

      if (allocatedQuantity <= 0) {
        lossLotIndex += 1;
        continue;
      }

      availableAfterLoss[lossLotIndex] = roundToTwoDecimals(
        (availableAfterLoss[lossLotIndex] ?? 0) - allocatedQuantity,
      );
      lossQuantityByLot[lossLotIndex] = roundToTwoDecimals(
        (lossQuantityByLot[lossLotIndex] ?? 0) + allocatedQuantity,
      );
      remainingLoss = roundToTwoDecimals(remainingLoss - allocatedQuantity);
      lossAllocations.push({
        ledgerLossItemId: loss.id,
        lotOriginKey: lot.lotOriginKey,
        quantity: allocatedQuantity,
        unitCost: lot.unitPrice,
        costAmount: amount(allocatedQuantity, lot.unitPrice),
      });

      if ((availableAfterLoss[lossLotIndex] ?? 0) <= 0) {
        lossLotIndex += 1;
      }
    }
  }

  const allocatedLossQuantity = roundToTwoDecimals(
    lossQuantityByLot.reduce((sum, quantity) => sum + quantity, 0),
  );
  const availablePostLossQuantity = roundToTwoDecimals(
    availableQuantity - allocatedLossQuantity,
  );

  // 손실을 먼저 차감한 뒤에도 마감 재고가 더 크면, 그 차이만 근거 미상 재고로
  // 보정한다. 손실 전 수량과 비교하면 손실 2개·마감 9개 같은 경우 1개가 사라진다.
  if (closingQuantity > availablePostLossQuantity) {
    const adjustmentQuantity = roundToTwoDecimals(
      closingQuantity - availablePostLossQuantity,
    );
    sourceLots.push({
      lotOriginKey: `${legacyOpening.lotOriginKey}:adjustment`,
      sourceType: "LEGACY_OPENING",
      sourceLedgerId: null,
      sourcePurchaseItemId: null,
      sourceBusinessDate: businessDate,
      unitPrice: legacyOpening.unitPrice,
      quantity: adjustmentQuantity,
    });
    lossQuantityByLot.push(0);
    availableAfterLoss.push(adjustmentQuantity);
  }

  let quantityToSell = roundToTwoDecimals(
    Math.max(
      0,
      availableAfterLoss.reduce((sum, quantity) => sum + quantity, 0) -
        closingQuantity,
    ),
  );
  let consumedAmount = 0;
  let lossAmount = 0;
  let soldAmount = 0;
  let remainingAmount = 0;
  const lots: FifoLotSnapshot[] = sourceLots.map((lot, index) => {
    const lotLossQuantity = lossQuantityByLot[index] ?? 0;
    const soldQuantity = roundToTwoDecimals(
      Math.min(availableAfterLoss[index] ?? 0, quantityToSell),
    );
    const consumedQuantity = roundToTwoDecimals(lotLossQuantity + soldQuantity);
    const remainingQuantity = roundToTwoDecimals(
      lot.quantity - consumedQuantity,
    );
    const lotLossAmount = amount(lotLossQuantity, lot.unitPrice);
    const lotSoldAmount = amount(soldQuantity, lot.unitPrice);
    const lotConsumedAmount = amount(consumedQuantity, lot.unitPrice);
    const lotRemainingAmount = amount(remainingQuantity, lot.unitPrice);
    quantityToSell = roundToTwoDecimals(quantityToSell - soldQuantity);
    consumedAmount = addBoundedAmount(consumedAmount, lotConsumedAmount);
    lossAmount = addBoundedAmount(lossAmount, lotLossAmount);
    soldAmount = addBoundedAmount(soldAmount, lotSoldAmount);
    remainingAmount = addBoundedAmount(remainingAmount, lotRemainingAmount);

    return {
      lotOriginKey: lot.lotOriginKey,
      sourceType: lot.sourceType,
      sourceLedgerId: lot.sourceLedgerId,
      sourcePurchaseItemId: lot.sourcePurchaseItemId,
      sourceBusinessDate: lot.sourceBusinessDate,
      unitPrice: lot.unitPrice,
      originalQuantity: lot.quantity,
      consumedQuantity,
      lossQuantity: lotLossQuantity,
      soldQuantity,
      remainingQuantity,
      originalAmount: amount(lot.quantity, lot.unitPrice),
      consumedAmount: lotConsumedAmount,
      lossAmount: lotLossAmount,
      soldAmount: lotSoldAmount,
      remainingAmount: lotRemainingAmount,
      sortOrder: index,
    };
  });

  return {
    lots,
    lossAllocations,
    consumedAmount,
    lossAmount,
    soldAmount,
    remainingAmount,
    containsLegacyOpening: lots.some(
      (lot) => lot.sourceType === "LEGACY_OPENING",
    ),
  };
}

export type InventoryFifoLotView = {
  lotOriginKey: string;
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
  lossQuantity: number;
  soldQuantity: number;
  remainingQuantity: number;
  originalAmount: number;
  consumedAmount: number;
  lossAmount: number;
  soldAmount: number;
  remainingAmount: number;
  plannedUnitPrice: number | null;
  plannedUnitPriceSource: LotPlannedUnitPriceSource | null;
  expectedRevenue: number | null;
  expectedProfit: number | null;
  expectedMarginRate: number | null;
  sortOrder: number;
};

export function toInventoryFifoLotViews(
  lots: readonly FifoLotSnapshot[],
): InventoryFifoLotView[] {
  return lots.map((lot) => ({
    lotOriginKey: lot.lotOriginKey,
    sourceType: lot.sourceType,
    sourceLedgerId: lot.sourceLedgerId,
    sourcePurchaseItemId: lot.sourcePurchaseItemId,
    purchaseDate: null,
    sourceBusinessDate: lot.sourceBusinessDate?.toISOString() ?? null,
    unitPrice: lot.unitPrice,
    originalQuantity: lot.originalQuantity,
    consumedQuantity: lot.consumedQuantity,
    lossQuantity: lot.lossQuantity,
    soldQuantity: lot.soldQuantity,
    remainingQuantity: lot.remainingQuantity,
    originalAmount: lot.originalAmount,
    consumedAmount: lot.consumedAmount,
    lossAmount: lot.lossAmount,
    soldAmount: lot.soldAmount,
    remainingAmount: lot.remainingAmount,
    plannedUnitPrice: null,
    plannedUnitPriceSource: null,
    expectedRevenue: null,
    expectedProfit: null,
    expectedMarginRate: null,
    sortOrder: lot.sortOrder,
  }));
}

const fifoLotViewSelect = {
  lotOriginKey: true,
  ledgerInventoryItemId: true,
  productId: true,
  sourceType: true,
  sourceLedgerId: true,
  sourcePurchaseItemId: true,
  sourceBusinessDate: true,
  unitPrice: true,
  originalQuantity: true,
  consumedQuantity: true,
  lossQuantity: true,
  soldQuantity: true,
  remainingQuantity: true,
  originalAmount: true,
  consumedAmount: true,
  lossAmount: true,
  soldAmount: true,
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
      lotOriginKey: lot.lotOriginKey,
      sourceType: lot.sourceType,
      sourceLedgerId: lot.sourceLedgerId,
      sourcePurchaseItemId: lot.sourcePurchaseItemId,
      purchaseDate: lot.sourcePurchaseItem?.createdAt.toISOString() ?? null,
      sourceBusinessDate: lot.sourceBusinessDate?.toISOString() ?? null,
      unitPrice: lot.unitPrice,
      originalQuantity: decimalToNumber(lot.originalQuantity),
      consumedQuantity: decimalToNumber(lot.consumedQuantity),
      lossQuantity: decimalToNumber(lot.lossQuantity),
      soldQuantity: decimalToNumber(lot.soldQuantity),
      remainingQuantity: decimalToNumber(lot.remainingQuantity),
      originalAmount: lot.originalAmount,
      consumedAmount: lot.consumedAmount,
      lossAmount: lot.lossAmount,
      soldAmount: lot.soldAmount,
      remainingAmount: lot.remainingAmount,
      plannedUnitPrice: null,
      plannedUnitPriceSource: null,
      expectedRevenue: null,
      expectedProfit: null,
      expectedMarginRate: null,
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

type FifoAmountValidationItem = {
  productId: string;
  unitPrice: number;
  previousQuantity: number;
  currentQuantity: number | null;
  quantity: number | null;
  carryoverLedgerId: string | null;
};

export type LedgerInventoryFifoSnapshot = {
  purchasedQuantity: number;
  lossItems: Array<{ id: string; recoveredAmount: number }>;
  fifo: ReturnType<typeof calculateFifoLotSnapshots>;
};

export type LedgerInventoryFifoPreflight = {
  invalidProductIds: string[];
  snapshotsByProductId: Map<string, LedgerInventoryFifoSnapshot>;
};

// 저장과 같은 원천 lot/매입/손실을 읽고 같은 순수 FIFO 계산을 실행한다. mutation 전
// Int 금액 경계를 행 오류로 바꾸기 위한 preflight이며 DB에는 아무것도 쓰지 않는다.
export async function getLedgerInventoryFifoAmountErrorProductIdsInTx(
  tx: Prisma.TransactionClient,
  dailyLedgerId: string,
  businessDate: Date,
  items: FifoAmountValidationItem[],
): Promise<LedgerInventoryFifoPreflight> {
  if (items.length === 0) {
    return { invalidProductIds: [], snapshotsByProductId: new Map() };
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
        lotOriginKey: true,
        productId: true,
        unitPrice: true,
        quantity: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.ledgerLossItem.findMany({
      where: { dailyLedgerId, productId: { in: productIds } },
      select: {
        id: true,
        productId: true,
        quantity: true,
        recoveredAmount: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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
            lotOriginKey: true,
            sourceType: true,
            sourcePurchaseItemId: true,
            sourceBusinessDate: true,
            unitPrice: true,
            remainingQuantity: true,
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
      lotOriginKey: lot.lotOriginKey,
      sourceType: lot.sourceType,
      sourceLedgerId: lot.dailyLedgerId,
      sourcePurchaseItemId: lot.sourcePurchaseItemId,
      sourceBusinessDate: lot.sourceBusinessDate,
      unitPrice: lot.unitPrice,
      remainingQuantity: decimalToNumber(lot.remainingQuantity),
    })),
  );
  const invalidProductIds: string[] = [];
  const snapshotsByProductId = new Map<string, LedgerInventoryFifoSnapshot>();

  for (const item of items) {
    const productPurchases = purchasesByProductId.get(item.productId) ?? [];
    const purchasedQuantity = sumQuantity(productPurchases);
    const systemQuantity = calculateSystemInventoryQuantity({
      previousQuantity: item.previousQuantity,
      purchasedQuantity,
      lossQuantity: sumQuantity(lossesByProductId.get(item.productId) ?? []),
    });
    const closingQuantity =
      item.currentQuantity ??
      item.quantity ??
      systemQuantity ??
      item.previousQuantity;

    try {
      const fifo = calculateFifoLotSnapshots({
        previousLots: previousLotsByProductId.get(item.productId) ?? [],
        legacyOpening: {
          lotOriginKey: `legacy:${item.carryoverLedgerId ?? dailyLedgerId}:${item.productId}`,
          unitPrice: item.unitPrice,
          quantity: item.previousQuantity,
        },
        purchases: productPurchases.map((purchase) => ({
          id: purchase.id,
          lotOriginKey: purchase.lotOriginKey,
          unitPrice: purchase.unitPrice,
          quantity: purchase.quantity,
        })),
        losses: (lossesByProductId.get(item.productId) ?? []).map((loss) => ({
          id: loss.id,
          quantity: loss.quantity,
        })),
        closingQuantity,
        businessDate,
      });
      snapshotsByProductId.set(item.productId, {
        purchasedQuantity,
        lossItems: (lossesByProductId.get(item.productId) ?? []).map(
          (loss) => ({
            id: loss.id,
            recoveredAmount: loss.recoveredAmount,
          }),
        ),
        fifo,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "FIFO_AMOUNT_UNAVAILABLE"
      ) {
        invalidProductIds.push(item.productId);
        continue;
      }

      throw error;
    }
  }

  return { invalidProductIds, snapshotsByProductId };
}

export async function refreshLedgerInventoryFifoLots(
  tx: Prisma.TransactionClient,
  dailyLedgerId: string,
  preflightSnapshotsByProductId?: ReadonlyMap<
    string,
    LedgerInventoryFifoSnapshot
  >,
) {
  // WO-G(2026-06-22): lot의 영업 기준일은 현재 장부의 closingDate를 사용한다.
  const currentLedger = preflightSnapshotsByProductId
    ? null
    : await tx.dailyLedger.findUnique({
        where: { id: dailyLedgerId },
        select: { storeId: true, closingDate: true },
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

  await Promise.all([
    tx.ledgerLossLotAllocation.deleteMany({ where: { dailyLedgerId } }),
    tx.ledgerInventoryFifoLot.deleteMany({ where: { dailyLedgerId } }),
  ]);

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
  const [purchases, losses, previousLots] = preflightSnapshotsByProductId
    ? ([[], [], []] as const)
    : await Promise.all([
        tx.ledgerPurchaseItem.findMany({
          where: { dailyLedgerId, productId: { in: productIds } },
          select: {
            id: true,
            lotOriginKey: true,
            productId: true,
            unitPrice: true,
            quantity: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
        tx.ledgerLossItem.findMany({
          where: { dailyLedgerId, productId: { in: productIds } },
          select: {
            id: true,
            productId: true,
            quantity: true,
            recoveredAmount: true,
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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
                lotOriginKey: true,
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
      lotOriginKey: lot.lotOriginKey,
      sourceType: lot.sourceType,
      sourceLedgerId: lot.dailyLedgerId,
      sourcePurchaseItemId: lot.sourcePurchaseItemId,
      sourceBusinessDate: lot.sourceBusinessDate,
      unitPrice: lot.unitPrice,
      remainingQuantity: decimalToNumber(lot.remainingQuantity),
    })),
  );
  const rowsToCreate: Array<Prisma.LedgerInventoryFifoLotCreateManyInput> = [];
  const lossAllocationsToCreate: Array<
    FifoLossLotAllocation & { productId: string }
  > = [];
  const lossItemsForAmount = new Map<
    string,
    { recoveredAmount: number; productId: string }
  >();
  // 품목별 update를 개별 호출하면 DB 왕복이 품목 수만큼 늘어난다. Prisma는 인터랙티브
  // 트랜잭션 안의 동시 요청을 한 왕복으로 묶어주지 않으므로 Promise.all도 소용없다
  // (프로덕션 Neon 측정: 41행 순차 9.1s / Promise.all 8.3s / 단일 statement 0.8s).
  // 저장 트랜잭션이 30s 타임아웃(P2028)을 넘기는 주원인이었다. 루프는 계산만 하고
  // 아래에서 벌크 UPDATE 한 번으로 보낸다.
  const itemUpdates: Array<{
    id: string;
    purchasedQuantity: number;
    inventoryAmount: number;
  }> = [];

  for (const item of itemInputs) {
    const preflightSnapshot = preflightSnapshotsByProductId?.get(
      item.productId,
    );

    if (preflightSnapshotsByProductId && !preflightSnapshot) {
      throw new Error("FIFO_AMOUNT_UNAVAILABLE");
    }

    const productPurchases = purchasesByProductId.get(item.productId) ?? [];
    const purchasedQuantity =
      preflightSnapshot?.purchasedQuantity ?? sumQuantity(productPurchases);
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
    const fifo =
      preflightSnapshot?.fifo ??
      calculateFifoLotSnapshots({
        previousLots: previousLotsByProductId.get(item.productId) ?? [],
        legacyOpening: {
          lotOriginKey: `legacy:${item.carryoverLedgerId ?? dailyLedgerId}:${item.productId}`,
          unitPrice: item.unitPrice,
          quantity: item.previousQuantity,
        },
        purchases: productPurchases.map((purchase) => ({
          id: purchase.id,
          lotOriginKey: purchase.lotOriginKey,
          unitPrice: purchase.unitPrice,
          quantity: purchase.quantity,
        })),
        losses: (lossesByProductId.get(item.productId) ?? []).map((loss) => ({
          id: loss.id,
          quantity: loss.quantity,
        })),
        closingQuantity,
        businessDate,
      });

    itemUpdates.push({
      id: item.id,
      purchasedQuantity,
      inventoryAmount: fifo.remainingAmount,
    });

    rowsToCreate.push(
      ...fifo.lots.map((lot) => ({
        lotOriginKey: lot.lotOriginKey,
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
        lossQuantity: lot.lossQuantity,
        soldQuantity: lot.soldQuantity,
        remainingQuantity: lot.remainingQuantity,
        originalAmount: lot.originalAmount,
        consumedAmount: lot.consumedAmount,
        lossAmount: lot.lossAmount,
        soldAmount: lot.soldAmount,
        remainingAmount: lot.remainingAmount,
        sortOrder: lot.sortOrder,
      })),
    );

    lossAllocationsToCreate.push(
      ...(fifo.lossAllocations ?? []).map((allocation) => ({
        ...allocation,
        productId: item.productId,
      })),
    );
    const productLossItems = preflightSnapshot
      ? (preflightSnapshot.lossItems ?? [])
      : (lossesByProductId.get(item.productId) ?? []).map((loss) => ({
          id: loss.id,
          recoveredAmount: loss.recoveredAmount,
        }));
    for (const lossItem of productLossItems) {
      lossItemsForAmount.set(lossItem.id, {
        recoveredAmount: lossItem.recoveredAmount,
        productId: item.productId,
      });
    }
  }

  if (itemUpdates.length > 0) {
    // 자리표시자는 배열 길이로만 만들고 값은 전부 바인딩 파라미터다(입력값이 SQL에
    // 섞이지 않는다). purchasedQuantity는 Decimal(12,2)이므로 부동소수 왕복을 피해
    // 문자열로 넘겨 numeric으로 캐스팅한다. raw는 @updatedAt을 트리거하지 않아
    // Prisma update와 같게 updatedAt을 직접 갱신한다.
    const rowValues = itemUpdates
      .map((_, index) => {
        const base = index * 3;

        return `($${base + 1}, $${base + 2}::numeric, $${base + 3}::int)`;
      })
      .join(", ");

    await tx.$executeRawUnsafe(
      `UPDATE "LedgerInventoryItem" AS item
          SET "purchasedQuantity" = source."purchasedQuantity",
              "inventoryAmount" = source."inventoryAmount",
              "updatedAt" = now()
         FROM (VALUES ${rowValues})
           AS source(id, "purchasedQuantity", "inventoryAmount")
        WHERE item.id = source.id`,
      ...itemUpdates.flatMap((update) => [
        update.id,
        String(update.purchasedQuantity),
        update.inventoryAmount,
      ]),
    );
  }

  if (rowsToCreate.length > 0) {
    await tx.ledgerInventoryFifoLot.createMany({
      data: rowsToCreate,
    });
  }

  if (lossAllocationsToCreate.length > 0) {
    const ledgerForPrices =
      currentLedger ??
      (await tx.dailyLedger.findUniqueOrThrow({
        where: { id: dailyLedgerId },
        select: { storeId: true, closingDate: true },
      }));
    const resolvedPrices = await loadResolvedLotSalesPricesInTx(tx, {
      dailyLedgerId,
      storeId: ledgerForPrices.storeId,
      businessDate: ledgerForPrices.closingDate,
      lots: lossAllocationsToCreate.map((allocation) => ({
        productId: allocation.productId,
        lotOriginKey: allocation.lotOriginKey,
      })),
    });
    const persistedAllocations = lossAllocationsToCreate.map((allocation) => {
      const resolved = resolvedPrices.get(
        lotSalesPriceKey(allocation.productId, allocation.lotOriginKey),
      );
      const plannedUnitPrice = resolved?.plannedUnitPrice ?? 0;

      return {
        dailyLedgerId,
        ledgerLossItemId: allocation.ledgerLossItemId,
        productId: allocation.productId,
        lotOriginKey: allocation.lotOriginKey,
        quantity: allocation.quantity,
        unitCost: allocation.unitCost,
        plannedUnitPrice,
        costAmount: allocation.costAmount,
        grossLossAmount: amount(allocation.quantity, plannedUnitPrice),
        hasPlannedPrice: resolved?.plannedUnitPrice != null,
      };
    });

    await tx.ledgerLossLotAllocation.createMany({
      data: persistedAllocations.map(({ hasPlannedPrice, ...allocation }) => {
        void hasPlannedPrice;
        return allocation;
      }),
    });

    const allocationsByLossId = new Map<string, typeof persistedAllocations>();
    for (const allocation of persistedAllocations) {
      const rows = allocationsByLossId.get(allocation.ledgerLossItemId) ?? [];
      rows.push(allocation);
      allocationsByLossId.set(allocation.ledgerLossItemId, rows);
    }

    await Promise.all(
      [...lossItemsForAmount.entries()].map(([lossItemId, lossItem]) => {
        const allocations = allocationsByLossId.get(lossItemId) ?? [];
        const grossLossAmount = allocations.reduce(
          (sum, allocation) => sum + allocation.grossLossAmount,
          0,
        );
        const allocatedQuantity = allocations.reduce(
          (sum, allocation) => sum + allocation.quantity,
          0,
        );
        const usedPlannedPrice =
          allocations.length > 0 &&
          allocations.every((allocation) => allocation.hasPlannedPrice);

        return tx.ledgerLossItem.update({
          where: { id: lossItemId },
          data: {
            unitPrice:
              allocatedQuantity > 0
                ? Math.round(grossLossAmount / allocatedQuantity)
                : 0,
            amount: Math.max(0, grossLossAmount - lossItem.recoveredAmount),
            usedPlannedPrice,
          },
        });
      }),
    );
  }
}
