import type { Prisma } from "../../../generated/prisma";

export type InventoryPlanGate = {
  targetProductIds: string[];
  persistedInventoryProductIds: string[];
  plannedProductIds: string[];
  missingInventoryProductIds: string[];
  missingPlanProductIds: string[];
  complete: boolean;
};

type InventoryPlanGateInput = {
  targetProductIds: Iterable<string>;
  persistedInventoryProductIds: Iterable<string>;
  plannedProductIds: Iterable<string>;
};

function uniqueSorted(values: Iterable<string>) {
  return [...new Set(values)].sort();
}

export function getInventoryPlanGate({
  targetProductIds,
  persistedInventoryProductIds,
  plannedProductIds,
}: InventoryPlanGateInput): InventoryPlanGate {
  const targets = uniqueSorted(targetProductIds);
  const persisted = uniqueSorted(persistedInventoryProductIds);
  const planned = uniqueSorted(plannedProductIds);
  const persistedSet = new Set(persisted);
  const plannedSet = new Set(planned);
  const missingInventoryProductIds = targets.filter(
    (productId) => !persistedSet.has(productId),
  );
  const missingPlanProductIds = targets.filter(
    (productId) => !plannedSet.has(productId),
  );

  return {
    targetProductIds: targets,
    persistedInventoryProductIds: persisted,
    plannedProductIds: planned,
    missingInventoryProductIds,
    missingPlanProductIds,
    complete:
      targets.length > 0 &&
      missingInventoryProductIds.length === 0 &&
      missingPlanProductIds.length === 0,
  };
}

function getYearMonth(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getInventoryPlanGateForLedgerInTx(
  tx: Prisma.TransactionClient,
  ledger: { id: string; storeId: string; closingDate: Date },
): Promise<InventoryPlanGate> {
  const [inventoryItems, purchaseItems, lossItems, plans] = await Promise.all([
    tx.ledgerInventoryItem.findMany({
      where: { dailyLedgerId: ledger.id },
      select: { productId: true },
    }),
    tx.ledgerPurchaseItem.findMany({
      where: { dailyLedgerId: ledger.id, productId: { not: null } },
      select: { productId: true },
    }),
    tx.ledgerLossItem.findMany({
      where: { dailyLedgerId: ledger.id },
      select: { productId: true },
    }),
    tx.storeSalesPricePlan.findMany({
      where: { storeId: ledger.storeId, businessDate: ledger.closingDate },
      select: { productId: true },
    }),
  ]);

  const persistedProductIds = inventoryItems.map((item) => item.productId);
  const activityProductIds = [
    ...purchaseItems.flatMap((item) => (item.productId ? [item.productId] : [])),
    ...lossItems.map((item) => item.productId),
  ];
  let carryoverProductIds: string[] = [];

  if (persistedProductIds.length === 0) {
    const priorLedger = await tx.dailyLedger.findFirst({
      where: {
        storeId: ledger.storeId,
        closingDate: { lt: ledger.closingDate },
        status: { not: "HOLIDAY" },
        ledgerInventoryItems: { some: {} },
      },
      orderBy: { closingDate: "desc" },
      select: {
        closingDate: true,
        ledgerInventoryItems: { select: { productId: true } },
      },
    });

    if (
      priorLedger &&
      getYearMonth(priorLedger.closingDate) === getYearMonth(ledger.closingDate)
    ) {
      carryoverProductIds = priorLedger.ledgerInventoryItems.map(
        (item) => item.productId,
      );
    } else {
      const snapshots = await tx.inventoryOpeningSnapshot.findMany({
        where: {
          storeId: ledger.storeId,
          yearMonth: getYearMonth(ledger.closingDate),
        },
        select: { productId: true },
      });
      carryoverProductIds =
        snapshots.length > 0
          ? snapshots.map((item) => item.productId)
          : (priorLedger?.ledgerInventoryItems.map((item) => item.productId) ??
            []);
    }
  }

  return getInventoryPlanGate({
    targetProductIds: [
      ...persistedProductIds,
      ...carryoverProductIds,
      ...activityProductIds,
    ],
    persistedInventoryProductIds: persistedProductIds,
    plannedProductIds: plans.map((plan) => plan.productId),
  });
}
