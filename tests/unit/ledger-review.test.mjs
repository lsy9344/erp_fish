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

function ok(value) {
  return { value, status: "ok" };
}

function unavailable(status, label, unavailableReason, reason) {
  return {
    value: null,
    status,
    label,
    unavailableReason,
    ...(reason ? { reason } : {}),
  };
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

  assert.deepEqual(summary.totalSales, ok(100_000));
  assert.deepEqual(summary.paymentTotal, ok(98_000));
  assert.deepEqual(summary.expenseTotal, ok(12_000));
  assert.deepEqual(summary.workerCount, ok(4));
  assert.deepEqual(summary.costOfGoodsSold, ok(9_000));
  assert.deepEqual(summary.grossProfit, ok(91_000));
  assert.deepEqual(summary.grossMarginRate, ok(0.91));
  assert.deepEqual(summary.operatingProfit, ok(79_000));
  assert.deepEqual(summary.productivity, ok(25_000));
  assert.deepEqual(summary.inventoryAmount, ok(16_000));
  assert.deepEqual(summary.paymentDifference, ok(2_000));
  assert.deepEqual(summary.salesDifference, ok(91_000));
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

  assert.deepEqual(
    summary.salesDifference,
    unavailable(
      "policy-unconfirmed",
      "확인 필요",
      "계산 기준 확인 필요",
      "매출차액 계산에는 재고조정과 손실 입력 컨텍스트가 필요합니다.",
    ),
  );
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

  assert.deepEqual(summary.costOfGoodsSold, ok(50_000));
  assert.deepEqual(summary.salesDifference, ok(65_000));
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

  assert.equal(summary.grossMarginRate.status, "data-insufficient");
  assert.equal(summary.productivity.status, "data-insufficient");
  assert.equal(summary.costOfGoodsSold.status, "data-insufficient");
  assert.equal(summary.inventoryAmount.status, "data-insufficient");
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

  assert.equal(noInventorySummary.costOfGoodsSold.status, "data-insufficient");
  assert.equal(noInventorySummary.inventoryAmount.status, "data-insufficient");

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

  assert.deepEqual(adjustedSummary.costOfGoodsSold, ok(7_000));
  assert.deepEqual(adjustedSummary.inventoryAmount, ok(8_000));
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
  assert.match(pageSource, /getStoreManagerLedgerReviewStepData\(/);
  assert.doesNotMatch(pageSource, /app\/api\/ledger\/review/);

  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-queries.ts",
  );
  const responseShapeSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "response-shaping.ts",
  );
  const validationSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-validation.ts",
  );

  assert.match(querySource, /getStoreLedgerInTx\(/);
  assert.match(querySource, /getKstBusinessDateParam/);
  assert.match(querySource, /getLedgerReviewMissingItems/);
  assert.match(
    validationSource,
    /export\s+function\s+getLedgerReviewMissingItems/,
  );
  assert.match(querySource, /getInventoryStepDataInTx\(/);
  assert.match(querySource, /getLossStepDataInTx\(/);
  assert.match(querySource, /calculateLedgerReviewSummary\(/);
  assert.match(querySource, /ledgerInventoryItem\.findMany\(/);
  assert.match(querySource, /getWarnings\(summary\.paymentDifference\)/);
  assert.match(querySource, /payment-difference-unavailable/);
  assert.doesNotMatch(querySource, /paymentDifference\.value\s*\?\?\s*0/);
  assert.doesNotMatch(querySource, /requireStoreAccess\(/);
  assert.doesNotMatch(
    querySource,
    /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/,
  );
});

test("ledger review missing item helper preserves KST links and separates review-only losses", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "review-validation.ts",
  );
  const { getLedgerReviewMissingItems } = await import(
    pathToFileURL(queryPath).href
  );

  const missingItems = getLedgerReviewMissingItems({
    storeId: "store-1",
    closingDate: "2026-06-11T00:00:00.000Z",
    totalSalesAmount: 0,
    paymentTotal: 0,
    expenseCount: 0,
    purchaseCount: 0,
    hasInventoryUnavailable: true,
    inventoryCount: 1,
    lossCount: 0,
    workerCount: 0,
  });

  assert.deepEqual(
    missingItems.map((item) => [item.id, item.status]),
    [
      ["sales", "missing"],
      ["expenses", "missing"],
      ["purchases", "missing"],
      ["inventory", "missing"],
      ["losses", "review"],
      ["work", "missing"],
    ],
  );
  assert.match(missingItems[0].href, /storeId=store-1/);
  assert.match(missingItems[0].href, /date=2026-06-11/);
  assert.match(missingItems[0].href, /step=sales/);
  assert.equal(
    missingItems.find((item) => item.id === "losses")?.detail,
    "손실 항목 없음으로 검토할 수 있습니다.",
  );
  assert.equal(
    missingItems.find((item) => item.id === "work")?.detail,
    "근무인원은 1명 이상이어야 제출할 수 있습니다.",
  );
});

test("ledger review step summary contract preserves shape, KST links, signed difference, and calculation states", () => {
  const typeSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-types.ts",
  );
  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-queries.ts",
  );
  const validationSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-validation.ts",
  );

  assert.match(typeSource, /LedgerReviewStepId[\s\S]*"sales"/);
  assert.match(typeSource, /LedgerReviewStepId[\s\S]*"work"/);
  assert.match(typeSource, /LedgerReviewStepMetric/);
  assert.match(typeSource, /kind:\s*"krw"\s*\|\s*"signed-krw"/);
  assert.match(typeSource, /stepSummaries:\s*LedgerReviewStepSummary\[\]/);
  assert.match(validationSource, /getLedgerReviewStepHref/);
  assert.match(validationSource, /getKstLedgerDateParam\(closingDate\)/);
  assert.match(querySource, /buildLedgerReviewStepSummaries/);
  assert.match(querySource, /"paymentDifference"/);
  assert.match(querySource, /"결제수단 합계와 총매출 차이"/);
  assert.match(querySource, /"signed-krw"/);
  assert.match(querySource, /"reviewStatus"/);
  assert.match(querySource, /"데이터 부족"/);
  assert.match(querySource, /"기준 확인 필요"/);
  assert.doesNotMatch(querySource, /paymentDifference\.value\s*\?\?\s*0/);
});

test("store manager ledger review response omits sensitive accounting metrics", async () => {
  const typeSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-types.ts",
  );
  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-queries.ts",
  );
  const responseShapeSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "response-shaping.ts",
  );
  const clientSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "review-summary-client.tsx",
  );

  assert.match(typeSource, /StoreManagerLedgerReviewSummary/);
  assert.match(typeSource, /StoreManagerLedgerReviewStepData/);
  assert.match(querySource, /toStoreManagerLedgerReviewStepData/);
  assert.match(querySource, /getStoreManagerLedgerReviewStepData/);
  assert.match(querySource, /buildLedgerReviewStepSummaries/);
  assert.match(responseShapeSource, /totalSales:\s*data\.summary\.totalSales/);
  assert.match(
    responseShapeSource,
    /paymentDifference:\s*data\.summary\.paymentDifference/,
  );
  assert.doesNotMatch(
    responseShapeSource,
    /grossMarginRate:\s*data\.summary\.grossMarginRate/,
  );
  assert.doesNotMatch(
    responseShapeSource,
    /inventoryAmount:\s*data\.summary\.inventoryAmount/,
  );

  assert.doesNotMatch(clientSource, /summary\.costOfGoodsSold/);
  assert.doesNotMatch(clientSource, /summary\.grossProfit/);
  assert.doesNotMatch(clientSource, /summary\.operatingProfit/);
  assert.doesNotMatch(clientSource, /summary\.productivity/);
  assert.doesNotMatch(clientSource, /summary\.salesDifference/);
  assert.match(clientSource, /stepSummaries/);
  assert.match(clientSource, /formatSignedKrw/);
  assert.match(querySource, /결제수단 합계와 총매출 차이/);
  assert.doesNotMatch(clientSource, /임계값 초과|확정 이상/);
  assert.doesNotMatch(clientSource, /label="매출원가"/);
  assert.doesNotMatch(clientSource, /label="매출이익"/);
  assert.doesNotMatch(clientSource, /label="영업이익"/);
  assert.doesNotMatch(clientSource, /label="인당생산성"/);
  assert.doesNotMatch(clientSource, /label="매출차액"/);

  const queryPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "response-shaping.ts",
  );
  const { toStoreManagerLedgerReviewStepData } = await import(
    pathToFileURL(queryPath).href
  );
  const safeReview = toStoreManagerLedgerReviewStepData({
    id: "ledger-1",
    storeId: "store-1",
    closingDate: "2026-06-10T00:00:00.000Z",
    status: "IN_PROGRESS",
    submittedById: null,
    submittedAt: null,
    updatedAt: "2026-06-10T00:00:00.000Z",
    version: 1,
    authorDisplayName: "작성자",
    summary: {
      totalSales: ok(100_000),
      costOfGoodsSold: ok(30_000),
      grossProfit: ok(70_000),
      grossMarginRate: ok(0.7),
      operatingProfit: ok(60_000),
      productivity: ok(30_000),
      inventoryAmount: ok(8_000),
      salesDifference: ok(2_000),
      paymentDifference: ok(0),
    },
    missingItems: [],
    warnings: [],
    signals: [],
    stepSummaries: [
      {
        id: "sales",
        label: "매출/결제",
        status: "saved",
        detail: "총매출과 결제수단 합계를 확인했습니다.",
        href: "/app/store-entry?storeId=store-1&date=2026-06-10&step=sales",
        metrics: [
          {
            id: "paymentDifference",
            label: "결제수단 합계와 총매출 차이",
            value: 0,
            kind: "signed-krw",
            status: "ok",
          },
        ],
      },
    ],
  });

  assert.deepEqual(Object.keys(safeReview.summary), [
    "totalSales",
    "paymentDifference",
  ]);
  assert.equal(Object.hasOwn(safeReview.summary, "costOfGoodsSold"), false);
  assert.equal(Object.hasOwn(safeReview.summary, "grossProfit"), false);
  assert.equal(Object.hasOwn(safeReview.summary, "grossMarginRate"), false);
  assert.equal(Object.hasOwn(safeReview.summary, "operatingProfit"), false);
  assert.equal(Object.hasOwn(safeReview.summary, "productivity"), false);
  assert.equal(Object.hasOwn(safeReview.summary, "inventoryAmount"), false);
  assert.equal(Object.hasOwn(safeReview.summary, "salesDifference"), false);
  assert.equal(safeReview.stepSummaries[0]?.metrics[0]?.kind, "signed-krw");
});

test("headquarters ledger detail keeps review summary read access separate from action permissions", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );

  assert.match(pageSource, /requireReportAccess\(\)/);
  assert.match(
    pageSource,
    /hasActionPermission\(user\.id,\s*PermissionAction\.LEDGER_EDIT\)/,
  );
  assert.match(
    pageSource,
    /hasActionPermission\(user\.id,\s*PermissionAction\.LEDGER_HQ_CLOSE\)/,
  );
  assert.match(
    pageSource,
    /hasActionPermission\(user\.id,\s*PermissionAction\.CORRECTION_CREATE\)/,
  );
  assert.match(pageSource, /검토 상태 요약/);
  assert.match(pageSource, /조회 전용/);
  assert.match(pageSource, /formatHqCloseCorrectionActionStatus/);
  assert.doesNotMatch(pageSource, /requireStoreAccess\(/);
});
