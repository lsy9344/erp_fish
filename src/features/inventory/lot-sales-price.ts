import type { Prisma } from "../../../generated/prisma";

import { SALES_PRICE_CARRYOVER_LEDGER_STATUSES } from "./sales-price-carryover.ts";

export type LotPlannedUnitPriceSource =
  | "CURRENT"
  | "CARRYOVER"
  | "LEGACY_PRODUCT";

export type ResolvedLotSalesPrice = {
  plannedUnitPrice: number | null;
  plannedUnitPriceSource: LotPlannedUnitPriceSource | null;
};

export type LedgerLotPriceInput = {
  productId: string;
  lotOriginKey: string;
  plannedUnitPrice: number;
};

export function lotSalesPriceKey(productId: string, lotOriginKey: string) {
  return `${productId}\u0000${lotOriginKey}`;
}

export async function upsertLedgerLotSalesPricePlansInTx(
  tx: Prisma.TransactionClient,
  input: {
    dailyLedgerId: string;
    lotPrices: LedgerLotPriceInput[];
    actorId: string;
  },
) {
  if (input.lotPrices.length === 0) return;

  const byOrigin = new Map(
    input.lotPrices.map((price) => [price.lotOriginKey, price]),
  );
  const lotPrices = [...byOrigin.values()];
  const existing = await tx.ledgerLotSalesPricePlan.findMany({
    where: {
      dailyLedgerId: input.dailyLedgerId,
      lotOriginKey: { in: lotPrices.map((price) => price.lotOriginKey) },
    },
    select: { lotOriginKey: true },
  });
  const existingOrigins = new Set(existing.map((plan) => plan.lotOriginKey));
  const updates = lotPrices.filter((price) =>
    existingOrigins.has(price.lotOriginKey),
  );
  const creates = lotPrices.filter(
    (price) => !existingOrigins.has(price.lotOriginKey),
  );

  if (updates.length > 0) {
    const values = updates
      .map(
        (_, index) =>
          `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3}::int)`,
      )
      .join(", ");
    const tail = updates.length * 3;

    await tx.$executeRawUnsafe(
      `UPDATE "LedgerLotSalesPricePlan" AS plan
          SET "productId" = source."productId",
              "plannedUnitPrice" = source."plannedUnitPrice",
              "updatedById" = $${tail + 1},
              "updatedAt" = now()
         FROM (VALUES ${values}) AS source("lotOriginKey", "productId", "plannedUnitPrice")
        WHERE plan."dailyLedgerId" = $${tail + 2}
          AND plan."lotOriginKey" = source."lotOriginKey"`,
      ...updates.flatMap((price) => [
        price.lotOriginKey,
        price.productId,
        price.plannedUnitPrice,
      ]),
      input.actorId,
      input.dailyLedgerId,
    );
  }

  if (creates.length > 0) {
    await tx.ledgerLotSalesPricePlan.createMany({
      data: creates.map((price) => ({
        dailyLedgerId: input.dailyLedgerId,
        productId: price.productId,
        lotOriginKey: price.lotOriginKey,
        plannedUnitPrice: price.plannedUnitPrice,
        createdById: input.actorId,
        updatedById: input.actorId,
      })),
    });
  }
}

/**
 * Resolve a price for every lot in this order:
 * today lot price -> latest earlier price for the same immutable lot ->
 * legacy product price for today/latest eligible prior business day.
 */
export async function loadResolvedLotSalesPricesInTx(
  tx: Prisma.TransactionClient,
  input: {
    dailyLedgerId: string;
    storeId: string;
    businessDate: Date;
    lots: readonly { productId: string; lotOriginKey: string }[];
  },
): Promise<Map<string, ResolvedLotSalesPrice>> {
  const uniqueLots = [
    ...new Map(
      input.lots.map((lot) => [
        lotSalesPriceKey(lot.productId, lot.lotOriginKey),
        lot,
      ]),
    ).values(),
  ];

  if (uniqueLots.length === 0) return new Map();

  const originKeys = uniqueLots.map((lot) => lot.lotOriginKey);
  const productIds = [...new Set(uniqueLots.map((lot) => lot.productId))];
  const [currentLotPlans, priorLotPlans, currentProductPlans, priorLedger] =
    await Promise.all([
      tx.ledgerLotSalesPricePlan.findMany({
        where: {
          dailyLedgerId: input.dailyLedgerId,
          lotOriginKey: { in: originKeys },
        },
        select: {
          productId: true,
          lotOriginKey: true,
          plannedUnitPrice: true,
        },
      }),
      tx.ledgerLotSalesPricePlan.findMany({
        where: {
          lotOriginKey: { in: originKeys },
          dailyLedger: {
            storeId: input.storeId,
            closingDate: { lt: input.businessDate },
            status: { in: [...SALES_PRICE_CARRYOVER_LEDGER_STATUSES] },
          },
        },
        orderBy: { dailyLedger: { closingDate: "desc" } },
        select: {
          productId: true,
          lotOriginKey: true,
          plannedUnitPrice: true,
        },
      }),
      tx.storeSalesPricePlan.findMany({
        where: {
          storeId: input.storeId,
          businessDate: input.businessDate,
          productId: { in: productIds },
        },
        select: { productId: true, plannedUnitPrice: true },
      }),
      tx.dailyLedger.findFirst({
        where: {
          storeId: input.storeId,
          closingDate: { lt: input.businessDate },
          status: { in: [...SALES_PRICE_CARRYOVER_LEDGER_STATUSES] },
        },
        orderBy: { closingDate: "desc" },
        select: { closingDate: true },
      }),
    ]);

  const priorProductPlans = priorLedger
    ? await tx.storeSalesPricePlan.findMany({
        where: {
          storeId: input.storeId,
          businessDate: priorLedger.closingDate,
          productId: { in: productIds },
        },
        select: { productId: true, plannedUnitPrice: true },
      })
    : [];
  const currentLotByKey = new Map(
    currentLotPlans.map((plan) => [
      lotSalesPriceKey(plan.productId, plan.lotOriginKey),
      plan.plannedUnitPrice,
    ]),
  );
  const priorLotByKey = new Map<string, number>();
  for (const plan of priorLotPlans) {
    const key = lotSalesPriceKey(plan.productId, plan.lotOriginKey);
    if (!priorLotByKey.has(key)) priorLotByKey.set(key, plan.plannedUnitPrice);
  }
  const currentProductById = new Map(
    currentProductPlans.map((plan) => [plan.productId, plan.plannedUnitPrice]),
  );
  const priorProductById = new Map(
    priorProductPlans.map((plan) => [plan.productId, plan.plannedUnitPrice]),
  );
  const resolved = new Map<string, ResolvedLotSalesPrice>();

  for (const lot of uniqueLots) {
    const key = lotSalesPriceKey(lot.productId, lot.lotOriginKey);
    const currentLotPrice = currentLotByKey.get(key);
    const priorLotPrice = priorLotByKey.get(key);
    const legacyProductPrice =
      currentProductById.get(lot.productId) ??
      priorProductById.get(lot.productId);

    resolved.set(
      key,
      currentLotPrice !== undefined
        ? {
            plannedUnitPrice: currentLotPrice,
            plannedUnitPriceSource: "CURRENT",
          }
        : priorLotPrice !== undefined
          ? {
              plannedUnitPrice: priorLotPrice,
              plannedUnitPriceSource: "CARRYOVER",
            }
          : legacyProductPrice !== undefined
            ? {
                plannedUnitPrice: legacyProductPrice,
                plannedUnitPriceSource: "LEGACY_PRODUCT",
              }
            : { plannedUnitPrice: null, plannedUnitPriceSource: null },
    );
  }

  return resolved;
}
