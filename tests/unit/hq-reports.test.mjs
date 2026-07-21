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

test("HQ daily meeting report source files follow story 6.1 boundaries", () => {
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
  const reportsNavSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "reports-nav.tsx",
  );

  assert.match(pageSource, /requireReportAccess\(/);
  assert.match(pageSource, /getHqDailyMeetingReport\(/);
  assert.match(pageSource, /DailyMeetingReportTable/);
  assert.match(pageSource, /아침 회의 리포트/);
  assert.match(loadingSource, /Skeleton/);
  assert.match(loadingSource, /md:block/);
  assert.match(loadingSource, /md:hidden/);
  assert.match(sidebarSource, /href:\s*"\/app\/reports\/daily"/);
  assert.match(reportsNavSource, /href:\s*"\/app\/reports\/overview"/);
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
  assert.match(
    querySource,
    /closingDate:\s*\{\s*in:\s*\[closingDate,\s*previousClosingDate\]\s*\}/,
  );
  assert.match(querySource, /getLatestCorrectionValuesForLedgers/);
  assert.match(querySource, /latestReflectedAt/);
  assert.match(querySource, /getLatestReflectedAt/);
  assert.match(querySource, /applyCorrectionValuesToLedgerReviewInput/);
  assert.match(querySource, /calculateLedgerReviewSummary/);
  assert.match(querySource, /function\s+buildDailyMeetingPlannedSalesItems/);
  assert.match(querySource, /plannedSalesItemsByLedgerId/);
  assert.match(
    querySource,
    /plannedSalesItems:\s*ledger\s*\?\s*plannedSalesItemsByLedgerId\.get\(ledger\.id\)\s*:\s*undefined/s,
  );
  assert.match(
    querySource,
    /const\s+purchaseCorrectionMatchers\s*=\s*\[[\s\S]*fieldKey:\s*"unitPrice"[\s\S]*fieldKey:\s*"quantity"[\s\S]*fieldKey:\s*"amount"[\s\S]*fieldKey:\s*"productName"[\s\S]*fieldKey:\s*"referenceInfo"[\s\S]*\]/,
  );
  assert.match(
    querySource,
    /const\s+grossMarginRateCorrections\s*=\s*getMetricCorrectionState\(correctionState,\s*\[[\s\S]*\.\.\.purchaseCorrectionMatchers[\s\S]*\]\)/,
  );
  assert.match(
    querySource,
    /const\s+salesDifferenceCorrections\s*=\s*getMetricCorrectionState\(correctionState,\s*\[[\s\S]*\.\.\.purchaseCorrectionMatchers[\s\S]*\]\)/,
  );
  assert.match(querySource, /evaluateRevenueAnomalySignals/);
  assert.match(querySource, /evaluateInventoryLossAnomalySignals/);
  assert.match(querySource, /correction-review-required/);
  const dailyQueryStart = querySource.indexOf(
    "export async function getHqDailyMeetingReport",
  );
  const dailyQueryEnd = querySource.indexOf("// (2026-06-30)", dailyQueryStart);
  const dailyQuerySource = querySource.slice(dailyQueryStart, dailyQueryEnd);
  const laborSelectStart = dailyQuerySource.indexOf("ledgerLaborItems:");
  const laborSelect = dailyQuerySource.slice(
    laborSelectStart,
    laborSelectStart + 420,
  );
  for (const field of [
    "workerName",
    "employeeId",
    "lateMemo",
    "earlyLeaveMemo",
    "specialMemo",
  ]) {
    assert.match(laborSelect, new RegExp(`${field}:\\s*true`));
  }
  assert.match(laborSelect, /orderBy:\s*\{\s*createdAt:\s*"asc"\s*\}/);
  assert.doesNotMatch(laborSelect, /amount:|createdById:|updatedById:/);
  assert.doesNotMatch(querySource, /\.(create|createMany|update|upsert)\(/);
  assert.doesNotMatch(querySource, /export\s+async\s+function\s+(GET|POST)/);
});

test("HQ daily meeting rows carry the raw expected gross-margin metric", () => {
  const typeSource = readProjectFile("src", "features", "reports", "types.ts");
  const querySource = readProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );

  assert.match(typeSource, /expectedGrossMarginRate:\s*LedgerReviewMetric/);
  assert.match(typeSource, /reportMarginGapThresholdBps:\s*number/);
  assert.match(
    querySource,
    /expectedGrossMarginRate:\s*reviewSummary\.plannedGrossMarginRate/,
  );
  assert.match(
    querySource,
    /expectedGrossMarginRate:\s*dataInsufficient\([\s\S]*?예상 마진율 데이터가 없습니다/,
  );
  assert.doesNotMatch(
    querySource,
    /expectedGrossMarginRate:[\s\S]{0,120}(?:parseFloat|parseInt|Number)\s*\(.*analysisMarginDisplay/,
  );
  assert.match(querySource, /reportMarginGapThresholdBps:\s*true/);
  assert.match(querySource, /DEFAULT_REPORT_MARGIN_GAP_THRESHOLD_BPS/);
});

test("gross-margin gap threshold includes the exact 1.5%p boundary", async () => {
  const helperPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "store-daily-performance.ts",
  );
  const { hasSignificantGrossMarginGap } = await import(
    pathToFileURL(helperPath).href
  );

  assert.equal(hasSignificantGrossMarginGap(0.2, 0.1851), false);
  assert.equal(hasSignificantGrossMarginGap(0.2, 0.18505), false);
  assert.equal(hasSignificantGrossMarginGap(0.2, 0.185), true);
  assert.equal(hasSignificantGrossMarginGap(0.21, 0.195), true);
  assert.equal(hasSignificantGrossMarginGap(-1000, -1000.015), true);
  assert.equal(hasSignificantGrossMarginGap(-100000, -100000.015), true);
  assert.equal(hasSignificantGrossMarginGap(-100000, -100000.0149), false);
  assert.equal(hasSignificantGrossMarginGap(null, 0.195), false);
  assert.equal(hasSignificantGrossMarginGap(0.21, null), false);
  assert.equal(hasSignificantGrossMarginGap(0.2, 0.185, 200), false);
  assert.equal(hasSignificantGrossMarginGap(0.2, 0.185, 100), true);
});

test("HQ daily chart always uses sales bars and raw actual/expected margin rates", () => {
  const chartSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "store-daily-performance-chart.tsx",
  );

  assert.match(
    chartSource,
    /type SortMode = "salesAmount" \| "grossMarginRate"/,
  );
  assert.match(chartSource, /<Bar dataKey="salesAmount"/);
  assert.match(chartSource, /<Cell/);
  assert.match(chartSource, /hasSignificantGrossMarginGap/);
  assert.match(chartSource, /expectedGrossMarginRate\.value/);
  assert.match(
    chartSource,
    /\.filter\(\(row\) => row\.salesAmount\.value !== null\)/,
  );
  assert.match(
    chartSource,
    /function compareNullableDescending[\s\S]*?if \(a === null\) return b === null \? 0 : 1;[\s\S]*?if \(b === null\) return -1;/,
  );
  assert.match(chartSource, /실제 데이터 부족/);
  assert.match(chartSource, /예상 데이터 부족/);
  assert.match(chartSource, /reportMarginGapThresholdBps/);
  assert.match(chartSource, /formatMarginThreshold/);
  assert.match(chartSource, /title="지점별 장부 입력 매출·마진율"/);
  assert.match(chartSource, /desc="막대는 장부 입력 매출/);
  assert.match(chartSource, /<table className="sr-only"/);
  assert.match(chartSource, /data-testid="store-performance-chart-scroll"/);
  assert.match(
    chartSource,
    /actual === null \|\| expected === null[\s\S]*?"판정 불가"/,
  );
  assert.match(
    chartSource,
    /formatter=\{\(_value, _name, item\) =>[\s\S]*?item\.payload as StoreChartRow[\s\S]*?\.label/,
  );
  assert.doesNotMatch(chartSource, /dataKey=\{(?:metric|sortMode)\}/);
  assert.doesNotMatch(chartSource, /추정 매출액|추정 이익률/);
});

test("daily product table is searchable, quantity-ranked, and limited to three columns", () => {
  const componentSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "product-profitability-report.tsx",
  );
  const dailyPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "daily",
    "page.tsx",
  );

  assert.match(
    componentSource,
    /const \[searchQuery, setSearchQuery\] = useState/,
  );
  assert.match(componentSource, /const rankedItems = useMemo/);
  assert.match(
    componentSource,
    /tableVariant\?: "profitability" \| "salesRanking"/,
  );
  assert.match(componentSource, /tableVariant = "profitability"/);
  assert.match(
    componentSource,
    /\{showChart && tableVariant === "profitability" \? \(\s*<dl/,
  );
  assert.match(componentSource, /tableVariant === "salesRanking"/);
  assert.match(componentSource, /b\.soldQuantity - a\.soldQuantity/);
  assert.match(componentSource, /\.slice\(0, 10\)/);
  assert.match(componentSource, /const salesRankingChartItems = useMemo/);
  assert.match(
    componentSource,
    /<SalesRankingChart items=\{salesRankingChartItems\}/,
  );
  assert.match(componentSource, /data=\{items\}[\s\S]*?dataKey="soldQuantity"/);
  assert.match(componentSource, /품목별 판매수량 상위 10개 차트/);
  assert.match(componentSource, /<BarChart[\s\S]*?data=\{data\.items\}/);
  assert.match(componentSource, /data\.items\.map\(\(item\) =>/);
  assert.doesNotMatch(componentSource, /<BarChart[\s\S]*?data=\{rankedItems\}/);
  assert.equal(
    componentSource.match(
      /className="text-xs text-amber-600 dark:text-amber-500"/g,
    )?.length,
    2,
  );
  assert.match(componentSource, /FieldLabel[^>]*htmlFor="product-search"/);
  assert.match(componentSource, /placeholder="품목명 또는 규격 검색"/);
  assert.match(
    componentSource,
    /<h3 className="text-sm font-medium">판매수량 상위 10개<\/h3>/,
  );
  assert.match(componentSource, /colSpan=\{3\}/);
  assert.match(componentSource, /검색 결과가 없습니다\./);
  assert.match(componentSource, /추정 판매 수량/);
  assert.match(componentSource, /추정 판매액/);
  assert.match(componentSource, /추정 원가/);
  assert.match(componentSource, /추정 마진/);
  assert.match(componentSource, /추정 이익률/);
  assert.match(componentSource, /item\.statusLabel/);
  assert.match(
    componentSource,
    /판매수량 = 전일재고 \+ 당일매입 − 손실수량 − 당일재고/,
  );
  assert.match(dailyPageSource, /mode="both"/);
  assert.match(dailyPageSource, /tableVariant="salesRanking"/);
  assert.match(dailyPageSource, /품목별 판매 현황/);
  assert.match(
    dailyPageSource,
    /재고 흐름으로 계산한 판매수량 기준 상위 품목입니다\./,
  );
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
  assert.match(tableSource, /최신 반영/);
  assert.match(tableSource, /상태 메시지/);
  assert.match(tableSource, /row\.latestReflectedAt/);
  assert.match(tableSource, /getDailyMeetingStatusMessage/);
  assert.match(tableSource, /formatLatestReflectedAt/);
  assert.match(tableSource, /<details/);
  assert.match(tableSource, /근거 보기/);
  assert.match(tableSource, /원본/);
  assert.match(tableSource, /정정 반영/);
  assert.match(tableSource, /계산 불가 사유/);
  assert.match(tableSource, /correctionTimelineHref/);
  assert.match(tableSource, /row\.metricEvidence\.loss/);
  assert.match(tableSource, /DailyReportSalesCell/);
  assert.match(tableSource, /row\.analysisSalesAmount/);
  assert.match(tableSource, /분석/);
  assert.match(tableSource, /입력 전/);
  assert.match(tableSource, /tabular-nums/);
  assert.match(tableSource, /break-words/);
  assert.doesNotMatch(tableSource, /salesDropRateBps/);
  assert.doesNotMatch(tableSource, /grossMarginDropBps/);
  assert.doesNotMatch(tableSource, /salesDifferenceAmount/);
  assert.doesNotMatch(tableSource, /inventoryDifferenceQuantity/);
});

test("daily sales analysis and attendance components are display-only responsive views", () => {
  const salesSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "daily-sales-analysis.tsx",
  );
  const attendanceSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "daily-attendance-report.tsx",
  );
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

  for (const label of [
    "전일 대비 매출액 증감률",
    "재고비율",
    "매장 매출 포지션",
    "계산 불가",
    "제외 지점",
  ]) {
    assert.match(salesSource, new RegExp(label));
  }
  assert.match(salesSource, /from "~\/components\/ui\/card"/);
  assert.match(salesSource, /BarChart/);
  assert.match(salesSource, /PieChart/);
  assert.match(salesSource, /ReferenceLine/);
  assert.match(salesSource, /lg:grid-cols-3/);
  assert.match(salesSource, /deviationRate/);
  assert.match(salesSource, /deviationAmount/);
  assert.match(salesSource, /formatShareWithAmount/);
  assert.match(salesSource, /formatPercentWithAmount/);
  assert.match(salesSource, /표시할 매출 분석 데이터가 없습니다\./);
  assert.doesNotMatch(salesSource, /전체 평균 대비/);
  assert.doesNotMatch(salesSource, /\.reduce\(|\/\s*(?:total|previous|sales)/);

  for (const label of [
    "이상 근태 인원",
    "지각",
    "조퇴",
    "특이사항",
    "지점",
    "직원",
    "상태",
    "지각 메모",
    "조퇴 메모",
  ]) {
    assert.match(attendanceSource, new RegExp(label));
  }
  assert.match(attendanceSource, /attendance\.rows\.map/);
  assert.match(attendanceSource, /md:block/);
  assert.match(attendanceSource, /md:hidden/);
  assert.match(attendanceSource, /선택일에 지각·조퇴·특이사항이 없습니다\./);
  assert.doesNotMatch(attendanceSource, /급여|인건비|amount|employeeId/);
  assert.doesNotMatch(attendanceSource, /<(?:table|thead|tbody|tr|th|td)\b/);

  const pageHeadings = [
    "지점별 매출·이익률",
    "매출 분석",
    "직원 근태 현황",
    "품목별 판매 현황",
    "마감·이상 신호 현황",
  ];
  let previousIndex = -1;
  for (const heading of pageHeadings) {
    const index = pageSource.indexOf(heading);
    assert.ok(
      index > previousIndex,
      `${heading} should follow the prior section`,
    );
    previousIndex = index;
  }
  assert.match(
    pageSource,
    /<DailySalesAnalysis data=\{report\.salesAnalysis\}/,
  );
  assert.match(
    pageSource,
    /<DailyAttendanceReport attendance=\{report\.attendance\}/,
  );
  assert.match(pageSource, /<StoreDailyPerformanceChart rows=\{report\.rows\}/);
  assert.match(pageSource, /<DailyMeetingReportTable report=\{report\}/);

  previousIndex = -1;
  for (const heading of pageHeadings) {
    const index = loadingSource.indexOf(heading);
    assert.ok(
      index > previousIndex,
      `${heading} loading skeleton should be ordered`,
    );
    previousIndex = index;
  }
});

test("HQ reports build frozen/live category performance with 추정 이익률 from FIFO consumed amount (WO-03 + point_summary.md:26)", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildProductCategoryPerformance } = await import(
    pathToFileURL(queryPath).href
  );

  const performance = buildProductCategoryPerformance([
    {
      ledgerInventoryItems: [
        {
          // 냉동: 판매 10+5-3 = 12개, 판매가 계획 1,500 → 추정 매출 18,000원
          // (매입단가 1,000이 아니라 판매가 계획 기준으로 매출을 산출한다)
          // FIFO 소진금액 9,000(원가) → 추정 이익률 (18,000-9,000)/18,000 = 0.5
          productCategory: "냉동",
          previousQuantity: 10,
          purchasedQuantity: 5,
          currentQuantity: 3,
          unitPrice: 1_000,
          plannedUnitPrice: 1_500,
          fifoLots: [{ consumedAmount: 6_000 }, { consumedAmount: 3_000 }],
        },
        {
          // 생물: 판매 8+0-3 = 5개, 판매가 계획 없음 → 매입단가 2,000으로 폴백
          // → 추정 매출 10,000원, FIFO lot 없어 COGS 폴백 10,000 → 이익률 0
          productCategory: "생물",
          previousQuantity: 8,
          purchasedQuantity: 0,
          currentQuantity: 3,
          unitPrice: 2_000,
          plannedUnitPrice: null,
        },
        {
          // 당일 재고 미입력(null) 행은 제외한다.
          productCategory: "냉동",
          previousQuantity: 4,
          purchasedQuantity: 0,
          currentQuantity: null,
          unitPrice: 5_000,
          fifoLots: [{ consumedAmount: 1_000 }],
        },
        {
          // 판매 수량 0 이하 행은 제외한다.
          productCategory: "생물",
          previousQuantity: 2,
          purchasedQuantity: 0,
          currentQuantity: 5,
          unitPrice: 5_000,
        },
      ],
    },
  ]);

  // 냉동은 판매가 계획 기준이라 폴백 0건, 생물은 판매가 계획 없어 폴백 1건.
  assert.deepEqual(performance, [
    {
      category: "냉동",
      salesAmount: 18_000,
      grossMarginRate: 0.5,
      statusLabel: "추정",
      salesPriceFallbackItemCount: 0,
    },
    {
      category: "생물",
      salesAmount: 10_000,
      grossMarginRate: 0,
      statusLabel: "추정",
      salesPriceFallbackItemCount: 1,
    },
  ]);
});

test("buildProductProfitability returns per-item rows that reconcile with category totals", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildProductProfitability, buildProductCategoryPerformance } =
    await import(pathToFileURL(queryPath).href);

  // buildProductCategoryPerformance와 같은 입력으로, 품목 합계가 카테고리 합계와
  // 일치하는지 본다. 같은 품목(productId)이 두 지점에 나뉘어 있어도 합산해야 한다.
  const ledgers = [
    {
      ledgerInventoryItems: [
        {
          productId: "p-gal",
          productName: "갈치",
          productSpec: "1kg",
          productCategory: "냉동",
          previousQuantity: 10,
          purchasedQuantity: 5,
          currentQuantity: 3,
          unitPrice: 1_000,
          plannedUnitPrice: 1_500,
          fifoLots: [{ consumedAmount: 6_000 }, { consumedAmount: 3_000 }],
        },
        {
          productId: "p-saewoo",
          productName: "새우",
          productCategory: "생물",
          previousQuantity: 8,
          purchasedQuantity: 0,
          currentQuantity: 3,
          unitPrice: 2_000,
          plannedUnitPrice: null,
        },
        {
          // 당일재고 null → 카테고리/품목 모두에서 제외.
          productId: "p-x",
          productName: "제외품",
          productCategory: "냉동",
          previousQuantity: 4,
          purchasedQuantity: 0,
          currentQuantity: null,
          unitPrice: 5_000,
          fifoLots: [{ consumedAmount: 1_000 }],
        },
        {
          // 기타 카테고리 → 제외.
          productId: "p-etc",
          productName: "기타품",
          productCategory: "기타",
          previousQuantity: 10,
          purchasedQuantity: 0,
          currentQuantity: 2,
          unitPrice: 1_000,
          plannedUnitPrice: 1_000,
        },
      ],
    },
    {
      ledgerInventoryItems: [
        {
          // 같은 갈치를 다른 지점에서 4개 더 판매(판매가 계획 1,500 → 6,000원,
          // FIFO 소진 3,000). 첫 지점과 합산되어야 한다.
          productId: "p-gal",
          productName: "갈치",
          productCategory: "냉동",
          previousQuantity: 4,
          purchasedQuantity: 0,
          currentQuantity: 0,
          unitPrice: 1_000,
          plannedUnitPrice: 1_500,
          fifoLots: [{ consumedAmount: 3_000 }],
        },
      ],
    },
  ];

  const summary = buildProductProfitability(ledgers);
  const category = buildProductCategoryPerformance(ledgers);

  // 갈치(합산)와 새우 두 품목. 갈치가 매출이 더 크므로 내림차순 정렬상 먼저.
  assert.equal(summary.items.length, 2);
  const gal = summary.items[0];
  assert.equal(gal.productName, "갈치");
  // WO-04(2026-06-28): 표 규격 컬럼을 위해 규격이 함께 내려온다.
  assert.equal(gal.productSpec, "1kg");
  assert.equal(gal.soldQuantity, 16); // 12 + 4
  assert.equal(gal.estimatedSalesAmount, 24_000); // 18,000 + 6,000
  assert.equal(gal.estimatedCogsAmount, 12_000); // 9,000 + 3,000
  assert.equal(gal.estimatedGrossProfit, 12_000);
  assert.equal(gal.estimatedGrossMarginRate, 0.5);
  assert.equal(gal.salesBasis, "planned");
  assert.equal(gal.statusLabel, "추정");

  const saewoo = summary.items[1];
  assert.equal(saewoo.productName, "새우");
  assert.equal(saewoo.estimatedSalesAmount, 10_000);
  assert.equal(saewoo.salesBasis, "cost");
  assert.equal(saewoo.statusLabel, "판매가 미반영");

  // 인수 조건: 품목 합계 = 냉동/생물 카테고리 합계.
  const categorySales = category.reduce((sum, c) => sum + c.salesAmount, 0);
  assert.equal(summary.totalSalesAmount, categorySales); // 24,000 + 10,000
  assert.equal(summary.totalSalesAmount, 34_000);
  assert.equal(summary.totalGrossProfit, 12_000); // (24,000-12,000) + (10,000-10,000)
  assert.equal(summary.totalGrossMarginRate, 12_000 / 34_000);
  assert.equal(summary.salesPriceFallbackItemCount, 1);
  assert.equal(summary.unavailableItemCount, 0);
});

test("estimated sales subtract loss quantity (loss is not counted as sold)", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildProductProfitability, buildProductCategoryPerformance } =
    await import(pathToFileURL(queryPath).href);

  // 전일 0 + 매입 4 - 손실 1 - 당일재고 1 = 판매 2 (손실 1을 빼지 않으면 3으로 부풀려진다).
  const ledgers = [
    {
      ledgerInventoryItems: [
        {
          productId: "p-godeungeo",
          productName: "고등어",
          productCategory: "냉동",
          previousQuantity: 0,
          purchasedQuantity: 4,
          lossQuantity: 1,
          currentQuantity: 1,
          unitPrice: 10_000,
          plannedUnitPrice: 40_000,
        },
      ],
    },
  ];

  const summary = buildProductProfitability(ledgers);
  assert.equal(summary.items[0].soldQuantity, 2);
  assert.equal(summary.items[0].estimatedSalesAmount, 80_000); // 2 × 40,000

  const category = buildProductCategoryPerformance(ledgers);
  const frozen = category.find((c) => c.category === "냉동");
  assert.equal(frozen.salesAmount, 80_000); // 2 × 40,000, not 3 × 40,000
});

test("buildProductProfitability flags zero-sales items as 계산 불가", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildProductProfitability } = await import(
    pathToFileURL(queryPath).href
  );

  // 판매가 계획·매입단가 모두 0이면 추정 매출 0 → 이익률 계산 불가.
  const summary = buildProductProfitability([
    {
      ledgerInventoryItems: [
        {
          productId: "p-zero",
          productName: "무가격품",
          productCategory: "냉동",
          previousQuantity: 5,
          purchasedQuantity: 0,
          currentQuantity: 2,
          unitPrice: 0,
          plannedUnitPrice: null,
        },
      ],
    },
  ]);

  assert.equal(summary.items.length, 1);
  assert.equal(summary.items[0].estimatedSalesAmount, 0);
  assert.equal(summary.items[0].estimatedGrossMarginRate, null);
  assert.equal(summary.items[0].statusLabel, "계산 불가");
  assert.equal(summary.totalGrossMarginRate, null);
  assert.equal(summary.unavailableItemCount, 1);
});

test("HQ report pages omit the category margin chart while preserving category calculations", () => {
  const policyDocSource = readProjectFile(
    "docs",
    "meeting",
    "point-summary-policy-decisions-2026-06-22.md",
  );
  const dailyPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "daily",
    "page.tsx",
  );
  const monthlyComponentSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "monthly-closing-anomaly-report.tsx",
  );
  const productReviewPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "product-review",
    "page.tsx",
  );
  const querySource = readProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );

  for (const source of [
    dailyPageSource,
    productReviewPageSource,
    monthlyComponentSource,
  ]) {
    assert.doesNotMatch(source, /ProductCategoryMarginChart/);
    assert.doesNotMatch(source, /냉동\/생물 매출 \(추정\)/);
  }
  assert.equal(
    existsSync(
      path.join(
        root,
        "src",
        "features",
        "reports",
        "components",
        "product-category-margin-chart.tsx",
      ),
    ),
    false,
  );

  // WO(2026-06-25): 지점별 토글 차트 + 품목별 이익률 차트가 일별 리포트에 노출된다.
  assert.match(dailyPageSource, /StoreDailyPerformanceChart/);
  assert.match(dailyPageSource, /report\.rows/);
  assert.match(dailyPageSource, /ProductProfitabilityReport/);
  assert.match(dailyPageSource, /report\.productProfitability/);
  assert.match(
    querySource,
    /buildProductProfitability\(ledgersWithPlannedPrice\)/,
  );

  // 정책 문서는 원문 요구에 맞춰 "계산 불가" 고정이 아니라 추정 이익률 노출을 허용한다.
  assert.match(policyDocSource, /추정 이익률/);
  assert.match(policyDocSource, /FIFO 소진금액/);
  assert.doesNotMatch(policyDocSource, /카테고리 이익률은 "계산 불가"/);
  assert.doesNotMatch(policyDocSource, /`grossMarginRate`는 `null`/);

  // 쿼리는 두 리포트 모두에 categoryPerformance를 채운다.
  // point_summary 검토 후속(2026-06-24): 판매가 계획을 붙인 ledgersWithPlannedPrice를 넘긴다.
  assert.match(
    querySource,
    /categoryPerformance:\s*buildProductCategoryPerformance\(\s*ledgersWithPlannedPrice,?\s*\)/,
  );
  assert.match(querySource, /getPlannedUnitPriceLookup/);
});

test("correction creation revalidates daily reports after correction values change", () => {
  const actionSource = readProjectFile(
    "src",
    "features",
    "corrections",
    "actions.ts",
  );

  assert.match(actionSource, /revalidateDashboardAndReports\(\)/);
});

test("HQ store comparison report source files follow story 6.2 boundaries", () => {
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
  assert.match(pageSource, /storeId/);
  assert.match(pageSource, /<select/);
  assert.match(pageSource, /전체 활성 지점/);
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
  assert.match(querySource, /normalizedStoreId/);
  assert.match(querySource, /matchedStore/);
  assert.match(querySource, /selectedStores/);
  assert.match(querySource, /storeErrorMessage/);
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
  assert.match(typeSource, /StoreComparisonReportStoreOption/);
  assert.match(typeSource, /selectedStoreId/);
  assert.match(typeSource, /errorMessages/);
  assert.match(typeSource, /metricEvidence/);
  assert.match(
    querySource,
    /selectedStoreId:\s*matchedStore\?\.id\s*\?\?\s*null/,
  );
  assert.doesNotMatch(
    querySource,
    /selectedStoreId:\s*matchedStore\?\.id\s*\?\?\s*normalizedStoreId/,
  );
  assert.match(actionSource, /revalidateDashboardAndReports\(\)/);
});

test("ledger and master data writes revalidate store comparison reports", () => {
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
      /revalidateDashboardAndReports\(\)|revalidateMasterDataPaths\("(stores|anomaly-thresholds)"\)/,
      `${segments.join("/")} should revalidate store comparison reports`,
    );
  }
});

test("HQ monthly closing anomaly report source files follow story 6.3 boundaries", () => {
  assertProjectFile("src", "app", "app", "reports", "monthly", "page.tsx");
  assertProjectFile("src", "app", "app", "reports", "monthly", "loading.tsx");
  assertProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "monthly-closing-anomaly-report.tsx",
  );
  assert.ok(
    !existsSync(path.join(root, "src", "features", "monthly-report")),
    "story 6.3 should stay inside src/features/reports",
  );
  assert.ok(
    !existsSync(path.join(root, "src", "app", "api", "reports", "monthly")),
    "story 6.3 should not add a public monthly report API route",
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
  const reportsNavSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "reports-nav.tsx",
  );

  assert.match(pageSource, /requireReportAccess\(/);
  assert.match(pageSource, /getHqMonthlyClosingAnomalyReport\(/);
  assert.match(pageSource, /MonthlyClosingAnomalyReport/);
  assert.match(pageSource, /월간 요약 리포트/);
  assert.match(pageSource, /핵심 성과와 손실\/재고 흐름/);
  assert.match(pageSource, /권한 있는 지점 선택 후/);
  assert.doesNotMatch(
    pageSource,
    /selectedStoreName\s*\?\?\s*"활성 지점 없음"/,
  );
  assert.match(pageSource, /month/);
  assert.match(pageSource, /storeId/);
  assert.match(loadingSource, /Skeleton/);
  assert.match(loadingSource, /월간 핵심 성과/);
  assert.match(loadingSource, /손실\/재고 흐름/);
  assert.match(loadingSource, /md:block/);
  assert.match(loadingSource, /md:hidden/);
  assert.match(componentSource, /DashboardStatusBadge/);
  assert.match(componentSource, /DashboardSignalSummary/);
  assert.match(componentSource, /본사 마감/);
  assert.match(componentSource, /검토 대기/);
  assert.match(componentSource, /입력 중/);
  assert.match(componentSource, /미입력/);
  assert.match(componentSource, /휴무/);
  assert.match(componentSource, /주요 이상/);
  assert.match(componentSource, /월간 핵심 성과/);
  assert.match(componentSource, /손실\/재고 흐름/);
  assert.match(componentSource, /손실 유형별 요약/);
  assert.match(componentSource, /최고매출품목/);
  assert.match(componentSource, /계산 포함\/제외 일자/);
  assert.match(componentSource, /정정 반영 건수/);
  assert.match(componentSource, /미마감 장부 포함/);
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
  assert.match(dailyPageSource, /<ReportsNav active="daily"/);
  assert.match(comparisonPageSource, /<ReportsNav active="comparison"/);
  assert.match(reportsNavSource, /href:\s*"\/app\/reports\/monthly"/);
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
  assert.match(
    querySource,
    /selectedStoreId:\s*matchedStore\?\.id\s*\?\?\s*null/,
  );
  assert.doesNotMatch(
    querySource,
    /selectedStoreId:\s*matchedStore\?\.id\s*\?\?\s*selectedStore\.id/,
  );
  assert.doesNotMatch(querySource, /첫 번째 활성 지점으로 조회합니다/);
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
      /revalidateDashboardAndReports\(\)|revalidateMasterDataPaths\("(stores|anomaly-thresholds)"\)/,
      `${segments.join("/")} should revalidate monthly reports`,
    );
  }
});

test("HQ monthly report surfaces headquarters expenses as a separate line", () => {
  const componentSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "monthly-closing-anomaly-report.tsx",
  );
  const typeSource = readProjectFile("src", "features", "reports", "types.ts");
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "monthly",
    "page.tsx",
  );

  assert.match(typeSource, /export type MonthlyHeadquartersExpenseSummary/);
  assert.match(componentSource, /headquartersExpense/);
  assert.match(componentSource, /본사 지출/);
  assert.match(
    componentSource,
    /data-testid="hq-report-monthly-headquarters-expense"/,
  );
  // 본사 지출 합계는 본사 설정 권한 사용자에게만 별도 라인으로 노출된다.
  assert.match(pageSource, /getHeadquartersExpenseReportSummary\(/);
  assert.match(pageSource, /PermissionAction\.SETTINGS_MANAGE/);
  assert.match(pageSource, /headquartersExpense=\{headquartersExpense\}/);
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
      /revalidateDashboardAndReports\(\)|revalidateMasterDataPaths\("(stores|anomaly-thresholds)"\)/,
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

test("HQ monthly closing anomaly report rejects invalid store URL state without fallback data", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );

  assert.match(
    querySource,
    /normalizedStoreId\s*&&\s*!matchedStore[\s\S]*권한 범위/,
  );
  assert.match(querySource, /buildEmptyMonthlyClosingAnomalyReport/);
  assert.doesNotMatch(
    querySource,
    /const selectedStore = matchedStore \?\? stores\[0\]/,
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
  const correctedMarginRate = {
    ...baseMetric,
    label: "이익률",
    kind: "percent",
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
    grossMarginRate: correctedMarginRate,
    salesDifference: { ...baseMetric, label: "매출 차이" },
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
            id: "margin-rate-below-threshold",
            label: "마진률 미달",
            severity: "warning",
            detail: "마진률이 기준보다 낮습니다.",
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
  assert.equal(report.unfinishedDayCount, 2);
  assert.equal(report.hasUnfinishedDays, true);
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
  assert.equal(report.monthlyKpis.appliedCorrectionCount, 3);
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

test("HQ monthly closing anomaly report marks purchase flow when purchase row correction needs review", async () => {
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
    ledgerDetailHref: "/app/ledgers/ledger-purchase-review",
    correctionTimelineHref: null,
  };

  const report = buildMonthlyClosingAnomalyReportForTest({
    store: { id: "store-1", name: "테스트점" },
    monthInput: "2026-06",
    dateInputs: ["2026-06-01"],
    ledgerSummaries: [
      {
        dateInput: "2026-06-01",
        ledgerId: "ledger-purchase-review",
        status: "HEADQUARTERS_CLOSED",
        signals: [],
        metricEvidence: {
          salesAmount: metric,
          grossMarginRate: metric,
          salesDifference: metric,
          loss: metric,
        },
        hasUnappliedCorrections: true,
        original: {
          totalSales: { value: 1000 },
          grossProfit: { value: 500 },
          grossMarginRate: { value: 0.5 },
          operatingProfit: { value: 500 },
          productivity: { value: 1000 },
          inventoryAmount: { value: 1000 },
        },
        applied: {
          totalSales: { value: 1000 },
          grossProfit: { value: 500 },
          grossMarginRate: { value: 0.5 },
          operatingProfit: { value: 500 },
          productivity: { value: 1000 },
          inventoryAmount: { value: 1000 },
        },
        workerCount: 1,
        lossItems: [],
        inventoryItems: [
          {
            id: "inventory-1",
            productId: "product-1",
            productName: "광어",
            previousQuantity: 10,
            purchasedQuantity: 5,
            currentQuantity: 8,
            quantity: 8,
            unitPrice: 1000,
            inventoryAmount: 8000,
          },
        ],
        inventoryAdjustments: [],
        appliedCorrectionKeys: new Set(),
        unappliedCorrectionKeys: new Set([
          "ledger-purchase-review:PURCHASE_ROW:purchase-1:quantity",
        ]),
      },
    ],
  });

  assert.equal(report.monthlyInventoryFlow.purchaseAmount.value, 5000);
  assert.equal(
    report.monthlyInventoryFlow.metricEvidence.purchaseAmount.status,
    "needs-review",
  );
  assert.equal(
    report.monthlyInventoryFlow.metricEvidence.purchaseAmount.statusLabel,
    "정정 확인 필요",
  );
  assert.equal(
    report.monthlyInventoryFlow.metricEvidence.purchaseAmount
      .correctionTimelineHref,
    "/app/ledgers/ledger-purchase-review#correction-timeline",
  );
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
    buildDailyAttendanceReport,
    buildDailySalesAnalysis,
    getDailyMeetingReportDate,
    getDailyMeetingReportDateQuery,
    getDailyMeetingReportDatePreset,
    getPreviousReportDate,
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
  assert.equal(
    getPreviousReportDate(new Date("2026-07-01T00:00:00.000Z")).toISOString(),
    "2026-06-30T00:00:00.000Z",
  );
  assert.equal(
    getPreviousReportDate(new Date("2026-01-01T00:00:00.000Z")).toISOString(),
    "2025-12-31T00:00:00.000Z",
  );

  const metric = (value, reason) => ({
    value,
    ...(reason ? { unavailableReason: reason } : {}),
  });
  const ledger = ({
    id,
    status = "HEADQUARTERS_CLOSED",
    sales,
    inventory = [],
    correctionKeys = [],
    workerCount = null,
    labor = [],
  }) => ({
    ledgerId: id,
    status,
    totalSales: metric(sales),
    inventoryItems: inventory,
    appliedCorrectionKeys: new Set(correctionKeys),
    workerCount,
    ledgerLaborItems: labor,
  });
  const stores = [
    {
      storeId: "store-up",
      storeName: "가 지점",
      current: ledger({
        id: "current-up",
        sales: 120_000,
        inventory: [{ id: "inventory-up", inventoryAmount: 30_000 }],
        workerCount: 3,
        labor: [
          {
            workerName: "정상 직원",
            employeeId: "employee-1",
            lateMemo: "   ",
            earlyLeaveMemo: null,
            specialMemo: null,
          },
          {
            workerName: "복합 직원",
            employeeId: null,
            lateMemo: "10분 지각",
            earlyLeaveMemo: "병원 방문",
            specialMemo: "인수인계",
          },
        ],
      }),
      previous: ledger({ id: "previous-up", sales: 80_000 }),
    },
    {
      storeId: "store-down",
      storeName: "나 지점",
      current: ledger({ id: "current-down", sales: 100_000 }),
      previous: ledger({ id: "previous-down", sales: 200_000 }),
    },
    {
      storeId: "store-zero",
      storeName: "다 지점",
      current: ledger({
        id: "current-zero",
        sales: 0,
        inventory: [{ id: "inventory-zero", inventoryAmount: 10_000 }],
      }),
      previous: ledger({ id: "previous-zero", sales: 0 }),
    },
    {
      storeId: "store-missing",
      storeName: "라 지점",
      current: null,
      previous: null,
    },
    {
      storeId: "store-holiday",
      storeName: "마 지점",
      current: ledger({ id: "current-holiday", status: "HOLIDAY", sales: 0 }),
      previous: ledger({
        id: "previous-holiday",
        status: "HOLIDAY",
        sales: 0,
      }),
    },
    {
      storeId: "store-incomplete",
      storeName: "바 지점",
      current: ledger({
        id: "current-incomplete",
        sales: 120_000,
        inventory: [
          { id: "inventory-complete", inventoryAmount: 10_000 },
          { id: "inventory-incomplete", inventoryAmount: null },
        ],
      }),
      previous: ledger({ id: "previous-incomplete", sales: 100_000 }),
    },
    {
      storeId: "store-corrected-inventory",
      storeName: "사 지점",
      current: ledger({
        id: "current-corrected-inventory",
        sales: 120_000,
        inventory: [{ id: "inventory-corrected", inventoryAmount: 30_000 }],
        correctionKeys: [
          "current-corrected-inventory:INVENTORY_ROW:inventory-corrected:currentQuantity",
        ],
      }),
      previous: ledger({ id: "previous-corrected-inventory", sales: 100_000 }),
    },
  ];

  const analysis = buildDailySalesAnalysis(stores);
  const baselineChange = buildDailySalesAnalysis([
    {
      storeId: "baseline",
      storeName: "기준점",
      current: ledger({ id: "baseline-current", sales: 120_000 }),
      previous: ledger({ id: "baseline-previous", sales: 100_000 }),
    },
  ]).salesChanges[0];
  assert.equal(baselineChange.difference.value, 20_000);
  assert.equal(baselineChange.rate.value, 0.2);
  const increase = analysis.salesChanges.find(
    (row) => row.storeId === "store-up",
  );
  assert.equal(increase.currentSales.value, 120_000);
  assert.equal(increase.previousSales.value, 80_000);
  assert.equal(increase.difference.value, 40_000);
  assert.equal(increase.rate.value, 0.5);
  assert.deepEqual(
    analysis.salesChanges.slice(0, 2).map((row) => row.storeId),
    ["store-up", "store-down"],
  );
  assert.equal(
    analysis.salesChanges.find((row) => row.storeId === "store-missing").rate
      .reason,
    "선택일 장부 미입력",
  );
  assert.equal(
    analysis.salesChanges.find((row) => row.storeId === "store-holiday").rate
      .reason,
    "선택일 휴무",
  );
  assert.equal(
    analysis.salesChanges.find((row) => row.storeId === "store-zero").rate
      .reason,
    "전일 매출 0원",
  );

  const inventoryRatio = analysis.inventoryRatios.find(
    (row) => row.storeId === "store-up",
  );
  assert.equal(inventoryRatio.inventoryAmount.value, 30_000);
  assert.equal(inventoryRatio.salesAmount.value, 120_000);
  assert.equal(inventoryRatio.deviationAmount.value, -90_000);
  assert.equal(inventoryRatio.deviationRate.value, -0.75);
  const zeroSalesInventory = analysis.inventoryRatios.find(
    (row) => row.storeId === "store-zero",
  );
  assert.equal(zeroSalesInventory.inventoryAmount.value, 10_000);
  assert.equal(zeroSalesInventory.deviationAmount.value, 10_000);
  assert.equal(zeroSalesInventory.deviationRate.value, null);
  assert.equal(zeroSalesInventory.deviationRate.reason, "선택일 매출 0원");
  for (const storeId of ["store-incomplete", "store-corrected-inventory"]) {
    const row = analysis.inventoryRatios.find(
      (item) => item.storeId === storeId,
    );
    assert.equal(row.inventoryAmount.value, null);
    assert.equal(row.deviationAmount.value, null);
    assert.equal(row.deviationRate.value, null);
  }
  assert.equal(
    analysis.inventoryRatios.find((row) => row.storeId === "store-incomplete")
      .deviationRate.reason,
    "저장 FIFO 재고금액 누락",
  );
  assert.equal(
    analysis.inventoryRatios.find(
      (row) => row.storeId === "store-corrected-inventory",
    ).deviationRate.reason,
    "재고 수량 정정으로 FIFO 금액을 확정할 수 없음",
  );

  const unavailablePrevious = buildDailySalesAnalysis([
    {
      storeId: "previous-missing",
      storeName: "전일 미입력점",
      current: ledger({ id: "current-present", sales: 100 }),
      previous: null,
    },
    {
      storeId: "previous-holiday",
      storeName: "전일 휴무점",
      current: ledger({ id: "current-present-2", sales: 100 }),
      previous: ledger({ id: "previous-holiday", status: "HOLIDAY", sales: 0 }),
    },
  ]).salesChanges;
  assert.equal(
    unavailablePrevious.find((row) => row.storeId === "previous-missing").rate
      .reason,
    "전일 장부 미입력",
  );
  assert.equal(
    unavailablePrevious.find((row) => row.storeId === "previous-holiday").rate
      .reason,
    "전일 휴무",
  );

  assert.deepEqual(
    analysis.positions.slice(0, 3).map((row) => [row.rank, row.storeName]),
    [
      [1, "가 지점"],
      [2, "바 지점"],
      [3, "사 지점"],
    ],
  );
  assert.equal(analysis.positions[0].share.value, 120_000 / 460_000);
  assert.equal(analysis.positions[0].difference.value, 40_000);
  assert.equal(analysis.positions[0].rate.value, 0.5);
  assert.deepEqual(
    analysis.excludedPositions.map((row) => [row.storeName, row.reason]),
    [
      ["라 지점", "선택일 장부 미입력"],
      ["마 지점", "선택일 휴무"],
    ],
  );

  const tieAnalysis = buildDailySalesAnalysis([
    {
      storeId: "tie-na",
      storeName: "나 지점",
      current: ledger({ id: "tie-na-ledger", sales: 100 }),
      previous: null,
    },
    {
      storeId: "tie-ga",
      storeName: "가 지점",
      current: ledger({ id: "tie-ga-ledger", sales: 100 }),
      previous: null,
    },
  ]);
  assert.deepEqual(
    tieAnalysis.positions.map((row) => row.storeName),
    ["가 지점", "나 지점"],
  );
  assert.deepEqual(
    tieAnalysis.positions.map((row) => row.share.value),
    [0.5, 0.5],
  );
  assert.deepEqual(
    tieAnalysis.positions.map((row) => row.rate.reason),
    ["전일 장부 미입력", "전일 장부 미입력"],
  );

  const positionAnalysis = buildDailySalesAnalysis([
    {
      storeId: "position-high",
      storeName: "가 지점",
      current: ledger({ id: "position-high-ledger", sales: 300_000 }),
      previous: null,
    },
    {
      storeId: "position-low",
      storeName: "나 지점",
      current: ledger({ id: "position-low-ledger", sales: 100_000 }),
      previous: null,
    },
  ]).positions;
  assert.deepEqual(
    positionAnalysis.map((row) => [row.rank, row.share.value]),
    [
      [1, 0.75],
      [2, 0.25],
    ],
  );

  const inventoryDeviationEdges = buildDailySalesAnalysis([
    {
      storeId: "inventory-equal",
      storeName: "동일점",
      current: ledger({
        id: "inventory-equal-current",
        sales: 100_000,
        inventory: [{ inventoryAmount: 100_000 }],
      }),
      previous: null,
    },
    {
      storeId: "inventory-above",
      storeName: "초과점",
      current: ledger({
        id: "inventory-above-current",
        sales: 100_000,
        inventory: [{ inventoryAmount: 250_000 }],
      }),
      previous: null,
    },
  ]).inventoryRatios;
  assert.equal(inventoryDeviationEdges[0].deviationRate.value, 0);
  assert.equal(inventoryDeviationEdges[0].deviationAmount.value, 0);
  assert.equal(inventoryDeviationEdges[1].deviationRate.value, 1.5);
  assert.equal(inventoryDeviationEdges[1].deviationAmount.value, 150_000);

  const attendance = buildDailyAttendanceReport(stores);
  assert.deepEqual(attendance.summary, {
    exceptionWorkers: 1,
    late: 1,
    earlyLeave: 1,
    special: 1,
  });
  assert.equal(attendance.rows.length, 1);
  assert.equal(attendance.rows[0].workerName, "복합 직원");
  assert.deepEqual(attendance.rows[0].statuses, [
    "지각",
    "조퇴",
    "특이사항",
    "직원 미연결",
  ]);
  assert.equal(attendance.rows[0].lateMemo, "10분 지각");
  const attendanceEdges = buildDailyAttendanceReport([
    {
      storeId: "missing-ledger",
      storeName: "장부 미입력점",
      current: null,
      previous: null,
    },
    {
      storeId: "unlinked-normal",
      storeName: "미연결점",
      current: ledger({
        id: "unlinked-normal-ledger",
        sales: 0,
        workerCount: 1,
        labor: [
          {
            workerName: "미연결 정상 직원",
            employeeId: null,
            lateMemo: " ",
            earlyLeaveMemo: null,
            specialMemo: null,
          },
        ],
      }),
      previous: null,
    },
  ]);
  assert.deepEqual(attendanceEdges.rows, []);
  const serializedAttendance = JSON.stringify(attendance);
  assert.doesNotMatch(serializedAttendance, /amount|employeeId/);
  assert.doesNotMatch(serializedAttendance, /employee-1/);
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
  assert.equal(
    getStoreComparisonReportPath({ ...range, storeId: "store-1" }),
    "/app/reports/comparison?startDate=2026-05-30&endDate=2026-06-02&storeId=store-1",
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

test("HQ store comparison report keeps single-period scope explicit and sorts by selected-period sales", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { sortStoreComparisonReportRowsForTest } = await import(
    pathToFileURL(queryPath).href
  );
  const metricEvidence = {
    label: "매출",
    kind: "money",
    original: { value: 0, kind: "money" },
    applied: { value: 0, kind: "money" },
    isCorrected: false,
    status: "zero",
    statusLabel: "0",
    unavailableReason: null,
    ledgerDetailHref: null,
    correctionTimelineHref: null,
  };
  const row = (storeId, storeName, salesAmount, missingDayCount = 0) => ({
    storeId,
    storeName,
    statusCounts: {
      missingDayCount,
      inProgressCount: 0,
      reviewCount: 0,
      closedCount: 1,
      holidayCount: 0,
    },
    salesAmount: { value: salesAmount },
    grossProfit: { value: null, unavailableReason: "계산 기준 확인 필요" },
    grossMarginRate: { value: null, unavailableReason: "계산 기준 확인 필요" },
    operatingProfit: { value: null, unavailableReason: "계산 기준 확인 필요" },
    productivity: { value: null, unavailableReason: "계산 기준 확인 필요" },
    averageInventory: { value: null, unavailableReason: "계산 기준 확인 필요" },
    averageSales: { value: salesAmount },
    inventoryToSalesRatio: {
      value: null,
      unavailableReason: "계산 기준 확인 필요",
    },
    hasLoss: false,
    hasUnappliedCorrections: false,
    metricEvidence: {
      salesAmount: metricEvidence,
      grossProfit: metricEvidence,
      grossMarginRate: metricEvidence,
      operatingProfit: metricEvidence,
      productivity: metricEvidence,
      averageInventory: metricEvidence,
      averageSales: metricEvidence,
      inventoryToSalesRatio: metricEvidence,
      loss: metricEvidence,
    },
  });

  const sorted = sortStoreComparisonReportRowsForTest([
    row("store-b", "나지점", 300000),
    row("store-c", "다지점", 300000, 1),
    row("store-a", "가지점", 500000),
  ]);

  assert.deepEqual(
    sorted.map((item) => item.storeId),
    ["store-a", "store-c", "store-b"],
  );
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

test("HQ store comparison report keeps OQ-gated metrics as needs-review instead of finalized numbers", async () => {
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
    dateCount: 1,
    ledgerSummaries: [
      {
        ledgerId: "ledger-policy",
        status: "HEADQUARTERS_CLOSED",
        original: {
          totalSales: { value: 100000 },
          grossProfit: {
            value: null,
            status: "policy-unconfirmed",
            unavailableReason: "계산 기준 확인 필요",
          },
          grossMarginRate: {
            value: null,
            status: "policy-unconfirmed",
            unavailableReason: "계산 기준 확인 필요",
          },
          operatingProfit: {
            value: null,
            status: "policy-unconfirmed",
            unavailableReason: "계산 기준 확인 필요",
          },
          productivity: { value: 100000 },
          inventoryAmount: {
            value: null,
            status: "policy-unconfirmed",
            unavailableReason: "계산 기준 확인 필요",
          },
        },
        applied: {
          totalSales: { value: 100000 },
          grossProfit: {
            value: null,
            status: "policy-unconfirmed",
            unavailableReason: "계산 기준 확인 필요",
          },
          grossMarginRate: {
            value: null,
            status: "policy-unconfirmed",
            unavailableReason: "계산 기준 확인 필요",
          },
          operatingProfit: {
            value: null,
            status: "policy-unconfirmed",
            unavailableReason: "계산 기준 확인 필요",
          },
          productivity: { value: 100000 },
          inventoryAmount: {
            value: null,
            status: "policy-unconfirmed",
            unavailableReason: "계산 기준 확인 필요",
          },
        },
        workerCount: 1,
        hasLoss: false,
        hasUnappliedCorrections: false,
        appliedCorrectionKeys: new Set(),
        unappliedCorrectionKeys: new Set(),
      },
    ],
  });

  assert.equal(row.grossProfit.value, null);
  assert.equal(row.grossProfit.unavailableReason, "계산 기준 확인 필요");
  assert.equal(row.metricEvidence.grossProfit.status, "needs-review");
  assert.equal(
    row.metricEvidence.grossProfit.statusLabel,
    "계산 기준 확인 필요",
  );
  assert.equal(row.metricEvidence.averageInventory.status, "needs-review");
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

test("HQ report export route follows story 6.4 server-side guardrails", () => {
  assertProjectFile("src", "app", "api", "reports", "export", "route.ts");
  assertProjectFile("src", "features", "reports", "export.ts");

  const routeSource = readProjectFile(
    "src",
    "app",
    "api",
    "reports",
    "export",
    "route.ts",
  );
  const exportSource = readProjectFile(
    "src",
    "features",
    "reports",
    "export.ts",
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
  const monthlyPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "monthly",
    "page.tsx",
  );

  assert.match(routeSource, /requireExportCreateAccess\(\)/);
  assert.match(routeSource, /isValidDateInput\(/);
  assert.match(routeSource, /isValidMonthInput\(/);
  assert.match(routeSource, /isRequestedStoreOutsideResolvedScope\(/);
  assert.match(routeSource, /getHqDailyMeetingReport\(/);
  assert.match(routeSource, /getHqStoreComparisonReport\(/);
  assert.match(routeSource, /getHqMonthlyClosingAnomalyReport\(/);
  assert.match(routeSource, /getHqInventoryPositionReport\(/);
  assert.match(routeSource, /writeAuditLog\(/);
  assert.match(routeSource, /targetType:\s*"ReportExport"/);
  assert.match(routeSource, /action:\s*"report\.export\.created"/);
  assert.match(routeSource, /Cache-Control["']?\s*:\s*"no-store"/);
  assert.match(
    routeSource,
    /NextResponse\.json\([\s\S]*status:\s*400[\s\S]*headers:\s*\{[\s\S]*"Cache-Control":\s*"no-store"[\s\S]*\}/,
  );
  assert.match(routeSource, /Content-Disposition/);
  assert.match(routeSource, /text\/csv;\s*charset=utf-8/);
  assert.match(routeSource, /status:\s*403/);
  assert.doesNotMatch(routeSource, /redirect\("/);

  assert.match(exportSource, /REPORT_EXPORT_COLUMN_ALLOWLISTS/);
  assert.match(exportSource, /buildDailyMeetingReportExport/);
  assert.match(exportSource, /buildStoreComparisonReportExport/);
  assert.match(exportSource, /buildMonthlyClosingAnomalyReportExport/);
  assert.match(exportSource, /buildInventoryPositionReportExport/);
  assert.match(exportSource, /buildReportCsv/);
  assert.match(exportSource, /getReportExportFilename/);
  assert.match(exportSource, /statusLabel/);
  assert.match(exportSource, /unavailableReason/);
  assert.match(exportSource, /정정 반영/);
  assert.match(exportSource, /기준 확인 필요/);
  // WO-15(2026-06-28): xlsx 다운로드를 제공한다(exceljs). CSV는 보조로 유지.
  assert.match(exportSource, /buildReportXlsx/);
  assert.match(exportSource, /import\("exceljs"\)/);
  // 라우트는 xlsx 포맷을 허용하고 포맷별 Content-Type을 내려준다.
  assert.match(routeSource, /isReportExportFormat\(/);
  assert.match(
    routeSource,
    /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
  );

  for (const pageSource of [
    dailyPageSource,
    comparisonPageSource,
    monthlyPageSource,
  ]) {
    assert.match(pageSource, /hasActionPermission\(/);
    assert.match(pageSource, /PermissionAction\.EXPORT_CREATE/);
    assert.match(pageSource, /DownloadIcon/);
    assert.match(pageSource, /\/api\/reports\/export/);
  }
});

test("HQ report export helpers produce safe CSV, filenames, and status values", async () => {
  const exportPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "export.ts",
  );
  const {
    buildReportCsv,
    buildReportXlsx,
    getReportExportFilename,
    isReportExportFormat,
    buildDailyMeetingReportExport,
  } = await import(pathToFileURL(exportPath).href);
  const metric = ({
    label,
    kind = "money",
    value,
    originalValue = value,
    statusLabel = "원본",
    unavailableReason = null,
  }) => ({
    label,
    kind,
    original: { value: originalValue },
    applied: { value, unavailableReason },
    isCorrected: statusLabel === "정정 반영",
    status: statusLabel === "정정 반영" ? "corrected" : "original",
    statusLabel,
    unavailableReason,
    ledgerDetailHref: "/app/ledgers/ledger-1",
    correctionTimelineHref:
      statusLabel === "정정 반영"
        ? "/app/ledgers/ledger-1#correction-timeline"
        : null,
  });
  const exportData = buildDailyMeetingReportExport({
    dateInput: "2026-06-12",
    rows: [
      {
        storeId: "store-1",
        storeName: '=강남 "본점"',
        ledgerStatus: { label: "본사 마감" },
        businessStatus: { label: "영업" },
        latestReflectedAt: "2026-06-12T01:00:00.000Z",
        statusMessage: "회의 반영 완료",
        salesAmount: { value: 45000 },
        grossMarginRate: {
          value: null,
          unavailableReason: "계산 기준 확인 필요",
        },
        salesDifference: { value: 0 },
        hasLoss: false,
        signals: [{ label: "정정 확인 필요" }],
        metricEvidence: {
          salesAmount: metric({
            label: "매출",
            value: 45000,
            originalValue: 300000,
            statusLabel: "정정 반영",
          }),
          grossMarginRate: metric({
            label: "이익률",
            kind: "percent",
            value: 0.25,
            originalValue: 0.2,
            statusLabel: "정정 반영",
          }),
          salesDifference: metric({ label: "매출 차이", value: 0 }),
          loss: metric({ label: "손실", value: 0, statusLabel: "0" }),
        },
      },
    ],
  });
  const csv = buildReportCsv(exportData);

  assert.equal(
    getReportExportFilename({
      report: "daily",
      period: "2026-06-12/store-1/강남",
    }),
    "erp-fish-report-daily-2026-06-12-store-1.csv",
  );
  // WO-15(2026-06-28): xlsx 포맷 허용 + 포맷별 파일 확장자.
  assert.equal(isReportExportFormat("xlsx"), true);
  assert.equal(isReportExportFormat("csv"), true);
  assert.equal(isReportExportFormat("pdf"), false);
  assert.equal(
    getReportExportFilename({
      report: "daily",
      period: "2026-06-12/store-1/강남",
      format: "xlsx",
    }),
    "erp-fish-report-daily-2026-06-12-store-1.xlsx",
  );
  // buildReportXlsx는 ZIP 컨테이너(PK 매직)로 시작하는 워크북을 만든다.
  const xlsx = new Uint8Array(await buildReportXlsx(exportData));
  assert.ok(xlsx.length > 0);
  assert.equal(xlsx[0], 0x50); // 'P'
  assert.equal(xlsx[1], 0x4b); // 'K'
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /"'=강남 ""본점"""/);
  assert.match(csv, /정정 반영/);
  assert.match(csv, /25%/);
  assert.doesNotMatch(csv, /0\.25/);
  assert.doesNotMatch(csv, /300000/);
  assert.deepEqual(exportData.scopedStoreIds, ["store-1"]);
  assert.ok(exportData.columns.every((column) => column.key !== "lot"));
});

test("HQ comparison and monthly export helpers preserve gated statuses without leaking row values into audit metadata", async () => {
  const exportPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "export.ts",
  );
  const {
    buildReportCsv,
    buildReportExportAuditSnapshot,
    buildStoreComparisonReportExport,
    buildMonthlyClosingAnomalyReportExport,
  } = await import(pathToFileURL(exportPath).href);
  const metric = ({
    label,
    value,
    originalValue = value,
    statusLabel = "원본",
    unavailableReason = null,
  }) => ({
    label,
    kind: "money",
    original: { value: originalValue },
    applied: { value, unavailableReason },
    isCorrected: statusLabel === "정정 반영",
    status: statusLabel === "정정 반영" ? "corrected" : "original",
    statusLabel,
    unavailableReason,
    ledgerDetailHref: "/app/ledgers/ledger-1",
    correctionTimelineHref: null,
  });
  const comparisonExport = buildStoreComparisonReportExport({
    range: {
      startDateInput: "2026-06-01",
      endDateInput: "2026-06-12",
    },
    selectedStoreId: "store-2",
    rows: [
      {
        storeId: "store-2",
        storeName: "잠실점",
        statusCounts: {
          closedCount: 8,
          inProgressCount: 1,
          reviewCount: 1,
          missingDayCount: 2,
        },
        metricEvidence: {
          salesAmount: metric({
            label: "매출",
            value: 120000,
            originalValue: 100000,
            statusLabel: "정정 반영",
          }),
          grossProfit: metric({
            label: "매출이익",
            value: null,
            statusLabel: "데이터 부족",
            unavailableReason: "데이터 부족",
          }),
          grossMarginRate: metric({
            label: "이익률",
            value: null,
            statusLabel: "계산 불가",
            unavailableReason: "계산 불가",
          }),
          operatingProfit: metric({
            label: "영업이익",
            value: null,
            statusLabel: "기준 확인 필요",
            unavailableReason: "기준 확인 필요",
          }),
          productivity: metric({ label: "인당생산성", value: 30000 }),
          loss: metric({ label: "손실", value: 0 }),
        },
      },
    ],
  });
  const comparisonCsv = buildReportCsv(comparisonExport);

  assert.match(comparisonCsv, /정정 반영/);
  assert.match(comparisonCsv, /데이터 부족/);
  assert.match(comparisonCsv, /계산 불가/);
  assert.match(comparisonCsv, /기준 확인 필요/);
  assert.doesNotMatch(comparisonCsv, /100000/);
  assert.deepEqual(comparisonExport.filters, {
    startDate: "2026-06-01",
    endDate: "2026-06-12",
    storeId: "store-2",
  });
  assert.deepEqual(comparisonExport.scopedStoreIds, ["store-2"]);

  const monthlyExport = buildMonthlyClosingAnomalyReportExport({
    monthRange: { monthInput: "2026-06" },
    selectedStoreId: "store-2",
    selectedStoreName: "서초점",
    monthlyKpis: {
      metricEvidence: {
        salesAmount: metric({ label: "월간 매출", value: 500000 }),
        grossProfit: metric({
          label: "매출이익",
          value: null,
          statusLabel: "기준 확인 필요",
          unavailableReason: "기준 확인 필요",
        }),
        grossMarginRate: metric({
          label: "이익률",
          value: null,
          statusLabel: "데이터 부족",
          unavailableReason: "데이터 부족",
        }),
        operatingProfit: metric({
          label: "영업이익",
          value: null,
          statusLabel: "계산 불가",
          unavailableReason: "계산 불가",
        }),
      },
    },
    monthlyLossSummary: {
      metricEvidence: {
        totalAmount: metric({ label: "손실 합계", value: 0 }),
      },
    },
    monthlyInventoryFlow: {
      metricEvidence: {
        currentAmount: metric({
          label: "당일재고",
          value: 220000,
          originalValue: 240000,
          statusLabel: "정정 반영",
        }),
      },
    },
    topRevenueItem: {
      productName: "광어",
      note: "정정 확인 필요",
      statusLabel: "정정 확인 필요",
    },
    calculationDays: [
      {
        ledgerStatusLabel: "입력 중",
        dateInput: "2026-06-12",
        inclusion: "excluded",
        reason: "미마감 장부 제외",
      },
    ],
    days: [{ storeId: "store-2" }, { storeId: "store-2" }],
  });
  const monthlyCsv = buildReportCsv(monthlyExport);
  const auditSnapshot = buildReportExportAuditSnapshot({
    exportData: monthlyExport,
    format: "csv",
  });
  const auditJson = JSON.stringify(auditSnapshot);

  assert.match(monthlyCsv, /정정 확인 필요/);
  assert.match(monthlyCsv, /미마감 장부 제외/);
  assert.match(monthlyCsv, /정정 반영/);
  assert.doesNotMatch(monthlyCsv, /240000/);
  assert.deepEqual(monthlyExport.scopedStoreIds, ["store-2"]);
  assert.deepEqual(auditSnapshot, {
    report: "monthly",
    filters: { month: "2026-06", storeId: "store-2" },
    scopedStoreIdCount: 1,
    scopedStoreIds: ["store-2"],
    columnKeys: [
      "section",
      "item",
      "date",
      "storeName",
      "value",
      "status",
      "reason",
    ],
    rowCount: monthlyExport.rows.length,
    format: "csv",
  });
  assert.doesNotMatch(auditJson, /서초점|광어|500000|220000/);
});

test("monthly report ranks products by estimated sales (sold quantity × planned price, cost fallback)", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildMonthlyClosingAnomalyReportForTest } = await import(
    pathToFileURL(queryPath).href
  );

  const inventoryItem = (productId, productName, overrides) => ({
    id: `inv-${productId}`,
    productId,
    productName,
    previousQuantity: 0,
    purchasedQuantity: 0,
    currentQuantity: 0,
    quantity: 0,
    unitPrice: 0,
    inventoryAmount: null,
    ...overrides,
  });

  // 판매량 = 전일 + 매입 - 당일. 추정매출 = 판매량 × 판매가(계획 우선, 없으면 매입단가 폴백).
  // 매입단가 1000 고정, 판매량으로 순위를 통제한다(폴백 시 추정매출 = 판매량 × 1000).
  const soldItem = (productId, productName, soldQuantity) =>
    inventoryItem(productId, productName, {
      previousQuantity: soldQuantity,
      purchasedQuantity: 0,
      currentQuantity: 0,
      quantity: 0,
      unitPrice: 1000,
    });

  const report = buildMonthlyClosingAnomalyReportForTest({
    store: { id: "store-1", name: "테스트점" },
    monthInput: "2026-06",
    dateInputs: ["2026-06-01"],
    ledgerSummaries: [
      {
        dateInput: "2026-06-01",
        ledgerId: "ledger-1",
        status: "HEADQUARTERS_CLOSED",
        signals: [],
        metricEvidence: {},
        hasUnappliedCorrections: false,
        inventoryItems: [
          // 1위: 판매가 계획 2000이 있으므로 매입단가가 아닌 계획가 기준(70 × 2000 = 140,000).
          {
            ...soldItem("p1", "1위품목", 70),
            plannedUnitPrice: 2000,
          },
          // 나머지는 판매가 계획이 없어 매입단가(1000)로 폴백.
          soldItem("p2", "2위품목", 60),
          soldItem("p3", "3위품목", 50),
          soldItem("p4", "4위품목", 40),
          soldItem("p5", "5위품목", 30),
          soldItem("p6", "6위품목", 20),
          soldItem("p7", "7위품목", 10),
          // 팔리지 않은 품목(판매량 0)은 순위에서 제외된다.
          inventoryItem("p-nakji", "낙지", {
            previousQuantity: 3,
            purchasedQuantity: 0,
            currentQuantity: 3,
            quantity: 3,
            unitPrice: 5000,
          }),
        ],
      },
    ],
  });

  const ranking = report.revenueRanking;

  assert.equal(ranking.status, "available");
  assert.match(ranking.basisLabel, /판매량.*판매가 계획.*추정/);
  // 판매가 계획이 없어 폴백한 품목 수(p2~p7 = 6건).
  assert.equal(ranking.salesPriceFallbackItemCount, 6);

  // 상위 5는 추정매출 내림차순. 1위는 판매가 계획(2000) 기준이라 140,000.
  assert.deepEqual(
    ranking.top.map((item) => [
      item.productName,
      item.estimatedSalesAmount,
      item.salesBasis,
    ]),
    [
      ["1위품목", 140000, "planned"],
      ["2위품목", 60000, "cost"],
      ["3위품목", 50000, "cost"],
      ["4위품목", 40000, "cost"],
      ["5위품목", 30000, "cost"],
    ],
  );

  // 하위는 추정매출 오름차순이며, 상위와 중복되지 않는다.
  assert.deepEqual(
    ranking.bottom.map((item) => item.productName),
    ["7위품목", "6위품목"],
  );

  const topNames = new Set(ranking.top.map((item) => item.productName));
  assert.ok(
    ranking.bottom.every((item) => !topNames.has(item.productName)),
    "하위 목록은 상위 목록과 중복되지 않는다",
  );
  assert.ok(
    [...ranking.top, ...ranking.bottom].every(
      (item) => item.productName !== "낙지",
    ),
    "팔리지 않은 품목은 상위·하위 순위에 포함되지 않는다",
  );
});

test("monthly report ranking reports data-insufficient when no sales can be derived", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildMonthlyClosingAnomalyReportForTest } = await import(
    pathToFileURL(queryPath).href
  );

  const report = buildMonthlyClosingAnomalyReportForTest({
    store: { id: "store-1", name: "테스트점" },
    monthInput: "2026-06",
    dateInputs: ["2026-06-01"],
    ledgerSummaries: [
      {
        dateInput: "2026-06-01",
        ledgerId: "ledger-1",
        status: "HEADQUARTERS_CLOSED",
        signals: [],
        metricEvidence: {},
        hasUnappliedCorrections: false,
        inventoryItems: [],
      },
    ],
  });

  assert.equal(report.revenueRanking.status, "data-insufficient");
  assert.deepEqual(report.revenueRanking.top, []);
  assert.deepEqual(report.revenueRanking.bottom, []);
});

test("monthly report lists P&L inputs as actual, estimated, or unavailable", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const { buildMonthlyClosingAnomalyReportForTest } = await import(
    pathToFileURL(queryPath).href
  );

  const report = buildMonthlyClosingAnomalyReportForTest({
    store: { id: "store-1", name: "테스트점" },
    monthInput: "2026-06",
    dateInputs: ["2026-06-01"],
    ledgerSummaries: [
      {
        dateInput: "2026-06-01",
        ledgerId: "ledger-1",
        status: "HEADQUARTERS_CLOSED",
        signals: [],
        metricEvidence: {},
        hasUnappliedCorrections: false,
        inventoryItems: [],
      },
    ],
  });

  const readiness = report.profitAndLossReadiness;
  const byKey = new Map(readiness.inputs.map((input) => [input.key, input]));

  // 매출/지점비용/본사지출/재고가치는 실측.
  assert.equal(byKey.get("sales")?.availability, "actual");
  assert.equal(byKey.get("branchExpense")?.availability, "actual");
  assert.equal(byKey.get("headquartersExpense")?.availability, "actual");
  assert.equal(byKey.get("inventoryValue")?.availability, "actual");
  // 매입원가/품목별 매출은 추정.
  assert.equal(byKey.get("purchaseCost")?.availability, "estimated");
  assert.equal(byKey.get("productSales")?.availability, "estimated");
  // 인건비는 직원별 급여 입력으로 실측.
  assert.equal(byKey.get("labor")?.availability, "actual");

  assert.equal(byKey.get("sales")?.availabilityLabel, "실측");
  assert.equal(byKey.get("productSales")?.availabilityLabel, "추정");
  assert.equal(byKey.get("labor")?.availabilityLabel, "실측");
  assert.equal(byKey.get("purchaseCost")?.source, "재고 흐름/FIFO 원가");
  assert.equal(
    byKey.get("purchaseCost")?.note,
    "재고 흐름과 FIFO 원가 기준으로 추정 산출합니다. 품목별 실판매 기록은 아직 직접 기록되지 않습니다.",
  );
  assert.equal(
    byKey.get("inventoryValue")?.note,
    "장부에 저장된 FIFO 재고금액을 실측 집계합니다.",
  );
  for (const input of readiness.inputs) {
    assert.doesNotMatch(input.note, /정책 확정|확정 전|OQ-7|OQ-17/);
  }

  const actualCount = readiness.inputs.filter(
    (input) => input.availability === "actual",
  ).length;
  const estimatedCount = readiness.inputs.filter(
    (input) => input.availability === "estimated",
  ).length;
  const unavailableCount = readiness.inputs.filter(
    (input) => input.availability === "unavailable",
  ).length;

  assert.equal(readiness.actualCount, actualCount);
  assert.equal(readiness.estimatedCount, estimatedCount);
  assert.equal(readiness.unavailableCount, unavailableCount);
  assert.equal(readiness.unavailableCount, 0);
  assert.match(readiness.statusLabel, /실측.*추정.*미구현/);
});

test("monthly report keeps product revenue ranking labeled estimated", async () => {
  const componentSource = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "monthly-closing-anomaly-report.tsx",
  );

  // 품목별 매출이 없어 순위가 추정임을 화면에 명시한다.
  assert.match(componentSource, /추정/);
  assert.match(componentSource, /매출 상위5 \/ 하위5 품목 \(추정\)/);
  assert.match(componentSource, /ProfitAndLossReadinessSummary/);
  assert.match(componentSource, /손익\(P&amp;L\) 리포트 준비도/);
});

// WO-16(2026-06-28): 본사 전용 품목 검토 / 매출 검토 차트 페이지.
test("WO-16: product/sales review pages are HQ-only and reuse report data with chart/table toggle", () => {
  const productPage = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "product-review",
    "page.tsx",
  );
  const salesPage = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "sales-review",
    "page.tsx",
  );
  const toggle = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "review-view-toggle.tsx",
  );

  for (const page of [productPage, salesPage]) {
    // 본사 전용(requireReportAccess) + 일별 리포트 데이터 재사용 + 차트/표 전환.
    assert.match(page, /requireReportAccess/);
    assert.match(page, /getHqDailyMeetingReport/);
    assert.match(page, /ReviewViewToggle/);
    assert.match(page, /mode="chart"/);
    assert.match(page, /mode="table"/);
  }

  assert.match(toggle, /"use client"/);
  assert.match(toggle, /차트 보기/);
  assert.match(toggle, /표 보기/);
});
