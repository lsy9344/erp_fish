import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateFifoLotSnapshots } from "../../src/features/inventory/fifo-lots.ts";
import {
  loadResolvedLotSalesPricesInTx,
  lotSalesPriceKey,
} from "../../src/features/inventory/lot-sales-price.ts";
import { calculateLedgerReviewSummary } from "../../src/server/calculations/ledger.ts";
import { buildProductCategoryPerformance } from "../../src/features/reports/queries.ts";

test("same-day lots keep separate origins while loss and sales both cross FIFO lots", () => {
  const result = calculateFifoLotSnapshots({
    previousLots: [],
    legacyOpening: {
      lotOriginKey: "legacy-unused",
      unitPrice: 0,
      quantity: 0,
    },
    purchases: [
      { id: "purchase-1", lotOriginKey: "lot-1", unitPrice: 100, quantity: 5 },
      { id: "purchase-2", lotOriginKey: "lot-2", unitPrice: 150, quantity: 5 },
      { id: "purchase-3", lotOriginKey: "lot-3", unitPrice: 200, quantity: 5 },
    ],
    losses: [{ id: "loss-1", quantity: 7 }],
    closingQuantity: 2,
    businessDate: new Date("2026-08-24T00:00:00.000Z"),
  });

  assert.deepEqual(
    result.lots.map((lot) => ({
      lotOriginKey: lot.lotOriginKey,
      lossQuantity: lot.lossQuantity,
      soldQuantity: lot.soldQuantity,
      remainingQuantity: lot.remainingQuantity,
    })),
    [
      {
        lotOriginKey: "lot-1",
        lossQuantity: 5,
        soldQuantity: 0,
        remainingQuantity: 0,
      },
      {
        lotOriginKey: "lot-2",
        lossQuantity: 2,
        soldQuantity: 3,
        remainingQuantity: 0,
      },
      {
        lotOriginKey: "lot-3",
        lossQuantity: 0,
        soldQuantity: 3,
        remainingQuantity: 2,
      },
    ],
  );
  assert.deepEqual(
    result.lossAllocations.map((allocation) => ({
      lotOriginKey: allocation.lotOriginKey,
      quantity: allocation.quantity,
      costAmount: allocation.costAmount,
    })),
    [
      { lotOriginKey: "lot-1", quantity: 5, costAmount: 500 },
      { lotOriginKey: "lot-2", quantity: 2, costAmount: 300 },
    ],
  );
  assert.equal(result.lossAmount, 800);
  assert.equal(result.soldAmount, 1_050);

  const priceByOrigin = new Map([
    ["lot-1", 200],
    ["lot-2", 300],
    ["lot-3", 400],
  ]);
  const expectedRevenue = result.lots.reduce(
    (sum, lot) => sum + lot.soldQuantity * priceByOrigin.get(lot.lotOriginKey),
    0,
  );
  const grossLossAmount = result.lossAllocations.reduce(
    (sum, allocation) =>
      sum + allocation.quantity * priceByOrigin.get(allocation.lotOriginKey),
    0,
  );

  assert.equal(expectedRevenue, 2_100);
  assert.equal(expectedRevenue - result.soldAmount, 1_050);
  assert.equal((expectedRevenue - result.soldAmount) / expectedRevenue, 0.5);
  assert.equal(grossLossAmount, 1_600);
});

test("each immutable lot carries its own prior-day price with legacy product fallback", async () => {
  let lotPlanCall = 0;
  let productPlanCall = 0;
  const tx = {
    ledgerLotSalesPricePlan: {
      findMany: async () => {
        lotPlanCall += 1;
        if (lotPlanCall === 1) {
          return [
            {
              productId: "p",
              lotOriginKey: "lot-current",
              plannedUnitPrice: 210,
            },
          ];
        }
        return [
          { productId: "p", lotOriginKey: "lot-a", plannedUnitPrice: 220 },
          { productId: "p", lotOriginKey: "lot-b", plannedUnitPrice: 330 },
        ];
      },
    },
    storeSalesPricePlan: {
      findMany: async () => {
        productPlanCall += 1;
        return productPlanCall === 1
          ? [{ productId: "legacy-current", plannedUnitPrice: 440 }]
          : [{ productId: "legacy-prior", plannedUnitPrice: 550 }];
      },
    },
    dailyLedger: {
      findFirst: async () => ({
        closingDate: new Date("2026-08-23T00:00:00.000Z"),
      }),
    },
  };

  const prices = await loadResolvedLotSalesPricesInTx(tx, {
    dailyLedgerId: "ledger-today",
    storeId: "store-1",
    businessDate: new Date("2026-08-24T00:00:00.000Z"),
    lots: [
      { productId: "p", lotOriginKey: "lot-current" },
      { productId: "p", lotOriginKey: "lot-a" },
      { productId: "p", lotOriginKey: "lot-b" },
      { productId: "legacy-current", lotOriginKey: "legacy-c" },
      { productId: "legacy-prior", lotOriginKey: "legacy-p" },
    ],
  });

  assert.deepEqual(prices.get(lotSalesPriceKey("p", "lot-current")), {
    plannedUnitPrice: 210,
    plannedUnitPriceSource: "CURRENT",
  });
  assert.deepEqual(prices.get(lotSalesPriceKey("p", "lot-a")), {
    plannedUnitPrice: 220,
    plannedUnitPriceSource: "CARRYOVER",
  });
  assert.deepEqual(prices.get(lotSalesPriceKey("p", "lot-b")), {
    plannedUnitPrice: 330,
    plannedUnitPriceSource: "CARRYOVER",
  });
  assert.deepEqual(prices.get(lotSalesPriceKey("legacy-current", "legacy-c")), {
    plannedUnitPrice: 440,
    plannedUnitPriceSource: "LEGACY_PRODUCT",
  });
  assert.deepEqual(prices.get(lotSalesPriceKey("legacy-prior", "legacy-p")), {
    plannedUnitPrice: 550,
    plannedUnitPriceSource: "LEGACY_PRODUCT",
  });
});

test("overstock adjustment is measured after FIFO loss allocation", () => {
  const result = calculateFifoLotSnapshots({
    previousLots: [],
    legacyOpening: {
      lotOriginKey: "legacy-stock",
      unitPrice: 100,
      quantity: 10,
    },
    purchases: [],
    losses: [{ id: "loss-1", quantity: 2 }],
    closingQuantity: 9,
    businessDate: new Date("2026-08-24T00:00:00.000Z"),
  });

  assert.equal(
    result.lots.reduce((sum, lot) => sum + lot.remainingQuantity, 0),
    9,
  );
  assert.deepEqual(
    result.lots.map((lot) => ({
      lotOriginKey: lot.lotOriginKey,
      lossQuantity: lot.lossQuantity,
      remainingQuantity: lot.remainingQuantity,
    })),
    [
      {
        lotOriginKey: "legacy-stock",
        lossQuantity: 2,
        remainingQuantity: 8,
      },
      {
        lotOriginKey: "legacy-stock:adjustment",
        lossQuantity: 0,
        remainingQuantity: 1,
      },
    ],
  );
});

test("review revenue subtracts only sold-lot cost, not FIFO loss cost", () => {
  const summary = calculateLedgerReviewSummary({
    totalSalesAmount: 1_000,
    cashAmount: 1_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 1,
    expenseTotal: 0,
    inventoryItems: [
      {
        previousQuantity: 10,
        purchasedQuantity: 0,
        currentQuantity: 2,
        quantity: 2,
        unitPrice: 100,
        inventoryAmount: 200,
        fifoLots: [
          {
            sourceType: "PURCHASE",
            consumedAmount: 800,
            soldAmount: 500,
            lossAmount: 300,
            remainingAmount: 200,
          },
        ],
      },
    ],
    lossItems: [{ amount: 300 }],
    plannedSalesItems: [
      {
        previousQuantity: 10,
        purchasedQuantity: 0,
        lossQuantity: 3,
        currentQuantity: 2,
        quantity: 2,
        plannedUnitPrice: 200,
      },
    ],
  });

  assert.equal(summary.costOfGoodsSold.value, 500);
  assert.equal(summary.plannedSalesTotal.value, 1_000);
  assert.equal(summary.plannedGrossProfit.value, 500);
});

test("review treats pre-migration FIFO consumption as sales cost", () => {
  const summary = calculateLedgerReviewSummary({
    totalSalesAmount: 1_000,
    cashAmount: 1_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 1,
    expenseTotal: 0,
    inventoryItems: [
      {
        previousQuantity: 10,
        purchasedQuantity: 0,
        currentQuantity: 2,
        quantity: 2,
        unitPrice: 100,
        inventoryAmount: 200,
        fifoLots: [
          {
            sourceType: "PURCHASE",
            consumedAmount: 800,
            soldAmount: 0,
            lossAmount: 0,
            remainingAmount: 200,
          },
        ],
      },
    ],
    lossItems: [],
  });

  assert.equal(summary.costOfGoodsSold.value, 800);
});

test("reports sum each lot's sold quantity at that lot's own price", () => {
  const [frozen] = buildProductCategoryPerformance([
    {
      ledgerInventoryItems: [
        {
          productId: "p",
          productCategory: "냉동",
          previousQuantity: 5,
          purchasedQuantity: 0,
          currentQuantity: 0,
          lossQuantity: 0,
          unitPrice: 130,
          plannedUnitPrice: 999,
          fifoLots: [
            {
              soldQuantity: 2,
              unitPrice: 100,
              plannedUnitPrice: 200,
              consumedAmount: 200,
              soldAmount: 200,
              lossAmount: 0,
            },
            {
              soldQuantity: 3,
              unitPrice: 150,
              plannedUnitPrice: 400,
              consumedAmount: 450,
              soldAmount: 450,
              lossAmount: 0,
            },
          ],
        },
      ],
    },
  ]);

  assert.equal(frozen.salesAmount, 1_600);
  assert.equal(frozen.grossMarginRate, (1_600 - 650) / 1_600);
  assert.equal(frozen.salesPriceFallbackItemCount, 0);
});
