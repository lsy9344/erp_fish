import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

function readProjectFile(...segments) {
  return readFileSync(assertProjectFile(...segments), "utf8");
}

test("ledger review summary helper calculates PRD metrics and unavailable states", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );

  const summary = calculateLedgerReviewSummary({
    totalSalesAmount: 100_000,
    cashAmount: 40_000,
    cardAmount: 50_000,
    otherPaymentAmount: 8_000,
    workerCount: 4,
    expenseTotal: 12_000,
    inventoryItems: [
      {
        previousQuantity: 10,
        purchasedQuantity: 5,
        currentQuantity: 8,
        quantity: 8,
        unitPrice: 1_000,
        inventoryAmount: 8_000,
      },
      {
        previousQuantity: 3,
        purchasedQuantity: 2,
        currentQuantity: null,
        quantity: 4,
        unitPrice: 2_000,
        inventoryAmount: 8_000,
      },
    ],
    inventoryAdjustments: [],
    lossItems: [],
  });

  assert.deepEqual(summary.totalSales, { value: 100_000 });
  assert.deepEqual(summary.costOfGoodsSold, { value: 9_000 });
  assert.deepEqual(summary.grossProfit, { value: 91_000 });
  assert.deepEqual(summary.grossMarginRate, { value: 0.91 });
  assert.deepEqual(summary.operatingProfit, { value: 79_000 });
  assert.deepEqual(summary.productivity, { value: 25_000 });
  assert.deepEqual(summary.inventoryAmount, { value: 16_000 });
  assert.deepEqual(summary.paymentDifference, { value: 2_000 });
  assert.deepEqual(summary.salesDifference, { value: 91_000 });
});

test("ledger review summary helper does not calculate sales difference without adjustment and loss context", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );

  const summary = calculateLedgerReviewSummary({
    totalSalesAmount: 100_000,
    cashAmount: 100_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 2,
    expenseTotal: 0,
    inventoryItems: [
      {
        previousQuantity: 10,
        purchasedQuantity: 5,
        currentQuantity: 8,
        quantity: 8,
        unitPrice: 1_000,
        inventoryAmount: 8_000,
      },
    ],
  });

  assert.deepEqual(summary.salesDifference, {
    value: null,
    unavailableReason: "계산 기준 확인 필요",
  });
});

test("ledger review summary helper calculates sales difference with loss and inventory adjustment amounts", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );

  const summary = calculateLedgerReviewSummary({
    totalSalesAmount: 100_000,
    cashAmount: 100_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 2,
    expenseTotal: 0,
    inventoryItems: [
      {
        previousQuantity: 20,
        purchasedQuantity: 0,
        currentQuantity: 10,
        quantity: 10,
        unitPrice: 5_000,
        inventoryAmount: 50_000,
      },
    ],
    inventoryAdjustments: [
      {
        differenceAmount: -10_000,
      },
    ],
    lossItems: [
      {
        amount: 5_000,
      },
    ],
  });

  assert.deepEqual(summary.costOfGoodsSold, { value: 50_000 });
  assert.deepEqual(summary.salesDifference, { value: 65_000 });
});

test("ledger review summary helper does not expose divide by zero or hidden inventory calculations", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );

  const summary = calculateLedgerReviewSummary({
    totalSalesAmount: 0,
    cashAmount: 0,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 0,
    expenseTotal: 1_000,
    inventoryItems: [
      {
        previousQuantity: 1,
        purchasedQuantity: 1,
        currentQuantity: null,
        quantity: null,
        unitPrice: 1_000,
        inventoryAmount: null,
      },
    ],
  });

  assert.deepEqual(summary.grossMarginRate, {
    value: null,
    unavailableReason: "계산 불가",
  });
  assert.deepEqual(summary.productivity, {
    value: null,
    unavailableReason: "계산 불가",
  });
  assert.deepEqual(summary.costOfGoodsSold, {
    value: null,
    unavailableReason: "계산 불가",
  });
  assert.deepEqual(summary.inventoryAmount, {
    value: null,
    unavailableReason: "계산 불가",
  });
  assert.equal(Number.isFinite(summary.grossMarginRate.value), false);
  assert.equal(Number.isFinite(summary.productivity.value), false);
});

test("ledger review summary helper requires saved inventory and uses one quantity basis", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );

  const noInventorySummary = calculateLedgerReviewSummary({
    totalSalesAmount: 100_000,
    cashAmount: 100_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 2,
    expenseTotal: 0,
    inventoryItems: [],
  });

  assert.deepEqual(noInventorySummary.costOfGoodsSold, {
    value: null,
    unavailableReason: "계산 불가",
  });
  assert.deepEqual(noInventorySummary.inventoryAmount, {
    value: null,
    unavailableReason: "계산 불가",
  });

  const adjustedSummary = calculateLedgerReviewSummary({
    totalSalesAmount: 100_000,
    cashAmount: 100_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 2,
    expenseTotal: 0,
    inventoryItems: [
      {
        previousQuantity: 10,
        purchasedQuantity: 5,
        currentQuantity: 8,
        quantity: 10,
        unitPrice: 1_000,
        inventoryAmount: 10_000,
      },
    ],
    inventoryAdjustments: [],
    lossItems: [],
  });

  assert.deepEqual(adjustedSummary.costOfGoodsSold, { value: 7_000 });
  assert.deepEqual(adjustedSummary.inventoryAmount, { value: 8_000 });
});

test("ledger review route/query contracts use existing server flows", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "page.tsx",
  );

  assert.match(pageSource, /type\s+StoreEntryStep\s*=[^;]*"review"/s);
  assert.match(pageSource, /step\s*===\s*"review"/);
  assert.match(pageSource, /getLedgerReviewStepData\(/);
  assert.doesNotMatch(pageSource, /app\/api\/ledger\/review/);

  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-queries.ts",
  );

  assert.match(querySource, /getTodayStoreLedgerInTx\(/);
  assert.match(querySource, /getInventoryStepDataInTx\(/);
  assert.match(querySource, /getLossStepDataInTx\(/);
  assert.match(querySource, /calculateLedgerReviewSummary\(/);
  assert.match(querySource, /ledgerInventoryItem\.findMany\(/);
  assert.doesNotMatch(querySource, /requireStoreAccess\(/);
  assert.doesNotMatch(
    querySource,
    /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/,
  );
});
