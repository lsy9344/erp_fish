import type { LedgerReviewMetric } from "../../server/calculations/ledger.ts";
import type { StoreComparisonReportRow } from "./types.ts";

// WO-0806 [F]: 대표 엑셀 `분석` 시트의 8지표를 순서까지 그대로 옮긴다.
// 이 배열이 기간 대조·시계열 두 모드의 단일 출처다.
export const PERIOD_ANALYSIS_METRICS = [
  { key: "salesAmount", label: "매출", kind: "money" },
  { key: "grossProfit", label: "매출이익", kind: "money" },
  { key: "grossMarginRate", label: "이익률", kind: "percent" },
  { key: "averageWorkerCount", label: "평균 근무인원", kind: "headcount" },
  { key: "productivity", label: "인당생산성", kind: "money" },
  { key: "averageInventory", label: "평균재고", kind: "money" },
  { key: "averageSales", label: "평균매출", kind: "money" },
  {
    key: "inventoryToSalesRatio",
    label: "매출대비 재고비율",
    kind: "percent",
  },
] as const satisfies readonly {
  key: keyof StoreComparisonReportRow;
  label: string;
  kind: "money" | "percent" | "headcount";
}[];

export type PeriodAnalysisMetric = (typeof PERIOD_ANALYSIS_METRICS)[number];
export type PeriodAnalysisMetricKey = PeriodAnalysisMetric["key"];

export function getPeriodAnalysisMetric(
  key: unknown,
): PeriodAnalysisMetric | null {
  return PERIOD_ANALYSIS_METRICS.find((metric) => metric.key === key) ?? null;
}

// 엑셀 `과거 대비 현재 증감율`은 지표 성격에 따라 두 방식을 섞어 쓴다(실측 검증).
//   매출 82,652,900 → 115,377,000 = 0.395922  (비율)
//   이익률 0.2589592 → 0.2546863 = -0.0042728 (차분, %p)
// 대표 눈에 값이 달라 보이면 신뢰를 잃으므로 이 관행을 그대로 따른다.
export type PeriodContrastDeltaKind = "rate" | "point";

export type PeriodContrastDelta = {
  kind: PeriodContrastDeltaKind;
  value: number | null;
  unavailableReason: string | null;
};

export function calculatePeriodDelta({
  kind,
  base,
  current,
}: {
  kind: PeriodAnalysisMetric["kind"];
  base: LedgerReviewMetric | undefined;
  current: LedgerReviewMetric | undefined;
}): PeriodContrastDelta {
  const deltaKind: PeriodContrastDeltaKind =
    kind === "percent" ? "point" : "rate";

  if (base?.value === null || base?.value === undefined) {
    return {
      kind: deltaKind,
      value: null,
      unavailableReason: base ? "대조 기간 계산 불가" : "대조 기간 데이터 없음",
    };
  }

  if (current?.value === null || current?.value === undefined) {
    return {
      kind: deltaKind,
      value: null,
      unavailableReason: current
        ? "현재 기간 계산 불가"
        : "현재 기간 데이터 없음",
    };
  }

  if (deltaKind === "point") {
    return {
      kind: deltaKind,
      value: current.value - base.value,
      unavailableReason: null,
    };
  }

  // 과거가 0이면 증감률은 정의되지 않는다. Infinity를 화면에 내보내지 않는다.
  if (base.value === 0) {
    return {
      kind: deltaKind,
      value: null,
      unavailableReason: "대조 기간 값 0",
    };
  }

  return {
    kind: deltaKind,
    value: (current.value - base.value) / base.value,
    unavailableReason: null,
  };
}

export type PeriodContrastRow = {
  storeId: string;
  storeName: string;
  deltas: Record<PeriodAnalysisMetricKey, PeriodContrastDelta>;
};

export function buildPeriodContrastRows({
  baseRows,
  currentRows,
}: {
  baseRows: StoreComparisonReportRow[];
  currentRows: StoreComparisonReportRow[];
}): PeriodContrastRow[] {
  const baseById = new Map(baseRows.map((row) => [row.storeId, row]));
  // 어느 한쪽에만 있는 지점도 빠뜨리지 않는다(신규 개점/폐점).
  const storeOrder = [
    ...currentRows,
    ...baseRows.filter(
      (row) => !currentRows.some((current) => current.storeId === row.storeId),
    ),
  ];
  const currentById = new Map(currentRows.map((row) => [row.storeId, row]));

  return storeOrder.map((row) => ({
    storeId: row.storeId,
    storeName: row.storeName,
    deltas: Object.fromEntries(
      PERIOD_ANALYSIS_METRICS.map((metric) => [
        metric.key,
        calculatePeriodDelta({
          kind: metric.kind,
          base: baseById.get(row.storeId)?.[metric.key],
          current: currentById.get(row.storeId)?.[metric.key],
        }),
      ]),
    ) as Record<PeriodAnalysisMetricKey, PeriodContrastDelta>,
  }));
}

// 직전 동일 길이 기간. 대조 기간을 비우면 이 값을 쓴다.
export function getPreviousComparableRange({
  startDateInput,
  endDateInput,
}: {
  startDateInput: string;
  endDateInput: string;
}) {
  const start = new Date(`${startDateInput}T00:00:00.000Z`);
  const end = new Date(`${endDateInput}T00:00:00.000Z`);
  const dayCount =
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(start.getTime() - 86_400_000);
  const previousStart = new Date(
    previousEnd.getTime() - (dayCount - 1) * 86_400_000,
  );

  return {
    startDateInput: previousStart.toISOString().slice(0, 10),
    endDateInput: previousEnd.toISOString().slice(0, 10),
  };
}

// WO-0806 [F]/D-8: 시계열 최대 조회 폭. 엑셀은 78개월을 담지만 기간마다 집계
// 쿼리를 왕복하는 구조라 그대로 두면 응답이 무너진다.
export const MAX_TREND_COLUMNS = 36;
const MIN_TREND_YEAR = 2000;
const MAX_TREND_YEAR = 2100;

export type PeriodTrendUnit = "month" | "year";

export function buildPeriodTrendYearRange({
  fromYear,
  toYear,
  fallbackYear,
}: {
  fromYear: unknown;
  toYear: unknown;
  fallbackYear: number;
}) {
  const errorMessages: string[] = [];
  const safeFallback = Math.min(
    Math.max(Math.trunc(fallbackYear), MIN_TREND_YEAR),
    MAX_TREND_YEAR,
  );
  const parse = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) &&
      parsed >= MIN_TREND_YEAR &&
      parsed <= MAX_TREND_YEAR
      ? Math.trunc(parsed)
      : null;
  };
  const parsedTo = parse(toYear);
  const safeTo = parsedTo ?? safeFallback;
  const parsedFrom = parse(fromYear);
  let safeFrom = parsedFrom ?? Math.max(MIN_TREND_YEAR, safeTo - 6);

  if (
    (toYear !== undefined && toYear !== null && parsedTo === null) ||
    (fromYear !== undefined && fromYear !== null && parsedFrom === null)
  ) {
    errorMessages.push(
      `연도는 ${MIN_TREND_YEAR}년부터 ${MAX_TREND_YEAR}년 사이로 입력해 주세요. 기본 범위로 조회했습니다.`,
    );
  }

  if (safeFrom > safeTo) {
    errorMessages.push(
      "시작 연도가 종료 연도보다 늦습니다. 최근 7년으로 조회했습니다.",
    );
    safeFrom = Math.max(MIN_TREND_YEAR, safeTo - 6);
  }

  return {
    fromYear: safeFrom,
    toYear: safeTo,
    years: Array.from(
      { length: safeTo - safeFrom + 1 },
      (_, index) => safeFrom + index,
    ),
    errorMessages,
  };
}

export type PeriodTrendColumn = {
  key: string;
  label: string;
  startDateInput: string;
  endDateInput: string;
};

function toInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

// unit=month → 지정 연도의 1~12월. unit=year → 연도별 같은 월 범위(시즌 비교).
// 엑셀 `매장 별(년도)` 시트가 6/1~6/30을 고정하고 연도만 바꾸는 방식을 따른다.
export function buildPeriodTrendColumns({
  unit,
  year,
  years = [],
  fromMonth = 1,
  toMonth = 12,
}: {
  unit: PeriodTrendUnit;
  year: number;
  years?: number[];
  fromMonth?: number;
  toMonth?: number;
}): { columns: PeriodTrendColumn[]; errorMessages: string[] } {
  const errorMessages: string[] = [];
  const safeYear = Math.min(
    Math.max(Math.trunc(year), MIN_TREND_YEAR),
    MAX_TREND_YEAR,
  );
  const safeFrom = Math.min(Math.max(Math.trunc(fromMonth), 1), 12);
  const safeTo = Math.min(Math.max(Math.trunc(toMonth), safeFrom), 12);
  let columns: PeriodTrendColumn[];

  if (unit === "month") {
    columns = Array.from({ length: safeTo - safeFrom + 1 }, (_, index) => {
      const month = safeFrom + index;

      return {
        key: `${safeYear}-${String(month).padStart(2, "0")}`,
        label: `${month}월`,
        startDateInput: toInput(new Date(Date.UTC(safeYear, month - 1, 1))),
        endDateInput: toInput(new Date(Date.UTC(safeYear, month, 0))),
      };
    });
  } else {
    columns = years.map((targetYear) => ({
      key: String(targetYear),
      label: `${targetYear}년`,
      startDateInput: toInput(new Date(Date.UTC(targetYear, safeFrom - 1, 1))),
      endDateInput: toInput(new Date(Date.UTC(targetYear, safeTo, 0))),
    }));
  }

  if (columns.length > MAX_TREND_COLUMNS) {
    errorMessages.push(
      `한 번에 조회할 수 있는 기간은 최대 ${MAX_TREND_COLUMNS}개입니다. 최근 ${MAX_TREND_COLUMNS}개만 표시합니다.`,
    );
    columns = columns.slice(-MAX_TREND_COLUMNS);
  }

  return { columns, errorMessages };
}

export type PeriodTrendCell = LedgerReviewMetric | null;

export type PeriodTrendRow = {
  key: string;
  label: string;
  kind: PeriodAnalysisMetric["kind"];
  cells: PeriodTrendCell[];
  total: PeriodTrendCell;
};

function sumOrWeightedAverage(
  kind: PeriodAnalysisMetric["kind"],
  cells: PeriodTrendCell[],
  weights: number[],
): PeriodTrendCell {
  const usable = cells
    .map((cell, index) => ({
      value: cell?.value ?? null,
      weight: weights[index] ?? 0,
    }))
    .filter(
      (entry): entry is { value: number; weight: number } =>
        entry.value !== null,
    );

  if (usable.length === 0) {
    return null;
  }

  // 금액은 합계, 평균 근무인원은 기간별 평균의 단순평균, 비율은 매출
  // 가중평균이다. 인원을 매출로 가중하면 매출이 큰 달의 인력이 과대 반영된다.
  if (kind === "money") {
    return {
      value: usable.reduce((sum, entry) => sum + entry.value, 0),
      status: "ok",
    };
  }

  if (kind === "headcount") {
    return {
      value:
        usable.reduce((sum, entry) => sum + entry.value, 0) / usable.length,
      status: "ok",
    };
  }

  const weightTotal = usable.reduce((sum, entry) => sum + entry.weight, 0);

  if (weightTotal <= 0) {
    return {
      value:
        usable.reduce((sum, entry) => sum + entry.value, 0) / usable.length,
      status: "ok",
    };
  }

  return {
    value:
      usable.reduce((sum, entry) => sum + entry.value * entry.weight, 0) /
      weightTotal,
    status: "ok",
  };
}

// axis=metric → 행이 8지표(엑셀 `매장 별(달)`/`매장 별(년도)`).
export function buildMetricAxisTrendRows(
  rowsByColumn: (StoreComparisonReportRow | null)[],
): PeriodTrendRow[] {
  const weights = rowsByColumn.map((row) => row?.salesAmount.value ?? 0);

  return PERIOD_ANALYSIS_METRICS.map((metric) => {
    const cells = rowsByColumn.map((row) => row?.[metric.key] ?? null);

    return {
      key: metric.key,
      label: metric.label,
      kind: metric.kind,
      cells,
      total: sumOrWeightedAverage(metric.kind, cells, weights),
    };
  });
}

// axis=store → 행이 지점, 지표 1개 선택(엑셀 `매출`·`이익률` 등 피벗 시트).
export function buildStoreAxisTrendRows({
  metric,
  rowsByColumn,
}: {
  metric: PeriodAnalysisMetric;
  rowsByColumn: StoreComparisonReportRow[][];
}): PeriodTrendRow[] {
  const storeNames = new Map<string, string>();

  for (const rows of rowsByColumn) {
    for (const row of rows) {
      storeNames.set(row.storeId, row.storeName);
    }
  }

  return [...storeNames.entries()]
    .sort((left, right) => left[1].localeCompare(right[1], "ko"))
    .map(([storeId, storeName]) => {
      const cells = rowsByColumn.map(
        (rows) =>
          rows.find((row) => row.storeId === storeId)?.[metric.key] ?? null,
      );
      const weights = rowsByColumn.map(
        (rows) =>
          rows.find((row) => row.storeId === storeId)?.salesAmount.value ?? 0,
      );

      return {
        key: storeId,
        label: storeName,
        kind: metric.kind,
        cells,
        total: sumOrWeightedAverage(metric.kind, cells, weights),
      };
    });
}
