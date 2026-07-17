"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
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
import { ReviewViewToggle } from "~/features/reports/components/review-view-toggle";
import type {
  HqReportOverviewData,
  ReportOverviewMetricKey,
} from "~/features/reports/overview";
import { formatKrw, formatSignedKrw } from "~/lib/format";

const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});

const lossColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
] as const;

const salesConfig: ChartConfig = {
  currentAmount: { label: "현재 월", color: "var(--chart-1)" },
  previousAmount: { label: "전월 같은 날", color: "var(--muted-foreground)" },
};

const rankingConfig = {
  value: { label: "지점 실적", color: "var(--chart-1)" },
} satisfies ChartConfig;

const profitAndLossConfig = {
  offset: { label: "누적 기준", color: "transparent" },
  amount: { label: "증감액", color: "var(--chart-1)" },
} satisfies ChartConfig;

const closingConfig = {
  closed: { label: "본사 마감", color: "var(--chart-1)" },
  progress: { label: "진행 중", color: "var(--chart-2)" },
  missing: { label: "미입력", color: "var(--chart-3)" },
  holiday: { label: "휴무", color: "var(--chart-4)" },
} satisfies ChartConfig;

const waterfallAxisLabels: Record<string, string> = {
  sales: "매출",
  cogs: "원가",
  grossProfit: "매출이익",
  labor: "인건비",
  storeExpenses: "지점비",
  companyWideExpenses: "전사비",
  hqAdjustment: "본사조정",
  net: "순이익",
};

const rankingMetrics: Array<{
  key: ReportOverviewMetricKey;
  label: string;
}> = [
  { key: "sales", label: "매출" },
  { key: "grossProfit", label: "매출이익" },
  { key: "grossMarginRate", label: "이익률" },
  { key: "loss", label: "손실" },
];

function formatNullableKrw(value: number | null) {
  return value === null ? "계산 불가" : formatKrw(value);
}

function formatRankingValue(metric: ReportOverviewMetricKey, value: number) {
  if (metric === "grossMarginRate") return percentFormatter.format(value);
  if (metric === "grossProfit") return formatSignedKrw(value);
  return formatKrw(value);
}

function chartNumber(value: unknown) {
  return typeof value === "number" ? formatKrw(value) : "계산 불가";
}

function formatWaterfallAxisLabel(value: unknown) {
  const key = String(value);
  return waterfallAxisLabels[key] ?? key;
}

function formatWaterfallDisplayAmount(
  step: HqReportOverviewData["profitAndLoss"]["steps"][number],
) {
  if (step.kind === "total") return formatSignedKrw(step.end);
  if (step.kind === "decrease") return formatSignedKrw(-step.amount);
  return formatSignedKrw(step.amount);
}

function DetailLink({
  href,
  label = "상세 보기",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Button asChild size="sm" variant="outline">
      <Link href={href}>{label}</Link>
    </Button>
  );
}

function EmptyChartState({ message, href }: { message: string; href: string }) {
  return (
    <div className="border-border bg-muted/20 flex min-h-52 flex-col items-start justify-center gap-3 rounded-md border p-5">
      <p className="text-muted-foreground max-w-prose text-sm">{message}</p>
      <DetailLink href={href} label="입력 현황 보기" />
    </div>
  );
}

export function HqReportOverview({ report }: { report: HqReportOverviewData }) {
  return (
    <div className="grid min-w-0 gap-4">
      <OverviewSummary report={report} />
      <DataQualitySummary report={report} />
      <ReviewViewToggle
        chart={<OverviewCharts report={report} />}
        table={<OverviewTables report={report} />}
      />
      <ActionList report={report} />
    </div>
  );
}

function OverviewSummary({ report }: { report: HqReportOverviewData }) {
  const metrics = [
    { label: "매출", value: formatNullableKrw(report.summary.salesAmount) },
    {
      label: "매출이익",
      value: formatNullableKrw(report.summary.grossProfit),
    },
    { label: "순이익", value: formatNullableKrw(report.summary.netAmount) },
    { label: "손실", value: formatNullableKrw(report.summary.lossAmount) },
    { label: "조치 필요", value: `${report.summary.actionCount}건` },
  ];

  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">월간 핵심 현황</CardTitle>
        <CardDescription>
          정정 반영 실제 총매출과 계산 가능한 손익을 함께 표시합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-5">
          {metrics.map((metric) => (
            <div className="min-w-0" key={metric.label}>
              <dt className="text-muted-foreground text-xs">{metric.label}</dt>
              <dd className="mt-1 text-sm font-semibold break-words tabular-nums sm:text-base">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function DataQualitySummary({ report }: { report: HqReportOverviewData }) {
  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">데이터 품질</CardTitle>
        </div>
        <CardDescription>
          누락과 계산 기준을 확인한 뒤 숫자를 해석해 주세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge
            variant={
              report.dataQuality.missingCount > 0 ? "secondary" : "outline"
            }
          >
            미입력 {report.dataQuality.missingCount}건
          </Badge>
          <Badge variant="outline">
            손실 계산 {report.lossBreakdown.computableCount}/
            {report.lossBreakdown.totalCount}건
          </Badge>
          <Badge
            variant={report.profitAndLoss.available ? "outline" : "secondary"}
          >
            손익 {report.profitAndLoss.available ? "계산 완료" : "계산 불가"}
          </Badge>
        </div>
        <p className="text-muted-foreground break-words">
          {report.dataQuality.lossBasisLabel} ·{" "}
          {report.dataQuality.profitAndLossLabel}
        </p>
        {report.errorMessages.length > 0 ? (
          <div className="flex flex-col gap-1">
            {report.errorMessages.map((message) => (
              <p className="text-destructive" key={message}>
                {message}
              </p>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OverviewCharts({ report }: { report: HqReportOverviewData }) {
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-12">
      <SalesTrendChart report={report} />
      <LossDonutChart report={report} />
      <StoreRankingChart report={report} />
      <ProfitAndLossChart report={report} />
      <ClosingStatusChart report={report} />
    </div>
  );
}

function SalesTrendChart({ report }: { report: HqReportOverviewData }) {
  return (
    <Card className="min-w-0 shadow-xs xl:col-span-8">
      <CardHeader>
        <CardTitle>매출 추세</CardTitle>
        <CardDescription>{report.chartSummaries.salesTrend}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        {report.salesTrend.length === 0 ? (
          <EmptyChartState
            message="선택 월에 표시할 실제 총매출이 없습니다. 일별 장부 입력과 마감 상태를 확인해 주세요."
            href="/app/reports/daily"
          />
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            <ChartContainer
              aria-label="현재 월과 전월 같은 날의 실제 총매출 선 차트"
              className="h-72 w-full min-w-0"
              config={salesConfig}
            >
              <LineChart
                accessibilityLayer
                data={report.salesTrend}
                margin={{ left: 4, right: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="day"
                  tickFormatter={(day) => `${day}일`}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={(value) => formatKrw(Number(value))}
                  tickLine={false}
                  axisLine={false}
                  width={76}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(_, payload) => {
                        const point = payload?.[0]?.payload as
                          | HqReportOverviewData["salesTrend"][number]
                          | undefined;
                        return point ? (
                          <div className="flex flex-col gap-1">
                            <span>{point.dateInput}</span>
                            <span className="text-muted-foreground font-normal">
                              현재 {point.currentStatusLabel} · 전월{" "}
                              {point.previousStatusLabel}
                            </span>
                            <span className="text-muted-foreground font-normal">
                              정정 반영 실제 총매출 기준
                            </span>
                          </div>
                        ) : null;
                      }}
                      formatter={(value, name) => (
                        <div className="flex min-w-40 items-center justify-between gap-3">
                          <span className="text-muted-foreground">
                            {salesConfig[String(name)]?.label ?? String(name)}
                          </span>
                          <span className="font-mono font-medium tabular-nums">
                            {chartNumber(value)}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  connectNulls={false}
                  dataKey="currentAmount"
                  dot={false}
                  stroke="var(--color-currentAmount)"
                  strokeWidth={2}
                  type="monotone"
                />
                <Line
                  connectNulls={false}
                  dataKey="previousAmount"
                  dot={false}
                  stroke="var(--color-previousAmount)"
                  strokeDasharray="5 4"
                  strokeWidth={2}
                  type="monotone"
                />
              </LineChart>
            </ChartContainer>
            <div>
              <DetailLink
                href={report.salesTrend[0]!.detailHref}
                label="일별 근거 보기"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LossDonutChart({ report }: { report: HqReportOverviewData }) {
  const lossConfig: ChartConfig = Object.fromEntries(
    report.lossBreakdown.items.map((item, index) => [
      item.name,
      { label: item.name, color: lossColors[index] },
    ]),
  );

  return (
    <Card className="min-w-0 shadow-xs xl:col-span-4">
      <CardHeader>
        <CardTitle>손실 유형</CardTitle>
        <CardDescription>{report.chartSummaries.lossBreakdown}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        {report.lossBreakdown.items.length === 0 ? (
          <EmptyChartState
            message="판매가 계획 기준으로 계산 가능한 손실 유형이 없습니다. 손실 입력의 가격 기준을 확인해 주세요."
            href={report.lossBreakdown.detailHref}
          />
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="min-w-0">
              <ChartContainer
                aria-label="판매가 계획 기준 손실 유형 도넛 차트"
                className="mx-auto h-64 w-full min-w-0"
                config={lossConfig}
              >
                <PieChart accessibilityLayer>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        hideLabel
                        nameKey="name"
                        formatter={(value, name, item) => {
                          const ratio = (item.payload as { ratio?: number })
                            .ratio;
                          return (
                            <div className="flex min-w-44 items-center justify-between gap-3">
                              <span className="text-muted-foreground">
                                {String(name)}
                              </span>
                              <span className="font-mono font-medium tabular-nums">
                                {chartNumber(value)}
                                {typeof ratio === "number"
                                  ? ` · ${percentFormatter.format(ratio)}`
                                  : ""}
                              </span>
                            </div>
                          );
                        }}
                      />
                    }
                  />
                  <Pie
                    data={report.lossBreakdown.items}
                    dataKey="amount"
                    innerRadius={58}
                    nameKey="name"
                    outerRadius={84}
                  >
                    {report.lossBreakdown.items.map((item, index) => (
                      <Cell fill={lossColors[index]} key={item.name} />
                    ))}
                    <Label
                      content={({ viewBox }) => {
                        if (
                          !viewBox ||
                          !("cx" in viewBox) ||
                          !("cy" in viewBox) ||
                          typeof viewBox.cx !== "number" ||
                          typeof viewBox.cy !== "number"
                        ) {
                          return null;
                        }

                        return (
                          <text
                            dominantBaseline="middle"
                            textAnchor="middle"
                            x={viewBox.cx}
                            y={viewBox.cy}
                          >
                            <tspan
                              className="fill-muted-foreground text-[10px]"
                              x={viewBox.cx}
                              y={viewBox.cy - 7}
                            >
                              계산 가능 총액
                            </tspan>
                            <tspan
                              className="fill-foreground text-xs font-semibold"
                              dy="1.4em"
                              x={viewBox.cx}
                            >
                              {formatKrw(report.lossBreakdown.totalAmount)}
                            </tspan>
                          </text>
                        );
                      }}
                    />
                  </Pie>
                  <ChartLegend
                    content={
                      <LossBreakdownLegend items={report.lossBreakdown.items} />
                    }
                  />
                </PieChart>
              </ChartContainer>
            </div>
            <p className="text-muted-foreground text-xs">
              판매가 계획 기준 계산 가능 {report.lossBreakdown.computableCount}/
              {report.lossBreakdown.totalCount}건
              {report.lossBreakdown.uncomputableCount > 0
                ? ` · 기준 없음 ${report.lossBreakdown.uncomputableCount}건`
                : ""}
            </p>
            <div>
              <DetailLink href={report.lossBreakdown.detailHref} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LossBreakdownLegend({
  items,
}: {
  items: HqReportOverviewData["lossBreakdown"]["items"];
}) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-3 pt-3 text-xs">
      {items.map((item, index) => (
        <li className="flex items-center gap-1.5" key={item.name}>
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-sm"
            style={{ backgroundColor: lossColors[index] }}
          />
          <span>
            {item.name} · {formatKrw(item.amount)} ·{" "}
            {percentFormatter.format(item.ratio)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StoreRankingChart({ report }: { report: HqReportOverviewData }) {
  const [metric, setMetric] = useState<ReportOverviewMetricKey>("sales");
  const ranking = report.rankings[metric];

  return (
    <Card className="min-w-0 shadow-xs xl:col-span-6">
      <CardHeader>
        <CardTitle>지점 성과 순위</CardTitle>
        <CardDescription>{ranking.summary}</CardDescription>
        <div
          className="flex flex-wrap gap-2 pt-1"
          role="group"
          aria-label="순위 지표 선택"
        >
          {rankingMetrics.map((item) => (
            <Button
              aria-pressed={metric === item.key}
              key={item.key}
              onClick={() => setMetric(item.key)}
              size="sm"
              type="button"
              variant={metric === item.key ? "default" : "outline"}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        {ranking.rows.length === 0 ? (
          <EmptyChartState
            message="순위를 계산할 마감 지점이 없습니다. 월간 장부 상태와 계산 불가 사유를 확인해 주세요."
            href="/app/reports/comparison"
          />
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            <ChartContainer
              aria-label={`${rankingMetrics.find((item) => item.key === metric)?.label} 지점 성과 가로 막대 차트`}
              className="h-72 w-full min-w-0"
              config={rankingConfig}
            >
              <BarChart
                accessibilityLayer
                data={ranking.rows}
                layout="vertical"
                margin={{ left: 4, right: 72 }}
              >
                <CartesianGrid horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value) =>
                    formatRankingValue(metric, Number(value))
                  }
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  dataKey="storeName"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={72}
                />
                {(metric === "grossProfit" || metric === "grossMarginRate") && (
                  <ReferenceLine x={0} />
                )}
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, _name, item) => {
                        const row =
                          item.payload as HqReportOverviewData["rankings"][ReportOverviewMetricKey]["rows"][number];
                        return (
                          <div className="flex min-w-40 items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              {row.storeName}
                            </span>
                            <span className="font-mono font-medium tabular-nums">
                              {typeof value === "number"
                                ? formatRankingValue(metric, value)
                                : "계산 불가"}
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Bar dataKey="value" fill="var(--color-value)" radius={4}>
                  <LabelList
                    dataKey="value"
                    formatter={(value: unknown) =>
                      typeof value === "number"
                        ? formatRankingValue(metric, value)
                        : ""
                    }
                    position="right"
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
            <div className="flex flex-wrap gap-2">
              {ranking.rows.map((row) => (
                <Button asChild key={row.storeId} size="sm" variant="outline">
                  <Link href={row.detailHref}>{row.storeName} 상세</Link>
                </Button>
              ))}
            </div>
            {ranking.excluded.length > 0 ? (
              <div className="border-border rounded-md border p-3 text-sm">
                <p className="font-medium">
                  순위 제외 {ranking.excluded.length}곳
                </p>
                <ul className="text-muted-foreground mt-1 grid gap-1">
                  {ranking.excluded.map((row) => (
                    <li key={row.storeId}>
                      {row.storeName}: {row.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProfitAndLossChart({ report }: { report: HqReportOverviewData }) {
  return (
    <Card className="min-w-0 shadow-xs xl:col-span-6">
      <CardHeader>
        <CardTitle>월 손익 흐름</CardTitle>
        <CardDescription>{report.chartSummaries.profitAndLoss}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        {!report.profitAndLoss.available ? (
          <div className="border-border bg-muted/20 flex min-h-72 flex-col items-start justify-center gap-3 rounded-md border p-5">
            <p className="text-muted-foreground max-w-prose text-sm">
              {report.profitAndLoss.reason ?? "월 손익을 계산할 수 없습니다."}
            </p>
            <DetailLink
              href={report.profitAndLoss.detailHref}
              label="월간 손익 보기"
            />
          </div>
        ) : report.profitAndLoss.steps.length === 0 ? (
          <EmptyChartState
            message="표시할 월 손익 단계가 없습니다. 월간 비용과 장부 입력을 확인해 주세요."
            href={report.profitAndLoss.detailHref}
          />
        ) : (
          <div className="flex min-w-0 flex-col gap-3">
            <ChartContainer
              aria-label="매출에서 순이익까지의 월 손익 워터폴 차트"
              className="h-72 w-full min-w-0"
              config={profitAndLossConfig}
            >
              <BarChart
                accessibilityLayer
                data={report.profitAndLoss.steps}
                margin={{ left: 4, right: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="key"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  tick={{ fontSize: 10 }}
                  tickFormatter={formatWaterfallAxisLabel}
                  tickMargin={8}
                />
                <YAxis
                  tickFormatter={(value) => formatKrw(Number(value))}
                  tickLine={false}
                  axisLine={false}
                  width={76}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(_value, _name, item) => {
                        const step =
                          item.payload as HqReportOverviewData["profitAndLoss"]["steps"][number];
                        return (
                          <div className="flex min-w-44 items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              {step.label}
                            </span>
                            <span className="font-mono font-medium tabular-nums">
                              {formatWaterfallDisplayAmount(step)}
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="offset"
                  fill="transparent"
                  legendType="none"
                  stackId="waterfall"
                  tooltipType="none"
                />
                <Bar dataKey="amount" stackId="waterfall" radius={4}>
                  {report.profitAndLoss.steps.map((step) => (
                    <Cell
                      fill={
                        step.kind === "decrease"
                          ? "var(--chart-3)"
                          : step.kind === "increase"
                            ? "var(--chart-2)"
                            : "var(--chart-1)"
                      }
                      key={step.key}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
            <div>
              <DetailLink
                href={report.profitAndLoss.detailHref}
                label="월간 손익 근거 보기"
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClosingStatusChart({ report }: { report: HqReportOverviewData }) {
  const closingData = Object.fromEntries(
    report.closingStatus.map((item) => [item.key, item.ratio]),
  );

  return (
    <Card className="min-w-0 shadow-xs xl:col-span-12">
      <CardHeader>
        <CardTitle>월간 마감 상태</CardTitle>
        <CardDescription>{report.chartSummaries.closingStatus}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0">
        {report.closingStatus.every((item) => item.count === 0) ? (
          <EmptyChartState
            message="선택 월에 표시할 마감 상태가 없습니다. 일별 장부 입력 현황을 확인해 주세요."
            href={report.closingStatus[0]?.detailHref ?? "/app/reports/monthly"}
          />
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <ChartContainer
              aria-label="본사 마감, 진행 중, 미입력, 휴무 비율 100퍼센트 누적 막대 차트"
              className="h-36 w-full min-w-0"
              config={closingConfig}
            >
              <BarChart
                accessibilityLayer
                data={[closingData]}
                layout="vertical"
              >
                <XAxis domain={[0, 1]} hide type="number" />
                <YAxis hide type="category" />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      hideLabel
                      formatter={(value, name) => (
                        <div className="flex min-w-40 items-center justify-between gap-3">
                          <span className="text-muted-foreground">
                            {closingConfig[
                              String(name) as keyof typeof closingConfig
                            ]?.label ?? String(name)}
                          </span>
                          <span className="font-mono font-medium tabular-nums">
                            {typeof value === "number"
                              ? percentFormatter.format(value)
                              : "계산 불가"}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <ChartLegend
                  content={<ClosingStatusLegend items={report.closingStatus} />}
                />
                {report.closingStatus.map((item) => (
                  <Bar
                    dataKey={item.key}
                    fill={`var(--color-${item.key})`}
                    key={item.key}
                    stackId="closing"
                  />
                ))}
              </BarChart>
            </ChartContainer>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {report.closingStatus.map((item) => (
                <Button
                  asChild
                  className="justify-between"
                  key={item.key}
                  variant="outline"
                >
                  <Link href={item.detailHref}>
                    <span>{item.label}</span>
                    <span className="tabular-nums">
                      {percentFormatter.format(item.ratio)} · {item.count}건
                    </span>
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ClosingStatusLegend({
  items,
}: {
  items: HqReportOverviewData["closingStatus"];
}) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-3 pt-3 text-xs">
      {items.map((item, index) => (
        <li className="flex items-center gap-1.5" key={item.key}>
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-sm"
            style={{ backgroundColor: lossColors[index] }}
          />
          <span>
            {item.label} · {percentFormatter.format(item.ratio)} · {item.count}
            건
          </span>
        </li>
      ))}
    </ul>
  );
}

function OverviewTables({ report }: { report: HqReportOverviewData }) {
  return (
    <div className="grid min-w-0 gap-4">
      <SalesTrendTable report={report} />
      <LossBreakdownTable report={report} />
      <RankingsTable report={report} />
      <ProfitAndLossTable report={report} />
      <ClosingStatusTable report={report} />
    </div>
  );
}

function TableCard({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0 shadow-xs">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{summary}</CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

function SalesTrendTable({ report }: { report: HqReportOverviewData }) {
  return (
    <TableCard title="매출 추세" summary={report.chartSummaries.salesTrend}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>영업일</TableHead>
            <TableHead>현재 월</TableHead>
            <TableHead>현재 상태</TableHead>
            <TableHead>전월 같은 날</TableHead>
            <TableHead>전월 상태</TableHead>
            <TableHead>근거</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.salesTrend.map((row) => (
            <TableRow key={row.dateInput}>
              <TableCell>{row.dateInput}</TableCell>
              <TableCell className="tabular-nums">
                {formatNullableKrw(row.currentAmount)}
              </TableCell>
              <TableCell>{row.currentStatusLabel}</TableCell>
              <TableCell className="tabular-nums">
                {formatNullableKrw(row.previousAmount)}
              </TableCell>
              <TableCell>{row.previousStatusLabel}</TableCell>
              <TableCell>
                <DetailLink href={row.detailHref} />
              </TableCell>
            </TableRow>
          ))}
          {report.salesTrend.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6}>표시할 실제 총매출이 없습니다.</TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </TableCard>
  );
}

function LossBreakdownTable({ report }: { report: HqReportOverviewData }) {
  return (
    <TableCard title="손실 유형" summary={report.chartSummaries.lossBreakdown}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>손실 유형</TableHead>
            <TableHead>판매가 계획 기준 금액</TableHead>
            <TableHead>비율</TableHead>
            <TableHead>근거</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.lossBreakdown.items.map((row) => (
            <TableRow key={row.name}>
              <TableCell>{row.name}</TableCell>
              <TableCell className="tabular-nums">
                {formatKrw(row.amount)}
              </TableCell>
              <TableCell className="tabular-nums">
                {percentFormatter.format(row.ratio)}
              </TableCell>
              <TableCell>
                <DetailLink href={report.lossBreakdown.detailHref} />
              </TableCell>
            </TableRow>
          ))}
          {report.lossBreakdown.items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4}>
                계산 가능한 손실 유형이 없습니다.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      <p className="text-muted-foreground mt-3 text-xs">
        계산 가능 {report.lossBreakdown.computableCount}/
        {report.lossBreakdown.totalCount}건
      </p>
    </TableCard>
  );
}

function RankingsTable({ report }: { report: HqReportOverviewData }) {
  return (
    <TableCard
      title="지점 성과 순위"
      summary="서버에서 계산하고 정렬한 네 가지 지표입니다."
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>지표</TableHead>
            <TableHead>지점</TableHead>
            <TableHead>값</TableHead>
            <TableHead>근거</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rankingMetrics.flatMap((metric) =>
            report.rankings[metric.key].rows.map((row) => (
              <TableRow key={`${metric.key}:${row.storeId}`}>
                <TableCell>{metric.label}</TableCell>
                <TableCell>{row.storeName}</TableCell>
                <TableCell className="tabular-nums">
                  {formatRankingValue(metric.key, row.value)}
                </TableCell>
                <TableCell>
                  <DetailLink href={row.detailHref} />
                </TableCell>
              </TableRow>
            )),
          )}
          {rankingMetrics.every(
            (metric) => report.rankings[metric.key].rows.length === 0,
          ) ? (
            <TableRow>
              <TableCell colSpan={4}>
                계산 가능한 지점 순위가 없습니다.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      <div className="mt-3 grid gap-1 text-xs">
        {rankingMetrics.flatMap((metric) =>
          report.rankings[metric.key].excluded.map((row) => (
            <p
              className="text-muted-foreground"
              key={`${metric.key}:excluded:${row.storeId}`}
            >
              {metric.label} 제외 · {row.storeName}: {row.reason}
            </p>
          )),
        )}
      </div>
    </TableCard>
  );
}

function ProfitAndLossTable({ report }: { report: HqReportOverviewData }) {
  return (
    <TableCard
      title="월 손익 흐름"
      summary={report.chartSummaries.profitAndLoss}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>단계</TableHead>
            <TableHead>시작</TableHead>
            <TableHead>종료</TableHead>
            <TableHead>증감액</TableHead>
            <TableHead>근거</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.profitAndLoss.steps.map((step) => (
            <TableRow key={step.key}>
              <TableCell>{step.label}</TableCell>
              <TableCell className="tabular-nums">
                {formatSignedKrw(step.start)}
              </TableCell>
              <TableCell className="tabular-nums">
                {formatSignedKrw(step.end)}
              </TableCell>
              <TableCell className="tabular-nums">
                {formatWaterfallDisplayAmount(step)}
              </TableCell>
              <TableCell>
                <DetailLink href={report.profitAndLoss.detailHref} />
              </TableCell>
            </TableRow>
          ))}
          {!report.profitAndLoss.available ||
          report.profitAndLoss.steps.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                {report.profitAndLoss.reason ??
                  "표시할 월 손익 단계가 없습니다."}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </TableCard>
  );
}

function ClosingStatusTable({ report }: { report: HqReportOverviewData }) {
  return (
    <TableCard
      title="월간 마감 상태"
      summary={report.chartSummaries.closingStatus}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>상태</TableHead>
            <TableHead>비율</TableHead>
            <TableHead>건수</TableHead>
            <TableHead>근거</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.closingStatus.every((item) => item.count === 0) ? (
            <TableRow>
              <TableCell colSpan={4}>표시할 마감 상태가 없습니다.</TableCell>
            </TableRow>
          ) : (
            report.closingStatus.map((row) => (
              <TableRow key={row.key}>
                <TableCell>{row.label}</TableCell>
                <TableCell className="tabular-nums">
                  {percentFormatter.format(row.ratio)}
                </TableCell>
                <TableCell className="tabular-nums">{row.count}건</TableCell>
                <TableCell>
                  <DetailLink href={row.detailHref} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {report.closingMissingDays.length > 0 ? (
        <div className="mt-5 min-w-0 overflow-x-auto">
          <p className="mb-2 text-sm font-medium">미입력 일자</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>지점</TableHead>
                <TableHead>미입력 일자</TableHead>
                <TableHead>근거</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.closingMissingDays.map((row) => (
                <TableRow key={`${row.storeId}:${row.dateInput}`}>
                  <TableCell>{row.storeName}</TableCell>
                  <TableCell>{row.dateInput}</TableCell>
                  <TableCell>
                    <DetailLink href={row.detailHref} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </TableCard>
  );
}

function ActionList({ report }: { report: HqReportOverviewData }) {
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle>조치가 필요한 상황</CardTitle>
        <CardDescription>
          오늘 기준 · {report.selectedStoreName ?? "전체 지점"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {report.actions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            오늘 바로 조치할 항목이 없습니다.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {report.actions.map((action) => (
              <li
                className="flex min-w-0 flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                key={action.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        action.severity === "critical"
                          ? "destructive"
                          : action.severity === "warning"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {action.severity === "critical"
                        ? "긴급"
                        : action.severity === "warning"
                          ? "확인"
                          : "안내"}
                    </Badge>
                    <p className="font-medium">
                      {action.storeName} · {action.label}
                    </p>
                  </div>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {action.detail}
                  </p>
                </div>
                <DetailLink href={action.detailHref} label="근거 보기" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
