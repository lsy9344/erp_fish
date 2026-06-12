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
const latestReflectedAtFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
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
        <Table className="min-w-[1320px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">지점</TableHead>
              <TableHead>장부 상태</TableHead>
              <TableHead className="text-right">최신 반영</TableHead>
              <TableHead className="min-w-[220px]">상태 메시지</TableHead>
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
                <TableCell className="text-right text-sm whitespace-nowrap tabular-nums">
                  <span className="sr-only">최신 반영 </span>
                  {formatLatestReflectedAt(row.latestReflectedAt)}
                </TableCell>
                <TableCell className="min-w-[220px] text-sm break-words">
                  <span className="sr-only">상태 메시지 </span>
                  {getDailyMeetingStatusMessage(row)}
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
                  {getDailyMeetingStatusMessage(row)}
                </p>
              </div>
              <DashboardStatusBadge
                status={row.ledgerStatus}
                className="shrink-0"
              />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">최신 반영</dt>
                <dd className="font-medium tabular-nums">
                  {formatLatestReflectedAt(row.latestReflectedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">상태 메시지</dt>
                <dd className="font-medium break-words">
                  {getDailyMeetingStatusMessage(row)}
                </dd>
              </div>
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
    ? (metric.label ?? metric.unavailableReason ?? "계산 불가")
    : krwFormatter.format(metric.value);
}

function formatPercentMetric(metric: DailyMeetingReportRow["grossMarginRate"]) {
  return metric.value === null
    ? (metric.label ?? metric.unavailableReason ?? "계산 불가")
    : percentFormatter.format(metric.value);
}

function formatLoss(row: DailyMeetingReportRow) {
  if (row.hasLoss === null) {
    return "확인 필요";
  }

  return row.hasLoss ? "손실 있음" : "손실 없음";
}

function formatLatestReflectedAt(value: string | null) {
  if (!value) {
    return "반영 전";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "반영 전";
  }

  return latestReflectedAtFormatter.format(date);
}

function getDailyMeetingStatusMessage(row: DailyMeetingReportRow) {
  if (!row.ledgerId) {
    return "미제출 - 장부 입력 전";
  }

  if (row.ledgerStatus.key === "HOLIDAY") {
    return row.correctionState.hasUnappliedCorrections
      ? "휴무일 - 정정 확인 필요"
      : "휴무일 - 집계 제외";
  }

  if (row.correctionState.hasUnappliedCorrections) {
    return "정정 확인 필요 - 장부 상세 확인";
  }

  if (row.signals.length > 0) {
    return `확인 필요 - ${row.signals.map((signal) => signal.label).join(", ")}`;
  }

  const timingMessage = getSubmissionTimingMessage(row);

  switch (row.ledgerStatus.key) {
    case "HEADQUARTERS_CLOSED":
      return `본사마감 - ${timingMessage ?? "회의 반영 완료"}`;
    case "IN_REVIEW":
      return `검토 대기 - ${timingMessage ?? "본사 확인 필요"}`;
    case "IN_PROGRESS":
      return `입력중 - ${timingMessage ?? "제출 전"}`;
    default:
      return `${row.businessStatus.label} - ${formatLoss(row)}`;
  }
}

function getSubmissionTimingMessage(row: DailyMeetingReportRow) {
  if (!row.lastModifiedAt) {
    return null;
  }

  const submittedAt = Date.parse(row.lastModifiedAt);
  const meetingThreshold = getMeetingThresholdUtc(row.closingDate);

  if (!Number.isFinite(submittedAt) || meetingThreshold === null) {
    return null;
  }

  return submittedAt > meetingThreshold ? "지연 제출" : "기준 전 제출";
}

function getMeetingThresholdUtc(closingDateIso: string) {
  const dateInput = closingDateIso.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;

  return Date.UTC(Number(year), Number(month) - 1, Number(day), -1, 0, 0);
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
