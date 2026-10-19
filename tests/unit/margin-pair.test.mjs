import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function moduleUrl(relativePath) {
  return pathToFileURL(path.join(root, relativePath)).href;
}

function money(value) {
  return { value, status: "ok" };
}

function missing(reason) {
  return { value: null, status: "data-insufficient", reason };
}

// 삼국유통 2026-10-05 화면 예. 실제 27.7% / 예상 19.4%.
// 영업 매출 4,315,000, 예상 매출 3,871,353, 매출원가 3,119,145.
const SAMGUK = {
  operatingSales: 4_315_000,
  expectedSales: 3_871_353,
  costOfGoodsSold: 3_119_145,
};

test("margin pair uses one COGS and emits the sales difference", async () => {
  const { buildMarginPairBasis } = await import(
    moduleUrl("src/server/calculations/margin-pair.ts")
  );
  const pair = buildMarginPairBasis({
    operatingSales: money(SAMGUK.operatingSales),
    expectedSales: money(SAMGUK.expectedSales),
    costOfGoodsSold: money(SAMGUK.costOfGoodsSold),
  });

  assert.equal(pair.operatingSales.value, SAMGUK.operatingSales);
  assert.equal(pair.expectedSales.value, SAMGUK.expectedSales);
  assert.equal(pair.costOfGoodsSold.value, SAMGUK.costOfGoodsSold);
  assert.equal(
    pair.plannedVsActualSalesDifference.value,
    SAMGUK.operatingSales - SAMGUK.expectedSales,
  );
  assert.equal(
    pair.actualMarginRate.value,
    (SAMGUK.operatingSales - SAMGUK.costOfGoodsSold) / SAMGUK.operatingSales,
  );
  assert.equal(
    pair.expectedMarginRate.value,
    (SAMGUK.expectedSales - SAMGUK.costOfGoodsSold) / SAMGUK.expectedSales,
  );
  assert.equal((pair.actualMarginRate.value * 100).toFixed(1), "27.7");
  assert.equal((pair.expectedMarginRate.value * 100).toFixed(1), "19.4");
});

test("period margin pair sums inputs once and does not average daily rates", async () => {
  const { aggregateMarginPairBasis, buildMarginPairBasis } = await import(
    moduleUrl("src/server/calculations/margin-pair.ts")
  );
  const dayOne = buildMarginPairBasis({
    operatingSales: money(10_000),
    expectedSales: money(9_000),
    costOfGoodsSold: money(8_000),
  });
  const dayTwo = buildMarginPairBasis({
    operatingSales: money(5_000),
    expectedSales: money(4_000),
    costOfGoodsSold: money(2_000),
  });
  const period = aggregateMarginPairBasis([dayOne, dayTwo]);
  const averagedActual =
    (dayOne.actualMarginRate.value + dayTwo.actualMarginRate.value) / 2;

  assert.equal(period.operatingSales.value, 15_000);
  assert.equal(period.expectedSales.value, 13_000);
  assert.equal(period.costOfGoodsSold.value, 10_000);
  assert.equal(period.plannedVsActualSalesDifference.value, 2_000);
  assert.equal(period.actualMarginRate.value, 5_000 / 15_000);
  assert.equal(period.expectedMarginRate.value, 3_000 / 13_000);
  assert.notEqual(period.actualMarginRate.value, averagedActual);
});

test("missing expected sales blocks the expected rate and the difference only", async () => {
  const { buildMarginPairBasis } = await import(
    moduleUrl("src/server/calculations/margin-pair.ts")
  );
  const pair = buildMarginPairBasis({
    operatingSales: money(10_000),
    expectedSales: missing(
      "판매한 가격이 입력되지 않아 계획 대비 비교를 계산할 수 없습니다.",
    ),
    costOfGoodsSold: money(8_000),
  });

  assert.equal(pair.actualMarginRate.value, 0.2);
  assert.equal(pair.expectedMarginRate.value, null);
  assert.match(pair.expectedMarginRate.reason, /판매한 가격/);
  assert.equal(pair.plannedVsActualSalesDifference.value, null);
  assert.equal(pair.expectedMarginRate.label, "데이터 부족");
});

test("zero expected sales does not divide", async () => {
  const { buildMarginPairBasis } = await import(
    moduleUrl("src/server/calculations/margin-pair.ts")
  );
  const pair = buildMarginPairBasis({
    operatingSales: money(10_000),
    expectedSales: money(0),
    costOfGoodsSold: money(8_000),
  });

  assert.equal(pair.expectedMarginRate.value, null);
  assert.equal(pair.plannedVsActualSalesDifference.value, 10_000);
  assert.match(
    pair.expectedMarginRate.reason,
    /계획 매출 또는 매출이익이 부족해/,
  );
  assert.doesNotMatch(pair.expectedMarginRate.reason, /판매한 가격이 입력되지/);
  assert.equal(pair.actualMarginRate.value, 0.2);
});

test("policy-unconfirmed cost stays unconfirmed on both rates", async () => {
  const { buildMarginPairBasis } = await import(
    moduleUrl("src/server/calculations/margin-pair.ts")
  );
  const pair = buildMarginPairBasis({
    operatingSales: money(10_000),
    expectedSales: money(9_000),
    costOfGoodsSold: {
      value: 8_000,
      status: "policy-unconfirmed",
      label: "확인 필요",
      unavailableReason: "계산 기준 확인 필요",
      reason: "FIFO 원천 lot 근거가 부족해 계산 기준 확인이 필요합니다.",
    },
  });

  assert.equal(pair.actualMarginRate.status, "policy-unconfirmed");
  assert.equal(pair.expectedMarginRate.status, "policy-unconfirmed");
  assert.equal(pair.actualMarginRate.value, 0.2);
  assert.equal(pair.expectedMarginRate.value, 1_000 / 9_000);
  assert.match(pair.expectedMarginRate.reason, /FIFO/);
  assert.equal(pair.plannedVsActualSalesDifference.status, "ok");
});

test("ledger review summary and the margin pair use the same inputs", async () => {
  const { calculateLedgerReviewSummary } = await import(
    moduleUrl("src/server/calculations/ledger.ts")
  );
  const { buildMarginPairBasis } = await import(
    moduleUrl("src/server/calculations/margin-pair.ts")
  );
  const summary = calculateLedgerReviewSummary({
    totalSalesAmount: 100_000,
    cashAmount: 100_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 4,
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
      {
        previousQuantity: 3,
        purchasedQuantity: 2,
        currentQuantity: 4,
        quantity: 4,
        unitPrice: 2_000,
        inventoryAmount: 8_000,
      },
    ],
    inventoryAdjustments: [],
    lossItems: [],
    plannedSalesItems: [
      {
        previousQuantity: 10,
        purchasedQuantity: 5,
        currentQuantity: 8,
        quantity: 8,
        plannedUnitPrice: 1_500,
      },
      {
        previousQuantity: 3,
        purchasedQuantity: 2,
        currentQuantity: 4,
        quantity: 4,
        plannedUnitPrice: 3_000,
      },
    ],
  });
  const pair = buildMarginPairBasis({
    operatingSales: summary.operatingSales,
    expectedSales: summary.plannedSalesTotal,
    costOfGoodsSold: summary.costOfGoodsSold,
  });

  assert.equal(pair.actualMarginRate.value, summary.grossMarginRate.value);
  assert.equal(
    pair.expectedMarginRate.value,
    summary.plannedGrossMarginRate.value,
  );
  assert.equal(
    pair.plannedVsActualSalesDifference.value,
    summary.plannedVsActualSalesDifference.value,
  );
  assert.equal(pair.actualMarginRate.value, 0.91);
  assert.ok(Math.abs(pair.expectedMarginRate.value - 1 / 3) < 1e-9);
  assert.equal(pair.plannedVsActualSalesDifference.value, 86_500);
});

test("못골 마진 차이는 장부 매출이 계획 가격 합보다 적다고 말한다", async () => {
  const { explainMarginGapPlain } = await import(
    moduleUrl("src/server/calculations/margin-pair.ts")
  );
  const operatingSales = 3_984_000;
  const expectedSales = 4_182_400;
  const costOfGoodsSold = 3_186_070;
  const sentence = explainMarginGapPlain({
    operatingSales: money(operatingSales),
    expectedSales: money(expectedSales),
    costOfGoodsSold: money(costOfGoodsSold),
    actualMarginRate: money((operatingSales - costOfGoodsSold) / operatingSales),
    expectedMarginRate: money((expectedSales - costOfGoodsSold) / expectedSales),
    salesDifference: money(operatingSales - expectedSales),
  });

  assert.equal(
    sentence,
    [
      "장부 매출 3,984,000원이 계획 가격 합 4,182,400원보다 198,400원 적게 적혀 있습니다. 원가 3,186,070원은 실제 마진과 예상 마진에 같이 들어갑니다. 그래서 실제 마진율 20.03%가 예상 마진율 23.82%보다 낮습니다.",
      "이렇게 될 수 있는 경우는 다섯 가지입니다.",
      "1. 적어 둔 판매가보다 싸게 팔린 경우",
      "2. 재고는 빠졌는데 돈은 안 들어온 경우. 폐기로 안 적은 덤, 접대, 가져감",
      "3. 마감 재고를 실제보다 적게 센 경우",
      "4. 현금, 카드, 기타를 실제보다 적게 적은 경우",
      "5. 외상처럼 돈 칸에 없는 방식으로 나간 경우",
      "어느 경우인지는 이 금액만으로 정해지지 않습니다.",
    ].join("\n"),
  );
});

test("store comparison period row reads the margin pair from summed ledger inputs", async () => {
  const { buildStoreComparisonReportRowForTest } = await import(
    moduleUrl("src/features/reports/queries.ts")
  );
  const day = (ledgerId, operatingSales, expectedSales, costOfGoodsSold) => ({
    ledgerId,
    status: "HEADQUARTERS_CLOSED",
    original: {
      totalSales: money(operatingSales),
      grossProfit: money(operatingSales - costOfGoodsSold),
      grossMarginRate: money(
        (operatingSales - costOfGoodsSold) / operatingSales,
      ),
      operatingProfit: money(operatingSales - costOfGoodsSold),
      productivity: money(operatingSales),
      inventoryAmount: money(1_000),
    },
    applied: {
      totalSales: money(operatingSales),
      operatingSales: money(operatingSales),
      grossProfit: money(operatingSales - costOfGoodsSold),
      grossMarginRate: money(
        (operatingSales - costOfGoodsSold) / operatingSales,
      ),
      operatingProfit: money(operatingSales - costOfGoodsSold),
      productivity: money(operatingSales),
      inventoryAmount: money(1_000),
      costOfGoodsSold: money(costOfGoodsSold),
      plannedSalesTotal: money(expectedSales),
    },
    workerCount: 1,
    hasLoss: false,
    hasUnappliedCorrections: false,
    appliedCorrectionCount: 0,
    appliedCorrectionKeys: new Set(),
    unappliedCorrectionKeys: new Set(),
  });
  const row = buildStoreComparisonReportRowForTest({
    store: { id: "store-1", name: "테스트점" },
    dateCount: 2,
    ledgerSummaries: [
      day("ledger-1", 10_000, 9_000, 8_000),
      day("ledger-2", 5_000, 4_000, 2_000),
    ],
  });

  assert.equal(row.grossMarginRate.value, 5_000 / 15_000);
  assert.equal(row.expectedSalesAmount.value, 13_000);
  assert.equal(row.costOfGoodsSold.value, 10_000);
  assert.equal(row.expectedMarginRate.value, 3_000 / 13_000);
  assert.equal(row.plannedVsActualSalesDifference.value, 2_000);
});

test("mixed historical period does not keep an operational-only expected margin", async () => {
  const { mergeHistoricalStoreComparisonRow } = await import(
    moduleUrl("src/features/reports/historical-integration.ts")
  );
  const { buildMarginPairBasis } = await import(
    moduleUrl("src/server/calculations/margin-pair.ts")
  );
  const pair = buildMarginPairBasis({
    operatingSales: money(10_000),
    expectedSales: money(9_000),
    costOfGoodsSold: money(8_000),
  });
  const merged = mergeHistoricalStoreComparisonRow({
    operationalRow: {
      storeId: "store-1",
      storeName: "테스트점",
      statusCounts: {
        missingDayCount: 0,
        inProgressCount: 0,
        reviewCount: 0,
        closedCount: 1,
        holidayCount: 0,
      },
      salesAmount: money(10_000),
      closingSalesAmount: money(10_000),
      carryoverSalesAmount: money(0),
      operatingSalesAmount: money(10_000),
      grossProfit: money(2_000),
      grossMarginRate: money(0.2),
      operatingProfit: money(2_000),
      averageWorkerCount: money(1),
      productivity: money(10_000),
      averageInventory: money(1_000),
      averageSales: money(10_000),
      inventoryToSalesRatio: money(0.1),
      expectedSalesAmount: pair.expectedSales,
      costOfGoodsSold: pair.costOfGoodsSold,
      expectedMarginRate: pair.expectedMarginRate,
      plannedVsActualSalesDifference: pair.plannedVsActualSalesDifference,
      hasLoss: false,
      hasUnappliedCorrections: false,
      sourceSummary: {
        source: "operational",
        operationalDayCount: 1,
        historicalDayCount: 0,
        historicalCoverageDayCount: 0,
        excludedHistoricalOverlapCount: 0,
        missingMetrics: [],
      },
      metricEvidence: {
        salesAmount: evidence(money(10_000)),
        grossProfit: evidence(money(2_000)),
        grossMarginRate: evidence(money(0.2)),
        operatingProfit: evidence(money(2_000)),
        productivity: evidence(money(10_000)),
        averageInventory: evidence(money(1_000)),
        averageSales: evidence(money(10_000)),
        inventoryToSalesRatio: evidence(money(0.1)),
        loss: evidence(money(0)),
      },
    },
    operationalLedgerCount: 1,
    operationalBusinessDayCount: 1,
    historicalFacts: [
      {
        businessDate: "2024-01-02",
        salesAmount: 4_000,
        grossProfit: 1_000,
        grossMarginRate: 0.25,
        productivity: 4_000,
        workerCount: 1,
        metricStatus: {},
      },
    ],
    excludedHistoricalOverlapCount: 0,
    dateCount: 2,
  });

  assert.equal(merged.grossMarginRate.value, 3_000 / 14_000);
  assert.equal(merged.expectedMarginRate.value, null);
  assert.equal(merged.expectedSalesAmount.value, null);
  assert.equal(merged.costOfGoodsSold.value, null);
  assert.equal(merged.plannedVsActualSalesDifference.value, null);
  assert.match(merged.expectedMarginRate.reason, /과거 Excel/);
});

function evidence(metric) {
  return {
    original: metric,
    applied: metric,
    isCorrected: false,
    status: "original",
    statusLabel: "원본",
    correctionCount: 0,
    correctionTimelineHref: null,
    unavailableReason: null,
  };
}

test("chat period metrics cite the margin pair and do not recompute it", async () => {
  const { chatToolInternals, CHAT_TOOL_BY_NAME } = await import(
    moduleUrl("src/features/chat/tools.ts")
  );
  const { buildSystemPrompt } = await import(
    moduleUrl("src/features/chat/prompt.ts")
  );
  const row = chatToolInternals.toMetricRow({
    storeName: "삼국유통",
    salesAmount: money(SAMGUK.operatingSales),
    grossProfit: money(SAMGUK.operatingSales - SAMGUK.costOfGoodsSold),
    grossMarginRate: money(
      (SAMGUK.operatingSales - SAMGUK.costOfGoodsSold) / SAMGUK.operatingSales,
    ),
    averageWorkerCount: money(2),
    productivity: money(1),
    averageInventory: money(1),
    averageSales: money(1),
    inventoryToSalesRatio: money(1),
    expectedSalesAmount: money(SAMGUK.expectedSales),
    costOfGoodsSold: money(SAMGUK.costOfGoodsSold),
    expectedMarginRate: money(
      (SAMGUK.expectedSales - SAMGUK.costOfGoodsSold) / SAMGUK.expectedSales,
    ),
    plannedVsActualSalesDifference: money(
      SAMGUK.operatingSales - SAMGUK.expectedSales,
    ),
  });

  assert.equal(row.실제마진율, row.이익률);
  assert.equal(
    row.예상마진율,
    (SAMGUK.expectedSales - SAMGUK.costOfGoodsSold) / SAMGUK.expectedSales,
  );
  assert.equal(row.예상매출, SAMGUK.expectedSales);
  assert.equal(row.매출원가, SAMGUK.costOfGoodsSold);
  assert.equal(row.매출차이, SAMGUK.operatingSales - SAMGUK.expectedSales);
  assert.equal("estimatedGrossMarginRate" in row, false);

  const tool = CHAT_TOOL_BY_NAME.get("get_period_metrics");
  assert.match(tool.description, /예상 마진율/);

  const prompt = buildSystemPrompt({
    todayKst: "2026-10-19",
    storeNames: ["삼국유통"],
  });
  assert.match(prompt, /예상 마진율/);
  assert.match(prompt, /get_period_metrics/);
  assert.match(prompt, /나누지/);
  assert.match(prompt, /get_month_overview를 쓰지 않는다/);
  assert.match(prompt, /차이설명을 한 글자도 바꾸지 말고/);
  assert.doesNotMatch(prompt, /estimatedGrossMarginRate/);
});
