import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = process.cwd();

const {
  applySalesPriceCarryoverFallback,
  buildInventoryConflictServerValues,
  formatInventoryConflictSalePrice,
  isSalesPriceCarryoverLedgerStatus,
  resolvePlannedUnitPriceDisplay,
  selectSalesPriceCarryoverSourceDate,
  SALES_PRICE_CARRYOVER_LEDGER_STATUSES,
} = await import(
  pathToFileURL(
    path.join(
      root,
      "src",
      "features",
      "inventory",
      "sales-price-carryover.ts",
    ),
  ).href
);

const { resolveInventoryPreviousQuantitySource } = await import(
  pathToFileURL(
    path.join(
      root,
      "src",
      "features",
      "inventory",
      "inventory-previous-quantity-source.ts",
    ),
  ).href
);

const { getInventoryPlanGate } = await import(
  pathToFileURL(
    path.join(root, "src", "features", "ledger", "inventory-plan-gate.ts"),
  ).href
);

test("planned unit price prefers current persisted value over carryover", () => {
  assert.deepEqual(
    resolvePlannedUnitPriceDisplay({
      currentPlannedUnitPrice: 2_500,
      carryoverPlannedUnitPrice: 2_000,
    }),
    {
      plannedUnitPrice: 2_500,
      plannedUnitPriceSource: "CURRENT",
    },
  );
});

test("planned unit price falls back to prior submitted carryover only when current is missing", () => {
  assert.deepEqual(
    resolvePlannedUnitPriceDisplay({
      currentPlannedUnitPrice: null,
      carryoverPlannedUnitPrice: 2_000,
    }),
    {
      plannedUnitPrice: 2_000,
      plannedUnitPriceSource: "CARRYOVER",
    },
  );
  assert.deepEqual(
    resolvePlannedUnitPriceDisplay({
      currentPlannedUnitPrice: null,
      carryoverPlannedUnitPrice: null,
    }),
    {
      plannedUnitPrice: null,
      plannedUnitPriceSource: null,
    },
  );
});

test("carryover fallback keeps current rows and fills only missing products", () => {
  const rows = applySalesPriceCarryoverFallback(
    [
      { productId: "current", plannedUnitPrice: 3_000 },
      { productId: "carryover", plannedUnitPrice: null },
      { productId: "new-product", plannedUnitPrice: null },
    ],
    new Map([
      ["current", 1_000],
      ["carryover", 2_000],
    ]),
  );

  assert.deepEqual(rows, [
    {
      productId: "current",
      plannedUnitPrice: 3_000,
      plannedUnitPriceSource: "CURRENT",
    },
    {
      productId: "carryover",
      plannedUnitPrice: 2_000,
      plannedUnitPriceSource: "CARRYOVER",
    },
    {
      productId: "new-product",
      plannedUnitPrice: null,
      plannedUnitPriceSource: null,
    },
  ]);
});

test("sales price carryover source statuses exclude in-progress and holiday drafts", () => {
  assert.deepEqual([...SALES_PRICE_CARRYOVER_LEDGER_STATUSES], [
    "IN_REVIEW",
    "HEADQUARTERS_CLOSED",
  ]);
  assert.equal(isSalesPriceCarryoverLedgerStatus("IN_REVIEW"), true);
  assert.equal(isSalesPriceCarryoverLedgerStatus("HEADQUARTERS_CLOSED"), true);
  assert.equal(isSalesPriceCarryoverLedgerStatus("IN_PROGRESS"), false);
  assert.equal(isSalesPriceCarryoverLedgerStatus("HOLIDAY"), false);
});

test("carryover source date skips in-progress and holiday and allows month boundary", () => {
  const current = new Date("2026-07-01T00:00:00.000Z");
  const selected = selectSalesPriceCarryoverSourceDate(current, [
    { closingDate: new Date("2026-06-30T00:00:00.000Z"), status: "IN_PROGRESS" },
    { closingDate: new Date("2026-06-29T00:00:00.000Z"), status: "HOLIDAY" },
    {
      closingDate: new Date("2026-06-28T00:00:00.000Z"),
      status: "IN_REVIEW",
    },
    {
      closingDate: new Date("2026-05-31T00:00:00.000Z"),
      status: "HEADQUARTERS_CLOSED",
    },
    {
      closingDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "IN_REVIEW",
    },
  ]);

  assert.deepEqual(selected, new Date("2026-06-28T00:00:00.000Z"));
  assert.equal(
    selectSalesPriceCarryoverSourceDate(current, [
      {
        closingDate: new Date("2026-06-30T00:00:00.000Z"),
        status: "IN_PROGRESS",
      },
      {
        closingDate: new Date("2026-06-29T00:00:00.000Z"),
        status: "HOLIDAY",
      },
    ]),
    null,
  );
});

test("inventory conflict sale price labels distinguish current and carryover sources", () => {
  assert.equal(
    formatInventoryConflictSalePrice({
      plannedUnitPrice: 2_500,
      plannedUnitPriceSource: "CURRENT",
    }),
    "2500(당일)",
  );
  assert.equal(
    formatInventoryConflictSalePrice({
      plannedUnitPrice: 2_000,
      plannedUnitPriceSource: "CARRYOVER",
    }),
    "2000(이월)",
  );
  assert.equal(
    formatInventoryConflictSalePrice({
      plannedUnitPrice: null,
      plannedUnitPriceSource: null,
    }),
    "-",
  );
});

test("stale inventory conflict serverValues keep current and carryover sale-price sources", async () => {
  const serverValues = buildInventoryConflictServerValues([
    {
      productName: "당일품목",
      currentQuantity: 3,
      quantity: 3,
      plannedUnitPrice: 2_500,
      plannedUnitPriceSource: "CURRENT",
    },
    {
      productName: "이월품목",
      currentQuantity: 1,
      quantity: 1,
      plannedUnitPrice: 2_000,
      plannedUnitPriceSource: "CARRYOVER",
    },
  ]);

  assert.equal(
    serverValues["당일품목"],
    "당일재고 3 / 표시재고 3 / 판매한 가격 2500(당일)",
  );
  assert.equal(
    serverValues["이월품목"],
    "당일재고 1 / 표시재고 1 / 판매한 가격 2000(이월)",
  );

  const actionSource = await readFile(
    path.join(root, "src", "features", "inventory", "actions.ts"),
    "utf8",
  );
  const conflictHelperStart = actionSource.indexOf(
    "function toInventoryConflictValues(",
  );
  const conflictHelperEnd = actionSource.indexOf(
    "function toInventoryClientValues(",
    conflictHelperStart,
  );
  assert.notEqual(conflictHelperStart, -1);
  assert.notEqual(conflictHelperEnd, -1);
  assert.match(
    actionSource.slice(conflictHelperStart, conflictHelperEnd),
    /return buildInventoryConflictServerValues\(data\.items\)/,
  );
  assert.match(
    actionSource,
    /serverValues:\s*snapshot\.data \? toInventoryConflictValues\(snapshot\.data\) : \{\}/,
  );
});

test("inventory and loss availability share previous-quantity source selection policy", () => {
  assert.equal(
    resolveInventoryPreviousQuantitySource({
      closingYearMonth: "2026-07",
      priorLedgerClosingYearMonth: "2026-07",
      hasOpeningSnapshots: true,
    }),
    "SAME_MONTH_PRIOR_LEDGER",
  );
  assert.equal(
    resolveInventoryPreviousQuantitySource({
      closingYearMonth: "2026-07",
      priorLedgerClosingYearMonth: "2026-06",
      hasOpeningSnapshots: true,
    }),
    "OPENING_SNAPSHOT",
  );
  assert.equal(
    resolveInventoryPreviousQuantitySource({
      closingYearMonth: "2026-07",
      priorLedgerClosingYearMonth: "2026-06",
      hasOpeningSnapshots: false,
    }),
    "CROSS_MONTH_PRIOR_LEDGER",
  );
  assert.equal(
    resolveInventoryPreviousQuantitySource({
      closingYearMonth: "2026-07",
      priorLedgerClosingYearMonth: null,
      hasOpeningSnapshots: false,
    }),
    "NONE",
  );
});

test("inventory completion gate ignores carryover-only prices and requires current-date plans", () => {
  const incomplete = getInventoryPlanGate({
    targetProductIds: ["product-a", "product-b"],
    persistedInventoryProductIds: ["product-a", "product-b"],
    plannedProductIds: ["product-a"],
  });
  const complete = getInventoryPlanGate({
    targetProductIds: ["product-a", "product-b"],
    persistedInventoryProductIds: ["product-a", "product-b"],
    plannedProductIds: ["product-a", "product-b"],
  });
  const newProductBlank = getInventoryPlanGate({
    targetProductIds: ["new-product"],
    persistedInventoryProductIds: ["new-product"],
    plannedProductIds: [],
  });

  assert.equal(incomplete.complete, false);
  assert.deepEqual(incomplete.missingPlanProductIds, ["product-b"]);
  assert.equal(complete.complete, true);
  assert.equal(newProductBlank.complete, false);
  assert.deepEqual(newProductBlank.missingPlanProductIds, ["new-product"]);
});

test("carryover lookup stays outside attachPurchasePrices and only store-manager shaping applies it", async () => {
  const querySource = await readFile(
    path.join(root, "src", "features", "inventory", "queries.ts"),
    "utf8",
  );
  const shapingSource = await readFile(
    path.join(root, "src", "features", "inventory", "response-shaping.ts"),
    "utf8",
  );
  const actionSource = await readFile(
    path.join(root, "src", "features", "inventory", "actions.ts"),
    "utf8",
  );
  const attachStart = querySource.indexOf(
    "async function attachPurchasePrices(",
  );
  const attachEnd = querySource.indexOf(
    "async function loadSalesPriceCarryoverByProductId(",
    attachStart,
  );
  const attachBody = querySource.slice(attachStart, attachEnd);

  assert.notEqual(attachStart, -1);
  assert.notEqual(attachEnd, -1);
  assert.doesNotMatch(attachBody, /priorSubmittedLedger|fallbackSalesPlans/);
  assert.match(
    attachBody,
    /businessDate:\s*ledger\.closingDate/,
  );
  assert.match(
    querySource,
    /status:\s*\{\s*in:\s*\[\.\.\.SALES_PRICE_CARRYOVER_LEDGER_STATUSES\]\s*\}/,
  );
  assert.match(
    querySource,
    /closingDate:\s*\{\s*lt:\s*ledger\.closingDate\s*\}/,
  );
  assert.match(
    querySource,
    /toStoreManagerInventoryStepDataInTx\(tx,\s*data\)/,
  );
  assert.match(
    querySource,
    /export async function toStoreManagerInventoryStepDataInTx/,
  );
  const hqLookupStart = querySource.indexOf(
    "export async function getInventoryStepDataByLedgerId(\n",
  );
  const hqLookupEnd = querySource.indexOf(
    "export async function toStoreManagerInventoryStepDataInTx(",
    hqLookupStart,
  );
  assert.notEqual(hqLookupStart, -1);
  assert.notEqual(hqLookupEnd, -1);
  const hqLookupBody = querySource.slice(hqLookupStart, hqLookupEnd);
  assert.match(
    hqLookupBody,
    /getInventoryStepDataByLedgerIdInTx\(tx,\s*ledgerId\)/,
  );
  assert.doesNotMatch(
    hqLookupBody,
    /toStoreManagerInventoryStepDataInTx|carryoverByProductId|loadSalesPriceCarryoverByProductId/,
  );
  assert.match(shapingSource, /applySalesPriceCarryoverFallback/);
  assert.match(actionSource, /buildInventoryConflictServerValues/);
  assert.match(querySource, /resolveInventoryPreviousQuantitySource/);
  assert.match(
    querySource,
    /loadLossAvailabilityPreviousQuantitiesInTx[\s\S]*resolveInventoryPreviousQuantitySource/,
  );
  assert.match(
    querySource,
    /async function getCarryoverBases\([\s\S]*resolveInventoryPreviousQuantitySource/,
  );
});

test("loss availability helper uses ledger id and quantity-only projections", async () => {
  const querySource = await readFile(
    path.join(root, "src", "features", "inventory", "queries.ts"),
    "utf8",
  );
  const helperStart = querySource.indexOf(
    "export async function getLossInventoryAvailabilityLinesInTx(",
  );
  const helperEnd = querySource.indexOf(
    "function aggregateQuantityByProductId(",
    helperStart,
  );
  assert.notEqual(helperStart, -1);
  assert.notEqual(helperEnd, -1);
  const helperBody = querySource.slice(helperStart, helperEnd);

  assert.match(helperBody, /ledger:\s*\{/);
  assert.doesNotMatch(helperBody, /getStoreLedgerInTx/);
  assert.doesNotMatch(helperBody, /inventoryItemSelect/);
  assert.match(
    helperBody,
    /select:\s*\{\s*productId:\s*true,\s*quantity:\s*true\s*\}/,
  );
  assert.match(
    helperBody,
    /previousQuantity:\s*true,\s*purchasedQuantity:\s*true/,
  );
  assert.doesNotMatch(helperBody, /productName:\s*true/);
  assert.doesNotMatch(helperBody, /unitPrice:\s*true/);
  assert.doesNotMatch(helperBody, /carryoverDetail/);
});

test("inventory completion still requires current-date persisted plans", async () => {
  const gateSource = await readFile(
    path.join(root, "src", "features", "ledger", "inventory-plan-gate.ts"),
    "utf8",
  );

  assert.match(
    gateSource,
    /storeSalesPricePlan\.findMany\(\{\s*where:\s*\{\s*storeId:\s*ledger\.storeId,\s*businessDate:\s*ledger\.closingDate\s*\}/,
  );
});
