"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { HqDashboardData, HqDashboardRow } from "../types.ts";
import { DashboardSignalSummary } from "./dashboard-signal-summary.tsx";
import { DashboardStatusBadge } from "./dashboard-status-badge.tsx";

type HqDashboardTableProps = {
  dashboard: HqDashboardData;
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
const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function HqDashboardTable({ dashboard }: HqDashboardTableProps) {
  const router = useRouter();
  const hasNoActiveStores = dashboard.summary.totalStores === 0;

  if (dashboard.rows.length === 0) {
    return (
      <section
        className="bg-card text-muted-foreground rounded-lg border p-6 text-sm shadow-sm"
        aria-label="관제판 지점 목록"
      >
        {hasNoActiveStores
          ? "활성 지점이 없습니다. 기준정보에서 지점을 먼저 등록해 주세요."
          : "조건에 맞는 지점이 없습니다. 필터를 전체로 바꾸면 모든 지점을 볼 수 있습니다."}
      </section>
    );
  }

  const openLedgerDetail = (row: HqDashboardRow) => {
    if (row.ledgerId) {
      router.push(getLedgerDetailHref(row, dashboard));
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-label="관제판 지점 목록">
      <div className="bg-card hidden overflow-x-auto rounded-lg border shadow-sm md:block">
        <Table className="min-w-[1200px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">지점</TableHead>
              <TableHead>확인 순서</TableHead>
              <TableHead>영업 상태</TableHead>
              <TableHead>장부 상태</TableHead>
              <TableHead className="text-right">매출</TableHead>
              <TableHead className="text-right">매출 차이</TableHead>
              <TableHead className="text-right">마진율</TableHead>
              <TableHead>손실</TableHead>
              <TableHead>신호</TableHead>
              <TableHead>최종 수정</TableHead>
              <TableHead>본사 마감</TableHead>
              <TableHead>상세</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dashboard.rows.map((row) => (
              <TableRow
                key={row.storeId}
                data-testid={`hq-dashboard-row-${row.storeId}`}
                className={getRowClassName(row)}
                {...getRowActivationProps(row, openLedgerDetail)}
              >
                <TableCell className="font-medium">{row.storeName}</TableCell>
                <TableCell>
                  <PriorityBadge row={row} />
                </TableCell>
                <TableCell>{row.businessStatus.label}</TableCell>
                <TableCell>
                  <DashboardStatusBadge status={row.ledgerStatus} />
                </TableCell>
                <TableCell className="text-right">
                  {formatKrw(row.salesAmount.value)}
                </TableCell>
                <TableCell className="text-right">
                  {formatKrwMetric(row.salesDifference)}
                </TableCell>
                <TableCell className="text-right">
                  {formatPercentMetric(row.grossMarginRate)}
                </TableCell>
                <TableCell>{formatLoss(row)}</TableCell>
                <TableCell>
                  <DashboardSignalSummary signals={row.signals} />
                </TableCell>
                <TableCell>{formatLastModified(row)}</TableCell>
                <TableCell>{formatHeadquartersClosed(row)}</TableCell>
                <TableCell>
                  <DetailLink row={row} dashboard={dashboard} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {dashboard.rows.map((row) => (
          <article
            key={row.storeId}
            data-testid={`hq-dashboard-mobile-row-${row.storeId}`}
            className={cn(
              "bg-card w-full rounded-lg border p-4 shadow-sm",
              getRowClassName(row),
            )}
            {...getRowActivationProps(row, openLedgerDetail)}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div
                data-testid={`hq-dashboard-mobile-store-${row.storeId}`}
                className="min-w-0 flex-1"
              >
                <h2 className="truncate text-base font-semibold tracking-normal">
                  {row.storeName}
                </h2>
                <p className="text-muted-foreground text-sm break-words">
                  {row.businessStatus.label} · {formatLastModified(row)}
                </p>
              </div>
              <DashboardStatusBadge
                status={row.ledgerStatus}
                data-testid={`hq-dashboard-mobile-status-${row.storeId}`}
                className="shrink-0"
              />
            </div>

            <PriorityBadge row={row} className="mt-3" />

            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">매출</dt>
                <dd className="font-medium">
                  {formatKrw(row.salesAmount.value)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">손실</dt>
                <dd className="font-medium">{formatLoss(row)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">매출 차이</dt>
                <dd className="font-medium">
                  {formatKrwMetric(row.salesDifference)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">마진율</dt>
                <dd className="font-medium">
                  {formatPercentMetric(row.grossMarginRate)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">본사 마감</dt>
                <dd className="font-medium">{formatHeadquartersClosed(row)}</dd>
              </div>
            </dl>

            <DashboardSignalSummary
              signals={row.signals}
              data-testid={`hq-dashboard-mobile-signal-${row.storeId}`}
              className="mt-4"
            />
            <DetailLink row={row} dashboard={dashboard} className="mt-3" />
          </article>
        ))}
      </div>
    </section>
  );
}

function getRowActivationProps(
  row: HqDashboardRow,
  openLedgerDetail: (row: HqDashboardRow) => void,
) {
  if (!row.ledgerId) {
    return {};
  }

  return {
    role: "link" as const,
    tabIndex: 0,
    "aria-label": `${row.storeName} 장부 상세 보기`,
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (isInteractiveTarget(event.target, event.currentTarget)) {
        return;
      }

      openLedgerDetail(row);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (isInteractiveTarget(event.target, event.currentTarget)) {
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openLedgerDetail(row);
      }
    },
  };
}

function isInteractiveTarget(
  target: EventTarget | null,
  currentTarget: HTMLElement,
) {
  if (!(target instanceof Element)) {
    return false;
  }

  const interactiveTarget = target.closest(
    "a, button, input, select, textarea, [role='button'], [role='link']",
  );

  return Boolean(interactiveTarget && interactiveTarget !== currentTarget);
}

function DetailLink({
  row,
  dashboard,
  className,
}: {
  row: HqDashboardRow;
  dashboard: HqDashboardData;
  className?: string;
}) {
  if (!row.ledgerId) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        aria-label={`${row.storeName} 장부 입력 전`}
        className={className}
      >
        입력 전
      </Button>
    );
  }

  return (
    <Button asChild variant="outline" size="sm" className={className}>
      <Link
        href={getLedgerDetailHref(row, dashboard)}
        aria-label={`${row.storeName} 상세 보기`}
      >
        상세 보기
      </Link>
    </Button>
  );
}

function PriorityBadge({
  row,
  className,
}: {
  row: HqDashboardRow;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      title={row.priority.reasons.join(", ")}
      className={cn("max-w-full text-left whitespace-normal", className)}
    >
      {row.priority.label}
    </Badge>
  );
}

function getLedgerDetailHref(row: HqDashboardRow, dashboard: HqDashboardData) {
  if (!row.ledgerId) {
    return "/app/dashboard";
  }

  return `/app/ledgers/${row.ledgerId}?date=${dashboard.datePreset}&sort=${dashboard.sortMode}&filter=${dashboard.filterMode}`;
}

function getRowClassName(row: HqDashboardRow) {
  const activationClassName = row.ledgerId
    ? "cursor-pointer focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none"
    : undefined;
  const hasCriticalSignal = row.signals.some(
    (signal) => signal.severity === "critical",
  );
  const hasWarningSignal = row.signals.some(
    (signal) => signal.severity === "warning",
  );
  const hasInfoSignalsOnly =
    row.signals.length > 0 && !hasCriticalSignal && !hasWarningSignal;

  if (hasCriticalSignal) {
    return cn(
      activationClassName,
      "border-l-4 border-destructive bg-destructive/5",
    );
  }

  if (hasWarningSignal) {
    return cn(activationClassName, "border-l-4 border-warning bg-warning/10");
  }

  if (hasInfoSignalsOnly) {
    return cn(activationClassName, "border-l-4 border-primary/30 bg-primary/5");
  }

  return activationClassName;
}

function formatKrw(value: number | null) {
  return value === null ? "-" : krwFormatter.format(value);
}

function formatKrwMetric(metric: HqDashboardRow["salesDifference"]) {
  if (metric.value === null) {
    return metric.unavailableReason ?? "-";
  }

  return krwFormatter.format(metric.value);
}

function formatPercentMetric(metric: HqDashboardRow["grossMarginRate"]) {
  if (metric.value === null) {
    return metric.unavailableReason ?? "-";
  }

  return percentFormatter.format(metric.value);
}

function formatLoss(row: HqDashboardRow) {
  if (row.hasLoss === null) {
    return "입력 전";
  }

  return row.hasLoss ? "손실 있음" : "없음";
}

function formatHeadquartersClosed(row: HqDashboardRow) {
  return row.isHeadquartersClosed ? "마감" : "미마감";
}

function formatLastModified(row: HqDashboardRow) {
  if (row.lastModifiedAt === null) {
    return "입력 전";
  }

  const actor =
    row.lastModifiedBy?.name ?? row.lastModifiedBy?.email ?? "수정자 없음";

  return `${dateTimeFormatter.format(new Date(row.lastModifiedAt))} · ${actor}`;
}
