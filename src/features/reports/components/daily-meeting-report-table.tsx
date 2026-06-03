import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Button } from "~/components/ui/button";
import { DashboardSignalSummary } from "~/features/dashboard/components/dashboard-signal-summary";
import { DashboardStatusBadge } from "~/features/dashboard/components/dashboard-status-badge";
import { cn } from "~/lib/utils";
import type {
  DailyMeetingReportData,
  DailyMeetingReportMetricEvidence,
  DailyMeetingReportMetricValue,
  DailyMeetingReportRow,
} from "../types";

type DailyMeetingReportTableProps = {
  report: DailyMeetingReportData;
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

export function DailyMeetingReportTable({
  report,
}: DailyMeetingReportTableProps) {
  if (report.rows.length === 0) {
    return (
      <section className="bg-card text-muted-foreground rounded-lg border p-6 text-sm shadow-sm">
        표시할 지점 데이터가 없습니다. 기준정보에서 활성 지점을 먼저 확인해
        주세요.
      </section>
    );
  }

  return (
    <section
      className="flex flex-col gap-3"
      aria-label="일별 아침 회의 리포트 지점 목록"
    >
      <div className="bg-card hidden overflow-x-auto rounded-lg border shadow-sm md:block">
        <Table className="min-w-[1040px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">지점</TableHead>
              <TableHead>장부 상태</TableHead>
              <TableHead className="text-right">매출</TableHead>
              <TableHead className="text-right">이익률</TableHead>
              <TableHead className="text-right">매출 차이</TableHead>
              <TableHead>손실</TableHead>
              <TableHead>이상 신호</TableHead>
              <TableHead>상세</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.map((row) => (
              <TableRow
                key={row.storeId}
                data-testid={`hq-report-row-${row.storeId}`}
              >
                <TableCell className="font-medium">{row.storeName}</TableCell>
                <TableCell>
                  <DashboardStatusBadge status={row.ledgerStatus} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <MetricValueWithEvidence
                    value={formatKrw(row.salesAmount.value)}
                    evidence={row.metricEvidence.salesAmount}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <MetricValueWithEvidence
                    value={formatPercentMetric(row.grossMarginRate)}
                    evidence={row.metricEvidence.grossMarginRate}
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <MetricValueWithEvidence
                    value={formatKrwMetric(row.salesDifference)}
                    evidence={row.metricEvidence.salesDifference}
                  />
                </TableCell>
                <TableCell>
                  <MetricValueWithEvidence
                    value={formatLoss(row)}
                    evidence={row.metricEvidence.loss}
                    align="left"
                  />
                </TableCell>
                <TableCell>
                  <DashboardSignalSummary signals={row.signals} />
                </TableCell>
                <TableCell>
                  <DetailLink row={row} />
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
            data-testid={`hq-report-mobile-row-${row.storeId}`}
            className="bg-card rounded-lg border p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold tracking-normal">
                  {row.storeName}
                </h2>
                <p className="text-muted-foreground text-sm break-words">
                  {row.businessStatus.label} · {formatLoss(row)}
                </p>
              </div>
              <DashboardStatusBadge
                status={row.ledgerStatus}
                className="shrink-0"
              />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">매출</dt>
                <dd className="font-medium tabular-nums">
                  <MetricValueWithEvidence
                    value={formatKrw(row.salesAmount.value)}
                    evidence={row.metricEvidence.salesAmount}
                    align="left"
                  />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">이익률</dt>
                <dd className="font-medium tabular-nums">
                  <MetricValueWithEvidence
                    value={formatPercentMetric(row.grossMarginRate)}
                    evidence={row.metricEvidence.grossMarginRate}
                    align="left"
                  />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">매출 차이</dt>
                <dd className="font-medium tabular-nums">
                  <MetricValueWithEvidence
                    value={formatKrwMetric(row.salesDifference)}
                    evidence={row.metricEvidence.salesDifference}
                    align="left"
                  />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">손실</dt>
                <dd className="font-medium tabular-nums">
                  <MetricValueWithEvidence
                    value={formatLoss(row)}
                    evidence={row.metricEvidence.loss}
                    align="left"
                  />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">상세</dt>
                <dd>
                  <DetailLink row={row} compact />
                </dd>
              </div>
            </dl>

            <DashboardSignalSummary signals={row.signals} className="mt-4" />
          </article>
        ))}
      </div>
    </section>
  );
}

function DetailLink({
  row,
  compact = false,
}: {
  row: DailyMeetingReportRow;
  compact?: boolean;
}) {
  if (!row.ledgerId) {
    return (
      <span
        className={cn(
          "text-muted-foreground inline-flex min-h-9 items-center text-sm break-words",
          compact && "min-h-0",
        )}
      >
        입력 전
      </span>
    );
  }

  return (
    <Button asChild variant="outline" size="sm">
      <Link href={`/app/ledgers/${row.ledgerId}`}>상세 보기</Link>
    </Button>
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

function formatKrw(value: number | null) {
  return value === null ? "계산 불가" : krwFormatter.format(value);
}

function formatKrwMetric(metric: DailyMeetingReportRow["salesDifference"]) {
  return metric.value === null
    ? (metric.unavailableReason ?? "계산 불가")
    : krwFormatter.format(metric.value);
}

function formatPercentMetric(metric: DailyMeetingReportRow["grossMarginRate"]) {
  return metric.value === null
    ? (metric.unavailableReason ?? "계산 불가")
    : percentFormatter.format(metric.value);
}

function formatLoss(row: DailyMeetingReportRow) {
  if (row.hasLoss === null) {
    return "확인 필요";
  }

  return row.hasLoss ? "손실 있음" : "손실 없음";
}

function formatEvidenceValue(value: DailyMeetingReportMetricValue) {
  if (value.value === null) {
    return value.unavailableReason ?? "계산 불가";
  }

  if (value.kind === "percent") {
    return percentFormatter.format(value.value);
  }

  if (value.kind === "boolean") {
    return value.value > 0 ? "손실 있음" : "손실 없음";
  }

  return krwFormatter.format(value.value);
}
