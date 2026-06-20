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

test("HQ dashboard source files follow story 3.1 boundaries", () => {
  assertProjectFile("src", "features", "dashboard", "types.ts");
  assertProjectFile("src", "features", "dashboard", "queries.ts");
  assertProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "dashboard-status-badge.tsx",
  );
  assertProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "dashboard-signal-summary.tsx",
  );
  assertProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "hq-dashboard-table.tsx",
  );
  assertProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "dashboard-delayed-loading-notice.tsx",
  );
  assertProjectFile("src", "app", "app", "dashboard", "loading.tsx");

  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "dashboard",
    "page.tsx",
  );
  const tableSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "hq-dashboard-table.tsx",
  );
  const loadingSource = readProjectFile(
    "src",
    "app",
    "app",
    "dashboard",
    "loading.tsx",
  );
  assert.match(pageSource, /requireReportAccess\(/);
  assert.match(pageSource, /getHqDashboardRows\(/);
  assert.match(pageSource, /datePreset/);
  assert.doesNotMatch(pageSource, /overviewItems/);
  assert.match(tableSource, /본사 마감/);
  assert.match(tableSource, /overflow-x-auto/);
  assert.match(tableSource, /\/app\/ledgers\/\$\{row\.ledgerId\}/);
  assert.doesNotMatch(tableSource, /disabled[\s\S]*상세 준비 중/);
  assert.match(tableSource, /break-words/);
  assert.match(tableSource, /tabular-nums/);
  assert.match(tableSource, /useRouter/);
  assert.match(tableSource, /onKeyDown/);
  assert.match(tableSource, /tabIndex/);
  const detailPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );
  assert.match(detailPageSource, /requireReportAccess\(/);
  assert.match(detailPageSource, /getHqLedgerDetail\(/);
  assert.match(loadingSource, /md:block/);
  assert.match(loadingSource, /md:hidden/);
  assert.match(loadingSource, /repeat\(13/);
});

test("HQ ledger detail shows anomaly signal details as visible text", () => {
  const summarySource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "dashboard-signal-summary.tsx",
  );
  const detailPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );

  assert.match(summarySource, /showDetails/);
  assert.match(summarySource, /signal\.detail/);
  assert.match(detailPageSource, /showDetails/);
});

test("HQ dashboard query keeps 미입력 rows and avoids creating ledgers", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );

  assert.match(querySource, /export\s+async\s+function\s+getHqDashboardRows/);
  assert.match(querySource, /requireReportAccess\(\)/);
  assert.match(querySource, /getHeadquartersStoreScope\(\)/);
  assert.match(querySource, /storeScope\.stores/);
  assert.match(querySource, /dailyLedger\.findMany\(/);
  assert.match(querySource, /storeId:\s*\{\s*in:/s);
  assert.match(querySource, /closingDate/);
  assert.match(querySource, /calculateLedgerReviewSummary/);
  assert.match(querySource, /evaluateRevenueAnomalySignals/);
  assert.match(querySource, /evaluateInventoryLossAnomalySignals/);
  assert.match(querySource, /ledgerInventoryItems:\s*\{\s*select:\s*\{/s);
  assert.match(querySource, /previousQuantity:\s*true/);
  assert.match(querySource, /purchasedQuantity:\s*true/);
  assert.match(querySource, /currentQuantity:\s*true/);
  assert.match(querySource, /unitPrice:\s*true/);
  assert.match(querySource, /ledgerInventoryAdjustments:\s*\{\s*select:\s*\{/s);
  assert.match(querySource, /ledgerExpenses:\s*\{\s*select:\s*\{/s);
  assert.match(querySource, /expenseTotal:\s*calculateExpenseTotal/);
  assert.doesNotMatch(querySource, /expenseTotal:\s*0/);
  assert.match(querySource, /differenceQuantity:\s*true/);
  assert.match(querySource, /differenceAmount:\s*true/);
  assert.match(querySource, /ledgerLossItems:\s*\{\s*select:\s*\{/s);
  assert.match(querySource, /amount:\s*true/);
  assert.match(querySource, /quantity:\s*true/);
  assert.match(querySource, /productName:\s*true/);
  assert.match(
    querySource,
    /_count:\s*\{\s*select:\s*\{\s*ledgerLossItems:\s*true/s,
  );
  assert.doesNotMatch(querySource, /ledgerInventoryItems:\s*true/);
  assert.doesNotMatch(querySource, /ledgerInventoryAdjustments:\s*true/);
  assert.doesNotMatch(querySource, /getTodayStoreLedger(?:InTx)?\(/);
  assert.doesNotMatch(querySource, /export\s+async\s+function\s+(GET|POST)/);
});

test("HQ dashboard query uses correction-applied server calculations by default", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );
  const ledgerCalculationSource = readProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );

  assert.match(querySource, /getLatestCorrectionValuesForLedgers/);
  assert.match(querySource, /applyCorrectionValuesToLedgerReviewInput/);
  assert.match(querySource, /correctionState/);
  assert.match(querySource, /정정 확인 필요/);
  assert.match(
    ledgerCalculationSource,
    /applyCorrectionValuesToLedgerReviewInput/,
  );
  assert.match(ledgerCalculationSource, /hasUnappliedCorrections/);
  assert.match(ledgerCalculationSource, /PAYMENT_FIELD/);
  assert.match(ledgerCalculationSource, /LOSS_ROW/);
  assert.match(ledgerCalculationSource, /INVENTORY_ROW/);
  assert.match(ledgerCalculationSource, /EXPENSE_ROW/);
  assert.match(querySource, /toCorrectedInventoryAdjustments/);
});

test("HQ dashboard required-input signals use correction-applied required values", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );
  const missingItemBlocks = [
    ...querySource.matchAll(
      /const missingItems = getLedgerReviewMissingItems\(\{[\s\S]*?^\s*\}\);/gm,
    ),
  ].map(([block]) => block);

  assert.ok(
    missingItemBlocks.length >= 2,
    "expected dashboard row and detail missing item checks",
  );

  for (const block of missingItemBlocks) {
    assert.match(
      block,
      /totalSalesAmount:\s*correctionOverlay\.reviewInput\.totalSalesAmount/,
    );
    assert.match(
      block,
      /paymentTotal:\s*calculatePaymentTotal\(\s*correctionOverlay\.reviewInput\.cashAmount,\s*correctionOverlay\.reviewInput\.cardAmount,\s*correctionOverlay\.reviewInput\.otherPaymentAmount,\s*\)/,
    );
    assert.match(
      block,
      /workerCount:\s*correctionOverlay\.reviewInput\.workerCount/,
    );
    assert.doesNotMatch(block, /totalSalesAmount:\s*ledger\.totalSalesAmount/);
    assert.doesNotMatch(block, /workerCount:\s*ledger\.workerCount/);
  }
});

test("HQ dashboard row contract exposes story 4.1 operational fields", () => {
  const typeSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "types.ts",
  );
  const querySource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );
  const tableSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "hq-dashboard-table.tsx",
  );

  for (const field of [
    "businessStatus",
    "ledgerStatus",
    "isHeadquartersClosed",
    "latestReflectedAt",
    "lastModifiedBy",
    "salesAmount",
    "grossMarginRate",
    "salesDifference",
    "hasLoss",
    "correctionState",
    "signals",
  ]) {
    assert.match(typeSource, new RegExp(`${field}:`));
  }

  assert.match(
    querySource,
    /latestReflectedAt:\s*getLatestReflectedAt\(ledger\.updatedAt,\s*corrections\)/,
  );
  assert.match(querySource, /Date\.parse\(correction\.createdAt\)/);
  assert.match(tableSource, /최신 반영/);
  assert.match(tableSource, /마지막 수정자/);
  assert.doesNotMatch(typeSource, /can(Edit|Close|Correct|Mutate)|actions?:/);
  assert.doesNotMatch(querySource, /hasActionPermission/);
});

test("HQ dashboard keeps anomaly math out of UI components", () => {
  const tableSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "hq-dashboard-table.tsx",
  );

  assert.doesNotMatch(tableSource, /salesDropRateBps/);
  assert.doesNotMatch(tableSource, /grossMarginDropBps/);
  assert.doesNotMatch(tableSource, /salesDifferenceAmount/);
  assert.doesNotMatch(tableSource, /lossAmount/);
  assert.doesNotMatch(tableSource, /inventoryDifferenceQuantity/);
  assert.doesNotMatch(tableSource, /baselineSales/);
});

test("HQ dashboard e2e setup clears story 3.2 threshold state before asserting pending signals", () => {
  const specSource = readProjectFile("tests", "e2e", "hq-dashboard.spec.ts");

  assert.match(specSource, /anomalyThresholdSetting\.deleteMany/);
  assert.match(specSource, /targetType:\s*"AnomalyThresholdSetting"/);
});

test("HQ dashboard status and date helpers map story states", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );
  const { getDashboardDate, getDashboardDatePreset, mapDashboardLedgerStatus } =
    await import(pathToFileURL(queryPath).href);

  assert.equal(getDashboardDatePreset("yesterday"), "yesterday");
  assert.equal(getDashboardDatePreset("tomorrow"), "today");

  const today = getDashboardDate("today", new Date("2026-05-31T12:00:00Z"));
  const yesterday = getDashboardDate(
    "yesterday",
    new Date("2026-05-31T12:00:00Z"),
  );
  assert.equal(today.toISOString(), "2026-05-31T00:00:00.000Z");
  assert.equal(yesterday.toISOString(), "2026-05-30T00:00:00.000Z");

  assert.deepEqual(mapDashboardLedgerStatus(null), {
    key: "EMPTY",
    label: "미입력",
  });
  assert.deepEqual(mapDashboardLedgerStatus("IN_PROGRESS"), {
    key: "IN_PROGRESS",
    label: "입력중",
  });
  assert.deepEqual(mapDashboardLedgerStatus("IN_REVIEW"), {
    key: "IN_REVIEW",
    label: "검토대기",
  });
  assert.deepEqual(mapDashboardLedgerStatus("HEADQUARTERS_CLOSED"), {
    key: "HEADQUARTERS_CLOSED",
    label: "본사마감",
  });
  assert.deepEqual(mapDashboardLedgerStatus("HOLIDAY"), {
    key: "HOLIDAY",
    label: "휴무",
  });
});

test("HQ dashboard priority presentation orders problem rows first", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );
  const {
    applyDashboardPresentation,
    getDashboardFilterMode,
    getDashboardSortMode,
  } = await import(pathToFileURL(queryPath).href);
  const rows = [
    makeDashboardRow({
      storeId: "normal",
      storeName: "정상점",
      ledgerStatus: { key: "HEADQUARTERS_CLOSED", label: "본사마감" },
      isHeadquartersClosed: true,
    }),
    makeDashboardRow({
      storeId: "warning",
      storeName: "경고점",
      signals: [{ id: "sales", label: "매출 급락", severity: "warning" }],
    }),
    makeDashboardRow({
      storeId: "critical",
      storeName: "심각점",
      signals: [{ id: "loss", label: "손실 이상", severity: "critical" }],
    }),
    makeDashboardRow({
      storeId: "review",
      storeName: "검토점",
      ledgerStatus: { key: "IN_REVIEW", label: "검토대기" },
    }),
    makeDashboardRow({
      storeId: "empty",
      storeName: "미입력점",
      ledgerStatus: { key: "EMPTY", label: "미입력" },
      ledgerId: null,
    }),
  ];

  assert.equal(getDashboardSortMode("bad-value"), "priority");
  assert.equal(getDashboardFilterMode("bad-value"), "all");

  const presented = applyDashboardPresentation(rows, {
    sortMode: "priority",
    filterMode: "all",
  });
  assert.deepEqual(
    presented.map((row) => row.storeId),
    ["critical", "warning", "review", "empty", "normal"],
  );
  assert.deepEqual(
    presented.map((row) => row.priority.label),
    ["심각 이상", "경고 이상", "검토대기", "미입력", "정상"],
  );
  assert.deepEqual(
    applyDashboardPresentation(rows, {
      sortMode: "priority",
      filterMode: "needs-attention",
    }).map((row) => row.storeId),
    ["critical", "warning", "review", "empty"],
  );
});

test("HQ dashboard keeps calculation and policy states as distinct info signals", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );
  const { getDashboardSignals } = await import(pathToFileURL(queryPath).href);

  const signals = getDashboardSignals({
    thresholdSettings: {
      marginRateBps: 3500,
      inventoryDifferenceQuantity: 10,
    },
    revenueCurrent: {
      totalSales: {
        value: null,
        status: "data-insufficient",
        reason: "총매출 입력이 없습니다.",
      },
      grossMarginRate: {
        value: null,
        status: "calculation-unavailable",
        reason: "마진율 계산 중 오류가 발생했습니다.",
      },
      salesDifference: {
        value: null,
        status: "policy-unconfirmed",
        unavailableReason: "계산 기준 확인 필요",
        reason: "OQ-1 매출차액 기준이 확정되지 않았습니다.",
      },
    },
    inventoryLossCurrent: {
      inventoryItems: [],
      inventoryAdjustments: [],
      lossItems: [],
    },
    missingItems: [
      {
        id: "sales",
        label: "총매출/결제",
        status: "missing",
        detail: "총매출과 결제 금액이 아직 입력되지 않았습니다.",
        href: "/app/store-entry",
      },
    ],
    evaluateRevenueAnomalySignals: () => [],
    evaluateInventoryLossAnomalySignals: () => [],
  });

  assert.deepEqual(
    signals.map(({ id, label, severity }) => ({ id, label, severity })),
    [
      {
        id: "required-input-sales",
        label: "필수 누락",
        severity: "info",
      },
      {
        id: "calculation-totalSales-data-insufficient",
        label: "데이터 부족",
        severity: "info",
      },
      {
        id: "calculation-grossMarginRate-calculation-unavailable",
        label: "계산 불가",
        severity: "info",
      },
      {
        id: "calculation-salesDifference-policy-unconfirmed",
        label: "기준 확인 필요",
        severity: "info",
      },
    ],
  );
  assert.match(signals[0].detail, /총매출\/결제/);
  assert.match(signals[1].detail, /총매출 입력이 없습니다/);
  assert.match(signals[2].detail, /마진율 계산 중 오류/);
  assert.match(signals[3].detail, /OQ-1 매출차액 기준/);
});

test("HQ dashboard keeps policy-unconfirmed revenue metrics out of threshold anomaly evaluation", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );
  const anomalyPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "anomaly.ts",
  );
  const { getDashboardSignals } = await import(pathToFileURL(queryPath).href);
  const { evaluateRevenueAnomalySignals } = await import(
    pathToFileURL(anomalyPath).href
  );

  const signals = getDashboardSignals({
    thresholdSettings: {
      marginRateBps: 3500,
      inventoryDifferenceQuantity: 10,
    },
    revenueCurrent: {
      totalSales: { value: 100000, status: "ok" },
      grossMarginRate: {
        value: null,
        status: "policy-unconfirmed",
        unavailableReason: "계산 기준 확인 필요",
        reason: "OQ-2 마진률 판정 기준 확인이 필요합니다.",
      },
      salesDifference: {
        value: null,
        status: "policy-unconfirmed",
        unavailableReason: "계산 기준 확인 필요",
        reason: "OQ-1 매출차액 기준이 확정되지 않았습니다.",
      },
    },
    inventoryLossCurrent: {
      inventoryItems: [],
      inventoryAdjustments: [],
      lossItems: [],
    },
    evaluateRevenueAnomalySignals,
    evaluateInventoryLossAnomalySignals: () => [],
  });

  assert.deepEqual(
    signals.map(({ id, label, severity }) => ({ id, label, severity })),
    [
      {
        id: "calculation-grossMarginRate-policy-unconfirmed",
        label: "기준 확인 필요",
        severity: "info",
      },
      {
        id: "calculation-salesDifference-policy-unconfirmed",
        label: "기준 확인 필요",
        severity: "info",
      },
    ],
  );
  assert.ok(
    signals.every(
      (signal) =>
        signal.id !== "margin-rate-unavailable" &&
        signal.id !== "margin-rate-below-threshold",
    ),
  );
});

test("HQ dashboard downgrades OQ-gated threshold anomalies until policy is confirmed", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );
  const { applyDashboardPresentation, getDashboardSignals } = await import(
    pathToFileURL(queryPath).href
  );

  const signals = getDashboardSignals({
    thresholdSettings: {
      marginRateBps: 3500,
      inventoryDifferenceQuantity: 10,
    },
    revenueCurrent: {
      totalSales: { value: 100000, status: "ok" },
      grossMarginRate: { value: 0.2, status: "ok" },
      salesDifference: { value: 25000, status: "ok" },
    },
    inventoryLossCurrent: {
      inventoryItems: [
        {
          productName: "광어",
          previousQuantity: 20,
          purchasedQuantity: 0,
          currentQuantity: 1,
          quantity: 1,
          unitPrice: 1000,
        },
      ],
      inventoryAdjustments: [
        {
          productName: "광어",
          differenceQuantity: -19,
          differenceAmount: -19000,
          reason: "실사",
        },
      ],
      lossItems: [
        {
          productId: "product-1",
          productName: "광어",
          quantity: 60,
          amount: 60000,
        },
      ],
    },
    evaluateRevenueAnomalySignals: () => [],
    evaluateInventoryLossAnomalySignals: () => [
      {
        id: "inventory-difference-exceeded",
        label: "재고 이상",
        severity: "critical",
        detail: "재고 차이 19개",
      },
    ],
  });

  assert.deepEqual(
    signals.map(({ id, label, severity }) => ({ id, label, severity })),
    [
      {
        id: "inventory-policy-required",
        label: "재고 기준 확인",
        severity: "info",
      },
    ],
  );
  assert.ok(signals.every((signal) => signal.severity === "info"));
  assert.ok(
    signals.every(
      (signal) =>
        !/초과|급락|이상/.test(signal.label) &&
        /OQ-|정책|기준/.test(signal.detail ?? ""),
    ),
  );

  const [row] = applyDashboardPresentation(
    [
      makeDashboardRow({
        storeId: "policy",
        storeName: "정책확인점",
        signals,
      }),
    ],
    { sortMode: "priority", filterMode: "needs-attention" },
  );
  assert.equal(row.priority.label, "확인 필요");
  assert.deepEqual(row.priority.reasons, ["재고 기준 확인"]);
});

test("HQ dashboard treats inactive anomaly thresholds as policy-required info state", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );
  const anomalyPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "anomaly.ts",
  );
  const { getDashboardSignals } = await import(pathToFileURL(queryPath).href);
  const {
    evaluateInventoryLossAnomalySignals,
    evaluateRevenueAnomalySignals,
    normalizeAnomalyThresholdSignalSettings,
  } = await import(pathToFileURL(anomalyPath).href);

  const thresholdSettings = normalizeAnomalyThresholdSignalSettings({
    marginRateBps: 3500,
    inventoryDifferenceQuantity: 10,
    isActive: false,
  });
  const signals = getDashboardSignals({
    thresholdSettings,
    revenueCurrent: {
      totalSales: { value: 100000, status: "ok" },
      grossMarginRate: { value: 0.2, status: "ok" },
      salesDifference: { value: 25000, status: "ok" },
    },
    inventoryLossCurrent: {
      inventoryItems: [],
      inventoryAdjustments: [],
      lossItems: [],
    },
    evaluateRevenueAnomalySignals,
    evaluateInventoryLossAnomalySignals,
  });

  assert.equal(thresholdSettings, null);
  assert.deepEqual(signals, [
    {
      id: "thresholds-pending",
      label: "기준값 설정 전",
      severity: "info",
      detail: "기준값 기반 이상 신호는 기준값 저장 후 계산합니다.",
    },
  ]);
});

test("Dashboard signal chips expose text, icon, title, and aria labels", () => {
  const summarySource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "dashboard-signal-summary.tsx",
  );

  assert.match(summarySource, /InfoIcon/);
  assert.match(summarySource, /TriangleAlertIcon/);
  assert.match(summarySource, /CircleAlertIcon/);
  assert.match(summarySource, /aria-label=\{getSignalAccessibilityLabel/);
  assert.match(summarySource, /title=\{signal\.detail/);
  assert.match(summarySource, /signal\.label/);
  assert.match(summarySource, /signal\.detail/);
  assert.match(summarySource, /flex-wrap/);
  assert.match(summarySource, /break-words/);
});

test("HQ dashboard summary stays based on all active stores when rows are filtered", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );
  const { applyDashboardPresentation, summarizeDashboardRows } = await import(
    pathToFileURL(queryPath).href
  );
  const rows = [
    makeDashboardRow({
      storeId: "normal",
      storeName: "정상점",
      ledgerStatus: { key: "HEADQUARTERS_CLOSED", label: "본사마감" },
      isHeadquartersClosed: true,
    }),
    makeDashboardRow({
      storeId: "warning",
      storeName: "경고점",
      signals: [{ id: "sales", label: "매출 급락", severity: "warning" }],
    }),
    makeDashboardRow({
      storeId: "empty",
      storeName: "미입력점",
      ledgerStatus: { key: "EMPTY", label: "미입력" },
      ledgerId: null,
    }),
  ];

  assert.equal(typeof summarizeDashboardRows, "function");

  const allRows = applyDashboardPresentation(rows, {
    sortMode: "priority",
    filterMode: "all",
  });
  const filteredRows = applyDashboardPresentation(rows, {
    sortMode: "priority",
    filterMode: "needs-attention",
  });

  assert.deepEqual(
    filteredRows.map((row) => row.storeId),
    ["warning", "empty"],
  );
  assert.deepEqual(summarizeDashboardRows(allRows), {
    totalStores: 3,
    closedCount: 1,
    reviewCount: 0,
    emptyCount: 1,
    lossCount: 0,
  });
});

test("HQ dashboard distinguishes filtered-empty rows from no active stores", () => {
  const tableSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "hq-dashboard-table.tsx",
  );

  assert.match(tableSource, /dashboard\.summary\.totalStores === 0/);
  assert.match(tableSource, /조건에 맞는 지점이 없습니다/);
  assert.match(tableSource, /권한이 부여된 활성 지점이 없습니다/);
  assert.match(tableSource, /활성 지점이 없습니다/);
  assert.match(tableSource, /emptyStateReason/);
});

test("HQ dashboard loading copy stays distinct from business empty states", () => {
  const loadingSource = readProjectFile(
    "src",
    "app",
    "app",
    "dashboard",
    "loading.tsx",
  );
  const delayedLoadingSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "dashboard-delayed-loading-notice.tsx",
  );

  assert.match(loadingSource, /활성 지점 장부 상태를 불러오는 중입니다/);
  assert.match(loadingSource, /관제판 요약 불러오기/);
  assert.match(loadingSource, /관제판 지점 목록 불러오기/);
  assert.match(loadingSource, /DashboardDelayedLoadingNotice/);
  assert.match(delayedLoadingSource, /3000/);
  assert.match(delayedLoadingSource, /부분 로드/);
  assert.match(delayedLoadingSource, /마지막 갱신 시각/);
  assert.match(delayedLoadingSource, /router\.refresh\(\)/);
  assert.match(delayedLoadingSource, /재시도/);
  assert.doesNotMatch(loadingSource, /조건에 맞는 지점이 없습니다/);
  assert.doesNotMatch(loadingSource, /권한이 부여된 활성 지점이 없습니다/);
  assert.doesNotMatch(loadingSource, /활성 지점이 없습니다/);
});

test("HQ dashboard preserves sort and filter state through detail links", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "dashboard",
    "page.tsx",
  );
  const tableSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "hq-dashboard-table.tsx",
  );
  const detailPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );

  assert.match(pageSource, /sort\?: string \| string\[\]/);
  assert.match(pageSource, /filter\?: string \| string\[\]/);
  assert.match(tableSource, /date=.*sort=.*filter=/s);
  assert.match(detailPageSource, /searchParams/);
  assert.match(detailPageSource, /getDashboardPath/);
});

test("HQ dashboard desktop table supports persisted column resizing", () => {
  const tableSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "hq-dashboard-table.tsx",
  );

  assert.match(tableSource, /dashboardColumnWidthsStorageKey/);
  assert.match(tableSource, /dashboardColumnWidthConfig/);
  assert.match(
    tableSource,
    /localStorage\.getItem\(\s*dashboardColumnWidthsStorageKey/s,
  );
  assert.match(
    tableSource,
    /localStorage\.setItem\(\s*dashboardColumnWidthsStorageKey/s,
  );
  assert.match(tableSource, /startColumnResize/);
  assert.match(tableSource, /onPointerDown/);
  assert.match(tableSource, /handleColumnResizeKeyDown/);
  assert.match(tableSource, /role="separator"/);
  assert.match(tableSource, /aria-orientation="vertical"/);
  assert.match(tableSource, /aria-valuemin=\{column\.minWidth\}/);
  assert.match(tableSource, /aria-valuemax=\{column\.maxWidth\}/);
  assert.match(tableSource, /aria-valuenow=\{columnWidths\[column\.id\]\}/);
  assert.match(
    tableSource,
    /aria-label=\{`\$\{column\.label\} 컬럼 폭 조절`\}/,
  );
  assert.match(tableSource, /컬럼 폭 초기화/);
  assert.match(
    tableSource,
    /data-testid=\{`hq-dashboard-column-header-\$\{column\.id\}`\}/,
  );
  assert.match(
    tableSource,
    /data-testid=\{`hq-dashboard-column-resizer-\$\{column\.id\}`\}/,
  );
  assert.match(tableSource, /md:hidden/);
});

test("HQ dashboard auto-refreshes on an operational interval with status feedback", () => {
  const tableSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "hq-dashboard-table.tsx",
  );

  assert.match(tableSource, /dashboardRefreshIntervalMs\s*=\s*30_000/);
  assert.match(
    tableSource,
    /window\.setInterval\(\s*triggerDashboardRefresh,\s*dashboardRefreshIntervalMs/s,
  );
  assert.match(tableSource, /window\.clearInterval\(intervalId\)/);
  assert.match(tableSource, /router\.refresh\(\)/);
  assert.match(tableSource, /hq-dashboard-refresh-status/);
  assert.match(tableSource, /갱신 중/);
  assert.match(tableSource, /마지막 갱신/);
  assert.match(tableSource, /갱신 실패/);
});

test("HQ ledger detail supports direct navigation to the purchases tab", () => {
  const detailPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );

  assert.match(detailPageSource, /tab\?: string \| string\[\]/);
  assert.match(detailPageSource, /const ledgerDetailTabs = \[/);
  assert.match(detailPageSource, /query\.tab/);
  assert.match(detailPageSource, /selectedTab/);
  assert.match(detailPageSource, /ledgerDetailTabs\.includes/);
  assert.match(
    detailPageSource,
    /<Tabs defaultValue=\{selectedTab\} className="w-full">/,
  );
});

test("store manager closed ledger view exposes read-only correction values and history", () => {
  const storeEntrySource = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "page.tsx",
  );

  assert.match(storeEntrySource, /getStoreReadableCorrectionRecordsForLedger/);
  assert.match(storeEntrySource, /CorrectionReadonlySummary/);
  assert.match(storeEntrySource, /status === "HEADQUARTERS_CLOSED"/);
});

test("store manager paths do not reuse HQ dashboard row shape or sensitive dashboard fields", () => {
  const storeEntrySource = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "page.tsx",
  );
  const ledgerReviewResponseSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "response-shaping.ts",
  );
  const ledgerReviewTypesSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-types.ts",
  );
  const inventoryTypesSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "types.ts",
  );

  assert.doesNotMatch(storeEntrySource, /getHqDashboardRows|getHqLedgerDetail/);
  assert.doesNotMatch(storeEntrySource, /HqDashboardRow/);
  assert.match(
    ledgerReviewResponseSource,
    /toStoreManagerLedgerReviewStepData/,
  );
  assert.doesNotMatch(
    ledgerReviewTypesSource,
    /StoreManagerLedgerReviewStepData[\s\S]*HqDashboardRow/s,
  );
  assert.match(
    ledgerReviewTypesSource,
    /StoreManagerLedgerReviewSummary\s*=\s*Pick<[\s\S]*"totalSales"\s*\|\s*"paymentDifference"/s,
  );
  assert.match(
    ledgerReviewResponseSource,
    /const\s+storeManagerReviewMetricIds/,
  );
  assert.doesNotMatch(
    ledgerReviewResponseSource,
    /storeManagerReviewMetricIds[\s\S]*grossMarginRate|storeManagerReviewMetricIds[\s\S]*inventoryAmount|storeManagerReviewMetricIds[\s\S]*salesDifference/s,
  );
  assert.match(
    ledgerReviewResponseSource,
    /const\s+signals\s*=\s*data\.signals\.map\(\(\{\s*amount,\s*\.\.\.signal\s*\}/s,
  );
  assert.match(
    inventoryTypesSource,
    /StoreManagerInventoryAdjustmentView\s*=\s*Omit<[\s\S]*"beforeAmount"\s*\|\s*"afterAmount"\s*\|\s*"differenceAmount"/s,
  );
  assert.match(
    inventoryTypesSource,
    /StoreManagerInventoryStepLine\s*=\s*Omit<[\s\S]*"unitPrice"[\s\S]*"purchaseAmount"[\s\S]*"lossAmount"[\s\S]*"inventoryAmount"/s,
  );
});

function makeDashboardRow(overrides = {}) {
  return {
    storeId: "store",
    storeName: "지점",
    ledgerId: "ledger",
    closingDate: "2026-06-01T00:00:00.000Z",
    businessStatus: { key: "OPEN", label: "영업일" },
    ledgerStatus: { key: "HEADQUARTERS_CLOSED", label: "본사마감" },
    salesAmount: { value: 1000 },
    grossMarginRate: { value: 0.3 },
    salesDifference: { value: 0 },
    hasLoss: false,
    lastModifiedBy: null,
    lastModifiedAt: null,
    isHeadquartersClosed: false,
    signals: [],
    ...overrides,
  };
}
