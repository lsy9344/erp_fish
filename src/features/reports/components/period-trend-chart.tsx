"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
  type DotItemDotProps,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import type {
  PeriodAnalysisMetric,
  PeriodTrendColumn,
  PeriodTrendRow,
} from "../period-analysis";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

const LINE_PATTERNS = [
  "0",
  "8 4",
  "2 3",
  "12 4 2 4",
  "1 3",
  "16 4 2 4",
  "6 2",
] as const;

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});
const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});
const headcountFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatValue(kind: PeriodAnalysisMetric["kind"], value: number) {
  if (kind === "percent") return percentFormatter.format(value);
  if (kind === "headcount") return `${headcountFormatter.format(value)}명`;
  return krwFormatter.format(value);
}

function TrendDot({
  row,
  columnCount,
  props,
}: {
  row: PeriodTrendRow;
  columnCount: number;
  props: DotItemDotProps;
}) {
  const { cx, cy, index } = props;
  const value = props.value as unknown;
  if (
    typeof cx !== "number" ||
    typeof cy !== "number" ||
    typeof index !== "number" ||
    typeof value !== "number"
  ) {
    return null;
  }

  const previousValue = row.cells[index - 1]?.value ?? null;
  const nextValue = row.cells[index + 1]?.value ?? null;
  const isIsolated = previousValue === null || nextValue === null;
  if (columnCount > 12 && !isIsolated) return null;

  return (
    <circle
      cx={cx}
      cy={cy}
      fill={`var(--color-${row.key})`}
      r={3}
      stroke="var(--background)"
      strokeWidth={1.5}
    />
  );
}

function TrendLegend({ rows }: { rows: PeriodTrendRow[] }) {
  return (
    <div
      aria-label="지점 범례"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-3"
    >
      {rows.map((row, index) => (
        <div
          key={row.key}
          className="flex min-w-0 items-center gap-1.5 text-xs"
        >
          <svg
            aria-hidden="true"
            className="h-3 w-8 shrink-0"
            viewBox="0 0 32 12"
          >
            <line
              x1="1"
              x2="31"
              y1="6"
              y2="6"
              stroke={`var(--color-${row.key})`}
              strokeDasharray={LINE_PATTERNS[index % LINE_PATTERNS.length]}
              strokeWidth="2"
            />
          </svg>
          <span className="max-w-32 whitespace-nowrap">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

export function PeriodTrendChart({
  columns,
  rows,
  metric,
}: {
  columns: PeriodTrendColumn[];
  rows: PeriodTrendRow[];
  metric: PeriodAnalysisMetric;
}) {
  const config = Object.fromEntries(
    rows.map((row, index) => [
      row.key,
      {
        label: row.label,
        color: CHART_COLORS[index % CHART_COLORS.length],
      },
    ]),
  ) satisfies ChartConfig;
  const data = columns.map((column, columnIndex) => ({
    period: column.label,
    ...Object.fromEntries(
      rows.map((row) => [row.key, row.cells[columnIndex]?.value ?? null]),
    ),
  }));

  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle>{metric.label} 지점별 추이</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          aria-label={`${metric.label} 지점별 기간 추이 꺾은선 차트`}
          className="h-80 w-full"
          config={config}
        >
          <LineChart
            accessibilityLayer
            data={data}
            margin={{ left: 8, right: 16 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="period"
              tickLine={false}
              axisLine={false}
              minTickGap={16}
            />
            <YAxis
              tickFormatter={(value) => formatValue(metric.kind, Number(value))}
              tickLine={false}
              axisLine={false}
              width={92}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <div className="flex min-w-40 items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {config[String(name)]?.label ?? String(name)}
                      </span>
                      <span className="font-mono font-medium tabular-nums">
                        {formatValue(metric.kind, Number(value))}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <ChartLegend content={<TrendLegend rows={rows} />} />
            {rows.map((row, index) => (
              <Line
                key={row.key}
                connectNulls={false}
                dataKey={row.key}
                dot={(props) => (
                  <TrendDot
                    row={row}
                    columnCount={columns.length}
                    props={props}
                  />
                )}
                isAnimationActive={false}
                stroke={`var(--color-${row.key})`}
                strokeDasharray={LINE_PATTERNS[index % LINE_PATTERNS.length]}
                strokeWidth={2}
                type="monotone"
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
