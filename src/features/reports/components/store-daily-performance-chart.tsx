"use client";

import { useMemo, useState } from "react";
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
import { hasSignificantGrossMarginGap } from "~/features/reports/store-daily-performance";
import type { DailyMeetingReportRow } from "~/features/reports/types";

type StoreDailyPerformanceChartProps = {
  rows: DailyMeetingReportRow[];
};

type SortMode = "salesAmount" | "grossMarginRate";

type StoreChartRow = {
  storeId: string;
  storeName: string;
  salesAmount: number;
  grossMarginRate: number | null;
  expectedGrossMarginRate: number | null;
  reportMarginGapThresholdBps: number;
  label: string;
};

const chartConfig = {
  salesAmount: { label: "매출액", color: "var(--chart-1)" },
} satisfies ChartConfig;

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
  notation: "compact",
});

const actualPercentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 2,
});

const expectedPercentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentagePointFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

const koreanCollator = new Intl.Collator("ko-KR");

function formatActualMargin(value: number | null) {
  return value === null ? "데이터 부족" : actualPercentFormatter.format(value);
}

function formatExpectedMargin(value: number | null) {
  return value === null
    ? "데이터 부족"
    : expectedPercentFormatter.format(value);
}

function formatMarginThreshold(thresholdBps: number) {
  return `${percentagePointFormatter.format(thresholdBps / 100)}%p`;
}

function formatMarginWarning(
  actual: number | null,
  expected: number | null,
  thresholdBps: number,
) {
  if (actual === null || expected === null) return "판정 불가";
  return hasSignificantGrossMarginGap(actual, expected, thresholdBps)
    ? `${formatMarginThreshold(thresholdBps)} 이상`
    : "기준 이내";
}

function formatMarginComparison(
  actual: number | null,
  expected: number | null,
) {
  const actualLabel =
    actual === null ? "실제 데이터 부족" : `실제 ${formatActualMargin(actual)}`;
  const expectedLabel =
    expected === null
      ? "예상 데이터 부족"
      : `예상 ${formatExpectedMargin(expected)}`;

  return `${actualLabel} (${expectedLabel})`;
}

function formatChartLabel(row: Omit<StoreChartRow, "label">) {
  const warning = hasSignificantGrossMarginGap(
    row.grossMarginRate,
    row.expectedGrossMarginRate,
    row.reportMarginGapThresholdBps,
  )
    ? ` · 마진 차이 ${formatMarginThreshold(
        row.reportMarginGapThresholdBps,
      )} 이상`
    : "";

  return `${krwFormatter.format(row.salesAmount)} · ${formatMarginComparison(
    row.grossMarginRate,
    row.expectedGrossMarginRate,
  )}${warning}`;
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

  const [comparison, warning] = value.split(" · 마진 차이 ");
  const labelY = warning ? y + height / 2 - 7 : y + height / 2;

  return (
    <text
      x={x + width + 8}
      y={labelY}
      dominantBaseline="central"
      className="fill-foreground text-xs"
    >
      <tspan>{comparison}</tspan>
      {warning ? (
        <tspan x={x + width + 8} dy="1.2em">
          마진 차이 {warning}
        </tspan>
      ) : null}
    </text>
  );
}

export function StoreDailyPerformanceChart({
  rows,
}: StoreDailyPerformanceChartProps) {
  const [sortMode, setSortMode] = useState<SortMode>("salesAmount");
  const chartData = useMemo(
    () =>
      rows
        .filter((row) => row.salesAmount.value !== null)
        .map((row) => {
          const chartRow = {
            storeId: row.storeId,
            storeName: row.storeName,
            salesAmount: row.salesAmount.value!,
            grossMarginRate: row.grossMarginRate.value,
            expectedGrossMarginRate: row.expectedGrossMarginRate.value,
            reportMarginGapThresholdBps: row.reportMarginGapThresholdBps,
          };

          return { ...chartRow, label: formatChartLabel(chartRow) };
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
            className="min-w-[560px]"
            style={{ height: chartHeight }}
          >
            <BarChart
              accessibilityLayer
              title="지점별 장부 입력 매출·마진율"
              desc="막대는 장부 입력 매출이며 실제 마진, 예상 마진과 지점별 설정값 이상 차이 경고를 함께 표시합니다."
              data={chartData}
              layout="vertical"
              maxBarSize={36}
              margin={{ top: 4, right: 190, left: 4, bottom: 4 }}
            >
              <CartesianGrid horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(value: number) => krwFormatter.format(value)}
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
                      (item.payload as StoreChartRow).label
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
                <LabelList dataKey="label" content={StorePerformanceLabel} />
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      )}

      <table className="sr-only" style={{ tableLayout: "fixed" }}>
        <caption>지점별 매출과 마진 데이터</caption>
        <thead>
          <tr>
            <th>지점</th>
            <th>매출액</th>
            <th>실제 마진</th>
            <th>예상 마진</th>
            <th>마진 차이 경고</th>
          </tr>
        </thead>
        <tbody>
          {chartData.map((row) => (
            <tr key={row.storeId}>
              <td>{row.storeName}</td>
              <td>{krwFormatter.format(row.salesAmount)}</td>
              <td>{formatActualMargin(row.grossMarginRate)}</td>
              <td>{formatExpectedMargin(row.expectedGrossMarginRate)}</td>
              <td>
                {formatMarginWarning(
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
        막대는 지점장이 입력한 총매출이며, 실제 마진율은 매출과 매출원가로, 예상
        마진율은 재고 흐름과 계획 판매가로 계산합니다.
      </p>
      {omittedCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          매출 미입력 {omittedCount}개 지점은 차트에서 제외했습니다.
        </p>
      ) : null}
    </div>
  );
}
