"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
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
            <ChartLegend content={<ChartLegendContent />} />
            {rows.map((row) => (
              <Line
                key={row.key}
                connectNulls={false}
                dataKey={row.key}
                dot={false}
                stroke={`var(--color-${row.key})`}
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
