"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import { Button } from "~/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import type { DailyMeetingReportRow } from "~/features/reports/types";

type StoreDailyPerformanceChartProps = {
  rows: DailyMeetingReportRow[];
};

type Metric = "salesAmount" | "grossMarginRate";

const chartConfig = {
  salesAmount: { label: "추정 매출액", color: "var(--chart-1)" },
  grossMarginRate: { label: "추정 이익률", color: "var(--chart-2)" },
} satisfies ChartConfig;

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
  notation: "compact",
});

const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function StoreDailyPerformanceChart({
  rows,
}: StoreDailyPerformanceChartProps) {
  const [metric, setMetric] = useState<Metric>("grossMarginRate");

  // 값이 있는 지점만 그린다(미입력·계산 불가 지점은 막대로 0처럼 보이면 오해됨).
  const chartData = rows
    .map((row) => ({
      storeName: row.storeName,
      salesAmount: row.salesAmount.value,
      grossMarginRate: row.grossMarginRate.value,
    }))
    .filter((row) => row[metric] !== null) as Array<{
    storeName: string;
    salesAmount: number;
    grossMarginRate: number;
  }>;

  const omittedCount = rows.length - chartData.length;
  const format = (value: number) =>
    metric === "salesAmount"
      ? krwFormatter.format(value)
      : percentFormatter.format(value);

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="지표 전환"
      >
        <Button
          size="sm"
          variant={metric === "grossMarginRate" ? "default" : "outline"}
          aria-pressed={metric === "grossMarginRate"}
          onClick={() => setMetric("grossMarginRate")}
        >
          이익률
        </Button>
        <Button
          size="sm"
          variant={metric === "salesAmount" ? "default" : "outline"}
          aria-pressed={metric === "salesAmount"}
          onClick={() => setMetric("salesAmount")}
        >
          매출액
        </Button>
      </div>

      {chartData.length === 0 ? (
        <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
          표시할 지점 데이터 없음
        </div>
      ) : (
        <ChartContainer
          config={chartConfig}
          className="h-[280px] w-full"
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 56, left: 8, bottom: 4 }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={format}
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
                  formatter={(value) => format(Number(value))}
                />
              }
            />
            <Bar dataKey={metric} fill={`var(--color-${metric})`} radius={4}>
              <LabelList
                dataKey={metric}
                position="right"
                className="fill-foreground text-xs"
                formatter={(value) => format(Number(value))}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}

      <p className="text-muted-foreground text-xs">
        지점별 당일 추정 매출액과 추정 이익률입니다. 품목별 POS 매출이 없어 재고
        흐름과 판매가 계획 기반으로 산출한 추정값이며 확정 매출·이익률이
        아닙니다.
      </p>
      {omittedCount > 0 ? (
        <p className="text-muted-foreground text-xs">
          미입력·계산 불가 {omittedCount}개 지점은 차트에서 제외했습니다.
        </p>
      ) : null}
    </div>
  );
}
