import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const overviewPath = path.join(
  root,
  "src",
  "features",
  "reports",
  "overview.ts",
);

function ledger(overrides = {}) {
  return {
    ledgerId: "ledger-1",
    storeId: "store-1",
    closingDate: new Date("2026-06-01T00:00:00.000Z"),
    status: "HEADQUARTERS_CLOSED",
    workerCount: 1,
    totalSales: 100_000,
    grossProfit: 30_000,
    grossMarginRate: 0.3,
    grossMarginReason: null,
    lossItems: [],
    hasUnappliedCorrections: false,
    ...overrides,
  };
}

function status(storeId, dateInput, ledgerStatus) {
  return { storeId, dateInput, status: ledgerStatus };
}

function monthRange({
  monthInput = "2026-06",
  startDateInput = `${monthInput}-01`,
  endDateInput = `${monthInput}-01`,
} = {}) {
  return {
    monthInput,
    startDate: new Date(`${startDateInput}T00:00:00.000Z`),
    endDate: new Date(`${endDateInput}T00:00:00.000Z`),
    startDateInput,
    endDateInput,
    errorMessage: null,
    isFutureMonth: false,
  };
}

function lossItem(id, lossTypeName, amount, usedPlannedPrice = true) {
  return {
    id,
    lossTypeName,
    quantity: 1,
    amount,
    usedPlannedPrice,
  };
}

function pnlRow(overrides = {}) {
  return {
    monthInput: "2026-06",
    storeId: "store-1",
    storeName: "강남점",
    salesAmount: 100_000,
    cogsAmount: 60_000,
    grossProfit: 40_000,
    grossMarginRate: 0.4,
    laborAmount: 10_000,
    fixedCosts: { 월세: 5_000 },
    otherExpenseAmount: 0,
    hqAdjustmentAmount: 0,
    netAmount: 25_000,
    adjustmentReason: null,
    memo: null,
    ...overrides,
  };
}

function todayRow(overrides = {}) {
  return {
    storeId: "store-1",
    storeName: "강남점",
    ledgerId: "ledger-today-1",
    priority: { rank: 20, label: "경고 이상", reasons: ["매출 확인"] },
    signals: [
      {
        id: "sales",
        label: "매출 급락",
        severity: "warning",
        detail: "전일 대비 매출이 감소했습니다.",
      },
    ],
    correctionState: {
      appliedCorrectionCount: 0,
      hasAppliedCorrections: false,
      hasUnappliedCorrections: false,
    },
    ...overrides,
  };
}

function readProjectFile(...segments) {
  const filePath = path.join(root, ...segments);
  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);
  return readFileSync(filePath, "utf8");
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test("overview query enforces report access and headquarters store scope", () => {
  const source = readProjectFile("src", "features", "reports", "overview.ts");

  assert.match(source, /export\s+async\s+function\s+getHqReportOverview/);
  assert.match(source, /requireReportAccess\(\)/);
  assert.match(source, /getHeadquartersStoreScope\(\)/);
  assert.match(source, /getLedgerProfitSummariesForRange\(/);
  assert.match(source, /buildMonthlyProfitAndLoss\(/);
  assert.match(source, /getHqDashboardRows\(/);
  assert.doesNotMatch(
    source,
    /\.(create|createMany|update|upsert|delete|deleteMany)\(/,
  );
});

test("overview query separates no-target and future-month reads before monthly queries", () => {
  const source = readProjectFile("src", "features", "reports", "overview.ts");
  const queryStart = source.indexOf(
    "export async function getHqReportOverview",
  );
  assert.notEqual(queryStart, -1);
  const query = source.slice(queryStart);
  const accessIndex = query.indexOf("await requireReportAccess()");
  const scopeIndex = query.indexOf("getHeadquartersStoreScope();");
  const ledgerQueryIndex = query.indexOf("getLedgerProfitSummariesForRange({");
  const noTargetIndex = query.indexOf("if (targetStoreIds.length === 0)");
  const futureMonthIndex = query.indexOf("if (monthRange.isFutureMonth)");
  const promiseAllIndex = query.indexOf("Promise.all(");
  const noTargetBranch = query.slice(noTargetIndex, futureMonthIndex);
  const futureMonthBranch = query.slice(futureMonthIndex, promiseAllIndex);

  assert.ok(accessIndex >= 0 && accessIndex < scopeIndex);
  assert.ok(scopeIndex < ledgerQueryIndex);
  assert.ok(
    noTargetIndex >= 0 &&
      noTargetIndex < futureMonthIndex &&
      futureMonthIndex < promiseAllIndex,
  );
  assert.doesNotMatch(noTargetBranch, /getHqDashboardRows\(/);
  assert.match(
    futureMonthBranch,
    /getHqDashboardRows\(\{[\s\S]*?datePreset:\s*"today"[\s\S]*?sortMode:\s*"priority"[\s\S]*?filterMode:\s*"needs-attention"/,
  );
  assert.match(futureMonthBranch, /calculationStoreIds:\s*\[\]/);
  assert.match(
    futureMonthBranch,
    /todayRows:\s*selectedStore[\s\S]*?today\.rows\.filter/,
  );
  assert.ok(
    (query.match(/storeIds:\s*targetStoreIds/g) ?? []).length >= 2,
    "both ledger range queries should use targetStoreIds",
  );
  assert.match(query, /storeId:\s*\{\s*in:\s*targetStoreIds\s*\}/);
});

test("overview includes company-wide costs only for all-store headquarters scope", () => {
  const source = readProjectFile("src", "features", "reports", "overview.ts");
  const queryStart = source.indexOf(
    "export async function getHqReportOverview",
  );
  assert.notEqual(queryStart, -1);
  const query = source.slice(queryStart);

  assert.match(
    query,
    /buildMonthlyProfitAndLoss\(\{[\s\S]*?includeCompanyWide:\s*scope\.mode\s*===\s*"ALL_STORES"\s*&&\s*!selectedStore/,
  );
});

test("ledger profit summaries retain the saved loss price basis", () => {
  const source = readProjectFile("src", "features", "reports", "queries.ts");
  const ledgerProfitSummaryStart = source.indexOf(
    "export type LedgerProfitSummary",
  );
  const rangeQueryStart = source.indexOf(
    "export async function getLedgerProfitSummariesForRange",
  );
  const rangeQueryEnd = source.indexOf(
    "export async function getHqMonthlyClosingAnomalyReport",
    rangeQueryStart,
  );

  assert.notEqual(ledgerProfitSummaryStart, -1);
  assert.notEqual(rangeQueryStart, -1);
  assert.notEqual(rangeQueryEnd, -1);

  const ledgerProfitSummarySource = source.slice(
    ledgerProfitSummaryStart,
    rangeQueryStart,
  );
  const rangeQuerySource = source.slice(rangeQueryStart, rangeQueryEnd);

  assert.match(
    source,
    /type\s+ReportLedgerRecord\s*=\s*\{[\s\S]*?ledgerLossItems:\s*\{[\s\S]*?usedPlannedPrice\?:\s*boolean;[\s\S]*?\}\[\];[\s\S]*?\};/,
  );
  assert.match(ledgerProfitSummarySource, /status:\s*DailyLedgerStatus;/);
  assert.match(
    ledgerProfitSummarySource,
    /lossItems:\s*Array<\{\s*id\?:\s*string;\s*lossTypeName:\s*string;\s*quantity:\s*number;\s*amount:\s*number;\s*usedPlannedPrice:\s*boolean;\s*\}>;/,
  );
  assert.match(
    ledgerProfitSummarySource,
    /hasUnappliedCorrections:\s*boolean;/,
  );
  assert.match(
    rangeQuerySource,
    /ledgerLossItems:\s*\{\s*select:\s*\{[\s\S]*?usedPlannedPrice:\s*true,[\s\S]*?\},\s*\},/,
  );
  assert.match(
    rangeQuerySource,
    /result\.set\(ledger\.id,\s*\{[\s\S]*?status:\s*ledger\.status,/,
  );
  assert.match(
    rangeQuerySource,
    /result\.set\(ledger\.id,\s*\{[\s\S]*?lossItems:\s*summary\.lossItems,/,
  );
  assert.match(
    rangeQuerySource,
    /result\.set\(ledger\.id,\s*\{[\s\S]*?hasUnappliedCorrections:\s*summary\.hasUnappliedCorrections,/,
  );
  assert.match(
    source,
    /const\s+lossMetadataById\s*=\s*new\s+Map\(\s*ledger\.ledgerLossItems\.map\(\(item\)\s*=>\s*\[\s*item\.id,\s*\{\s*lossTypeName:\s*item\.lossTypeName,\s*usedPlannedPrice:\s*item\.usedPlannedPrice\s*\?\?\s*false,\s*\},\s*\]\),\s*\);/,
  );
  assert.match(
    source,
    /const\s+metadata\s*=\s*lossMetadataById\.get\(item\.id\s*\?\?\s*""\);/,
  );
  assert.match(
    source,
    /lossTypeName:\s*metadata\?\.lossTypeName\s*\?\?\s*"유형 미지정"/,
  );
  assert.match(
    source,
    /usedPlannedPrice:\s*metadata\?\.usedPlannedPrice\s*\?\?\s*false/,
  );
});

test("overview aligns the current month with the same previous-month day and keeps gaps null", async () => {
  const { buildHqReportOverviewForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const report = buildHqReportOverviewForTest({
    monthRange: monthRange({
      monthInput: "2026-07",
      startDateInput: "2026-07-01",
      endDateInput: "2026-07-02",
    }),
    stores: [{ id: "store-1", name: "강남점" }],
    selectedStoreId: null,
    currentLedgers: [
      ledger({ closingDate: new Date("2026-07-01T00:00:00.000Z") }),
    ],
    previousLedgers: [
      ledger({
        closingDate: new Date("2026-06-01T00:00:00.000Z"),
        totalSales: 80_000,
      }),
    ],
    statusRows: [
      status("store-1", "2026-07-01", "HEADQUARTERS_CLOSED"),
      status("store-1", "2026-07-02", "IN_PROGRESS"),
      status("store-1", "2026-06-01", "HEADQUARTERS_CLOSED"),
    ],
    pnlRows: [],
    todayRows: [],
    errorMessages: [],
  });

  assert.deepEqual(
    report.salesTrend.map((item) => [
      item.day,
      item.currentAmount,
      item.previousAmount,
    ]),
    [
      [1, 100_000, 80_000],
      [2, null, null],
    ],
  );
  assert.match(report.salesTrend[0].currentStatusLabel, /실제|마감/);
  assert.match(report.salesTrend[1].currentStatusLabel, /입력 중/);
  assert.equal(
    report.salesTrend[0].detailHref,
    "/app/reports/daily?date=2026-07-01",
  );
});

test("overview loss donut keeps four types and excludes missing price bases", async () => {
  const { buildHqReportOverviewForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const report = buildHqReportOverviewForTest({
    monthRange: monthRange(),
    stores: [{ id: "store-1", name: "강남점" }],
    selectedStoreId: null,
    currentLedgers: [
      ledger({
        lossItems: [
          lossItem("1", "폐기", 400),
          lossItem("2", "파손", 300),
          lossItem("3", "변질", 200),
          lossItem("4", "시식", 100),
          lossItem("5", "기준없음", 0, false),
        ],
      }),
    ],
    previousLedgers: [],
    statusRows: [status("store-1", "2026-06-01", "HEADQUARTERS_CLOSED")],
    pnlRows: [],
    todayRows: [],
    errorMessages: [],
  });

  assert.deepEqual(
    report.lossBreakdown.items.map((item) => item.name),
    ["폐기", "파손", "변질", "시식"],
  );
  assert.equal(report.lossBreakdown.totalAmount, 1_000);
  assert.equal(report.lossBreakdown.computableCount, 4);
  assert.equal(report.lossBreakdown.totalCount, 5);
  assert.equal(report.lossBreakdown.uncomputableCount, 1);
  assert.match(report.lossBreakdown.detailHref, /month=2026-06/);
});

test("overview loss donut groups five usable types as top three plus other", async () => {
  const { buildHqReportOverviewForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const report = buildHqReportOverviewForTest({
    monthRange: monthRange(),
    stores: [{ id: "store-1", name: "강남점" }],
    selectedStoreId: null,
    currentLedgers: [
      ledger({
        lossItems: [
          lossItem("1", "폐기", 500),
          lossItem("2", "파손", 400),
          lossItem("3", "변질", 300),
          lossItem("4", "시식", 200),
          lossItem("5", "기타손실", 100),
        ],
      }),
    ],
    previousLedgers: [],
    statusRows: [status("store-1", "2026-06-01", "HEADQUARTERS_CLOSED")],
    pnlRows: [],
    todayRows: [],
    errorMessages: [],
  });

  assert.deepEqual(
    report.lossBreakdown.items.map((item) => [item.name, item.amount]),
    [
      ["폐기", 500],
      ["파손", 400],
      ["변질", 300],
      ["기타", 300],
    ],
  );
  assert.equal(report.lossBreakdown.computableCount, 5);
  assert.equal(report.lossBreakdown.totalCount, 5);
});

test("overview keeps incomplete-month loss summary unavailable instead of confirmed zero", async () => {
  const { buildHqReportOverviewForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const report = buildHqReportOverviewForTest({
    monthRange: monthRange(),
    stores: [{ id: "store-1", name: "강남점" }],
    selectedStoreId: "store-1",
    currentLedgers: [],
    previousLedgers: [],
    statusRows: [status("store-1", "2026-06-01", "IN_PROGRESS")],
    pnlRows: [],
    todayRows: [],
    errorMessages: [],
  });

  assert.equal(report.summary.lossAmount, null);
  assert.equal(report.lossBreakdown.totalAmount, 0);
  assert.equal(report.lossBreakdown.totalCount, 0);
  assert.doesNotMatch(report.chartSummaries.lossBreakdown, /손실 금액이 없/);
  assert.match(report.chartSummaries.lossBreakdown, /월 범위 미완전|일부 장부/);
  assert.match(report.dataQuality.lossBasisLabel, /월 범위 미완전|일부 장부/);
});

test("overview keeps store filters but uses an empty calculation scope for an unauthorized store", async () => {
  const { buildHqReportOverviewForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const report = buildHqReportOverviewForTest({
    monthRange: monthRange(),
    stores: [
      { id: "store-1", name: "강남점" },
      { id: "store-2", name: "서초점" },
    ],
    selectedStoreId: "unauthorized-store",
    currentLedgers: [],
    previousLedgers: [],
    statusRows: [],
    pnlRows: [],
    todayRows: [],
    errorMessages: ["조회 지점이 권한 범위에 없거나 비활성입니다."],
  });

  assert.equal(report.stores.length, 2);
  assert.deepEqual(report.summary, {
    salesAmount: null,
    grossProfit: null,
    netAmount: null,
    lossAmount: null,
    actionCount: 0,
  });
  assert.equal(report.closingMissingDays.length, 0);
  assert.equal(
    report.closingStatus.reduce((sum, row) => sum + row.count, 0),
    0,
  );
  assert.ok(
    Object.values(report.rankings).every(
      (ranking) => ranking.rows.length === 0 && ranking.excluded.length === 0,
    ),
  );
  assert.match(report.errorMessages[0], /권한 범위|비활성/);
});

test("overview keeps future-month calculations empty and today actions visible", async () => {
  const { buildHqReportOverviewForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const report = buildHqReportOverviewForTest({
    monthRange: {
      ...monthRange({
        monthInput: "2026-08",
        startDateInput: "2026-08-01",
        endDateInput: "2026-08-31",
      }),
      isFutureMonth: true,
    },
    stores: [
      { id: "store-1", name: "강남점" },
      { id: "store-2", name: "서초점" },
    ],
    calculationStoreIds: [],
    selectedStoreId: "store-1",
    currentLedgers: [],
    previousLedgers: [],
    statusRows: [],
    pnlRows: [],
    todayRows: [
      todayRow({
        storeId: "store-2",
        storeName: "서초점",
        ledgerId: "ledger-other",
      }),
      todayRow(),
    ],
    errorMessages: [],
  });

  assert.equal(report.stores.length, 2);
  assert.deepEqual(report.salesTrend, []);
  assert.equal(report.closingMissingDays.length, 0);
  assert.equal(
    report.closingStatus.reduce((sum, row) => sum + row.count, 0),
    0,
  );
  assert.ok(
    Object.values(report.rankings).every(
      (ranking) => ranking.rows.length === 0 && ranking.excluded.length === 0,
    ),
  );
  assert.equal(report.summary.lossAmount, null);
  assert.equal(report.actions.length, 1);
  assert.equal(report.actions[0].storeName, "강남점");
  assert.equal(report.actions[0].detailHref, "/app/ledgers/ledger-today-1");
});

test("overview closing groups always add up to store count times visible days", async () => {
  const { buildClosingStatusForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const rows = buildClosingStatusForTest({
    storeIds: ["store-1", "store-2"],
    dateInputs: ["2026-06-01", "2026-06-02"],
    statusRows: [
      status("store-1", "2026-06-01", "HEADQUARTERS_CLOSED"),
      status("store-2", "2026-06-01", "IN_REVIEW"),
      status("store-1", "2026-06-02", "HOLIDAY"),
    ],
  });

  assert.deepEqual(
    rows.map((item) => [item.key, item.count]),
    [
      ["closed", 1],
      ["progress", 1],
      ["missing", 1],
      ["holiday", 1],
    ],
  );
  assert.equal(
    rows.reduce((sum, item) => sum + item.count, 0),
    4,
  );
});

test("overview blocks the waterfall when any business ledger has no FIFO profit", async () => {
  const { buildProfitAndLossWaterfallForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const waterfall = buildProfitAndLossWaterfallForTest({
    ledgers: [ledger({ grossProfit: null, grossMarginRate: null })],
    coverageComplete: true,
    rows: [
      pnlRow({
        grossProfit: null,
        grossMarginRate: null,
        cogsAmount: 0,
        netAmount: -15_000,
      }),
    ],
  });

  assert.equal(waterfall.available, false);
  assert.deepEqual(waterfall.steps, []);
  assert.match(waterfall.reason, /FIFO|계산/);
});

test("overview sorts all four rankings and excludes incomplete values instead of replacing them with zero", async () => {
  const { buildHqReportOverviewForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const report = buildHqReportOverviewForTest({
    monthRange: monthRange(),
    stores: [
      { id: "store-1", name: "강남점" },
      { id: "store-2", name: "서초점" },
      { id: "store-3", name: "미완료점" },
      { id: "store-4", name: "계산불가점" },
      { id: "store-5", name: "장부없음점" },
      { id: "store-6", name: "손실없음점" },
    ],
    selectedStoreId: null,
    currentLedgers: [
      ledger({
        storeId: "store-1",
        totalSales: 200,
        grossProfit: 60,
        grossMarginRate: 0.3,
        lossItems: [lossItem("loss-1", "폐기", 10)],
      }),
      ledger({
        ledgerId: "ledger-2",
        storeId: "store-2",
        totalSales: 300,
        grossProfit: 30,
        grossMarginRate: 0.1,
        lossItems: [lossItem("loss-2", "파손", 40)],
      }),
      ledger({
        ledgerId: "ledger-3",
        storeId: "store-3",
        status: "IN_PROGRESS",
        totalSales: 999,
        grossProfit: 999,
        grossMarginRate: 0.99,
        lossItems: [lossItem("loss-3", "변질", 100)],
      }),
      ledger({
        ledgerId: "ledger-4",
        storeId: "store-4",
        totalSales: null,
        grossProfit: null,
        grossMarginRate: null,
        lossItems: [lossItem("loss-4", "기준없음", 0, false)],
      }),
      ledger({
        ledgerId: "ledger-6",
        storeId: "store-6",
        status: "IN_PROGRESS",
        totalSales: 150,
        grossProfit: 15,
        grossMarginRate: 0.1,
        lossItems: [],
      }),
    ],
    previousLedgers: [],
    statusRows: [
      status("store-1", "2026-06-01", "HEADQUARTERS_CLOSED"),
      status("store-2", "2026-06-01", "HEADQUARTERS_CLOSED"),
      status("store-3", "2026-06-01", "IN_PROGRESS"),
      status("store-4", "2026-06-01", "HEADQUARTERS_CLOSED"),
      status("store-6", "2026-06-01", "IN_PROGRESS"),
    ],
    pnlRows: [],
    todayRows: [],
    errorMessages: [],
  });

  assert.deepEqual(
    report.rankings.sales.rows.map((row) => [row.storeId, row.value]),
    [
      ["store-2", 300],
      ["store-1", 200],
    ],
  );
  assert.deepEqual(
    report.rankings.grossProfit.rows.map((row) => [row.storeId, row.value]),
    [
      ["store-1", 60],
      ["store-2", 30],
    ],
  );
  assert.deepEqual(
    report.rankings.grossMarginRate.rows.map((row) => [row.storeId, row.value]),
    [
      ["store-1", 0.3],
      ["store-2", 0.1],
    ],
  );
  assert.deepEqual(
    report.rankings.loss.rows.map((row) => [row.storeId, row.value]),
    [
      ["store-3", 100],
      ["store-2", 40],
      ["store-1", 10],
      ["store-6", 0],
    ],
  );
  assert.deepEqual(
    report.rankings.sales.excluded.map((row) => row.storeId),
    ["store-3", "store-4", "store-5", "store-6"],
  );
  assert.deepEqual(
    report.rankings.loss.excluded.map((row) => row.storeId),
    ["store-4", "store-5"],
  );
  assert.ok(
    ["sales", "grossProfit", "grossMarginRate"].every((metric) =>
      report.rankings[metric].rows.every((row) => row.value !== 0),
    ),
  );
  assert.ok(
    Object.values(report.rankings).every((ranking) =>
      ranking.rows.every(
        (row) =>
          row.detailHref ===
          `/app/reports/comparison?startDate=2026-06-01&endDate=2026-06-01&storeId=${row.storeId}`,
      ),
    ),
  );
  assert.match(report.rankings.loss.summary, /판매가 계획 기준/);
});

test("overview waterfall includes company-wide costs as a separate step", async () => {
  const { buildHqReportOverviewForTest, buildProfitAndLossWaterfallForTest } =
    await import(pathToFileURL(overviewPath).href);
  const waterfall = buildProfitAndLossWaterfallForTest({
    ledgers: [ledger({ totalSales: 1_000, grossProfit: 400 })],
    coverageComplete: true,
    rows: [
      pnlRow({
        salesAmount: 1_000,
        cogsAmount: 600,
        grossProfit: 400,
        laborAmount: 50,
        fixedCosts: { 월세: 20 },
        otherExpenseAmount: 10,
        hqAdjustmentAmount: 5,
        netAmount: 315,
      }),
      pnlRow({
        storeId: "__company_wide__",
        storeName: "(전사 공통)",
        salesAmount: 0,
        cogsAmount: 0,
        grossProfit: null,
        grossMarginRate: null,
        laborAmount: 0,
        fixedCosts: { 월세: 30 },
        otherExpenseAmount: 20,
        hqAdjustmentAmount: 10,
        netAmount: -60,
      }),
    ],
  });

  assert.equal(waterfall.available, true);
  assert.deepEqual(
    waterfall.steps.map((step) => step.key),
    [
      "sales",
      "cogs",
      "grossProfit",
      "labor",
      "storeExpenses",
      "companyWideExpenses",
      "hqAdjustment",
      "net",
    ],
  );
  assert.equal(
    waterfall.steps.find((step) => step.key === "companyWideExpenses")?.amount,
    50,
  );
  assert.equal(waterfall.steps.at(-1)?.end, 255);
  assert.match(waterfall.detailHref, /month=2026-06/);

  const zeroCompanyWide = buildProfitAndLossWaterfallForTest({
    ledgers: [ledger({ totalSales: 1_000, grossProfit: 400 })],
    coverageComplete: true,
    rows: [
      pnlRow({
        salesAmount: 1_000,
        cogsAmount: 600,
        grossProfit: 400,
        laborAmount: 50,
        fixedCosts: { 월세: 20 },
        otherExpenseAmount: 10,
        hqAdjustmentAmount: 5,
        netAmount: 315,
      }),
    ],
  });
  assert.equal(
    zeroCompanyWide.steps.find((step) => step.key === "companyWideExpenses")
      ?.amount,
    0,
  );

  const selectedStore = buildHqReportOverviewForTest({
    monthRange: monthRange(),
    stores: [{ id: "store-1", name: "강남점" }],
    selectedStoreId: "store-1",
    currentLedgers: [ledger({ totalSales: 1_000, grossProfit: 400 })],
    previousLedgers: [],
    statusRows: [status("store-1", "2026-06-01", "HEADQUARTERS_CLOSED")],
    pnlRows: [
      pnlRow({
        salesAmount: 1_000,
        cogsAmount: 600,
        grossProfit: 400,
        laborAmount: 50,
        fixedCosts: { 월세: 20 },
        otherExpenseAmount: 10,
        hqAdjustmentAmount: 5,
        netAmount: 315,
      }),
    ],
    todayRows: [],
    errorMessages: [],
  });
  assert.equal(
    selectedStore.profitAndLoss.steps.some(
      (step) => step.key === "companyWideExpenses",
    ),
    false,
  );
  assert.match(selectedStore.profitAndLoss.detailHref, /storeId=store-1/);
});

test("overview actions filter by selected store, use dashboard state, and keep detail links", async () => {
  const { buildHqReportOverviewForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const selectedRows = Array.from({ length: 8 }, (_, index) =>
    todayRow({
      ledgerId: index === 0 ? null : `ledger-today-${index}`,
      priority: {
        rank: 10 + index,
        label: "심각 이상",
        reasons: [`조치 ${index + 1}`],
      },
      correctionState: {
        appliedCorrectionCount: 0,
        hasAppliedCorrections: false,
        hasUnappliedCorrections: index === 0,
      },
    }),
  );
  const report = buildHqReportOverviewForTest({
    monthRange: monthRange(),
    stores: [
      { id: "store-1", name: "강남점" },
      { id: "store-2", name: "서초점" },
    ],
    selectedStoreId: "store-1",
    currentLedgers: [],
    previousLedgers: [],
    statusRows: [],
    pnlRows: [],
    todayRows: [
      todayRow({
        storeId: "store-2",
        storeName: "서초점",
        ledgerId: "ledger-other",
        priority: { rank: 1, label: "심각 이상", reasons: ["제외"] },
      }),
      ...selectedRows,
    ],
    errorMessages: [],
  });

  assert.equal(report.actions.length, 7);
  assert.ok(report.actions.every((action) => action.storeName === "강남점"));
  assert.equal(report.actions[0].label, "심각 이상");
  assert.match(report.actions[0].detail, /정정|조치 1|매출/);
  assert.equal(report.actions[0].detailHref, "/app/reports/daily?date=today");
  assert.equal(report.actions[1].detailHref, "/app/ledgers/ledger-today-1");
});

test("overview action severity follows priority rank instead of signal or correction state", async () => {
  const { buildHqReportOverviewForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const report = buildHqReportOverviewForTest({
    monthRange: monthRange(),
    stores: [{ id: "store-1", name: "강남점" }],
    selectedStoreId: null,
    currentLedgers: [],
    previousLedgers: [],
    statusRows: [],
    pnlRows: [],
    todayRows: [
      todayRow({
        ledgerId: "ledger-rank-10",
        priority: { rank: 10, label: "심각 이상", reasons: ["심각"] },
        signals: [
          { id: "info", label: "정보 신호", severity: "info", detail: "정보" },
          {
            id: "critical-after-info",
            label: "심각 신호",
            severity: "critical",
            detail: "심각",
          },
        ],
      }),
      todayRow({
        ledgerId: "ledger-rank-25",
        priority: { rank: 25, label: "확인 필요", reasons: ["확인"] },
        signals: [
          {
            id: "critical",
            label: "심각 신호",
            severity: "critical",
            detail: "심각",
          },
        ],
      }),
      todayRow({
        ledgerId: "ledger-rank-90",
        priority: { rank: 90, label: "정상", reasons: ["정상"] },
        signals: [
          {
            id: "critical-normal",
            label: "심각 신호",
            severity: "critical",
            detail: "심각",
          },
        ],
        correctionState: {
          appliedCorrectionCount: 0,
          hasAppliedCorrections: false,
          hasUnappliedCorrections: true,
        },
      }),
    ],
    errorMessages: [],
  });

  assert.deepEqual(
    report.actions.map((action) => [
      action.detailHref,
      action.label,
      action.severity,
    ]),
    [
      ["/app/ledgers/ledger-rank-10", "심각 이상", "critical"],
      ["/app/ledgers/ledger-rank-25", "확인 필요", "warning"],
      ["/app/ledgers/ledger-rank-90", "정상", "info"],
    ],
  );
  assert.match(report.actions[0].detail, /^정보/);
});

test("overview UI keeps each chart accessible and protects its chart contract", () => {
  const source = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "hq-report-overview.tsx",
  );

  const chartFunctions = [
    ["SalesTrendChart", /<LineChart\s+accessibilityLayer/],
    ["LossDonutChart", /<PieChart\s+accessibilityLayer/],
    ["StoreRankingChart", /<BarChart\s+accessibilityLayer/],
    ["ProfitAndLossChart", /<BarChart\s+accessibilityLayer/],
    ["ClosingStatusChart", /<BarChart\s+accessibilityLayer/],
  ];

  assert.ok((source.match(/accessibilityLayer/g) ?? []).length >= 5);
  for (const [name, rootPattern] of chartFunctions) {
    assert.match(functionSource(source, name), rootPattern);
  }

  const sales = functionSource(source, "SalesTrendChart");
  assert.equal((sales.match(/connectNulls=\{false\}/g) ?? []).length, 2);
  assert.match(sales, /ChartTooltipContent/);
  assert.match(sales, /정정 반영 실제 총매출 기준/);

  const loss = functionSource(source, "LossDonutChart");
  const lossLegend = functionSource(source, "LossBreakdownLegend");
  assert.match(loss, /innerRadius=\{58\}/);
  assert.match(loss, /outerRadius=\{84\}/);
  assert.match(
    source,
    /const lossColors = \[[\s\S]*?--chart-1[\s\S]*?--chart-2[\s\S]*?--chart-3[\s\S]*?--chart-4[\s\S]*?\] as const/,
  );
  assert.match(
    loss,
    /<LossBreakdownLegend\s+items=\{report\.lossBreakdown\.items\}/,
  );
  assert.match(lossLegend, /item\.name/);
  assert.match(lossLegend, /formatKrw\(item\.amount\)/);
  assert.match(lossLegend, /percentFormatter\.format\(item\.ratio\)/);
  assert.match(loss, /판매가 계획 기준 계산 가능/);
  assert.match(loss, /<Label/);
  assert.match(loss, /viewBox/);
  assert.match(loss, /<text/);
  assert.match(loss, /<tspan/);
  assert.match(loss, /formatKrw\(report\.lossBreakdown\.totalAmount\)/);
  assert.doesNotMatch(loss, /pointer-events-none absolute/);

  const ranking = functionSource(source, "StoreRankingChart");
  assert.match(ranking, /aria-pressed=\{metric === item\.key\}/);
  assert.match(ranking, /<ReferenceLine x=\{0\}/);
  assert.match(ranking, /data=\{ranking\.rows\}/);
  assert.doesNotMatch(ranking, /\.sort\(/);

  const profitAndLoss = functionSource(source, "ProfitAndLossChart");
  assert.ok(
    profitAndLoss.indexOf("!report.profitAndLoss.available") <
      profitAndLoss.indexOf("<ChartContainer"),
  );
  assert.match(profitAndLoss, /!report\.profitAndLoss\.available\s*\?\s*\(/);
  assert.match(
    profitAndLoss,
    /<Bar(?=[^>]*dataKey="offset")(?=[^>]*stackId="waterfall")[^>]*\/>/,
  );
  assert.match(
    profitAndLoss,
    /<Bar(?=[^>]*dataKey="amount")(?=[^>]*stackId="waterfall")[^>]*>/,
  );
  assert.match(profitAndLoss, /dataKey="key"/);
  assert.match(profitAndLoss, /tickFormatter=\{formatWaterfallAxisLabel\}/);
  assert.match(profitAndLoss, /tick=\{\{ fontSize: 10 \}\}/);
  assert.match(profitAndLoss, /tickMargin=\{8\}/);
  assert.match(profitAndLoss, /formatWaterfallDisplayAmount\(step\)/);

  const closing = functionSource(source, "ClosingStatusChart");
  const closingLegend = functionSource(source, "ClosingStatusLegend");
  assert.match(
    closing,
    /<Bar(?=[^>]*dataKey=\{item\.key\})(?=[^>]*stackId="closing")[^>]*\/>/,
  );
  assert.match(
    closing,
    /<ClosingStatusLegend\s+items=\{report\.closingStatus\}/,
  );
  assert.match(closingLegend, /item\.label/);
  assert.match(closingLegend, /percentFormatter\.format\(item\.ratio\)/);
  assert.match(closingLegend, /item\.count/);
});

test("overview UI keeps five table alternatives and today's action list", () => {
  const source = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "hq-report-overview.tsx",
  );
  const tables = functionSource(source, "OverviewTables");
  const actions = functionSource(source, "ActionList");

  assert.match(source, /ReviewViewToggle/);
  assert.match(tables, /<SalesTrendTable report=\{report\}/);
  assert.match(tables, /<LossBreakdownTable report=\{report\}/);
  assert.match(tables, /<RankingsTable report=\{report\}/);
  assert.match(tables, /<ProfitAndLossTable report=\{report\}/);
  assert.match(tables, /<ClosingStatusTable report=\{report\}/);
  assert.match(actions, /오늘 기준/);
  assert.match(actions, /오늘 바로 조치할 항목이 없습니다/);
  assert.doesNotMatch(source, /grossProfit\s*\?\?\s*0/);
});

test("overview UI preserves waterfall signs and separates missing closing days", () => {
  const source = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "hq-report-overview.tsx",
  );
  const displayAmount = functionSource(source, "formatWaterfallDisplayAmount");
  const axisLabel = functionSource(source, "formatWaterfallAxisLabel");
  const profitTable = functionSource(source, "ProfitAndLossTable");
  const closingTable = functionSource(source, "ClosingStatusTable");

  assert.match(displayAmount, /step\.kind === "total"/);
  assert.match(displayAmount, /formatSignedKrw\(step\.end\)/);
  assert.match(displayAmount, /step\.kind === "decrease"/);
  assert.match(displayAmount, /formatSignedKrw\(-step\.amount\)/);
  assert.match(displayAmount, /formatSignedKrw\(step\.amount\)/);
  assert.match(profitTable, /formatWaterfallDisplayAmount\(step\)/);
  assert.match(axisLabel, /waterfallAxisLabels\[key\]/);

  for (const [key, label] of [
    ["sales", "매출"],
    ["cogs", "원가"],
    ["grossProfit", "매출이익"],
    ["labor", "인건비"],
    ["storeExpenses", "지점비"],
    ["companyWideExpenses", "전사비"],
    ["hqAdjustment", "본사조정"],
    ["net", "순이익"],
  ]) {
    assert.match(source, new RegExp(`${key}: "${label}"`));
  }

  assert.equal((closingTable.match(/<Table>/g) ?? []).length, 2);
  assert.match(
    closingTable,
    /closingStatus\.every\(\(item\) => item\.count === 0\)[\s\S]*?<TableCell colSpan=\{4\}>/,
  );
  const firstTableEnd = closingTable.indexOf("</Table>");
  const missingDays = closingTable.indexOf("closingMissingDays.map");
  assert.ok(firstTableEnd >= 0 && missingDays > firstTableEnd);
  assert.match(closingTable, /closingMissingDays\.length > 0[\s\S]*?<Table>/);
  assert.match(
    closingTable.slice(firstTableEnd),
    /<TableHead>지점<\/TableHead>[\s\S]*?<TableHead>미입력 일자<\/TableHead>[\s\S]*?<TableHead>근거<\/TableHead>/,
  );
});
