import Link from "next/link";

import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";
import type {
  DailyMeetingReportMetricEvidence,
  DailyMeetingReportMetricValue,
  StoreComparisonReportData,
  StoreComparisonReportRow,
} from "../types";

type StoreComparisonReportTableProps = {
  report: StoreComparisonReportData;
};

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});
const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function StoreComparisonReportTable({
  report,
}: StoreComparisonReportTableProps) {
  if (report.rows.length === 0) {
    return (
      <section className="bg-card text-muted-foreground rounded-lg border p-6 text-sm shadow-sm">
        {report.stores.length === 0
          ? "표시할 지점 데이터가 없습니다. 기준정보에서 활성 지점을 먼저 확인해 주세요."
          : "선택한 조건에 표시할 지점 데이터가 없습니다. 지점 권한과 활성 상태를 확인해 주세요."}
      </section>
    );
  }

  return (
    <section
      className="flex flex-col gap-3"
      aria-label="기간 비교 리포트 지점 목록"
    >
      <div className="bg-card hidden overflow-x-auto rounded-lg border shadow-sm md:block">
        <Table className="min-w-[1280px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">지점</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">매출</TableHead>
              <TableHead className="text-right">매출이익</TableHead>
              <TableHead className="text-right">이익률</TableHead>
              <TableHead className="text-right">영업이익</TableHead>
              <TableHead className="text-right">인당생산성</TableHead>
              <TableHead className="text-right">평균재고</TableHead>
              <TableHead className="text-right">평균매출</TableHead>
              <TableHead className="text-right">재고비율</TableHead>
              <TableHead>손실</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.map((row) => (
              <TableRow
                key={row.storeId}
                data-testid={`hq-report-comparison-row-${row.storeId}`}
              >
                <TableCell className="font-medium">{row.storeName}</TableCell>
                <TableCell>
                  <StatusSummary row={row} />
                </TableCell>
                <MetricCell
                  value={formatKrwMetric(row.salesAmount)}
                  evidence={row.metricEvidence.salesAmount}
                />
                <MetricCell
                  value={formatKrwMetric(row.grossProfit)}
                  evidence={row.metricEvidence.grossProfit}
                />
                <MetricCell
                  value={formatPercentMetric(row.grossMarginRate)}
                  evidence={row.metricEvidence.grossMarginRate}
                />
                <MetricCell
                  value={formatKrwMetric(row.operatingProfit)}
                  evidence={row.metricEvidence.operatingProfit}
                />
                <MetricCell
                  value={formatKrwMetric(row.productivity)}
                  evidence={row.metricEvidence.productivity}
                />
                <MetricCell
                  value={formatKrwMetric(row.averageInventory)}
                  evidence={row.metricEvidence.averageInventory}
                />
                <MetricCell
                  value={formatKrwMetric(row.averageSales)}
                  evidence={row.metricEvidence.averageSales}
                />
                <MetricCell
                  value={formatPercentMetric(row.inventoryToSalesRatio)}
                  evidence={row.metricEvidence.inventoryToSalesRatio}
                />
                <TableCell>
                  <MetricValueWithEvidence
                    value={formatLoss(row)}
                    evidence={row.metricEvidence.loss}
                    align="left"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {report.rows.map((row) => (
          <article
            key={row.storeId}
            data-testid={`hq-report-comparison-mobile-row-${row.storeId}`}
            className="bg-card rounded-lg border p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold tracking-normal">
                  {row.storeName}
                </h2>
                <StatusSummary row={row} className="mt-2" />
              </div>
              <Badge variant={row.hasLoss ? "destructive" : "outline"}>
                {formatLoss(row)}
              </Badge>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <MobileMetric
                label="매출"
                value={formatKrwMetric(row.salesAmount)}
                evidence={row.metricEvidence.salesAmount}
              />
              <MobileMetric
                label="이익률"
                value={formatPercentMetric(row.grossMarginRate)}
                evidence={row.metricEvidence.grossMarginRate}
              />
              <MobileMetric
                label="영업이익"
                value={formatKrwMetric(row.operatingProfit)}
                evidence={row.metricEvidence.operatingProfit}
              />
              <MobileMetric
                label="평균재고"
                value={formatKrwMetric(row.averageInventory)}
                evidence={row.metricEvidence.averageInventory}
              />
            </dl>

            <details className="mt-4 text-sm">
              <summary className="text-primary inline-flex cursor-pointer list-none underline-offset-2 hover:underline">
                나머지 지표
              </summary>
              <dl className="mt-3 grid gap-2">
                <MobileMetric
                  label="매출이익"
                  value={formatKrwMetric(row.grossProfit)}
                  evidence={row.metricEvidence.grossProfit}
                />
                <MobileMetric
                  label="인당생산성"
                  value={formatKrwMetric(row.productivity)}
                  evidence={row.metricEvidence.productivity}
                />
                <MobileMetric
                  label="평균매출"
                  value={formatKrwMetric(row.averageSales)}
                  evidence={row.metricEvidence.averageSales}
                />
                <MobileMetric
                  label="재고비율"
                  value={formatPercentMetric(row.inventoryToSalesRatio)}
                  evidence={row.metricEvidence.inventoryToSalesRatio}
                />
              </dl>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}

function MetricCell({
  value,
  evidence,
}: {
  value: string;
  evidence: DailyMeetingReportMetricEvidence;
}) {
  return (
    <TableCell className="text-right tabular-nums">
      <MetricValueWithEvidence value={value} evidence={evidence} />
    </TableCell>
  );
}

function MobileMetric({
  label,
  value,
  evidence,
}: {
  label: string;
  value: string;
  evidence: DailyMeetingReportMetricEvidence;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">
        <MetricValueWithEvidence
          value={value}
          evidence={evidence}
          align="left"
        />
      </dd>
    </div>
  );
}

function StatusSummary({
  row,
  className,
}: {
  row: StoreComparisonReportRow;
  className?: string;
}) {
  const items = [
    ["본사마감", row.statusCounts.closedCount],
    ["검토대기", row.statusCounts.reviewCount],
    ["입력중", row.statusCounts.inProgressCount],
    ["미입력", row.statusCounts.missingDayCount],
    ["휴무", row.statusCounts.holidayCount],
  ].filter(([, count]) => Number(count) > 0);
  const hasUnclosedLedgers =
    row.statusCounts.inProgressCount + row.statusCounts.reviewCount > 0;

  if (items.length === 0 && !row.hasUnappliedCorrections) {
    return <span className="text-muted-foreground text-sm">데이터 없음</span>;
  }

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {hasUnclosedLedgers ? <Badge variant="outline">미마감 포함</Badge> : null}
      {items.map(([label, count]) => (
        <Badge key={label} variant="outline">
          {label} {Number(count).toLocaleString("ko-KR")}일
        </Badge>
      ))}
      {row.hasUnappliedCorrections ? (
        <Badge variant="outline">정정 확인 필요</Badge>
      ) : null}
    </div>
  );
}

function MetricValueWithEvidence({
  value,
  evidence,
  align = "right",
}: {
  value: string;
  evidence: DailyMeetingReportMetricEvidence;
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn("min-w-0", align === "right" ? "text-right" : "text-left")}
    >
      <div className="font-medium break-words">
        {value}
        {evidence.isCorrected ? (
          <span className="text-primary ml-1 text-xs font-semibold whitespace-nowrap">
            정정 반영
          </span>
        ) : null}
      </div>
      <details className="mt-1 text-xs">
        <summary className="text-primary inline-flex cursor-pointer list-none break-words underline-offset-2 hover:underline">
          근거 보기
        </summary>
        <dl className="bg-muted/40 mt-2 grid gap-1 rounded-md p-2 text-left">
          <div className="min-w-0">
            <dt className="text-muted-foreground">원본</dt>
            <dd className="break-words tabular-nums">
              {formatEvidenceValue(evidence.original)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">정정 반영</dt>
            <dd className="break-words tabular-nums">
              {formatEvidenceValue(evidence.applied)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">계산 상태</dt>
            <dd className="break-words">{evidence.statusLabel}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">계산 불가 사유</dt>
            <dd className="break-words">
              {evidence.unavailableReason ?? "해당 없음"}
            </dd>
          </div>
        </dl>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {evidence.ledgerDetailHref ? (
            <Link
              className="text-primary underline"
              href={evidence.ledgerDetailHref}
            >
              장부 상세
            </Link>
          ) : null}
          {evidence.correctionTimelineHref ? (
            <Link
              className="text-primary underline"
              href={evidence.correctionTimelineHref}
            >
              정정 타임라인
            </Link>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function formatKrwMetric(metric: StoreComparisonReportRow["salesAmount"]) {
  return metric.value === null
    ? (metric.label ?? metric.unavailableReason ?? "계산 불가")
    : krwFormatter.format(metric.value);
}

function formatPercentMetric(
  metric: StoreComparisonReportRow["grossMarginRate"],
) {
  return metric.value === null
    ? (metric.label ?? metric.unavailableReason ?? "계산 불가")
    : percentFormatter.format(metric.value);
}

function formatLoss(row: StoreComparisonReportRow) {
  if (row.hasLoss === null) {
    return "확인 필요";
  }

  return row.hasLoss ? "손실 있음" : "손실 없음";
}

function formatEvidenceValue(value: DailyMeetingReportMetricValue) {
  if (value.value === null) {
    return value.label ?? value.unavailableReason ?? "계산 불가";
  }

  if (value.kind === "percent") {
    return percentFormatter.format(value.value);
  }

  if (value.kind === "boolean") {
    return value.value > 0 ? "손실 있음" : "손실 없음";
  }

  return krwFormatter.format(value.value);
}
