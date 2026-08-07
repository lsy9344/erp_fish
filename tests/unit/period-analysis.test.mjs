import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();
const {
  MAX_TREND_COLUMNS,
  PERIOD_ANALYSIS_METRICS,
  buildMetricAxisTrendRows,
  buildPeriodContrastRows,
  buildPeriodTrendColumns,
  buildPeriodTrendYearRange,
  buildStoreAxisTrendRows,
  calculatePeriodDelta,
  getPreviousComparableRange,
} = await import(
  pathToFileURL(
    path.join(root, "src", "features", "reports", "period-analysis.ts"),
  ).href
);

function metric(value) {
  return value === null
    ? {
        value: null,
        status: "calculation-unavailable",
        label: "계산 불가",
        unavailableReason: "계산 불가",
      }
    : { value, status: "ok" };
}

function storeRow(storeId, storeName, values = {}) {
  return {
    storeId,
    storeName,
    ...Object.fromEntries(
      PERIOD_ANALYSIS_METRICS.map((definition) => [
        definition.key,
        metric(values[definition.key] ?? 0),
      ]),
    ),
  };
}

// WO-0806 [F]: 지표 순서는 대표 엑셀 `분석` 시트와 같아야 한다.
test("period analysis metrics follow the owner spreadsheet order", () => {
  assert.deepEqual(
    PERIOD_ANALYSIS_METRICS.map((definition) => definition.label),
    [
      "매출",
      "매출이익",
      "이익률",
      "평균 근무인원",
      "인당생산성",
      "평균재고",
      "평균매출",
      "매출대비 재고비율",
    ],
  );
});

// 엑셀 실측: 매출은 비율(0.395922), 이익률은 차분(-0.0042728).
test("delta uses rate for amounts and percentage points for ratios", () => {
  const salesDelta = calculatePeriodDelta({
    kind: "money",
    base: metric(82_652_900),
    current: metric(115_377_000),
  });
  assert.equal(salesDelta.kind, "rate");
  assert.ok(Math.abs(salesDelta.value - 0.3959219821688047) < 1e-12);

  const marginDelta = calculatePeriodDelta({
    kind: "percent",
    base: metric(0.2589591532783484),
    current: metric(0.2546863152968096),
  });
  assert.equal(marginDelta.kind, "point");
  assert.ok(Math.abs(marginDelta.value - -0.0042728379815388) < 1e-12);

  // 평균 근무인원도 비율이다(2.88 → 2.8095238095238093 = -0.024470899470899).
  const headcountDelta = calculatePeriodDelta({
    kind: "headcount",
    base: metric(2.88),
    current: metric(2.8095238095238093),
  });
  assert.equal(headcountDelta.kind, "rate");
  assert.ok(Math.abs(headcountDelta.value - -0.0244708994708994) < 1e-12);
});

test("delta degrades with a reason instead of Infinity or NaN", () => {
  // 과거가 0이면 증감률은 정의되지 않는다.
  const zeroBase = calculatePeriodDelta({
    kind: "money",
    base: metric(0),
    current: metric(100),
  });
  assert.equal(zeroBase.value, null);
  assert.equal(zeroBase.unavailableReason, "대조 기간 값 0");

  // 비율 지표는 0에서도 차분이 성립한다.
  assert.equal(
    calculatePeriodDelta({
      kind: "percent",
      base: metric(0),
      current: metric(0.25),
    }).value,
    0.25,
  );

  for (const [base, current, reason] of [
    [metric(null), metric(100), "대조 기간 계산 불가"],
    [metric(100), metric(null), "현재 기간 계산 불가"],
    [undefined, metric(100), "대조 기간 데이터 없음"],
    [metric(100), undefined, "현재 기간 데이터 없음"],
  ]) {
    const delta = calculatePeriodDelta({ kind: "money", base, current });
    assert.equal(delta.value, null);
    assert.equal(delta.unavailableReason, reason);
  }
});

test("contrast rows keep stores present in only one period", () => {
  const rows = buildPeriodContrastRows({
    baseRows: [
      storeRow("a", "강남", { salesAmount: 100 }),
      storeRow("closed", "폐점", { salesAmount: 50 }),
    ],
    currentRows: [
      storeRow("a", "강남", { salesAmount: 120 }),
      storeRow("new", "신규", { salesAmount: 30 }),
    ],
  });

  assert.deepEqual(
    rows.map((row) => row.storeId),
    ["a", "new", "closed"],
  );
  assert.ok(Math.abs(rows[0].deltas.salesAmount.value - 0.2) < 1e-12);
  // 신규 개점은 대조 기간 데이터가 없고, 폐점은 현재 기간 데이터가 없다.
  assert.equal(
    rows[1].deltas.salesAmount.unavailableReason,
    "대조 기간 데이터 없음",
  );
  assert.equal(
    rows[2].deltas.salesAmount.unavailableReason,
    "현재 기간 데이터 없음",
  );
});

test("previous comparable range keeps the same length", () => {
  assert.deepEqual(
    getPreviousComparableRange({
      startDateInput: "2026-06-01",
      endDateInput: "2026-06-30",
    }),
    { startDateInput: "2026-05-02", endDateInput: "2026-05-31" },
  );

  assert.deepEqual(
    getPreviousComparableRange({
      startDateInput: "2026-07-08",
      endDateInput: "2026-07-14",
    }),
    { startDateInput: "2026-07-01", endDateInput: "2026-07-07" },
  );
});

// 엑셀 4개 뷰를 축 2개로 덮는다.
test("trend year range validates URL input and lets the 36-period guard run", () => {
  assert.deepEqual(
    buildPeriodTrendYearRange({
      fromYear: "2020",
      toYear: "2026",
      fallbackYear: 2026,
    }),
    {
      fromYear: 2020,
      toYear: 2026,
      years: [2020, 2021, 2022, 2023, 2024, 2025, 2026],
      errorMessages: [],
    },
  );

  const malformed = buildPeriodTrendYearRange({
    fromYear: "999999",
    toYear: "2026",
    fallbackYear: 2026,
  });
  assert.equal(malformed.fromYear, 2020);
  assert.equal(malformed.toYear, 2026);
  assert.equal(malformed.errorMessages.length, 1);

  const inverted = buildPeriodTrendYearRange({
    fromYear: "2026",
    toYear: "2020",
    fallbackYear: 2026,
  });
  assert.equal(inverted.fromYear, 2014);
  assert.equal(inverted.toYear, 2020);
  assert.match(inverted.errorMessages[0], /시작 연도/);
});

test("trend columns cover month, year, and seasonal month ranges", () => {
  const monthly = buildPeriodTrendColumns({ unit: "month", year: 2026 });
  assert.equal(monthly.columns.length, 12);
  assert.deepEqual(monthly.columns[0], {
    key: "2026-01",
    label: "1월",
    startDateInput: "2026-01-01",
    endDateInput: "2026-01-31",
  });
  assert.equal(monthly.columns[11].endDateInput, "2026-12-31");

  // 엑셀 `매장 별(년도)`: 6/1~6/30을 고정하고 연도만 바꾸는 시즌 비교.
  const seasonal = buildPeriodTrendColumns({
    unit: "year",
    year: 2026,
    years: [2024, 2025, 2026],
    fromMonth: 6,
    toMonth: 6,
  });
  assert.deepEqual(
    seasonal.columns.map((column) => [
      column.label,
      column.startDateInput,
      column.endDateInput,
    ]),
    [
      ["2024년", "2024-06-01", "2024-06-30"],
      ["2025년", "2025-06-01", "2025-06-30"],
      ["2026년", "2026-06-01", "2026-06-30"],
    ],
  );

  // 뒤집힌 월 범위는 오류가 아니라 시작 월로 좁힌다.
  const inverted = buildPeriodTrendColumns({
    unit: "month",
    year: 2026,
    fromMonth: 9,
    toMonth: 3,
  });
  assert.equal(inverted.columns.length, 1);
  assert.equal(inverted.columns[0].key, "2026-09");
});

// D-8: 상한을 넘으면 사유를 남기고 최근 N개로 자른다.
test("trend columns cap at the max width with a reason", () => {
  const years = Array.from({ length: 50 }, (_, index) => 1980 + index);
  const capped = buildPeriodTrendColumns({ unit: "year", year: 2026, years });

  assert.equal(capped.columns.length, MAX_TREND_COLUMNS);
  assert.equal(capped.errorMessages.length, 1);
  // 최근 기간을 남긴다.
  assert.equal(capped.columns.at(-1).key, "2029");
});

test("metric axis rows sum amounts and weight ratios by sales", () => {
  const rows = buildMetricAxisTrendRows([
    storeRow("a", "강남", {
      salesAmount: 100,
      grossMarginRate: 0.3,
      averageWorkerCount: 2,
    }),
    storeRow("a", "강남", {
      salesAmount: 300,
      grossMarginRate: 0.1,
      averageWorkerCount: 4,
    }),
    null,
  ]);
  const byKey = new Map(rows.map((row) => [row.key, row]));

  // 금액은 합계.
  assert.equal(byKey.get("salesAmount").total.value, 400);
  // 비율은 매출 가중평균: (0.3*100 + 0.1*300) / 400 = 0.15
  assert.ok(Math.abs(byKey.get("grossMarginRate").total.value - 0.15) < 1e-12);
  // 평균 근무인원은 매출로 가중하지 않고 기간별 평균의 단순평균이다.
  assert.equal(byKey.get("averageWorkerCount").total.value, 3);
  // 데이터 없는 기간은 셀이 null이며 합계에서 빠진다.
  assert.equal(byKey.get("salesAmount").cells[2], null);
});

test("store axis rows list every store seen in any period", () => {
  const metricDefinition = PERIOD_ANALYSIS_METRICS[0];
  const rows = buildStoreAxisTrendRows({
    metric: metricDefinition,
    rowsByColumn: [
      [storeRow("b", "잠실", { salesAmount: 10 })],
      [
        storeRow("a", "강남", { salesAmount: 20 }),
        storeRow("b", "잠실", { salesAmount: 30 }),
      ],
    ],
  });

  // 지점명 가나다순.
  assert.deepEqual(
    rows.map((row) => row.label),
    ["강남", "잠실"],
  );
  // 첫 기간에 없던 지점은 해당 셀이 null.
  assert.equal(rows[0].cells[0], null);
  assert.equal(rows[0].total.value, 20);
  assert.equal(rows[1].total.value, 40);
});
