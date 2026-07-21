"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
  type LabelProps,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import type { DailySalesAnalysis as DailySalesAnalysisData } from "~/features/reports/types";
import type { LedgerReviewMetric } from "~/server/calculations/ledger";

type SalesChangeChartRow = {
  storeId: string;
  storeName: string;
  rate: number;
  changeLabel: string;
  compactLabel: string;
};

type PositionChartRow = {
  rank: number;
  storeId: string;
  storeName: string;
  share: number;
  shareLabel: string;
  changeLabel: string;
  color: string;
};

type InventoryChartRow = {
  storeId: string;
  storeName: string;
  deviationRate: number;
  deviationLabel: string;
  compactLabel: string;
};

type UnavailableRow = {
  key: string;
  label: string;
  reason: string;
};

const currencyFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});
const wonFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});
const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
const unsignedPercentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});

const salesChangeConfig = {
  rate: { label: "전일 대비 증감률", color: "var(--chart-1)" },
} satisfies ChartConfig;

const positionConfig = {
  share: { label: "전체 매출 비중", color: "var(--chart-1)" },
} satisfies ChartConfig;

const inventoryConfig = {
  deviationRate: { label: "재고 편차율", color: "var(--chart-2)" },
} satisfies ChartConfig;

const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export function DailySalesAnalysis({ data }: { data: DailySalesAnalysisData }) {
  if (
    data.salesChanges.length === 0 &&
    data.inventoryRatios.length === 0 &&
    data.positions.length === 0
  ) {
    return (
      <p className="text-muted-foreground text-sm">
        표시할 매출 분석 데이터가 없습니다.
      </p>
    );
  }

  const salesChangeRows: SalesChangeChartRow[] = data.salesChanges.flatMap(
    (row) => {
      if (row.rate.value === null || row.difference.value === null) return [];

      return [
        {
          storeId: row.storeId,
          storeName: row.storeName,
          rate: row.rate.value,
          changeLabel: formatChangeWithAmount(row.rate, row.difference),
          compactLabel: formatCompactChange(row.rate, row.difference),
        },
      ];
    },
  );
  const unavailableSalesChanges: UnavailableRow[] = data.salesChanges.flatMap(
    (row) =>
      row.rate.value === null || row.difference.value === null
        ? [
            {
              key: row.storeId,
              label: row.storeName,
              reason: getUnavailableReason(row.rate, row.difference),
            },
          ]
        : [],
  );

  const positionRows: PositionChartRow[] = data.positions.flatMap(
    (row, index) => {
      if (row.share.value === null) return [];

      return [
        {
          rank: row.rank,
          storeId: row.storeId,
          storeName: row.storeName,
          share: row.share.value,
          shareLabel: formatShareWithAmount(row.share, row.salesAmount),
          changeLabel: formatChangeWithAmount(row.rate, row.difference),
          color: chartColors[index % chartColors.length]!,
        },
      ];
    },
  );
  const unavailablePositions: UnavailableRow[] = [
    ...data.positions.flatMap((row) =>
      row.share.value === null
        ? [
            {
              key: row.storeId,
              label: row.storeName,
              reason: getUnavailableReason(row.share),
            },
          ]
        : [],
    ),
    ...data.excludedPositions.map((row) => ({
      key: row.storeId,
      label: row.storeName,
      reason: row.reason,
    })),
  ];

  const inventoryRows: InventoryChartRow[] = data.inventoryRatios.flatMap(
    (row) => {
      if (
        row.deviationRate.value === null ||
        row.deviationAmount.value === null
      ) {
        return [];
      }

      return [
        {
          storeId: row.storeId,
          storeName: row.storeName,
          deviationRate: row.deviationRate.value,
          deviationLabel: formatPercentWithAmount(
            row.deviationRate,
            row.deviationAmount,
          ),
          compactLabel: formatCompactPercentWithAmount(
            row.deviationRate,
            row.deviationAmount,
          ),
        },
      ];
    },
  );
  const unavailableInventoryRows: UnavailableRow[] =
    data.inventoryRatios.flatMap((row) =>
      row.deviationRate.value === null
        ? [
            {
              key: row.storeId,
              label: row.storeName,
              reason: getUnavailableReason(row.deviationRate),
            },
          ]
        : [],
    );

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-3">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>전일 대비 매출액 증감률</CardTitle>
          <CardDescription>
            0선을 기준으로 지점별 증감률과 증감액을 함께 표시합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-1 flex-col gap-4">
          {salesChangeRows.length === 0 ? (
            <EmptyChartMessage message="계산 가능한 전일 대비 매출이 없습니다." />
          ) : (
            <>
              <SignedChangeChart rows={salesChangeRows} />
              <SalesChangeLegend rows={salesChangeRows} />
            </>
          )}
          <SalesChangeAccessibleTable data={data} />
        </CardContent>
        <AvailabilityFooter
          availableMessage="증감률과 증감액은 같은 비교 기준을 사용합니다."
          rows={unavailableSalesChanges}
        />
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>매장 매출 포지션</CardTitle>
          <CardDescription>
            전체 매출 비중과 선택일 매출액을 함께 표시합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-1 flex-col gap-4">
          {positionRows.length === 0 ? (
            <EmptyChartMessage message="표시할 매장 매출 비중이 없습니다." />
          ) : (
            <StorePositionDonut rows={positionRows} />
          )}
          <PositionAccessibleTable data={data} />
        </CardContent>
        <AvailabilityFooter
          availableMessage="범례에는 매출 비중과 전일 대비 증감을 함께 표시합니다."
          rows={unavailablePositions}
          title="포지션 제외 지점"
        />
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>재고비율</CardTitle>
          <CardDescription>
            (재고금액 - 매출액) ÷ 매출액 편차율과 편차액을 표시합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-1 flex-col gap-4">
          {inventoryRows.length === 0 ? (
            <EmptyChartMessage message="계산 가능한 재고비율이 없습니다." />
          ) : (
            <>
              <InventoryDeviationChart rows={inventoryRows} />
              <InventoryDeviationLegend rows={inventoryRows} />
            </>
          )}
          <InventoryAccessibleTable data={data} />
        </CardContent>
        <AvailabilityFooter
          availableMessage="축 범위는 지점별 최솟값·최댓값에 맞춰 자동 조정됩니다."
          rows={unavailableInventoryRows}
        />
      </Card>
    </div>
  );
}

function SignedChangeChart({ rows }: { rows: SalesChangeChartRow[] }) {
  const values = rows.map((row) => row.rate);
  const chartHeight = Math.max(220, rows.length * 52 + 40);

  return (
    <ChartContainer
      aria-label="지점별 전일 대비 매출액 증감률 차트"
      className="min-h-56 w-full min-w-0"
      config={salesChangeConfig}
      style={{ height: chartHeight }}
    >
      <BarChart
        accessibilityLayer
        data={rows}
        layout="vertical"
        margin={getSignedChartMargin(values, 104)}
      >
        <CartesianGrid horizontal={false} />
        <XAxis
          axisLine={false}
          domain={getSignedDomain(values)}
          tickFormatter={(value) =>
            unsignedPercentFormatter.format(Number(value))
          }
          tickLine={false}
          type="number"
        />
        <YAxis
          axisLine={false}
          dataKey="storeName"
          tickLine={false}
          type="category"
          width={72}
        />
        <ReferenceLine x={0} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(_value, _name, item) => {
                const row = item.payload as SalesChangeChartRow;

                return (
                  <div className="flex min-w-52 items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {row.storeName}
                    </span>
                    <span className="font-mono font-medium tabular-nums">
                      {row.changeLabel}
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        <Bar dataKey="rate" radius={4}>
          {rows.map((row) => (
            <Cell
              data-testid={`sales-change-bar-${row.storeId}`}
              fill={row.rate < 0 ? "var(--chart-3)" : "var(--chart-1)"}
              key={row.storeId}
            />
          ))}
          <LabelList content={SignedTwoLineLabel} dataKey="compactLabel" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function StorePositionDonut({ rows }: { rows: PositionChartRow[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ChartContainer
        aria-label="지점별 선택일 매출 비중 도넛 차트"
        className="mx-auto h-56 w-full min-w-0"
        config={positionConfig}
      >
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(_value, _name, item) => {
                  const row = item.payload as PositionChartRow;

                  return (
                    <div className="grid min-w-56 gap-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          {row.storeName}
                        </span>
                        <span className="font-mono font-medium tabular-nums">
                          {row.shareLabel}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        전일 대비 {row.changeLabel}
                      </p>
                    </div>
                  );
                }}
              />
            }
          />
          <Pie
            data={rows}
            dataKey="share"
            innerRadius={54}
            nameKey="storeName"
            outerRadius={82}
          >
            {rows.map((row) => (
              <Cell
                data-testid={`store-position-sector-${row.storeId}`}
                fill={row.color}
                key={row.storeId}
              />
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
                      className="fill-foreground text-base font-semibold"
                      x={viewBox.cx}
                      y={viewBox.cy - 5}
                    >
                      {rows.length}개
                    </tspan>
                    <tspan
                      className="fill-muted-foreground text-[10px]"
                      dy="1.5em"
                      x={viewBox.cx}
                    >
                      지점
                    </tspan>
                  </text>
                );
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      <ol className="grid gap-2" aria-label="지점별 매출 비중과 전일 대비 증감">
        {rows.map((row) => (
          <li
            className="flex min-w-0 items-start gap-2 text-xs"
            key={row.storeId}
          >
            <span
              aria-hidden="true"
              className="mt-1 size-2 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {row.rank}. {row.storeName}
                </span>
                <span className="shrink-0 tabular-nums">{row.shareLabel}</span>
              </div>
              <p className="text-muted-foreground mt-0.5 break-words">
                전일 대비 {row.changeLabel}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SalesChangeLegend({ rows }: { rows: SalesChangeChartRow[] }) {
  return (
    <ul className="grid gap-2" aria-label="지점별 전일 대비 증감 상세">
      {rows.map((row) => (
        <li
          className="flex min-w-0 items-start justify-between gap-2 text-xs"
          key={row.storeId}
        >
          <span className="truncate font-medium">{row.storeName}</span>
          <span className="shrink-0 text-right tabular-nums">
            {row.changeLabel}
          </span>
        </li>
      ))}
    </ul>
  );
}

function InventoryDeviationChart({ rows }: { rows: InventoryChartRow[] }) {
  const values = rows.map((row) => row.deviationRate);
  const chartHeight = Math.max(220, rows.length * 52 + 40);

  return (
    <ChartContainer
      aria-label="지점별 매출 대비 재고 편차율 차트"
      className="min-h-56 w-full min-w-0"
      config={inventoryConfig}
      style={{ height: chartHeight }}
    >
      <BarChart
        accessibilityLayer
        data={rows}
        layout="vertical"
        margin={getSignedChartMargin(values, 104)}
      >
        <CartesianGrid horizontal={false} />
        <XAxis
          axisLine={false}
          domain={getSignedDomain(values)}
          tickFormatter={(value) =>
            unsignedPercentFormatter.format(Number(value))
          }
          tickLine={false}
          type="number"
        />
        <YAxis
          axisLine={false}
          dataKey="storeName"
          tickLine={false}
          type="category"
          width={72}
        />
        <ReferenceLine x={0} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(_value, _name, item) => {
                const row = item.payload as InventoryChartRow;

                return (
                  <div className="flex min-w-44 items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      {row.storeName}
                    </span>
                    <span className="font-mono font-medium tabular-nums">
                      {row.deviationLabel}
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        <Bar dataKey="deviationRate" radius={4}>
          {rows.map((row) => (
            <Cell
              data-testid={`inventory-deviation-bar-${row.storeId}`}
              fill={
                row.deviationRate < 0
                  ? "var(--chart-3)"
                  : row.deviationRate > 0
                    ? "var(--chart-2)"
                    : "var(--muted-foreground)"
              }
              key={row.storeId}
            />
          ))}
          <LabelList content={SignedTwoLineLabel} dataKey="compactLabel" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function InventoryDeviationLegend({ rows }: { rows: InventoryChartRow[] }) {
  return (
    <ul className="grid gap-2" aria-label="지점별 재고 편차율과 편차액 상세">
      {rows.map((row) => (
        <li
          className="flex min-w-0 items-start justify-between gap-2 text-xs"
          key={row.storeId}
        >
          <span className="truncate font-medium">{row.storeName}</span>
          <span className="shrink-0 text-right tabular-nums">
            {row.deviationLabel}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AvailabilityFooter({
  availableMessage,
  rows,
  title = "계산 불가 지점",
}: {
  availableMessage: string;
  rows: UnavailableRow[];
  title?: string;
}) {
  return (
    <CardFooter className="items-start">
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-xs">{availableMessage}</p>
      ) : (
        <div className="grid gap-1.5 text-xs">
          <p className="font-medium">{title}</p>
          <ul className="text-muted-foreground grid gap-1">
            {rows.map((row) => (
              <li key={row.key}>
                {row.label}: {row.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </CardFooter>
  );
}

function EmptyChartMessage({ message }: { message: string }) {
  return (
    <div className="text-muted-foreground flex min-h-56 items-center justify-center text-center text-sm">
      {message}
    </div>
  );
}

function SalesChangeAccessibleTable({
  data,
}: {
  data: DailySalesAnalysisData;
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>지점별 전일 대비 매출액 증감 데이터</caption>
        <thead>
          <tr>
            <th>지점</th>
            <th>증감률</th>
            <th>증감액</th>
            <th>계산 상태</th>
          </tr>
        </thead>
        <tbody>
          {data.salesChanges.map((row) => (
            <tr key={row.storeId}>
              <td>{row.storeName}</td>
              <td>{formatPercent(row.rate)}</td>
              <td>{formatMoney(row.difference)}</td>
              <td>
                {row.rate.value === null || row.difference.value === null
                  ? getUnavailableReason(row.rate, row.difference)
                  : "계산 가능"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PositionAccessibleTable({ data }: { data: DailySalesAnalysisData }) {
  return (
    <div className="sr-only">
      <table>
        <caption>지점별 매출 비중과 전일 대비 증감 데이터</caption>
        <thead>
          <tr>
            <th>순위</th>
            <th>지점</th>
            <th>전체 매출 비중</th>
            <th>전일 대비 증감률</th>
            <th>전일 대비 증감액</th>
          </tr>
        </thead>
        <tbody>
          {data.positions.map((row) => (
            <tr key={row.storeId}>
              <td>{row.rank.toLocaleString("ko-KR")}</td>
              <td>{row.storeName}</td>
              <td>{formatShare(row.share)}</td>
              <td>{formatPercent(row.rate)}</td>
              <td>{formatMoney(row.difference)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InventoryAccessibleTable({ data }: { data: DailySalesAnalysisData }) {
  return (
    <div className="sr-only">
      <table>
        <caption>지점별 매출 대비 재고 편차 데이터</caption>
        <thead>
          <tr>
            <th>지점</th>
            <th>재고금액</th>
            <th>매출액</th>
            <th>재고 편차율</th>
            <th>재고 편차액</th>
            <th>계산 상태</th>
          </tr>
        </thead>
        <tbody>
          {data.inventoryRatios.map((row) => (
            <tr key={row.storeId}>
              <td>{row.storeName}</td>
              <td>{formatMoney(row.inventoryAmount)}</td>
              <td>{formatMoney(row.salesAmount)}</td>
              <td>{formatPercent(row.deviationRate)}</td>
              <td>{formatMoney(row.deviationAmount)}</td>
              <td>
                {row.deviationRate.value === null
                  ? getUnavailableReason(row.deviationRate)
                  : "계산 가능"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignedTwoLineLabel({ x, y, width, height, value }: LabelProps) {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof value !== "string"
  ) {
    return null;
  }

  const [change, amount] = value.split("|");
  const isNegative = change?.startsWith("-") ?? false;
  const labelX = isNegative ? x - 8 : x + width + 8;

  return (
    <text
      className="fill-foreground text-[10px]"
      dominantBaseline="central"
      textAnchor={isNegative ? "end" : "start"}
      x={labelX}
      y={y + height / 2 - 6}
    >
      <tspan>{change}</tspan>
      <tspan className="fill-muted-foreground" dy="1.25em" x={labelX}>
        {amount}
      </tspan>
    </text>
  );
}

function getSignedDomain(values: number[]): [number, number] {
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);

  if (minimum === 0 && maximum === 0) return [-0.01, 0.01];

  const span = maximum - minimum;
  const padding = Math.max(span * 0.12, 0.005);

  return [
    minimum < 0 ? minimum - padding : 0,
    maximum > 0 ? maximum + padding : 0,
  ];
}

function getSignedChartMargin(values: number[], labelSpace: number) {
  return {
    top: 4,
    right: values.some((value) => value >= 0) ? labelSpace : 8,
    bottom: 4,
    left: values.some((value) => value < 0) ? labelSpace : 8,
  };
}

function formatMoney(metric: LedgerReviewMetric) {
  return metric.value === null
    ? formatUnavailable(metric)
    : currencyFormatter.format(metric.value);
}

function formatPercent(metric: LedgerReviewMetric) {
  return metric.value === null
    ? formatUnavailable(metric)
    : percentFormatter.format(metric.value);
}

function formatShare(metric: LedgerReviewMetric) {
  return metric.value === null
    ? formatUnavailable(metric)
    : unsignedPercentFormatter.format(metric.value);
}

function formatShareWithAmount(
  share: LedgerReviewMetric,
  salesAmount: LedgerReviewMetric,
) {
  if (share.value === null || salesAmount.value === null) {
    return formatUnavailable(share.value === null ? share : salesAmount);
  }

  return `${unsignedPercentFormatter.format(share.value)} (${formatSignedWon(salesAmount.value)})`;
}

function formatPercentWithAmount(
  rate: LedgerReviewMetric,
  amount: LedgerReviewMetric,
) {
  if (rate.value === null || amount.value === null) {
    return formatUnavailable(rate.value === null ? rate : amount);
  }

  return `${percentFormatter.format(rate.value)} (${formatSignedWon(amount.value)})`;
}

function formatCompactPercentWithAmount(
  rate: LedgerReviewMetric,
  amount: LedgerReviewMetric,
) {
  if (rate.value === null || amount.value === null) return "계산 불가|";

  return `${percentFormatter.format(rate.value)}|(${formatSignedWon(amount.value)})`;
}

function formatChangeWithAmount(
  rate: LedgerReviewMetric,
  difference: LedgerReviewMetric,
) {
  if (rate.value === null || difference.value === null) {
    return formatUnavailable(rate.value === null ? rate : difference);
  }

  return `${formatChangeRate(rate.value)} (${formatSignedWon(difference.value)})`;
}

function formatCompactChange(
  rate: LedgerReviewMetric,
  difference: LedgerReviewMetric,
) {
  if (rate.value === null || difference.value === null) return "계산 불가|";

  return `${formatChangeRate(rate.value)}|(${formatSignedWon(difference.value)})`;
}

function formatChangeRate(value: number) {
  const direction = value > 0 ? "증가" : value < 0 ? "감소" : "변동 없음";
  return `${percentFormatter.format(value)} ${direction}`;
}

function formatSignedWon(value: number) {
  return `${wonFormatter.format(value)}원`;
}

function getUnavailableReason(...metrics: LedgerReviewMetric[]) {
  const metric = metrics.find((item) => item.value === null);
  return metric?.reason ?? metric?.unavailableReason ?? "계산 불가";
}

function formatUnavailable(metric: LedgerReviewMetric) {
  return `계산 불가${metric.reason ? ` (${metric.reason})` : ""}`;
}
