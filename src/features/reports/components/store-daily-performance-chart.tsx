"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
  type LabelProps,
} from "recharts";

import { Button } from "~/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import {
  getGrossMarginGap,
  hasSignificantGrossMarginGap,
} from "~/features/reports/store-daily-performance";
import type { DailyMeetingReportRow } from "~/features/reports/types";
import { cn } from "~/lib/utils";

type StoreDailyPerformanceChartProps = {
  rows: DailyMeetingReportRow[];
  variant: "daily" | "salesReview";
};

type ViewMode = "salesAmount" | "grossMarginRate";
type SalesReviewSortMode = "salesAmount" | "grossMarginRate";

type StoreChartRow = {
  storeId: string;
  storeName: string;
  salesAmount: number | null;
  closingSalesAmount: number | null;
  carryoverSalesAmount: number | null;
  grossMarginRate: number | null;
  grossMarginReason: string | null;
  expectedGrossMarginRate: number | null;
  expectedGrossMarginReason: string | null;
  reportMarginGapThresholdBps: number;
};

type SalesChartRow = StoreChartRow & {
  salesAmount: number;
  label: string;
};

type SalesReviewChartRow = {
  storeId: string;
  storeName: string;
  salesAmount: number;
  closingSalesAmount: number | null;
  carryoverSalesAmount: number | null;
  grossMarginRate: number | null;
  expectedGrossMarginRate: number | null;
  reportMarginGapThresholdBps: number;
  label: string;
};

const chartConfig = {
  salesAmount: { label: "영업 매출 합계", color: "var(--chart-1)" },
} satisfies ChartConfig;

const axisKrwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
  notation: "compact",
});

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const signedPercentagePointFormatter = new Intl.NumberFormat("ko-KR", {
  signDisplay: "always",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const thresholdPercentagePointFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const salesReviewActualPercentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 2,
});

const salesReviewExpectedPercentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const salesReviewPercentagePointFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

const koreanCollator = new Intl.Collator("ko-KR");

function formatMargin(value: number | null) {
  return value === null ? "판정 불가" : percentFormatter.format(value);
}

function formatMarginGap(actual: number | null, expected: number | null) {
  const gap = getGrossMarginGap(actual, expected);
  return gap === null
    ? "판정 불가"
    : `${signedPercentagePointFormatter.format(gap * 100)}%p`;
}

function formatMarginThreshold(thresholdBps: number) {
  return `${thresholdPercentagePointFormatter.format(thresholdBps / 100)}%p`;
}

function formatMarginUnavailableReason(row: StoreChartRow) {
  const reasons = [
    row.grossMarginRate === null ? row.grossMarginReason : null,
    row.expectedGrossMarginRate === null ? row.expectedGrossMarginReason : null,
  ].filter((reason): reason is string => Boolean(reason));

  return [...new Set(reasons)].join(" / ") || "판정 불가";
}

function formatMarginWarning(row: StoreChartRow) {
  if (row.grossMarginRate === null || row.expectedGrossMarginRate === null) {
    return formatMarginUnavailableReason(row);
  }

  return hasSignificantGrossMarginGap(
    row.grossMarginRate,
    row.expectedGrossMarginRate,
    row.reportMarginGapThresholdBps,
  )
    ? `지점 설정값 ${formatMarginThreshold(row.reportMarginGapThresholdBps)} 이상`
    : "기준 이내";
}

function isWarning(row: StoreChartRow) {
  return hasSignificantGrossMarginGap(
    row.grossMarginRate,
    row.expectedGrossMarginRate,
    row.reportMarginGapThresholdBps,
  );
}

function formatChartLabel(row: StoreChartRow & { salesAmount: number }) {
  const comparisonLabel = [
    `실제 ${formatMargin(row.grossMarginRate)} (예상 ${formatMargin(row.expectedGrossMarginRate)})`,
    `차이 ${formatMarginGap(row.grossMarginRate, row.expectedGrossMarginRate)}`,
    isWarning(row) ? "기준 이상" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return `${krwFormatter.format(row.salesAmount)}\n${comparisonLabel}`;
}

function compareNullableDescending(a: number | null, b: number | null) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return b - a;
}

function StorePerformanceLabel({ x, y, width, height, value }: LabelProps) {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof value !== "string"
  ) {
    return null;
  }

  const lines = value.split("\n");
  const lineHeight = 16;
  const labelY = y + height / 2 - ((lines.length - 1) * lineHeight) / 2;

  return (
    <text
      data-slot="store-performance-bar-label"
      x={x + width + 8}
      y={labelY}
      dominantBaseline="central"
      className="fill-foreground text-xs"
    >
      {lines.map((line, index) => (
        <tspan
          key={`${line}-${index}`}
          x={x + width + 8}
          dy={index === 0 ? 0 : lineHeight}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

function SalesAmountView({ rows }: { rows: SalesChartRow[] }) {
  const chartHeight = Math.max(160, rows.length * 56 + 48);
  const longestLabelLine = useMemo(
    () =>
      rows
        .flatMap((row) => row.label.split("\n"))
        .reduce(
          (longest, line) => (line.length > longest.length ? line : longest),
          "",
        ),
    [rows],
  );
  const labelMeasureRef = useRef<HTMLSpanElement>(null);
  const [labelRightMargin, setLabelRightMargin] = useState(24);

  useLayoutEffect(() => {
    const measuredWidth =
      labelMeasureRef.current?.getBoundingClientRect().width;
    if (measuredWidth) {
      setLabelRightMargin(Math.ceil(measuredWidth) + 24);
    }
  }, [longestLabelLine]);

  const chartMinWidth = Math.max(520, 380 + labelRightMargin);

  return (
    <div className="relative">
      <span
        ref={labelMeasureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute text-xs whitespace-nowrap"
      >
        {longestLabelLine}
      </span>
      <div
        data-testid="store-performance-chart-scroll"
        className="w-full overflow-x-auto"
      >
        <ChartContainer
          config={chartConfig}
          className="w-full"
          style={{ height: chartHeight, minWidth: chartMinWidth }}
        >
          <BarChart
            accessibilityLayer
            title="지점별 영업 매출 합계"
            desc="매출액순 막대와 실제 마진, 예상 마진, 부호 있는 차이 및 지점 설정값 이상 경고를 함께 표시합니다."
            data={rows}
            layout="vertical"
            maxBarSize={26}
            margin={{
              top: 4,
              right: labelRightMargin,
              left: 4,
              bottom: 4,
            }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(value: number) => axisKrwFormatter.format(value)}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="storeName"
              tickLine={false}
              axisLine={false}
              width={96}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(_value, _name, item) =>
                    (item.payload as SalesChartRow).label
                  }
                />
              }
            />
            <Bar dataKey="salesAmount" radius={4}>
              {rows.map((row) => (
                <Cell
                  key={row.storeId}
                  data-testid={`store-performance-bar-${row.storeId}`}
                  fill={
                    isWarning(row) ? "var(--destructive)" : "var(--chart-1)"
                  }
                />
              ))}
              <LabelList dataKey="label" content={StorePerformanceLabel} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>

      <table className="sr-only" style={{ tableLayout: "fixed" }}>
        <caption>지점별 매출 구성과 마진 데이터</caption>
        <thead>
          <tr>
            <th>지점</th>
            <th>장부 마감 매출</th>
            <th>이월 매출</th>
            <th>영업 매출 합계</th>
            <th>실제 마진</th>
            <th>예상 마진</th>
            <th>마진 차이</th>
            <th>마진 차이 경고</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.storeId}>
              <td>{row.storeName}</td>
              <td>
                {row.closingSalesAmount === null
                  ? "계산 불가"
                  : krwFormatter.format(row.closingSalesAmount)}
              </td>
              <td>
                {row.carryoverSalesAmount === null
                  ? "계산 불가"
                  : krwFormatter.format(row.carryoverSalesAmount)}
              </td>
              <td>{krwFormatter.format(row.salesAmount)}</td>
              <td>{formatMargin(row.grossMarginRate)}</td>
              <td>{formatMargin(row.expectedGrossMarginRate)}</td>
              <td>
                {formatMarginGap(
                  row.grossMarginRate,
                  row.expectedGrossMarginRate,
                )}
              </td>
              <td>{formatMarginWarning(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GrossMarginView({ rows }: { rows: StoreChartRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div
        className="divide-y sm:hidden"
        role="list"
        aria-label="지점별 매출 구성과 마진 데이터"
      >
        {rows.map((row) => {
          const warning = isWarning(row);
          return (
            <div
              key={row.storeId}
              data-testid={`store-margin-card-${row.storeId}`}
              className="space-y-2 px-3 py-3"
              role="listitem"
            >
              <div>
                <p className="font-medium">{row.storeName}</p>
                <p
                  className={cn(
                    "mt-0.5 text-xs break-words",
                    warning ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {formatMarginWarning(row)}
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-right">
                <div>
                  <dt className="text-muted-foreground text-xs">실제</dt>
                  <dd className="mt-0.5 text-sm tabular-nums">
                    {formatMargin(row.grossMarginRate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">예상</dt>
                  <dd className="mt-0.5 text-sm tabular-nums">
                    {formatMargin(row.expectedGrossMarginRate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">차이</dt>
                  <dd
                    className={cn(
                      "mt-0.5 text-sm font-medium tabular-nums",
                      warning && "text-destructive",
                    )}
                  >
                    {formatMarginGap(
                      row.grossMarginRate,
                      row.expectedGrossMarginRate,
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>

      <table className="hidden w-full table-fixed text-sm sm:table">
        <caption className="sr-only">지점별 매출 구성과 마진 데이터</caption>
        <thead className="bg-muted/50">
          <tr>
            <th className="w-[40%] px-3 py-2 text-left font-medium">지점</th>
            <th className="w-[20%] px-2 py-2 text-right font-medium">실제</th>
            <th className="w-[20%] px-2 py-2 text-right font-medium">예상</th>
            <th className="w-[20%] px-3 py-2 text-right font-medium">차이</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const warning = isWarning(row);
            return (
              <tr
                key={row.storeId}
                data-testid={`store-margin-row-${row.storeId}`}
                className="border-t"
              >
                <th className="px-3 py-2 text-left align-top font-medium">
                  {row.storeName}
                  <span
                    className={cn(
                      "mt-0.5 block text-xs font-normal",
                      warning ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {formatMarginWarning(row)}
                  </span>
                </th>
                <td className="px-2 py-2 text-right align-top tabular-nums">
                  {formatMargin(row.grossMarginRate)}
                </td>
                <td className="px-2 py-2 text-right align-top tabular-nums">
                  {formatMargin(row.expectedGrossMarginRate)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 text-right align-top font-medium tabular-nums",
                    warning && "text-destructive",
                  )}
                >
                  {formatMarginGap(
                    row.grossMarginRate,
                    row.expectedGrossMarginRate,
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DailyPerformanceViews({ rows }: { rows: DailyMeetingReportRow[] }) {
  const [viewMode, setViewMode] = useState<ViewMode>("salesAmount");
  const storeRows = useMemo<StoreChartRow[]>(
    () =>
      rows.map((row) => ({
        storeId: row.storeId,
        storeName: row.storeName,
        salesAmount: row.salesAmount.value,
        closingSalesAmount: row.closingSalesAmount.value,
        carryoverSalesAmount: row.carryoverSalesAmount.value,
        grossMarginRate: row.grossMarginRate.value,
        grossMarginReason: row.grossMarginRate.reason ?? null,
        expectedGrossMarginRate: row.expectedGrossMarginRate.value,
        expectedGrossMarginReason: row.expectedGrossMarginRate.reason ?? null,
        reportMarginGapThresholdBps: row.reportMarginGapThresholdBps,
      })),
    [rows],
  );
  const salesRows = useMemo<SalesChartRow[]>(
    () =>
      storeRows
        .filter(
          (
            row,
          ): row is StoreChartRow & {
            salesAmount: number;
          } => row.salesAmount !== null,
        )
        .map((row) => ({ ...row, label: formatChartLabel(row) }))
        .sort(
          (a, b) =>
            b.salesAmount - a.salesAmount ||
            koreanCollator.compare(a.storeName, b.storeName),
        ),
    [storeRows],
  );
  const marginRows = useMemo(
    () =>
      [...storeRows].sort((a, b) => {
        const aUnavailable =
          a.grossMarginRate === null || a.expectedGrossMarginRate === null;
        const bUnavailable =
          b.grossMarginRate === null || b.expectedGrossMarginRate === null;
        if (aUnavailable !== bUnavailable) {
          return aUnavailable ? 1 : -1;
        }

        const primary = compareNullableDescending(
          a.grossMarginRate,
          b.grossMarginRate,
        );
        return (
          primary ||
          compareNullableDescending(a.salesAmount, b.salesAmount) ||
          koreanCollator.compare(a.storeName, b.storeName)
        );
      }),
    [storeRows],
  );
  const visibleRows = viewMode === "salesAmount" ? salesRows : marginRows;
  const omittedCount = rows.length - salesRows.length;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <ToggleGroup
        type="single"
        value={viewMode}
        onValueChange={(value) => {
          if (value === "salesAmount" || value === "grossMarginRate") {
            setViewMode(value);
          }
        }}
        aria-label="보기 방식"
        role="radiogroup"
      >
        <ToggleGroupItem
          aria-checked={viewMode === "salesAmount"}
          role="radio"
          value="salesAmount"
        >
          매출액순
        </ToggleGroupItem>
        <ToggleGroupItem
          aria-checked={viewMode === "grossMarginRate"}
          role="radio"
          value="grossMarginRate"
        >
          마진율순
        </ToggleGroupItem>
      </ToggleGroup>

      {visibleRows.length === 0 ? (
        <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
          표시할 지점 데이터 없음
        </div>
      ) : viewMode === "salesAmount" ? (
        <SalesAmountView rows={salesRows} />
      ) : (
        <GrossMarginView rows={marginRows} />
      )}

      <p className="text-muted-foreground text-xs">
        실제 마진율은 영업 매출 합계와 매출원가로, 예상 마진율은 재고 흐름과
        판매한 가격으로 계산합니다. 경고는 지점 설정값 이상인 차이에만
        표시합니다.
      </p>
      {viewMode === "salesAmount" && omittedCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          영업 매출 합계 미입력 {omittedCount}개 지점은 매출액 보기에서
          제외했습니다.
        </p>
      ) : null}
    </div>
  );
}

function formatSalesReviewActualMargin(value: number | null) {
  return value === null
    ? "데이터 부족"
    : salesReviewActualPercentFormatter.format(value);
}

function formatSalesReviewExpectedMargin(value: number | null) {
  return value === null
    ? "데이터 부족"
    : salesReviewExpectedPercentFormatter.format(value);
}

function formatSalesReviewThreshold(thresholdBps: number) {
  return `${salesReviewPercentagePointFormatter.format(thresholdBps / 100)}%p`;
}

function formatSalesReviewWarning(
  actual: number | null,
  expected: number | null,
  thresholdBps: number,
) {
  if (actual === null || expected === null) return "판정 불가";
  return hasSignificantGrossMarginGap(actual, expected, thresholdBps)
    ? `${formatSalesReviewThreshold(thresholdBps)} 이상`
    : "기준 이내";
}

function formatSalesReviewComparison(
  actual: number | null,
  expected: number | null,
) {
  const actualLabel =
    actual === null
      ? "실제 데이터 부족"
      : `실제 ${formatSalesReviewActualMargin(actual)}`;
  const expectedLabel =
    expected === null
      ? "예상 데이터 부족"
      : `예상 ${formatSalesReviewExpectedMargin(expected)}`;

  return `${actualLabel} (${expectedLabel})`;
}

function formatSalesReviewChartLabel(row: Omit<SalesReviewChartRow, "label">) {
  const warning = hasSignificantGrossMarginGap(
    row.grossMarginRate,
    row.expectedGrossMarginRate,
    row.reportMarginGapThresholdBps,
  )
    ? `마진 차이 ${formatSalesReviewThreshold(row.reportMarginGapThresholdBps)} 이상`
    : "";

  return [
    `영업 합계 ${axisKrwFormatter.format(row.salesAmount)} (장부 마감 ${axisKrwFormatter.format(row.closingSalesAmount ?? 0)} + 이월 ${axisKrwFormatter.format(row.carryoverSalesAmount ?? 0)})`,
    formatSalesReviewComparison(
      row.grossMarginRate,
      row.expectedGrossMarginRate,
    ),
    warning,
  ]
    .filter(Boolean)
    .join("\n");
}

function SalesReviewPerformanceLabel({
  x,
  y,
  width,
  height,
  value,
}: LabelProps) {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof value !== "string"
  ) {
    return null;
  }

  const lines = value.split("\n");
  const labelY = y + height / 2 - ((lines.length - 1) * 14) / 2;

  return (
    <text
      x={x + width + 8}
      y={labelY}
      dominantBaseline="central"
      className="fill-foreground text-xs"
    >
      {lines.map((line, index) => (
        <tspan
          key={`${line}-${index}`}
          x={x + width + 8}
          dy={index === 0 ? 0 : "1.2em"}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

function SalesReviewPerformanceChart({
  rows,
}: {
  rows: DailyMeetingReportRow[];
}) {
  const [sortMode, setSortMode] = useState<SalesReviewSortMode>("salesAmount");
  const chartData = useMemo(
    () =>
      rows
        .filter((row) => row.salesAmount.value !== null)
        .map((row) => {
          const chartRow = {
            storeId: row.storeId,
            storeName: row.storeName,
            salesAmount: row.salesAmount.value!,
            closingSalesAmount: row.closingSalesAmount.value,
            carryoverSalesAmount: row.carryoverSalesAmount.value,
            grossMarginRate: row.grossMarginRate.value,
            expectedGrossMarginRate: row.expectedGrossMarginRate.value,
            reportMarginGapThresholdBps: row.reportMarginGapThresholdBps,
          };

          return {
            ...chartRow,
            label: formatSalesReviewChartLabel(chartRow),
          };
        })
        .sort((a, b) => {
          const primary = compareNullableDescending(
            sortMode === "salesAmount" ? a.salesAmount : a.grossMarginRate,
            sortMode === "salesAmount" ? b.salesAmount : b.grossMarginRate,
          );
          return (
            primary ||
            b.salesAmount - a.salesAmount ||
            koreanCollator.compare(a.storeName, b.storeName)
          );
        }),
    [rows, sortMode],
  );
  const omittedCount = rows.length - chartData.length;
  const chartHeight = Math.max(140, chartData.length * 48 + 48);

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="정렬 기준">
        <Button
          size="sm"
          variant={sortMode === "salesAmount" ? "default" : "outline"}
          aria-pressed={sortMode === "salesAmount"}
          onClick={() => setSortMode("salesAmount")}
        >
          매출액순
        </Button>
        <Button
          size="sm"
          variant={sortMode === "grossMarginRate" ? "default" : "outline"}
          aria-pressed={sortMode === "grossMarginRate"}
          onClick={() => setSortMode("grossMarginRate")}
        >
          마진율순
        </Button>
      </div>

      {chartData.length === 0 ? (
        <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
          표시할 지점 데이터 없음
        </div>
      ) : (
        <div
          data-testid="store-performance-chart-scroll"
          className="w-full overflow-x-auto"
        >
          <ChartContainer
            config={chartConfig}
            className="min-w-[760px]"
            style={{ height: chartHeight }}
          >
            <BarChart
              accessibilityLayer
              title="지점별 영업 매출 합계·마진율"
              desc="막대는 장부 마감 매출과 이월 매출을 더한 영업 매출 합계이며 실제 마진, 예상 마진과 지점별 설정값 이상 차이 경고를 함께 표시합니다."
              data={chartData}
              layout="vertical"
              maxBarSize={36}
              margin={{ top: 4, right: 390, left: 4, bottom: 4 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(value: number) =>
                  axisKrwFormatter.format(value)
                }
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="storeName"
                tickLine={false}
                axisLine={false}
                width={96}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(_value, _name, item) =>
                      (item.payload as SalesReviewChartRow).label
                    }
                  />
                }
              />
              <Bar dataKey="salesAmount" radius={4}>
                {chartData.map((row) => (
                  <Cell
                    key={row.storeId}
                    data-testid={`store-performance-bar-${row.storeId}`}
                    fill={
                      hasSignificantGrossMarginGap(
                        row.grossMarginRate,
                        row.expectedGrossMarginRate,
                        row.reportMarginGapThresholdBps,
                      )
                        ? "var(--destructive)"
                        : "var(--chart-1)"
                    }
                  />
                ))}
                <LabelList
                  dataKey="label"
                  content={SalesReviewPerformanceLabel}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      )}

      <table className="sr-only" style={{ tableLayout: "fixed" }}>
        <caption>지점별 매출 구성과 마진 데이터</caption>
        <thead>
          <tr>
            <th>지점</th>
            <th>장부 마감 매출</th>
            <th>이월 매출</th>
            <th>영업 매출 합계</th>
            <th>실제 마진</th>
            <th>예상 마진</th>
            <th>마진 차이 경고</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.storeId}>
              <td>{row.storeName}</td>
              <td>{axisKrwFormatter.format(row.closingSalesAmount ?? 0)}</td>
              <td>{axisKrwFormatter.format(row.carryoverSalesAmount ?? 0)}</td>
              <td>{axisKrwFormatter.format(row.salesAmount)}</td>
              <td>{formatSalesReviewActualMargin(row.grossMarginRate)}</td>
              <td>
                {formatSalesReviewExpectedMargin(row.expectedGrossMarginRate)}
              </td>
              <td>
                {formatSalesReviewWarning(
                  row.grossMarginRate,
                  row.expectedGrossMarginRate,
                  row.reportMarginGapThresholdBps,
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-muted-foreground text-xs">
        막대는 영업 매출 합계입니다. 실제 마진율은 영업 매출 합계와 매출원가로,
        예상 마진율은 재고 흐름과 판매한 가격으로 계산합니다.
      </p>
      {omittedCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          영업 매출 합계 미입력 {omittedCount}개 지점은 차트에서 제외했습니다.
        </p>
      ) : null}
    </div>
  );
}

export function StoreDailyPerformanceChart({
  rows,
  variant,
}: StoreDailyPerformanceChartProps) {
  return variant === "daily" ? (
    <DailyPerformanceViews rows={rows} />
  ) : (
    <SalesReviewPerformanceChart rows={rows} />
  );
}
