"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import type { ProductCategoryPerformance } from "~/features/reports/types";

type ProductCategoryMarginChartProps = {
  data: ProductCategoryPerformance[];
};

const chartConfig = {
  salesAmount: {
    label: "추정 매출",
    color: "var(--chart-1)",
  },
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

export function ProductCategoryMarginChart({
  data,
}: ProductCategoryMarginChartProps) {
  const chartData = data
    .filter((item) => item.category !== "기타")
    .map((item) => ({
      category: item.category,
      salesAmount: item.salesAmount,
      grossMarginRate: item.grossMarginRate,
      statusLabel: item.statusLabel,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        카테고리별 매출 데이터 없음
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ChartContainer config={chartConfig} className="h-40 w-full">
        <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="category"
            tickLine={false}
            axisLine={false}
            tickMargin={4}
          />
          <YAxis
            tickFormatter={(value: number) => krwFormatter.format(value)}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name, item) => {
                  const row = item.payload as (typeof chartData)[number];
                  const parts: string[] = [krwFormatter.format(Number(value))];

                  if (row.grossMarginRate !== null) {
                    parts.push(
                      `이익률 ${percentFormatter.format(row.grossMarginRate)}`,
                    );
                  }

                  parts.push(`(${row.statusLabel})`);

                  return parts.join(" ");
                }}
              />
            }
          />
          <Bar dataKey="salesAmount" fill="var(--color-salesAmount)" radius={4} />
        </BarChart>
      </ChartContainer>

      <div className="flex gap-4 text-xs text-muted-foreground">
        {chartData.map((item) => (
          <span key={item.category}>
            {item.category}: 추정 이익률{" "}
            {item.grossMarginRate !== null
              ? percentFormatter.format(item.grossMarginRate)
              : "계산 불가"}{" "}
            <span className="text-xs opacity-70">({item.statusLabel})</span>
          </span>
        ))}
      </div>
      {/* 검토 후속(point_summary.md:26): 매출은 재고 흐름 기반 추정값이고, 이익률은
          추정 매출과 FIFO 소진금액(없으면 단가) 기반 추정 매출원가로 산출한 추정값이다.
          확정 POS 매출/원가가 아님을 명시한다. */}
      <p className="text-muted-foreground text-xs">
        매출은 재고 흐름(전일+매입−당일) 기반 추정값이며, 추정 이익률은 추정 매출과 FIFO
        소진금액 기반 추정 원가로 계산한 추정값입니다. 확정 매출·원가가 아닙니다.
      </p>
    </div>
  );
}
