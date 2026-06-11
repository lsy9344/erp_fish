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

test("HQ daily meeting report source files follow story 5.1 boundaries", () => {
  assertProjectFile("src", "features", "reports", "types.ts");
  assertProjectFile("src", "features", "reports", "queries.ts");
  assertProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "daily-meeting-report-table.tsx",
  );
  assertProjectFile("src", "app", "app", "reports", "daily", "page.tsx");
  assertProjectFile("src", "app", "app", "reports", "daily", "loading.tsx");

  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "daily",
    "page.tsx",
  );
  const loadingSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "daily",
    "loading.tsx",
  );
  const sidebarSource = readProjectFile("src", "components", "app-sidebar.tsx");

  assert.match(pageSource, /requireReportAccess\(/);
  assert.match(pageSource, /getHqDailyMeetingReport\(/);
  assert.match(pageSource, /DailyMeetingReportTable/);
  assert.match(pageSource, /아침 회의 리포트/);
  assert.match(loadingSource, /Skeleton/);
  assert.match(loadingSource, /md:block/);
  assert.match(loadingSource, /md:hidden/);
  assert.match(sidebarSource, /href:\s*"\/app\/reports\/daily"/);
});

test("HQ daily meeting report query reuses dashboard calculation contracts", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );

  assert.match(
    querySource,
    /export\s+async\s+function\s+getHqDailyMeetingReport/,
  );
  assert.match(querySource, /requireReportAccess\(\)/);
  assert.match(querySource, /getHeadquartersStoreScope\(\)/);
  assert.match(querySource, /storeScope\.stores/);
  assert.match(querySource, /dailyLedger\.findMany\(/);
  assert.match(querySource, /storeId:\s*\{\s*in:/s);
  assert.match(querySource, /closingDate/);
  assert.match(querySource, /getLatestCorrectionValuesForLedgers/);
  assert.match(querySource, /applyCorrectionValuesToLedgerReviewInput/);
  assert.match(querySource, /calculateLedgerReviewSummary/);
  assert.match(querySource, /evaluateRevenueAnomalySignals/);
  assert.match(querySource, /evaluateInventoryLossAnomalySignals/);
  assert.match(querySource, /correction-review-required/);
  assert.doesNotMatch(querySource, /\.(create|createMany|update|upsert)\(/);
  assert.doesNotMatch(querySource, /export\s+async\s+function\s+(GET|POST)/);
});

test("HQ daily meeting report UI reuses status and signal components without UI math", () => {
  const tableSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "daily-meeting-report-table.tsx",
  );

  assert.match(tableSource, /DashboardStatusBadge/);
  assert.match(tableSource, /DashboardSignalSummary/);
  assert.match(tableSource, /\/app\/ledgers\/\$\{row\.ledgerId\}/);
  assert.match(tableSource, /<details/);
  assert.match(tableSource, /근거 보기/);
  assert.match(tableSource, /원본/);
  assert.match(tableSource, /정정 반영/);
  assert.match(tableSource, /계산 불가 사유/);
  assert.match(tableSource, /correctionTimelineHref/);
  assert.match(tableSource, /row\.metricEvidence\.loss/);
  assert.match(tableSource, /입력 전/);
  assert.match(tableSource, /tabular-nums/);
  assert.match(tableSource, /break-words/);
  assert.doesNotMatch(tableSource, /salesDropRateBps/);
  assert.doesNotMatch(tableSource, /grossMarginDropBps/);
  assert.doesNotMatch(tableSource, /salesDifferenceAmount/);
  assert.doesNotMatch(tableSource, /inventoryDifferenceQuantity/);
});

test("correction creation revalidates daily reports after correction values change", () => {
  const actionSource = readProjectFile(
    "src",
    "features",
    "corrections",
    "actions.ts",
  );

  assert.match(actionSource, /revalidatePath\("\/app\/reports\/daily"\)/);
});

test("HQ store comparison report source files follow story 5.3 boundaries", () => {
  assertProjectFile("src", "app", "app", "reports", "comparison", "page.tsx");
  assertProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "comparison",
    "loading.tsx",
  );
  assertProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "store-comparison-report-table.tsx",
  );

  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "comparison",
    "page.tsx",
  );
  const loadingSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "comparison",
    "loading.tsx",
  );
  const tableSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "store-comparison-report-table.tsx",
  );

  assert.match(pageSource, /requireReportAccess\(/);
  assert.match(pageSource, /getHqStoreComparisonReport\(/);
  assert.match(pageSource, /StoreComparisonReportTable/);
  assert.match(pageSource, /기간 비교 리포트/);
  assert.match(pageSource, /startDate/);
  assert.match(pageSource, /endDate/);
  assert.match(loadingSource, /Skeleton/);
  assert.match(loadingSource, /md:block/);
  assert.match(loadingSource, /md:hidden/);
  assert.match(tableSource, /매출이익/);
  assert.match(tableSource, /인당생산성/);
  assert.match(tableSource, /평균재고/);
  assert.match(tableSource, /평균매출/);
  assert.match(tableSource, /재고비율/);
  assert.match(tableSource, /상태/);
  assert.match(tableSource, /근거 보기/);
  assert.match(tableSource, /tabular-nums/);
  assert.match(tableSource, /break-words/);
  assert.doesNotMatch(tableSource, /calculateLedgerReviewSummary/);
});

test("HQ store comparison report query reuses report calculation contracts", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const typeSource = readProjectFile("src", "features", "reports", "types.ts");
  const actionSource = readProjectFile(
    "src",
    "features",
    "corrections",
    "actions.ts",
  );

  assert.match(
    querySource,
    /export\s+async\s+function\s+getHqStoreComparisonReport/,
  );
  assert.match(querySource, /requireReportAccess\(\)/);
  assert.match(querySource, /getHeadquartersStoreScope\(\)/);
  assert.match(querySource, /storeScope\.stores/);
  assert.match(querySource, /dailyLedger\.findMany\(/);
  assert.match(querySource, /closingDate:\s*\{\s*gte:/s);
  assert.match(querySource, /lte:/);
  assert.match(querySource, /getLatestCorrectionValuesForLedgers/);
  assert.match(querySource, /applyCorrectionValuesToLedgerReviewInput/);
  assert.match(querySource, /calculateLedgerReviewSummary/);
  assert.match(querySource, /missingDayCount/);
  assert.match(querySource, /holidayCount/);
  assert.match(querySource, /inProgressCount/);
  assert.match(querySource, /reviewCount/);
  assert.match(querySource, /closedCount/);
  assert.doesNotMatch(querySource, /\.(create|createMany|update|upsert)\(/);
  assert.match(typeSource, /export type StoreComparisonReportData/);
  assert.match(typeSource, /export type StoreComparisonReportRow/);
  assert.match(typeSource, /metricEvidence/);
  assert.match(actionSource, /revalidatePath\("\/app\/reports\/comparison"\)/);
});

test("HQ monthly closing anomaly report source files follow story 5.4 boundaries", () => {
  assertProjectFile("src", "app", "app", "reports", "monthly", "page.tsx");
  assertProjectFile("src", "app", "app", "reports", "monthly", "loading.tsx");
  assertProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "monthly-closing-anomaly-report.tsx",
  );

  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "monthly",
    "page.tsx",
  );
  const loadingSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "monthly",
    "loading.tsx",
  );
  const componentSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "monthly-closing-anomaly-report.tsx",
  );
  const dailyPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "daily",
    "page.tsx",
  );
  const comparisonPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "comparison",
    "page.tsx",
  );

  assert.match(pageSource, /requireReportAccess\(/);
  assert.match(pageSource, /getHqMonthlyClosingAnomalyReport\(/);
  assert.match(pageSource, /MonthlyClosingAnomalyReport/);
  assert.match(pageSource, /월간 요약 리포트/);
  assert.match(pageSource, /핵심 성과와 손실\/재고 흐름/);
  assert.match(pageSource, /month/);
  assert.match(pageSource, /storeId/);
  assert.match(loadingSource, /Skeleton/);
  assert.match(loadingSource, /월간 핵심 성과/);
  assert.match(loadingSource, /손실\/재고 흐름/);
  assert.match(loadingSource, /md:block/);
  assert.match(loadingSource, /md:hidden/);
  assert.match(componentSource, /DashboardStatusBadge/);
  assert.match(componentSource, /DashboardSignalSummary/);
  assert.match(componentSource, /본사마감/);
  assert.match(componentSource, /검토대기/);
  assert.match(componentSource, /입력중/);
  assert.match(componentSource, /미입력/);
  assert.match(componentSource, /휴무/);
  assert.match(componentSource, /주요 이상/);
  assert.match(componentSource, /월간 핵심 성과/);
  assert.match(componentSource, /손실\/재고 흐름/);
  assert.match(componentSource, /손실 유형별 요약/);
  assert.match(componentSource, /최고매출품목/);
  assert.match(componentSource, /계산 포함\/제외 일자/);
  assert.match(componentSource, /장부 상세/);
  assert.match(componentSource, /item\.storeName/);
  assert.match(
    componentSource,
    /DashboardSignalSummary\s+signals=\{\[\s*\{\s*id:\s*item\.id/s,
  );
  assert.match(componentSource, /data-testid=\{`hq-report-monthly-day-/);
  assert.match(componentSource, /data-testid=\{`hq-report-monthly-anomaly-/);
  assert.match(componentSource, /data-testid="hq-report-monthly-kpi-sales"/);
  assert.match(componentSource, /data-testid="hq-report-monthly-loss-summary"/);
  assert.match(
    componentSource,
    /data-testid="hq-report-monthly-inventory-flow"/,
  );
  assert.match(componentSource, /tabular-nums/);
  assert.match(componentSource, /break-words/);
  assert.doesNotMatch(componentSource, /evaluateRevenueAnomalySignals/);
  assert.doesNotMatch(componentSource, /evaluateInventoryLossAnomalySignals/);
  assert.match(dailyPageSource, /\/app\/reports\/monthly/);
  assert.match(comparisonPageSource, /\/app\/reports\/monthly/);
});

test("HQ monthly closing anomaly report query reuses report calculation contracts", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const typeSource = readProjectFile("src", "features", "reports", "types.ts");
  const revalidationFiles = [
    ["src", "features", "dashboard", "threshold-actions.ts"],
    ["src", "features", "ledger", "actions.ts"],
    ["src", "features", "ledger", "hq-close-actions.ts"],
    ["src", "features", "corrections", "actions.ts"],
    ["src", "features", "ledger", "hq-edit-actions.ts"],
    ["src", "features", "inventory", "actions.ts"],
    ["src", "features", "inventory", "hq-edit-actions.ts"],
    ["src", "features", "losses", "actions.ts"],
    ["src", "features", "losses", "hq-edit-actions.ts"],
    ["src", "features", "master-data", "actions.ts"],
  ];

  assert.match(
    querySource,
    /export\s+async\s+function\s+getHqMonthlyClosingAnomalyReport/,
  );
  assert.match(querySource, /getMonthlyClosingAnomalyReportMonthRange/);
  assert.match(querySource, /getMonthlyClosingAnomalyReportPath/);
  assert.match(querySource, /MONTH_QUERY_PATTERN/);
  assert.match(querySource, /requireReportAccess\(\)/);
  assert.match(querySource, /getHeadquartersStoreScope\(\)/);
  assert.match(querySource, /storeScope\.stores/);
  assert.match(querySource, /dailyLedger\.findMany\(/);
  assert.match(querySource, /storeId/);
  assert.match(querySource, /closingDate:\s*\{\s*gte:/s);
  assert.match(querySource, /lte:/);
  assert.match(querySource, /getLatestCorrectionValuesForLedgers/);
  assert.match(querySource, /applyCorrectionValuesToLedgerReviewInput/);
  assert.match(querySource, /calculateLedgerReviewSummary/);
  assert.match(querySource, /evaluateRevenueAnomalySignals/);
  assert.match(querySource, /evaluateInventoryLossAnomalySignals/);
  assert.match(querySource, /buildMonthlyClosingAnomalyReportForTest/);
  assert.match(querySource, /toReportLedgerCalculationSummary/);
  assert.match(querySource, /lossTypeName/);
  assert.match(querySource, /buildMonthlyKpis/);
  assert.match(querySource, /buildMonthlyInventoryFlow/);
  assert.match(querySource, /buildMonthlyTopRevenueItemSummary/);
  assert.doesNotMatch(querySource, /\.(create|createMany|update|upsert)\(/);
  assert.match(typeSource, /export type MonthlyClosingAnomalyReportData/);
  assert.match(typeSource, /export type MonthlyClosingAnomalyDay/);
  assert.match(typeSource, /export type MonthlyAnomalyItem/);
  assert.match(typeSource, /export type MonthlyClosingKpiSummary/);
  assert.match(typeSource, /export type MonthlyLossSummary/);
  assert.match(typeSource, /export type MonthlyInventoryFlowSummary/);
  assert.match(typeSource, /export type MonthlyCalculationDay/);

  for (const segments of revalidationFiles) {
    assert.match(
      readProjectFile(...segments),
      /revalidatePath\("\/app\/reports\/monthly"\)/,
      `${segments.join("/")} should revalidate monthly reports`,
    );
  }
});

test("ledger and master data writes revalidate daily reports", () => {
  const files = [
    ["src", "features", "ledger", "actions.ts"],
    ["src", "features", "inventory", "actions.ts"],
    ["src", "features", "losses", "actions.ts"],
    ["src", "features", "ledger", "hq-edit-actions.ts"],
    ["src", "features", "inventory", "hq-edit-actions.ts"],
    ["src", "features", "losses", "hq-edit-actions.ts"],
    ["src", "features", "ledger", "hq-close-actions.ts"],
    ["src", "features", "master-data", "actions.ts"],
    ["src", "features", "dashboard", "threshold-actions.ts"],
  ];

  for (const segments of files) {
    assert.match(
      readProjectFile(...segments),
      /revalidatePath\("\/app\/reports\/daily"\)/,
      `${segments.join("/")} should revalidate daily reports`,
    );
  }
});

test("HQ monthly closing anomaly report month helper keeps KST URL state", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const {
    getMonthlyClosingAnomalyReportMonthRange,
    getMonthlyClosingAnomalyReportPath,
  } = await import(pathToFileURL(queryPath).href);

  const currentMonth = getMonthlyClosingAnomalyReportMonthRange(
    "2026-06",
    new Date("2026-06-14T16:00:00.000Z"),
  );

  assert.equal(currentMonth.monthInput, "2026-06");
  assert.equal(currentMonth.startDateInput, "2026-06-01");
  assert.equal(currentMonth.endDateInput, "2026-06-15");
  assert.equal(currentMonth.errorMessage, null);
  assert.equal(currentMonth.isFutureMonth, false);
  assert.equal(
    getMonthlyClosingAnomalyReportPath({
      monthInput: currentMonth.monthInput,
      storeId: "store-1",
    }),
    "/app/reports/monthly?month=2026-06&storeId=store-1",
  );

  const pastMonth = getMonthlyClosingAnomalyReportMonthRange(
    "2026-05",
    new Date("2026-06-14T16:00:00.000Z"),
  );

  assert.equal(pastMonth.startDateInput, "2026-05-01");
  assert.equal(pastMonth.endDateInput, "2026-05-31");

  const invalidMonth = getMonthlyClosingAnomalyReportMonthRange(
    "2026-13",
    new Date("2026-06-14T16:00:00.000Z"),
  );

  assert.equal(invalidMonth.monthInput, "2026-06");
  assert.equal(invalidMonth.startDateInput, "2026-06-01");
  assert.equal(invalidMonth.endDateInput, "2026-06-15");
  assert.match(invalidMonth.errorMessage, /월/);

  const futureMonth = getMonthlyClosingAnomalyReportMonthRange(
    "2026-07",
    new Date("2026-06-14T16:00:00.000Z"),
  );

  assert.equal(futureMonth.isFutureMonth, true);
  assert.equal(futureMonth.startDateInput, "2026-07-01");
  assert.equal(futureMonth.endDateInput, "2026-07-31");
});

test("HQ monthly closing anomaly report store fallback message requires active fallback", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );

  assert.match(
    querySource,
    /normalizedStoreId\s*&&\s*!matchedStore\s*&&\s*selectedStore/s,
  );
});

test("HQ monthly closing anomaly report builds day statuses and anomaly evidence", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildMonthlyClosingAnomalyReportForTest } = await import(
    pathToFileURL(queryPath).href
  );
  const baseMetric = {
    label: "매출",
    kind: "money",
    original: { value: 100000, kind: "money" },
    applied: { value: 100000, kind: "money" },
    isCorrected: false,
    status: "original",
    statusLabel: "원본",
    unavailableReason: null,
    ledgerDetailHref: "/app/ledgers/ledger-1",
    correctionTimelineHref: null,
  };
  const correctedSalesDifference = {
    ...baseMetric,
    label: "매출 차이",
    isCorrected: true,
    status: "corrected",
    statusLabel: "정정 반영",
    correctionTimelineHref: "/app/ledgers/ledger-1#correction-timeline",
  };
  const correctedGrossMarginRate = {
    ...baseMetric,
    label: "이익률",
    kind: "percent",
    ledgerDetailHref: "/app/ledgers/ledger-5",
    isCorrected: true,
    status: "corrected",
    statusLabel: "정정 반영",
    correctionTimelineHref: "/app/ledgers/ledger-5#correction-timeline",
  };
  const metricEvidence = {
    salesAmount: baseMetric,
    grossMarginRate: { ...baseMetric, label: "이익률", kind: "percent" },
    salesDifference: correctedSalesDifference,
    loss: { ...baseMetric, label: "손실", kind: "boolean" },
  };
  const plainMetricEvidence = {
    salesAmount: baseMetric,
    grossMarginRate: { ...baseMetric, label: "이익률", kind: "percent" },
    salesDifference: { ...baseMetric, label: "매출 차이" },
    loss: { ...baseMetric, label: "손실", kind: "boolean" },
  };
  const inventorySignalMetricEvidence = {
    salesAmount: {
      ...baseMetric,
      ledgerDetailHref: "/app/ledgers/ledger-5",
    },
    grossMarginRate: correctedGrossMarginRate,
    salesDifference: {
      ...baseMetric,
      label: "매출 차이",
      ledgerDetailHref: "/app/ledgers/ledger-5",
    },
    loss: {
      ...baseMetric,
      label: "손실",
      kind: "boolean",
      ledgerDetailHref: "/app/ledgers/ledger-5",
    },
  };

  const report = buildMonthlyClosingAnomalyReportForTest({
    store: { id: "store-1", name: "테스트점" },
    monthInput: "2026-06",
    dateInputs: [
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
      "2026-06-06",
    ],
    ledgerSummaries: [
      {
        dateInput: "2026-06-01",
        ledgerId: "ledger-1",
        status: "HEADQUARTERS_CLOSED",
        signals: [
          {
            id: "sales-difference",
            label: "매출 차이 확인",
            severity: "warning",
            detail: "정정 반영 후에도 차이가 큽니다.",
          },
        ],
        metricEvidence,
        hasUnappliedCorrections: false,
      },
      {
        dateInput: "2026-06-02",
        ledgerId: "ledger-2",
        status: "IN_REVIEW",
        signals: [],
        metricEvidence: plainMetricEvidence,
        hasUnappliedCorrections: false,
      },
      {
        dateInput: "2026-06-03",
        ledgerId: "ledger-3",
        status: "IN_PROGRESS",
        signals: [],
        metricEvidence: plainMetricEvidence,
        hasUnappliedCorrections: false,
      },
      {
        dateInput: "2026-06-04",
        ledgerId: "ledger-4",
        status: "HOLIDAY",
        signals: [],
        metricEvidence: plainMetricEvidence,
        hasUnappliedCorrections: true,
      },
      {
        dateInput: "2026-06-05",
        ledgerId: "ledger-5",
        status: "HEADQUARTERS_CLOSED",
        signals: [
          {
            id: "inventory-difference-exceeded",
            label: "재고 이상",
            severity: "critical",
            detail: "재고 차이가 기준을 넘었습니다.",
          },
        ],
        metricEvidence: inventorySignalMetricEvidence,
        hasUnappliedCorrections: false,
      },
    ],
  });

  assert.equal(report.selectedStoreName, "테스트점");
  assert.equal(report.statusCounts.closedCount, 2);
  assert.equal(report.statusCounts.reviewCount, 1);
  assert.equal(report.statusCounts.inProgressCount, 1);
  assert.equal(report.statusCounts.holidayCount, 1);
  assert.equal(report.statusCounts.missingDayCount, 1);
  assert.equal(report.days.length, 6);
  assert.equal(report.days[0].ledgerDetailHref, "/app/ledgers/ledger-1");
  assert.equal(report.days[5].ledgerStatus.label, "미입력");
  assert.equal(report.days[5].ledgerDetailHref, null);
  assert.equal(report.anomalyItems.length, 3);
  assert.equal(report.anomalyItems[0].dateInput, "2026-06-01");
  assert.equal(report.anomalyItems[0].ledgerId, "ledger-1");
  assert.equal(
    report.anomalyItems[0].correctionTimelineHref,
    "/app/ledgers/ledger-1#correction-timeline",
  );
  const inventoryItem = report.anomalyItems.find(
    (item) => item.label === "재고 이상",
  );
  assert.ok(inventoryItem);
  assert.equal(inventoryItem.metricEvidence, null);

  const correctionItem = report.anomalyItems.find(
    (item) => item.label === "이익률 정정 반영",
  );
  assert.ok(correctionItem);
  assert.equal(correctionItem.ledgerId, "ledger-5");
  assert.equal(
    correctionItem.correctionTimelineHref,
    "/app/ledgers/ledger-5#correction-timeline",
  );
});

test("HQ monthly closing anomaly report builds monthly KPIs loss inventory flow and calculation days", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildMonthlyClosingAnomalyReportForTest } = await import(
    pathToFileURL(queryPath).href
  );
  const metric = (label, value, kind = "money", ledgerId = "ledger-1") => ({
    label,
    kind,
    original: { value, kind },
    applied: { value, kind },
    isCorrected: false,
    status: "original",
    statusLabel: "원본",
    unavailableReason: null,
    ledgerDetailHref: `/app/ledgers/${ledgerId}`,
    correctionTimelineHref: null,
  });
  const dailyMetricEvidence = (ledgerId) => ({
    salesAmount: metric("매출", 100000, "money", ledgerId),
    grossMarginRate: metric("이익률", 0.6, "percent", ledgerId),
    salesDifference: metric("매출 차이", 0, "money", ledgerId),
    loss: metric("손실", 0, "boolean", ledgerId),
  });
  const reviewMetrics = ({
    totalSales,
    grossProfit,
    grossMarginRate,
    operatingProfit,
    inventoryAmount,
  }) => ({
    totalSales: { value: totalSales },
    grossProfit: { value: grossProfit },
    grossMarginRate: { value: grossMarginRate },
    operatingProfit: { value: operatingProfit },
    productivity: { value: 0 },
    inventoryAmount: { value: inventoryAmount },
  });

  const report = buildMonthlyClosingAnomalyReportForTest({
    store: { id: "store-1", name: "테스트점" },
    monthInput: "2026-06",
    dateInputs: ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"],
    ledgerSummaries: [
      {
        dateInput: "2026-06-01",
        ledgerId: "ledger-1",
        status: "HEADQUARTERS_CLOSED",
        signals: [],
        metricEvidence: dailyMetricEvidence("ledger-1"),
        hasUnappliedCorrections: false,
        original: reviewMetrics({
          totalSales: 100000,
          grossProfit: 60000,
          grossMarginRate: 0.6,
          operatingProfit: 50000,
          inventoryAmount: 30000,
        }),
        applied: reviewMetrics({
          totalSales: 100000,
          grossProfit: 60000,
          grossMarginRate: 0.6,
          operatingProfit: 50000,
          inventoryAmount: 30000,
        }),
        workerCount: 2,
        originalWorkerCount: 2,
        lossItems: [
          {
            id: "loss-1",
            productId: "product-1",
            productName: "광어",
            lossTypeName: "폐기",
            quantity: 2,
            amount: 10000,
          },
          {
            id: "loss-2",
            productId: "product-2",
            productName: "우럭",
            lossTypeName: "",
            quantity: 1,
            amount: 4000,
          },
        ],
        inventoryItems: [
          {
            id: "inventory-1",
            productId: "product-1",
            productName: "광어",
            previousQuantity: 10,
            purchasedQuantity: 5,
            currentQuantity: 12,
            quantity: 12,
            unitPrice: 1000,
            inventoryAmount: null,
          },
        ],
        inventoryAdjustments: [
          { differenceQuantity: -1, differenceAmount: -1000 },
        ],
        appliedCorrectionKeys: new Set(),
        unappliedCorrectionKeys: new Set(),
      },
      {
        dateInput: "2026-06-02",
        ledgerId: "ledger-2",
        status: "IN_REVIEW",
        signals: [],
        metricEvidence: dailyMetricEvidence("ledger-2"),
        hasUnappliedCorrections: false,
        original: reviewMetrics({
          totalSales: 100000,
          grossProfit: 60000,
          grossMarginRate: 0.6,
          operatingProfit: 50000,
          inventoryAmount: 30000,
        }),
        applied: reviewMetrics({
          totalSales: 120000,
          grossProfit: 80000,
          grossMarginRate: 2 / 3,
          operatingProfit: 70000,
          inventoryAmount: 40000,
        }),
        workerCount: 2,
        originalWorkerCount: 2,
        lossItems: [
          {
            id: "loss-3",
            productId: "product-3",
            productName: "연어",
            lossTypeName: "떨이",
            quantity: 1,
            amount: 6000,
          },
        ],
        originalInventoryItems: [
          {
            id: "inventory-2",
            productId: "product-3",
            productName: "연어",
            previousQuantity: 20,
            purchasedQuantity: 0,
            currentQuantity: 8,
            quantity: 8,
            unitPrice: 2000,
            inventoryAmount: null,
          },
        ],
        inventoryItems: [
          {
            id: "inventory-2",
            productId: "product-3",
            productName: "연어",
            previousQuantity: 20,
            purchasedQuantity: 0,
            currentQuantity: 10,
            quantity: 10,
            unitPrice: 2000,
            inventoryAmount: null,
          },
        ],
        inventoryAdjustments: [
          { differenceQuantity: 2, differenceAmount: 4000 },
        ],
        appliedCorrectionKeys: new Set([
          "ledger-2:PAYMENT_FIELD:ledger-2:totalSalesAmount",
          "ledger-2:LOSS_ROW:loss-3:amount",
          "ledger-2:INVENTORY_ROW:inventory-2:currentQuantity",
        ]),
        unappliedCorrectionKeys: new Set(),
      },
      {
        dateInput: "2026-06-03",
        ledgerId: "ledger-3",
        status: "HOLIDAY",
        signals: [],
        metricEvidence: dailyMetricEvidence("ledger-3"),
        hasUnappliedCorrections: false,
        original: reviewMetrics({
          totalSales: 999999,
          grossProfit: 999999,
          grossMarginRate: 1,
          operatingProfit: 999999,
          inventoryAmount: 999999,
        }),
        applied: reviewMetrics({
          totalSales: 999999,
          grossProfit: 999999,
          grossMarginRate: 1,
          operatingProfit: 999999,
          inventoryAmount: 999999,
        }),
        workerCount: 0,
        lossItems: [
          {
            id: "loss-holiday",
            productId: "product-holiday",
            productName: "휴무품목",
            lossTypeName: "폐기",
            quantity: 99,
            amount: 999999,
          },
        ],
        inventoryItems: [],
        inventoryAdjustments: [],
        appliedCorrectionKeys: new Set(),
        unappliedCorrectionKeys: new Set(),
      },
    ],
  });

  assert.equal(report.monthlyKpis.salesAmount.value, 220000);
  assert.equal(report.monthlyKpis.grossProfit.value, 140000);
  assert.equal(report.monthlyKpis.operatingProfit.value, 120000);
  assert.equal(report.monthlyKpis.averageInventory.value, 35000);
  assert.equal(report.monthlyKpis.averageSales.value, 110000);
  assert.equal(
    Math.round(report.monthlyKpis.grossMarginRate.value * 1000),
    636,
  );
  assert.equal(
    Math.round(report.monthlyKpis.inventoryToSalesRatio.value * 1000),
    318,
  );
  assert.equal(
    report.monthlyKpis.metricEvidence.salesAmount.correctionTimelineHref,
    "/app/ledgers/ledger-2#correction-timeline",
  );
  assert.equal(report.monthlyLossSummary.totalQuantity, 4);
  assert.equal(report.monthlyLossSummary.totalAmount, 20000);
  assert.deepEqual(
    report.monthlyLossSummary.byType.map((item) => [
      item.lossTypeName,
      item.quantity,
      item.amount,
    ]),
    [
      ["폐기", 2, 10000],
      ["떨이", 1, 6000],
      ["유형 미지정", 1, 4000],
    ],
  );
  assert.equal(report.monthlyInventoryFlow.previousQuantity.value, 30);
  assert.equal(report.monthlyInventoryFlow.previousAmount.value, 50000);
  assert.equal(report.monthlyInventoryFlow.purchaseQuantity.value, 5);
  assert.equal(report.monthlyInventoryFlow.purchaseAmount.value, 5000);
  assert.equal(report.monthlyInventoryFlow.lossQuantity.value, 4);
  assert.equal(report.monthlyInventoryFlow.lossAmount.value, 20000);
  assert.equal(report.monthlyInventoryFlow.currentQuantity.value, 22);
  assert.equal(report.monthlyInventoryFlow.currentAmount.value, 32000);
  assert.equal(
    report.monthlyInventoryFlow.adjustmentDifferenceQuantity.value,
    1,
  );
  assert.equal(
    report.monthlyInventoryFlow.adjustmentDifferenceAmount.value,
    3000,
  );
  assert.equal(report.monthlyLossSummary.hasRecordedLoss, true);
  assert.equal(
    report.monthlyLossSummary.metricEvidence.totalAmount.correctionTimelineHref,
    "/app/ledgers/ledger-2#correction-timeline",
  );
  assert.equal(
    report.monthlyInventoryFlow.metricEvidence.currentAmount.ledgerDetailHref,
    "/app/ledgers/ledger-2",
  );
  assert.equal(report.topRevenueItem.status, "needs-review");
  assert.equal(report.topRevenueItem.statusLabel, "계산 기준 확인 필요");
  assert.deepEqual(
    report.calculationDays.map((day) => [
      day.dateInput,
      day.inclusion,
      day.reason,
    ]),
    [
      ["2026-06-01", "included", "장부 집계 포함"],
      ["2026-06-02", "included", "장부 집계 포함"],
      ["2026-06-03", "excluded", "휴무일"],
      ["2026-06-04", "excluded", "미입력"],
    ],
  );
});

test("HQ monthly closing anomaly report keeps zero amount losses visible", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildMonthlyClosingAnomalyReportForTest } = await import(
    pathToFileURL(queryPath).href
  );
  const metric = {
    label: "손실",
    kind: "boolean",
    original: { value: 0, kind: "boolean" },
    applied: { value: 0, kind: "boolean" },
    isCorrected: false,
    status: "zero",
    statusLabel: "0",
    unavailableReason: null,
    ledgerDetailHref: "/app/ledgers/ledger-zero-loss",
    correctionTimelineHref: null,
  };
  const report = buildMonthlyClosingAnomalyReportForTest({
    store: { id: "store-1", name: "테스트점" },
    monthInput: "2026-06",
    dateInputs: ["2026-06-01"],
    ledgerSummaries: [
      {
        dateInput: "2026-06-01",
        ledgerId: "ledger-zero-loss",
        status: "HEADQUARTERS_CLOSED",
        signals: [],
        metricEvidence: {
          salesAmount: metric,
          grossMarginRate: metric,
          salesDifference: metric,
          loss: metric,
        },
        hasUnappliedCorrections: false,
        original: {
          totalSales: { value: 1000 },
          grossProfit: { value: 1000 },
          grossMarginRate: { value: 1 },
          operatingProfit: { value: 1000 },
          productivity: { value: 1000 },
          inventoryAmount: { value: 1000 },
        },
        applied: {
          totalSales: { value: 1000 },
          grossProfit: { value: 1000 },
          grossMarginRate: { value: 1 },
          operatingProfit: { value: 1000 },
          productivity: { value: 1000 },
          inventoryAmount: { value: 1000 },
        },
        workerCount: 1,
        lossItems: [
          {
            id: "loss-zero",
            productId: "product-zero",
            productName: "광어",
            lossTypeName: "폐기",
            quantity: 3,
            amount: 0,
          },
        ],
        inventoryItems: [],
        inventoryAdjustments: [],
        appliedCorrectionKeys: new Set(),
        unappliedCorrectionKeys: new Set(),
      },
    ],
  });

  assert.equal(report.monthlyLossSummary.totalQuantity, 3);
  assert.equal(report.monthlyLossSummary.totalAmount, 0);
  assert.equal(report.monthlyLossSummary.hasRecordedLoss, true);
});

test("HQ monthly closing anomaly report marks inventory flow unavailable instead of zeroing invalid quantities", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildMonthlyClosingAnomalyReportForTest } = await import(
    pathToFileURL(queryPath).href
  );
  const metric = {
    label: "매출",
    kind: "money",
    original: { value: 1000, kind: "money" },
    applied: { value: 1000, kind: "money" },
    isCorrected: false,
    status: "original",
    statusLabel: "원본",
    unavailableReason: null,
    ledgerDetailHref: "/app/ledgers/ledger-invalid-inventory",
    correctionTimelineHref: null,
  };
  const report = buildMonthlyClosingAnomalyReportForTest({
    store: { id: "store-1", name: "테스트점" },
    monthInput: "2026-06",
    dateInputs: ["2026-06-01"],
    ledgerSummaries: [
      {
        dateInput: "2026-06-01",
        ledgerId: "ledger-invalid-inventory",
        status: "HEADQUARTERS_CLOSED",
        signals: [],
        metricEvidence: {
          salesAmount: metric,
          grossMarginRate: metric,
          salesDifference: metric,
          loss: metric,
        },
        hasUnappliedCorrections: false,
        original: {
          totalSales: { value: 1000 },
          grossProfit: { value: 1000 },
          grossMarginRate: { value: 1 },
          operatingProfit: { value: 1000 },
          productivity: { value: 1000 },
          inventoryAmount: { value: null, unavailableReason: "계산 불가" },
        },
        applied: {
          totalSales: { value: 1000 },
          grossProfit: { value: 1000 },
          grossMarginRate: { value: 1 },
          operatingProfit: { value: 1000 },
          productivity: { value: 1000 },
          inventoryAmount: { value: null, unavailableReason: "계산 불가" },
        },
        workerCount: 1,
        lossItems: [],
        inventoryItems: [
          {
            id: "inventory-invalid",
            productId: "product-invalid",
            productName: "광어",
            previousQuantity: 10,
            purchasedQuantity: 5,
            currentQuantity: null,
            quantity: null,
            unitPrice: 1000,
            inventoryAmount: null,
          },
        ],
        inventoryAdjustments: [],
        appliedCorrectionKeys: new Set(),
        unappliedCorrectionKeys: new Set(),
      },
    ],
  });

  assert.equal(report.monthlyInventoryFlow.currentQuantity.value, null);
  assert.equal(
    report.monthlyInventoryFlow.currentQuantity.unavailableReason,
    "계산 불가",
  );
  assert.equal(report.monthlyInventoryFlow.currentAmount.value, null);
  assert.equal(
    report.monthlyInventoryFlow.currentAmount.unavailableReason,
    "계산 불가",
  );
  assert.deepEqual(
    report.calculationDays.map((day) => [
      day.dateInput,
      day.inclusion,
      day.reason,
    ]),
    [["2026-06-01", "excluded", "재고 흐름 계산 불가"]],
  );
});

test("HQ monthly closing anomaly report marks inventory ratio unavailable when average sales is zero", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildMonthlyClosingAnomalyReportForTest } = await import(
    pathToFileURL(queryPath).href
  );
  const baseEvidence = {
    label: "매출",
    kind: "money",
    original: { value: 0, kind: "money" },
    applied: { value: 0, kind: "money" },
    isCorrected: false,
    status: "zero",
    statusLabel: "0",
    unavailableReason: null,
    ledgerDetailHref: "/app/ledgers/ledger-zero",
    correctionTimelineHref: null,
  };
  const metricEvidence = {
    salesAmount: baseEvidence,
    grossMarginRate: { ...baseEvidence, label: "이익률", kind: "percent" },
    salesDifference: { ...baseEvidence, label: "매출 차이" },
    loss: { ...baseEvidence, label: "손실", kind: "boolean" },
  };
  const report = buildMonthlyClosingAnomalyReportForTest({
    store: { id: "store-1", name: "테스트점" },
    monthInput: "2026-06",
    dateInputs: ["2026-06-01"],
    ledgerSummaries: [
      {
        dateInput: "2026-06-01",
        ledgerId: "ledger-zero",
        status: "HEADQUARTERS_CLOSED",
        signals: [],
        metricEvidence,
        hasUnappliedCorrections: false,
        original: {
          totalSales: { value: 0 },
          grossProfit: { value: 0 },
          grossMarginRate: { value: null, unavailableReason: "계산 불가" },
          operatingProfit: { value: 0 },
          productivity: { value: 0 },
          inventoryAmount: { value: 10000 },
        },
        applied: {
          totalSales: { value: 0 },
          grossProfit: { value: 0 },
          grossMarginRate: { value: null, unavailableReason: "계산 불가" },
          operatingProfit: { value: 0 },
          productivity: { value: 0 },
          inventoryAmount: { value: 10000 },
        },
        workerCount: 1,
        lossItems: [],
        inventoryItems: [],
        inventoryAdjustments: [],
        appliedCorrectionKeys: new Set(),
        unappliedCorrectionKeys: new Set(),
      },
    ],
  });

  assert.equal(report.monthlyKpis.averageSales.value, 0);
  assert.equal(report.monthlyKpis.inventoryToSalesRatio.value, null);
  assert.equal(
    report.monthlyKpis.inventoryToSalesRatio.unavailableReason,
    "계산 불가",
  );
});

test("HQ daily meeting report date helpers normalize KST operating dates", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const {
    getDailyMeetingReportDate,
    getDailyMeetingReportDateQuery,
    getDailyMeetingReportDatePreset,
  } = await import(pathToFileURL(queryPath).href);

  assert.equal(getDailyMeetingReportDatePreset("yesterday"), "yesterday");
  assert.equal(getDailyMeetingReportDatePreset("2026-05-31"), "custom");
  assert.equal(getDailyMeetingReportDateQuery("2026-05-31"), "2026-05-31");
  assert.equal(getDailyMeetingReportDateQuery("unknown"), "today");
  assert.equal(
    getDailyMeetingReportDate(
      "today",
      new Date("2026-06-01T16:00:00.000Z"),
    ).toISOString(),
    "2026-06-02T00:00:00.000Z",
  );
  assert.equal(
    getDailyMeetingReportDate(
      "yesterday",
      new Date("2026-06-01T16:00:00.000Z"),
    ).toISOString(),
    "2026-06-01T00:00:00.000Z",
  );
  assert.equal(
    getDailyMeetingReportDate(
      "2026-05-31",
      new Date("2026-06-01T16:00:00.000Z"),
    ).toISOString(),
    "2026-05-31T00:00:00.000Z",
  );
});

test("HQ store comparison report date range helper keeps valid URL state", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { getStoreComparisonReportDateRange, getStoreComparisonReportPath } =
    await import(pathToFileURL(queryPath).href);

  const range = getStoreComparisonReportDateRange({
    startDate: "2026-05-30",
    endDate: "2026-06-02",
  });

  assert.equal(range.startDateInput, "2026-05-30");
  assert.equal(range.endDateInput, "2026-06-02");
  assert.equal(range.errorMessage, null);
  assert.equal(
    getStoreComparisonReportPath(range),
    "/app/reports/comparison?startDate=2026-05-30&endDate=2026-06-02",
  );

  const reversed = getStoreComparisonReportDateRange({
    startDate: "2026-06-03",
    endDate: "2026-06-02",
  });

  assert.equal(reversed.startDateInput, "2026-06-02");
  assert.equal(reversed.endDateInput, "2026-06-02");
  assert.match(reversed.errorMessage, /시작일/);

  const missingEndDate = getStoreComparisonReportDateRange(
    {
      startDate: "2026-01-01",
    },
    new Date("2026-06-01T16:00:00.000Z"),
  );

  assert.equal(missingEndDate.startDateInput, "2026-05-27");
  assert.equal(missingEndDate.endDateInput, "2026-06-02");
  assert.match(missingEndDate.errorMessage, /기본 7일/);
});

test("HQ store comparison report aggregation distinguishes missing holiday zero and corrected values", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildStoreComparisonReportRowForTest } = await import(
    pathToFileURL(queryPath).href
  );

  const row = buildStoreComparisonReportRowForTest({
    store: { id: "store-1", name: "테스트점" },
    dateCount: 4,
    ledgerSummaries: [
      {
        ledgerId: "ledger-1",
        status: "HEADQUARTERS_CLOSED",
        original: {
          totalSales: { value: 300000 },
          grossProfit: { value: 120000 },
          grossMarginRate: { value: 0.4 },
          operatingProfit: { value: 90000 },
          productivity: { value: 150000 },
          inventoryAmount: { value: 60000 },
        },
        applied: {
          totalSales: { value: 450000 },
          grossProfit: { value: 180000 },
          grossMarginRate: { value: 0.4 },
          operatingProfit: { value: 150000 },
          productivity: { value: 225000 },
          inventoryAmount: { value: 60000 },
        },
        workerCount: 2,
        hasLoss: false,
        hasUnappliedCorrections: false,
        appliedCorrectionCount: 1,
        appliedCorrectionKeys: new Set([
          "ledger-1:PAYMENT_FIELD:ledger-1:totalSalesAmount",
        ]),
        unappliedCorrectionKeys: new Set(),
      },
      {
        ledgerId: "ledger-2",
        status: "HEADQUARTERS_CLOSED",
        original: {
          totalSales: { value: 0 },
          grossProfit: { value: 0 },
          grossMarginRate: { value: null, unavailableReason: "계산 불가" },
          operatingProfit: { value: 0 },
          productivity: { value: null, unavailableReason: "계산 불가" },
          inventoryAmount: { value: 40000 },
        },
        applied: {
          totalSales: { value: 0 },
          grossProfit: { value: 0 },
          grossMarginRate: { value: null, unavailableReason: "계산 불가" },
          operatingProfit: { value: 0 },
          productivity: { value: null, unavailableReason: "계산 불가" },
          inventoryAmount: { value: 40000 },
        },
        workerCount: 0,
        hasLoss: true,
        hasUnappliedCorrections: false,
        appliedCorrectionCount: 0,
        appliedCorrectionKeys: new Set(),
        unappliedCorrectionKeys: new Set(),
      },
      {
        ledgerId: "ledger-3",
        status: "HOLIDAY",
        original: {
          totalSales: { value: 0 },
          grossProfit: { value: 0 },
          grossMarginRate: { value: null, unavailableReason: "계산 불가" },
          operatingProfit: { value: 0 },
          productivity: { value: null, unavailableReason: "계산 불가" },
          inventoryAmount: { value: null, unavailableReason: "계산 불가" },
        },
        applied: {
          totalSales: { value: 0 },
          grossProfit: { value: 0 },
          grossMarginRate: { value: null, unavailableReason: "계산 불가" },
          operatingProfit: { value: 0 },
          productivity: { value: null, unavailableReason: "계산 불가" },
          inventoryAmount: { value: null, unavailableReason: "계산 불가" },
        },
        workerCount: null,
        hasLoss: false,
        hasUnappliedCorrections: true,
        appliedCorrectionCount: 0,
        appliedCorrectionKeys: new Set(),
        unappliedCorrectionKeys: new Set([
          "ledger-3:CALCULATED_METRIC:ledger-3:salesDifference",
        ]),
      },
    ],
  });

  assert.equal(row.storeName, "테스트점");
  assert.equal(row.statusCounts.missingDayCount, 1);
  assert.equal(row.statusCounts.closedCount, 2);
  assert.equal(row.statusCounts.holidayCount, 1);
  assert.equal(row.salesAmount.value, 450000);
  assert.equal(row.grossProfit.value, 180000);
  assert.equal(row.grossMarginRate.value, 0.4);
  assert.equal(row.operatingProfit.value, 150000);
  assert.equal(row.productivity.value, 225000);
  assert.equal(row.averageInventory.value, 50000);
  assert.equal(row.averageSales.value, 225000);
  assert.equal(row.inventoryToSalesRatio.value, 50000 / 225000);
  assert.equal(row.hasLoss, true);
  assert.equal(row.metricEvidence.salesAmount.isCorrected, true);
  assert.equal(row.metricEvidence.salesAmount.statusLabel, "정정 반영");
  assert.equal(row.metricEvidence.averageInventory.isCorrected, false);
  assert.equal(row.metricEvidence.averageInventory.statusLabel, "원본");
  assert.equal(row.metricEvidence.inventoryToSalesRatio.isCorrected, true);
  assert.equal(
    row.metricEvidence.inventoryToSalesRatio.statusLabel,
    "정정 반영",
  );
});

test("HQ store comparison report date range metric evidence uses the affected ledger", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildStoreComparisonReportRowForTest } = await import(
    pathToFileURL(queryPath).href
  );

  const row = buildStoreComparisonReportRowForTest({
    store: { id: "store-1", name: "테스트점" },
    dateCount: 2,
    ledgerSummaries: [
      {
        ledgerId: "ledger-1",
        status: "HEADQUARTERS_CLOSED",
        original: {
          totalSales: { value: 100000 },
          grossProfit: { value: 60000 },
          grossMarginRate: { value: 0.6 },
          operatingProfit: { value: 55000 },
          productivity: { value: 100000 },
          inventoryAmount: { value: 30000 },
        },
        applied: {
          totalSales: { value: 100000 },
          grossProfit: { value: 60000 },
          grossMarginRate: { value: 0.6 },
          operatingProfit: { value: 55000 },
          productivity: { value: 100000 },
          inventoryAmount: { value: 30000 },
        },
        workerCount: 1,
        hasLoss: false,
        hasUnappliedCorrections: false,
        appliedCorrectionCount: 0,
        appliedCorrectionKeys: new Set(),
        unappliedCorrectionKeys: new Set(),
      },
      {
        ledgerId: "ledger-2",
        status: "HEADQUARTERS_CLOSED",
        original: {
          totalSales: { value: 200000 },
          grossProfit: { value: 100000 },
          grossMarginRate: { value: 0.5 },
          operatingProfit: { value: 90000 },
          productivity: { value: 100000 },
          inventoryAmount: { value: 40000 },
        },
        applied: {
          totalSales: { value: 250000 },
          grossProfit: { value: 150000 },
          grossMarginRate: { value: 0.6 },
          operatingProfit: { value: 140000 },
          productivity: { value: 125000 },
          inventoryAmount: { value: 40000 },
        },
        workerCount: 2,
        hasLoss: false,
        hasUnappliedCorrections: false,
        appliedCorrectionCount: 1,
        appliedCorrectionKeys: new Set([
          "ledger-2:PAYMENT_FIELD:ledger-2:totalSalesAmount",
        ]),
        unappliedCorrectionKeys: new Set(),
      },
    ],
  });

  assert.equal(row.metricEvidence.salesAmount.isCorrected, true);
  assert.equal(
    row.metricEvidence.salesAmount.correctionTimelineHref,
    "/app/ledgers/ledger-2#correction-timeline",
  );
  assert.equal(row.metricEvidence.averageInventory.isCorrected, false);
  assert.equal(row.metricEvidence.averageInventory.statusLabel, "원본");
});

test("HQ store comparison report keeps data-insufficient aggregate states", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildStoreComparisonReportRowForTest } = await import(
    pathToFileURL(queryPath).href
  );

  const row = buildStoreComparisonReportRowForTest({
    store: { id: "store-1", name: "테스트점" },
    dateCount: 2,
    ledgerSummaries: [
      {
        ledgerId: "ledger-1",
        status: "HEADQUARTERS_CLOSED",
        original: {
          totalSales: { value: 100000 },
          grossProfit: { value: 60000 },
          grossMarginRate: { value: 0.6 },
          operatingProfit: { value: 50000 },
          productivity: { value: 100000 },
          inventoryAmount: { value: 30000 },
        },
        applied: {
          totalSales: { value: 100000 },
          grossProfit: { value: 60000 },
          grossMarginRate: { value: 0.6 },
          operatingProfit: { value: 50000 },
          productivity: { value: 100000 },
          inventoryAmount: { value: 30000 },
        },
        workerCount: 1,
        hasLoss: false,
        hasUnappliedCorrections: false,
        appliedCorrectionCount: 0,
        appliedCorrectionKeys: new Set(),
        unappliedCorrectionKeys: new Set(),
      },
      {
        ledgerId: "ledger-2",
        status: "IN_PROGRESS",
        original: {
          totalSales: { value: 200000 },
          grossProfit: { value: null, unavailableReason: "계산 불가" },
          grossMarginRate: { value: null, unavailableReason: "계산 불가" },
          operatingProfit: { value: null, unavailableReason: "계산 불가" },
          productivity: { value: null, unavailableReason: "계산 불가" },
          inventoryAmount: { value: null, unavailableReason: "계산 불가" },
        },
        applied: {
          totalSales: { value: 200000 },
          grossProfit: { value: null, unavailableReason: "계산 불가" },
          grossMarginRate: { value: null, unavailableReason: "계산 불가" },
          operatingProfit: { value: null, unavailableReason: "계산 불가" },
          productivity: { value: null, unavailableReason: "계산 불가" },
          inventoryAmount: { value: null, unavailableReason: "계산 불가" },
        },
        workerCount: null,
        hasLoss: false,
        hasUnappliedCorrections: false,
        appliedCorrectionCount: 0,
        appliedCorrectionKeys: new Set(),
        unappliedCorrectionKeys: new Set(),
      },
    ],
  });

  assert.equal(row.salesAmount.value, 300000);
  assert.equal(row.grossProfit.value, null);
  assert.equal(row.operatingProfit.value, null);
  assert.equal(row.productivity.value, null);
  assert.equal(row.averageInventory.value, null);
  assert.equal(row.inventoryToSalesRatio.value, null);
  assert.equal(row.metricEvidence.grossProfit.statusLabel, "데이터 부족");
});

test("HQ store comparison report loss evidence matches missing-ledger rows", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildStoreComparisonReportRowForTest } = await import(
    pathToFileURL(queryPath).href
  );

  const row = buildStoreComparisonReportRowForTest({
    store: { id: "store-1", name: "테스트점" },
    dateCount: 2,
    ledgerSummaries: [],
  });

  assert.equal(row.hasLoss, null);
  assert.equal(row.metricEvidence.loss.applied.value, null);
  assert.equal(row.metricEvidence.loss.statusLabel, "미입력");
});

test("HQ daily meeting report metric evidence distinguishes correction and calculation states", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildDailyMeetingReportMetricEvidence } = await import(
    pathToFileURL(queryPath).href
  );

  const corrected = buildDailyMeetingReportMetricEvidence({
    label: "매출",
    kind: "money",
    ledgerId: "ledger-1",
    ledgerStatus: "HEADQUARTERS_CLOSED",
    original: { value: 300000 },
    applied: { value: 45000 },
    correctionCount: 2,
    hasUnappliedCorrections: false,
  });

  assert.equal(corrected.status, "corrected");
  assert.equal(corrected.isCorrected, true);
  assert.equal(corrected.original.value, 300000);
  assert.equal(corrected.applied.value, 45000);
  assert.equal(
    corrected.correctionTimelineHref,
    "/app/ledgers/ledger-1#correction-timeline",
  );
  assert.equal(corrected.ledgerDetailHref, "/app/ledgers/ledger-1");

  const zero = buildDailyMeetingReportMetricEvidence({
    label: "매출",
    kind: "money",
    ledgerId: "ledger-2",
    ledgerStatus: "HEADQUARTERS_CLOSED",
    original: { value: 0 },
    applied: { value: 0 },
    correctionCount: 0,
    hasUnappliedCorrections: false,
  });

  assert.equal(zero.status, "zero");
  assert.equal(zero.statusLabel, "0");
  assert.equal(zero.isCorrected, false);

  const empty = buildDailyMeetingReportMetricEvidence({
    label: "매출",
    kind: "money",
    ledgerId: null,
    ledgerStatus: "EMPTY",
    original: { value: null, unavailableReason: "계산 불가" },
    applied: { value: null, unavailableReason: "계산 불가" },
    correctionCount: 0,
    hasUnappliedCorrections: false,
  });

  assert.equal(empty.status, "empty");
  assert.equal(empty.statusLabel, "미입력");
  assert.equal(empty.ledgerDetailHref, null);

  const holiday = buildDailyMeetingReportMetricEvidence({
    label: "매출",
    kind: "money",
    ledgerId: "ledger-3",
    ledgerStatus: "HOLIDAY",
    original: { value: 0 },
    applied: { value: 0 },
    correctionCount: 0,
    hasUnappliedCorrections: false,
  });

  assert.equal(holiday.status, "holiday");
  assert.equal(holiday.statusLabel, "휴무");

  const insufficient = buildDailyMeetingReportMetricEvidence({
    label: "이익률",
    kind: "percent",
    ledgerId: "ledger-4",
    ledgerStatus: "IN_PROGRESS",
    original: { value: null, unavailableReason: "계산 불가" },
    applied: { value: null, unavailableReason: "계산 불가" },
    correctionCount: 0,
    hasUnappliedCorrections: false,
  });

  assert.equal(insufficient.status, "data-insufficient");
  assert.equal(insufficient.statusLabel, "데이터 부족");
});

test("HQ daily meeting report metric evidence scopes correction states to the metric", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildDailyMeetingReportMetricEvidence } = await import(
    pathToFileURL(queryPath).href
  );

  const sameValueCorrection = buildDailyMeetingReportMetricEvidence({
    label: "매출",
    kind: "money",
    ledgerId: "ledger-1",
    ledgerStatus: "HEADQUARTERS_CLOSED",
    original: { value: 300000 },
    applied: { value: 300000 },
    correctionCount: 1,
    hasUnappliedCorrections: false,
  });

  assert.equal(sameValueCorrection.isCorrected, true);
  assert.equal(sameValueCorrection.status, "corrected");
  assert.equal(sameValueCorrection.statusLabel, "정정 반영");

  const unavailableToValueCorrection = buildDailyMeetingReportMetricEvidence({
    label: "이익률",
    kind: "percent",
    ledgerId: "ledger-2",
    ledgerStatus: "HEADQUARTERS_CLOSED",
    original: { value: null, unavailableReason: "계산 불가" },
    applied: { value: 0.25 },
    correctionCount: 1,
    hasUnappliedCorrections: false,
  });

  assert.equal(unavailableToValueCorrection.isCorrected, true);
  assert.equal(unavailableToValueCorrection.status, "corrected");

  const holidayNeedsReview = buildDailyMeetingReportMetricEvidence({
    label: "매출 차이",
    kind: "money",
    ledgerId: "ledger-3",
    ledgerStatus: "HOLIDAY",
    original: { value: 0 },
    applied: { value: 0 },
    correctionCount: 0,
    hasUnappliedCorrections: true,
  });

  assert.equal(holidayNeedsReview.status, "needs-review");
  assert.equal(holidayNeedsReview.statusLabel, "정정 확인 필요");
});
