"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type {
  ProductProfitabilityReportItem,
  ProductProfitabilitySummary,
} from "~/features/reports/types";

type ProductProfitabilityReportProps = {
  data: ProductProfitabilitySummary;
  // WO-16(2026-06-28): "both"(기본·일별 리포트)면 차트+표를 함께, "chart"/"table"이면 한쪽만.
  mode?: "both" | "chart" | "table";
};

const chartConfig = {
  estimatedSalesAmount: { label: "추정 판매액", color: "var(--chart-1)" },
} satisfies ChartConfig;

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
  notation: "compact",
});

// 표는 정확한 금액을 보여주므로 compact 표기를 쓰지 않는다.
const krwTableFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});

const quantityFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});

// 이익률 구간별 막대 색. 높음=초록, 보통=노랑, 낮음=주황, 음수/계산불가=빨강.
function marginColor(rate: number | null): string {
  if (rate === null) return "var(--color-rate-unavailable)";
  if (rate < 0) return "var(--color-rate-negative)";
  if (rate < 0.1) return "var(--color-rate-low)";
  if (rate < 0.3) return "var(--color-rate-mid)";
  return "var(--color-rate-high)";
}

function marginLabel(rate: number | null): string {
  return rate === null ? "계산 불가" : percentFormatter.format(rate);
}

export function ProductProfitabilityReport({
  data,
  mode = "both",
}: ProductProfitabilityReportProps) {
  const showChart = mode !== "table";
  const showTable = mode !== "chart";

  if (data.items.length === 0) {
    return (
      <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
        품목별 판매 데이터 없음
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3"
      // 색 변수는 한 곳에서 정의해 막대/범례가 동일하게 쓴다.
      style={
        {
          "--color-rate-high": "var(--chart-2)",
          "--color-rate-mid": "var(--chart-4)",
          "--color-rate-low": "var(--chart-5)",
          "--color-rate-negative": "var(--destructive)",
          "--color-rate-unavailable": "var(--muted-foreground)",
        } as React.CSSProperties
      }
    >
      {/* 당일 전체 판매분 합산 요약 (WO Task 3). */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground text-xs">추정 판매액 합계</dt>
          <dd className="text-base font-semibold tabular-nums">
            {krwFormatter.format(data.totalSalesAmount)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">추정 매출이익 합계</dt>
          <dd className="text-base font-semibold tabular-nums">
            {krwFormatter.format(data.totalGrossProfit)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">당일 추정 이익률</dt>
          <dd className="text-base font-semibold tabular-nums">
            {marginLabel(data.totalGrossMarginRate)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">품목 수</dt>
          <dd className="text-base font-semibold tabular-nums">
            {data.items.length}
          </dd>
        </div>
      </dl>

      {showChart ? (
        <ChartContainer config={chartConfig} className="h-[360px] w-full">
          <BarChart
            accessibilityLayer
            data={data.items}
            layout="vertical"
            margin={{ top: 4, right: 64, left: 8, bottom: 4 }}
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
              dataKey="productName"
              tickLine={false}
              axisLine={false}
              width={110}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, item) => {
                    const row = item.payload as ProductProfitabilityReportItem;
                    return [
                      `${row.productCategory} · ${krwFormatter.format(Number(value))}`,
                      `이익률 ${marginLabel(row.estimatedGrossMarginRate)} (${row.statusLabel})`,
                    ].join("  ");
                  }}
                />
              }
            />
            <Bar dataKey="estimatedSalesAmount" radius={4}>
              {data.items.map((item) => (
                <Cell
                  key={item.productId}
                  fill={marginColor(item.estimatedGrossMarginRate)}
                />
              ))}
              <LabelList
                dataKey="estimatedGrossMarginRate"
                position="right"
                className="fill-foreground text-xs"
                formatter={(value) =>
                  marginLabel(typeof value === "number" ? value : null)
                }
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      ) : null}

      {/* WO-04(2026-06-28): 차트와 같은 data source의 표. 본사 전용 리포트라 원가·마진을 노출한다. */}
      {showTable ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>품목</TableHead>
                <TableHead>규격</TableHead>
                <TableHead>분류</TableHead>
                <TableHead className="text-right">추정 판매 수량</TableHead>
                <TableHead className="text-right">추정 판매액</TableHead>
                <TableHead className="text-right">추정 원가</TableHead>
                <TableHead className="text-right">추정 마진</TableHead>
                <TableHead className="text-right">추정 이익률</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item) => (
                <TableRow key={item.productId}>
                  <TableCell className="font-medium">
                    {item.productName}
                  </TableCell>
                  <TableCell>{item.productSpec || "-"}</TableCell>
                  <TableCell>{item.productCategory}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {quantityFormatter.format(item.soldQuantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {krwTableFormatter.format(item.estimatedSalesAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {krwTableFormatter.format(item.estimatedCogsAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {krwTableFormatter.format(item.estimatedGrossProfit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {marginLabel(item.estimatedGrossMarginRate)}
                  </TableCell>
                  <TableCell>{item.statusLabel}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <p className="text-muted-foreground text-xs">
        추정 판매 수량 = 전일재고 + 당일매입 − 손실수량 − 당일재고. POS 실제
        판매 데이터가 아닌 재고 흐름 기반 추정값입니다.
      </p>

      {showChart ? (
        <>
          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>이익률 색상:</span>
            <span style={{ color: "var(--color-rate-high)" }}>≥30%</span>
            <span style={{ color: "var(--color-rate-mid)" }}>10–30%</span>
            <span style={{ color: "var(--color-rate-low)" }}>0–10%</span>
            <span style={{ color: "var(--color-rate-negative)" }}>음수</span>
            <span style={{ color: "var(--color-rate-unavailable)" }}>
              계산 불가
            </span>
          </div>

          <p className="text-muted-foreground text-xs">
            막대 길이는 추정 판매액(판매량 × 판매가 계획, 없으면 매입단가 폴백),
            색·라벨은 추정 이익률(추정 판매액과 FIFO 소진금액 기반 추정
            원가)입니다. 확정 POS 매출·원가가 아닙니다.
          </p>
        </>
      ) : null}
      {data.salesPriceFallbackItemCount > 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          판매가 계획이 없어 매입단가로 대체한(판매가 미반영) 품목{" "}
          {data.salesPriceFallbackItemCount}개가 있어 추정 매출·이익률이 실제
          의도보다 낮게 보일 수 있습니다.
        </p>
      ) : null}
      {data.unavailableItemCount > 0 ? (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          추정 판매액이 0이라 이익률을 낼 수 없는 품목{" "}
          {data.unavailableItemCount}
          개는 계산 불가로 표시했습니다.
        </p>
      ) : null}
    </div>
  );
}
