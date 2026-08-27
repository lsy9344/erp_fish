"use client";

import { Component, createContext, useContext, type ReactNode } from "react";
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
import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
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
  inventoryRatio: number;
  ratioLabel: string;
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
const inventoryRatioFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const salesChangeConfig = {
  rate: { label: "직전 기간 대비 증감률", color: "var(--chart-1)" },
} satisfies ChartConfig;

const positionConfig = {
  share: { label: "전체 매출 비중", color: "var(--chart-1)" },
} satisfies ChartConfig;

const inventoryConfig = {
  inventoryRatio: { label: "재고비율", color: "var(--chart-2)" },
} satisfies ChartConfig;

// WO-0806 #4: 같은 차트를 아침 회의(전일 대비)와 월간(전월 대비)에서 함께 쓴다.
// 라벨만 다르고 계산은 같아서 컴포넌트를 복제하지 않고 비교 기준 문구만 바꾼다.
const ComparisonLabelContext = createContext("전일");

function useComparisonLabel() {
  return useContext(ComparisonLabelContext);
}

const SIGNED_CHART_CATEGORY_AXIS_WIDTH = 72;

const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

export function DailySalesAnalysis({
  data,
  comparisonLabel = "전일",
}: {
  data: DailySalesAnalysisData;
  comparisonLabel?: string;
}) {
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
      if (row.inventoryRatio.value === null) {
        return [];
      }

      return [
        {
          storeId: row.storeId,
          storeName: row.storeName,
          inventoryRatio: row.inventoryRatio.value,
          ratioLabel: formatInventoryRatio(row.inventoryRatio),
        },
      ];
    },
  );
  const unavailableInventoryRows: UnavailableRow[] =
    data.inventoryRatios.flatMap((row) =>
      row.inventoryRatio.value === null
        ? [
            {
              key: row.storeId,
              label: row.storeName,
              reason: getUnavailableReason(row.inventoryRatio),
            },
          ]
        : [],
    );

  return (
    <ComparisonLabelContext.Provider value={comparisonLabel}>
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{comparisonLabel} 대비 매출액 증감률</CardTitle>
            <CardDescription>
              0선을 기준으로 지점별 증감률과 증감액을 함께 표시합니다.
            </CardDescription>
            <Badge className="mt-2" variant="outline">
              {salesChangeRows.length}개 표시 · {unavailableSalesChanges.length}
              개 제외
            </Badge>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-1 flex-col gap-4">
            {salesChangeRows.length === 0 ? (
              <EmptyChartMessage
                message={`계산 가능한 ${comparisonLabel} 대비 매출이 없습니다.`}
              />
            ) : (
              <>
                <ChartErrorBoundary
                  key={salesChangeRows
                    .map((row) => `${row.storeId}:${row.rate}`)
                    .join("|")}
                  fallback={
                    <EmptyChartMessage message="차트를 그릴 수 없어 표로 표시합니다." />
                  }
                >
                  <SignedChangeChart rows={salesChangeRows} />
                </ChartErrorBoundary>
                <SalesChangeLegend rows={salesChangeRows} />
              </>
            )}
            <SalesChangeTable data={data} />
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
              전체 매출 비중과 조회 기간 매출액을 함께 표시합니다.
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
            availableMessage={`범례에는 매출 비중과 ${comparisonLabel} 대비 증감을 함께 표시합니다.`}
            rows={unavailablePositions}
            title="포지션 제외 지점"
          />
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>재고비율</CardTitle>
            <CardDescription>
              재고금액 ÷ 매출액 비율을 표시하며, 동일 금액은 100.0%입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-1 flex-col gap-4">
            {inventoryRows.length === 0 ? (
              <EmptyChartMessage message="계산 가능한 재고비율이 없습니다." />
            ) : (
              <>
                <InventoryRatioChart rows={inventoryRows} />
                <InventoryRatioLegend rows={inventoryRows} />
              </>
            )}
            <InventoryAccessibleTable data={data} />
          </CardContent>
          <AvailabilityFooter
            availableMessage="100% 기준선은 재고금액과 매출액이 같은 지점을 뜻합니다."
            rows={unavailableInventoryRows}
          />
        </Card>
      </div>
    </ComparisonLabelContext.Provider>
  );
}

type ChartErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
};

class ChartErrorBoundary extends Component<
  ChartErrorBoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function SignedChangeChart({ rows }: { rows: SalesChangeChartRow[] }) {
  const comparisonLabel = useComparisonLabel();
  const values = rows.map((row) => row.rate);
  const chartHeight = Math.max(220, rows.length * 52 + 40);

  return (
    <ChartContainer
      aria-label={`지점별 ${comparisonLabel} 대비 매출액 증감률 차트`}
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
          tickMargin={getSignedCategoryTickMargin(values)}
          tickLine={false}
          type="category"
          width={SIGNED_CHART_CATEGORY_AXIS_WIDTH}
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
  const comparisonLabel = useComparisonLabel();
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
                        {comparisonLabel} 대비 {row.changeLabel}
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

      <ol
        className="grid gap-2"
        aria-label={`지점별 매출 비중과 ${comparisonLabel} 대비 증감`}
      >
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
                {comparisonLabel} 대비 {row.changeLabel}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SalesChangeLegend({ rows }: { rows: SalesChangeChartRow[] }) {
  const comparisonLabel = useComparisonLabel();
  return (
    <ul
      className="grid gap-2"
      aria-label={`지점별 ${comparisonLabel} 대비 증감 상세`}
    >
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

function InventoryRatioChart({ rows }: { rows: InventoryChartRow[] }) {
  const values = rows.map((row) => row.inventoryRatio);
  const chartHeight = Math.max(232, rows.length * 56 + 40);
  const labelRightMargin = Math.max(
    72,
    ...rows.map((row) => row.ratioLabel.length * 8 + 24),
  );

  return (
    <ChartContainer
      aria-label="지점별 재고비율 차트"
      className="min-h-56 w-full min-w-0"
      config={inventoryConfig}
      style={{ height: chartHeight }}
    >
      <BarChart
        accessibilityLayer
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: labelRightMargin, bottom: 4, left: 8 }}
      >
        <CartesianGrid horizontal={false} />
        <XAxis
          axisLine={false}
          domain={[0, getInventoryRatioDomainMaximum(values)]}
          tickFormatter={(value) =>
            unsignedPercentFormatter.format(Number(value))
          }
          tickLine={false}
          type="number"
        />
        <YAxis
          axisLine={false}
          dataKey="storeName"
          tickMargin={8}
          tickLine={false}
          type="category"
          width={SIGNED_CHART_CATEGORY_AXIS_WIDTH}
        />
        <ReferenceLine x={1} />
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
                      {row.ratioLabel}
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        <Bar dataKey="inventoryRatio" maxBarSize={20} radius={4}>
          {rows.map((row) => (
            <Cell
              data-testid={`inventory-ratio-bar-${row.storeId}`}
              fill="var(--chart-2)"
              key={row.storeId}
            />
          ))}
          <LabelList dataKey="ratioLabel" content={InventoryRatioLabel} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function InventoryRatioLabel({ x, y, width, height, value }: LabelProps) {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof value !== "string"
  ) {
    return null;
  }

  return (
    <text
      data-slot="inventory-ratio-label"
      x={x + width + 8}
      y={y + height / 2}
      dominantBaseline="central"
      className="fill-foreground text-[10px]"
    >
      {value}
    </text>
  );
}

function InventoryRatioLegend({ rows }: { rows: InventoryChartRow[] }) {
  return (
    <ul className="grid gap-2" aria-label="지점별 재고비율 상세">
      {rows.map((row) => (
        <li
          className="flex min-w-0 items-start justify-between gap-2 text-xs"
          key={row.storeId}
        >
          <span className="truncate font-medium">{row.storeName}</span>
          <span className="shrink-0 text-right tabular-nums">
            {row.ratioLabel}
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

function SalesChangeTable({ data }: { data: DailySalesAnalysisData }) {
  const comparisonLabel = useComparisonLabel();

  return (
    <div className="min-w-0">
      <Table>
        <TableCaption className="sr-only">
          지점별 {comparisonLabel} 대비 매출액 증감 데이터
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>지점</TableHead>
            <TableHead className="text-right">증감률</TableHead>
            <TableHead className="text-right">증감액</TableHead>
            <TableHead>상태</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.salesChanges.map((row) => {
            const isAvailable =
              row.rate.value !== null && row.difference.value !== null;

            return (
              <TableRow key={row.storeId}>
                <TableCell className="font-medium">{row.storeName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(row.rate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.difference)}
                </TableCell>
                <TableCell>
                  <Badge variant={isAvailable ? "secondary" : "outline"}>
                    {isAvailable
                      ? "계산 가능"
                      : getUnavailableReason(row.rate, row.difference)}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function PositionAccessibleTable({ data }: { data: DailySalesAnalysisData }) {
  const comparisonLabel = useComparisonLabel();
  return (
    <div className="sr-only">
      <table>
        <caption>지점별 매출 비중과 {comparisonLabel} 대비 증감 데이터</caption>
        <thead>
          <tr>
            <th>순위</th>
            <th>지점</th>
            <th>전체 매출 비중</th>
            <th>{comparisonLabel} 대비 증감률</th>
            <th>{comparisonLabel} 대비 증감액</th>
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
        <caption>지점별 재고비율 데이터</caption>
        <thead>
          <tr>
            <th>지점</th>
            <th>재고금액</th>
            <th>매출액</th>
            <th>재고비율</th>
            <th>계산 상태</th>
          </tr>
        </thead>
        <tbody>
          {data.inventoryRatios.map((row) => (
            <tr key={row.storeId}>
              <td>{row.storeName}</td>
              <td>{formatMoney(row.inventoryAmount)}</td>
              <td>{formatMoney(row.salesAmount)}</td>
              <td>{formatInventoryRatio(row.inventoryRatio)}</td>
              <td>
                {row.inventoryRatio.value === null
                  ? getUnavailableReason(row.inventoryRatio)
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

function getSignedCategoryTickMargin(values: number[]) {
  return values.some((value) => value < 0)
    ? SIGNED_CHART_CATEGORY_AXIS_WIDTH
    : 8;
}

function getInventoryRatioDomainMaximum(values: number[]) {
  return Math.max(1, ...values) * 1.12;
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

function formatInventoryRatio(metric: LedgerReviewMetric) {
  return metric.value === null
    ? formatUnavailable(metric)
    : inventoryRatioFormatter.format(metric.value);
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
