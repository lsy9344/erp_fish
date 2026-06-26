"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "~/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import type { StoreManagerTopSoldItem } from "~/features/ledger/review-types";

type StoreTopSoldItemsChartProps = {
  items: StoreManagerTopSoldItem[];
};

type Metric = "estimatedSalesAmount" | "soldQuantity";

const chartConfig = {
  estimatedSalesAmount: { label: "추정 매출", color: "var(--chart-1)" },
  soldQuantity: { label: "판매 수량", color: "var(--chart-2)" },
} satisfies ChartConfig;

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
  notation: "compact",
});

const quantityFormatter = new Intl.NumberFormat("ko-KR");

export function StoreTopSoldItemsChart({ items }: StoreTopSoldItemsChartProps) {
  const [metric, setMetric] = useState<Metric>("estimatedSalesAmount");

  const format = (value: number) =>
    metric === "estimatedSalesAmount"
      ? krwFormatter.format(value)
      : `${quantityFormatter.format(value)}개`;

  // 막대 수에 맞춰 높이를 키운다(고정 높이면 품목이 적을 때 막대가 과하게 두꺼워 보임).
  const chartHeight = Math.max(140, items.length * 48 + 48);

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="지표 전환">
        <Button
          size="sm"
          variant={metric === "estimatedSalesAmount" ? "default" : "outline"}
          aria-pressed={metric === "estimatedSalesAmount"}
          onClick={() => setMetric("estimatedSalesAmount")}
        >
          금액
        </Button>
        <Button
          size="sm"
          variant={metric === "soldQuantity" ? "default" : "outline"}
          aria-pressed={metric === "soldQuantity"}
          onClick={() => setMetric("soldQuantity")}
        >
          수량
        </Button>
      </div>

      <ChartContainer
        config={chartConfig}
        className="w-full max-w-xl"
        style={{ height: chartHeight }}
      >
        <BarChart
          accessibilityLayer
          data={items}
          layout="vertical"
          maxBarSize={36}
          margin={{ top: 4, right: 72, left: 8, bottom: 4 }}
        >
          <CartesianGrid horizontal={false} />
          <XAxis
            type="number"
            dataKey={metric}
            tickFormatter={format}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="productName"
            tickLine={false}
            axisLine={false}
            width={110}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, _name, item) => {
                  const row = item.payload as StoreManagerTopSoldItem;
                  return [
                    format(Number(value)),
                    row.salesBasis === "cost" ? "  · 판매가 미반영" : "",
                  ].join("");
                }}
              />
            }
          />
          <Bar dataKey={metric} radius={4}>
            {items.map((item) => (
              <Cell
                key={item.productId}
                // 판매가 미반영(cost 폴백) 품목은 추정 매출이 낮게 보일 수 있어 색으로 구분한다.
                fill={
                  item.salesBasis === "cost"
                    ? "var(--chart-4)"
                    : `var(--color-${metric})`
                }
              />
            ))}
            <LabelList
              dataKey={metric}
              position="right"
              className="fill-foreground text-xs"
              formatter={(value) => format(Number(value))}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}
