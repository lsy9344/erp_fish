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
    path.join(root, "src", "features", "inventory", "sales-price-carryover.ts"),
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

const { isHiddenZeroStockInventoryItem } = await import(
  pathToFileURL(
    path.join(
      root,
      "src",
      "features",
      "inventory",
      "inventory-zero-stock-display.ts",
    ),
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

// 2026-07-27 정책 변경: 제출 안 된 날의 가격도 이월한다. HOLIDAY만 제외.
test("sales price carryover source statuses accept unsubmitted drafts and exclude holidays", () => {
  assert.deepEqual(
    [...SALES_PRICE_CARRYOVER_LEDGER_STATUSES],
    ["IN_PROGRESS", "IN_REVIEW", "HEADQUARTERS_CLOSED"],
  );
  assert.equal(isSalesPriceCarryoverLedgerStatus("IN_PROGRESS"), true);
  assert.equal(isSalesPriceCarryoverLedgerStatus("IN_REVIEW"), true);
  assert.equal(isSalesPriceCarryoverLedgerStatus("HEADQUARTERS_CLOSED"), true);
  assert.equal(isSalesPriceCarryoverLedgerStatus("HOLIDAY"), false);
});

test("carryover source date takes the latest non-holiday day and allows month boundary", () => {
  const current = new Date("2026-07-01T00:00:00.000Z");
  const selected = selectSalesPriceCarryoverSourceDate(current, [
    {
      closingDate: new Date("2026-06-30T00:00:00.000Z"),
      status: "IN_PROGRESS",
    },
    { closingDate: new Date("2026-06-29T00:00:00.000Z"), status: "HOLIDAY" },
    {
      closingDate: new Date("2026-06-28T00:00:00.000Z"),
      status: "IN_REVIEW",
    },
    {
      closingDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "IN_REVIEW",
    },
  ]);

  // 제출 전 06-30이 원천이 된다(예전에는 06-28로 건너뛰어 06-30 입력분이 증발했다).
  assert.deepEqual(selected, new Date("2026-06-30T00:00:00.000Z"));

  // 휴무일은 건너뛰고 그 아래 영업일을 쓴다. 전월 장부도 허용한다.
  assert.deepEqual(
    selectSalesPriceCarryoverSourceDate(current, [
      { closingDate: new Date("2026-06-30T00:00:00.000Z"), status: "HOLIDAY" },
      {
        closingDate: new Date("2026-05-31T00:00:00.000Z"),
        status: "HEADQUARTERS_CLOSED",
      },
    ]),
    new Date("2026-05-31T00:00:00.000Z"),
  );

  assert.equal(
    selectSalesPriceCarryoverSourceDate(current, [
      { closingDate: new Date("2026-06-30T00:00:00.000Z"), status: "HOLIDAY" },
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

// 2026-07-25 "hide exact zero-stock rows" 이후 회귀: 폼이 숨긴 0재고 행은 판매한 가격을
// 넣을 화면이 없는데 게이트가 계획을 요구해 3단계가 영원히 미완료로 남았고,
// /app/store-entry?step=cost 진입이 재고 화면으로 계속 되돌아갔다.
test("inventory completion gate exempts form-hidden zero-stock rows from the plan requirement", () => {
  const hidden = { previousQuantity: 0, purchasedQuantity: 0, lossQuantity: 0 };
  assert.equal(
    isHiddenZeroStockInventoryItem({ ...hidden, currentQuantity: 0 }),
    true,
  );
  assert.equal(
    isHiddenZeroStockInventoryItem({ ...hidden, currentQuantity: null }),
    false,
  );

  const gate = getInventoryPlanGate({
    targetProductIds: ["visible", "hidden-zero"],
    persistedInventoryProductIds: ["visible", "hidden-zero"],
    plannedProductIds: ["visible"],
    planExemptProductIds: ["hidden-zero"],
  });

  assert.deepEqual(gate.missingPlanProductIds, []);
  assert.equal(gate.complete, true);

  // 면제는 판매한 가격에만 적용된다. 재고 행 자체가 없으면 여전히 미완료다.
  assert.equal(
    getInventoryPlanGate({
      targetProductIds: ["visible", "hidden-zero"],
      persistedInventoryProductIds: ["visible"],
      plannedProductIds: ["visible"],
      planExemptProductIds: ["hidden-zero"],
    }).complete,
    false,
  );
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
  assert.match(attachBody, /businessDate:\s*ledger\.closingDate/);
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
    /toStoreManagerInventoryStepDataInTx\(\s*tx,\s*applyInventoryFormDisplayPolicy\(data\),\s*\)/,
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
  assert.match(hqLookupBody, /applyInventoryFormDisplayPolicy\(data\)/);
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
