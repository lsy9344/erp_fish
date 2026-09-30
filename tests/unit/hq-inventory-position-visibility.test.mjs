import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

test("inventory report hides only items with zero previous and current stock", async () => {
  const cases = [
    { productId: "empty", previousQuantity: 0, currentQuantity: 0 },
    { productId: "sold-out", previousQuantity: 0.1, currentQuantity: 0 },
    { productId: "small-sold-out", previousQuantity: 0.01, currentQuantity: 0 },
    { productId: "new-stock", previousQuantity: 0, currentQuantity: 0.1 },
    { productId: "remaining", previousQuantity: 1, currentQuantity: 0.5 },
    { productId: "unknown", previousQuantity: 0, currentQuantity: null },
    {
      productId: "legacy-empty",
      previousQuantity: 0,
      currentQuantity: null,
      quantity: 0,
    },
    {
      productId: "legacy-stock",
      previousQuantity: 0,
      currentQuantity: null,
      quantity: 0.1,
    },
    {
      productId: "current-wins",
      previousQuantity: 0,
      currentQuantity: 0,
      quantity: 1,
    },
  ];
  const stores = [
    { id: "store-1", name: "본점" },
    { id: "store-2", name: "지점" },
    { id: "missing-store", name: "미입력점" },
  ];
  const ledgers = stores.slice(0, 2).map((store) => ({
    storeId: store.id,
    ledgerLossItems: [],
    ledgerInventoryItems: cases.map((item) => ({
      productName: item.productId,
      productCategory: "생물",
      productSpec: "1kg",
      unitPrice: 1000,
      purchasedQuantity: 0,
      conversionInQuantity: 0,
      conversionOutQuantity: 0,
      quantity: null,
      inventoryAmount: 0,
      fifoLots: [],
      ...item,
    })),
  }));
  const hooks = registerHooks({
    load(url, context, nextLoad) {
      if (url.endsWith("/src/server/authz.ts")) {
        return {
          format: "module",
          shortCircuit: true,
          source: `export async function requireReportAccess() {}
            export async function getHeadquartersStoreScope() {
              return { stores: ${JSON.stringify(stores)} };
            }`,
        };
      }
      if (url.endsWith("/src/server/db.ts")) {
        return {
          format: "module",
          shortCircuit: true,
          source: `export const db = { dailyLedger: { async findMany() {
            return ${JSON.stringify(ledgers)};
          } } };`,
        };
      }
      return nextLoad(url, context);
    },
  });

  try {
    const { getHqInventoryPositionReport } =
      await import("../../src/features/reports/inventory-position-queries.ts");
    const report = await getHqInventoryPositionReport({ date: "2026-09-29" });
    const visibleProducts = [
      "sold-out",
      "small-sold-out",
      "new-stock",
      "remaining",
      "unknown",
      "legacy-stock",
    ].sort();

    for (const store of stores.slice(0, 2)) {
      assert.deepEqual(
        report.rows
          .filter((row) => row.storeId === store.id)
          .map((row) => row.productId)
          .sort(),
        visibleProducts,
      );
    }
    assert.equal(report.summary.productCount, visibleProducts.length);
    assert.equal(report.summary.missingRowCount, 1);
    assert.equal(
      report.rows.find((row) => row.storeId === "missing-store").statusLabel,
      "미입력",
    );

    const filtered = await getHqInventoryPositionReport({
      date: "2026-09-29",
      storeId: "store-1",
      category: "생물",
      product: "empty",
    });
    assert.deepEqual(filtered.rows, []);
    assert.equal(filtered.summary.productCount, 0);
  } finally {
    hooks.deregister();
  }
});
