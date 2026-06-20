"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

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

const dashboardColumnWidthsStorageKey =
  "erp-fish:hq-dashboard-column-widths:v1";
const dashboardRefreshIntervalMs = 30_000;

const dashboardColumnWidthConfig = [
  {
    id: "store",
    label: "지점",
    defaultWidth: 180,
    minWidth: 160,
    maxWidth: 320,
  },
  {
    id: "priority",
    label: "확인 순서",
    defaultWidth: 150,
    minWidth: 130,
    maxWidth: 260,
  },
  {
    id: "businessStatus",
    label: "영업 상태",
    defaultWidth: 110,
    minWidth: 100,
    maxWidth: 180,
  },
  {
    id: "ledgerStatus",
    label: "장부 상태",
    defaultWidth: 120,
    minWidth: 110,
    maxWidth: 190,
  },
  {
    id: "salesAmount",
    label: "매출",
    defaultWidth: 130,
    minWidth: 120,
    maxWidth: 220,
    className: "text-right tabular-nums",
  },
  {
    id: "salesDifference",
    label: "매출 차이",
    defaultWidth: 130,
    minWidth: 120,
    maxWidth: 220,
    className: "text-right tabular-nums",
  },
  {
    id: "grossMarginRate",
    label: "마진율",
    defaultWidth: 110,
    minWidth: 100,
    maxWidth: 180,
    className: "text-right tabular-nums",
  },
  {
    id: "loss",
    label: "손실",
    defaultWidth: 100,
    minWidth: 90,
    maxWidth: 160,
  },
  {
    id: "signals",
    label: "신호",
    defaultWidth: 160,
    minWidth: 140,
    maxWidth: 320,
  },
  {
    id: "latestReflected",
    label: "최신 반영",
    defaultWidth: 140,
    minWidth: 130,
    maxWidth: 220,
    className: "tabular-nums",
  },
  {
    id: "lastModifiedBy",
    label: "마지막 수정자",
    defaultWidth: 140,
    minWidth: 130,
    maxWidth: 240,
  },
  {
    id: "headquartersClosed",
    label: "본사 마감",
    defaultWidth: 110,
    minWidth: 100,
    maxWidth: 180,
  },
  {
    id: "detail",
    label: "상세",
    defaultWidth: 110,
    minWidth: 100,
    maxWidth: 160,
  },
] as const;

type DashboardColumnConfig = (typeof dashboardColumnWidthConfig)[number];
type DashboardColumnId = DashboardColumnConfig["id"];
type DashboardColumnWidths = Record<DashboardColumnId, number>;

const dashboardColumnConfigById = Object.fromEntries(
  dashboardColumnWidthConfig.map((column) => [column.id, column]),
) as Record<DashboardColumnId, DashboardColumnConfig>;

const defaultDashboardColumnWidths = Object.fromEntries(
  dashboardColumnWidthConfig.map((column) => [column.id, column.defaultWidth]),
) as DashboardColumnWidths;

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
const refreshTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export function HqDashboardTable({ dashboard }: HqDashboardTableProps) {
  const router = useRouter();
  const refreshEndTimeoutRef = useRef<number | null>(null);
  const [columnWidths, setColumnWidths] = useState<DashboardColumnWidths>(
    defaultDashboardColumnWidths,
  );
  const [columnWidthsLoaded, setColumnWidthsLoaded] = useState(false);
  const [lastRefreshAttemptAt, setLastRefreshAttemptAt] = useState<Date | null>(
    null,
  );
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    const storedWidths = window.localStorage.getItem(
      dashboardColumnWidthsStorageKey,
    );

    if (storedWidths) {
      setColumnWidths(parseStoredColumnWidths(storedWidths));
    }

    setColumnWidthsLoaded(true);
  }, []);

  useEffect(() => {
    if (!columnWidthsLoaded) {
      return;
    }

    if (isDefaultColumnWidths(columnWidths)) {
      window.localStorage.removeItem(dashboardColumnWidthsStorageKey);
      return;
    }

    window.localStorage.setItem(
      dashboardColumnWidthsStorageKey,
      JSON.stringify(columnWidths),
    );
  }, [columnWidths, columnWidthsLoaded]);

  useEffect(() => {
    return () => {
      if (refreshEndTimeoutRef.current !== null) {
        window.clearTimeout(refreshEndTimeoutRef.current);
      }
    };
  }, []);

  const triggerDashboardRefresh = useCallback(() => {
    setLastRefreshAttemptAt(new Date());
    setIsAutoRefreshing(true);

    if (refreshEndTimeoutRef.current !== null) {
      window.clearTimeout(refreshEndTimeoutRef.current);
    }

    try {
      router.refresh();
      setRefreshError(null);
    } catch {
      setRefreshError("갱신 실패");
    }

    refreshEndTimeoutRef.current = window.setTimeout(() => {
      setIsAutoRefreshing(false);
    }, 1000);
  }, [router]);

  useEffect(() => {
    setLastRefreshAttemptAt(new Date());
    const intervalId = window.setInterval(
      triggerDashboardRefresh,
      dashboardRefreshIntervalMs,
    );

    return () => window.clearInterval(intervalId);
  }, [triggerDashboardRefresh]);

  const tableWidth = useMemo(
    () =>
      dashboardColumnWidthConfig.reduce(
        (totalWidth, column) => totalWidth + columnWidths[column.id],
        0,
      ),
    [columnWidths],
  );

  const setColumnWidth = useCallback(
    (columnId: DashboardColumnId, width: number) => {
      setColumnWidths((currentWidths) => ({
        ...currentWidths,
        [columnId]: clampColumnWidth(columnId, width),
      }));
    },
    [],
  );

  const startColumnResize = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      columnId: DashboardColumnId,
    ) => {
      event.preventDefault();
      event.stopPropagation();

      const resizeHandle = event.currentTarget;
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startWidth = columnWidths[columnId];

      resizeHandle.setPointerCapture(pointerId);

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        setColumnWidth(columnId, startWidth + moveEvent.clientX - startX);
      };
      const stopResize = () => {
        if (resizeHandle.hasPointerCapture(pointerId)) {
          resizeHandle.releasePointerCapture(pointerId);
        }

        resizeHandle.removeEventListener("pointermove", handlePointerMove);
        resizeHandle.removeEventListener("pointerup", stopResize);
        resizeHandle.removeEventListener("pointercancel", stopResize);
      };

      resizeHandle.addEventListener("pointermove", handlePointerMove);
      resizeHandle.addEventListener("pointerup", stopResize);
      resizeHandle.addEventListener("pointercancel", stopResize);
    },
    [columnWidths, setColumnWidth],
  );

  const handleColumnResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, columnId: DashboardColumnId) => {
      const columnConfig = dashboardColumnConfigById[columnId];
      const currentWidth = columnWidths[columnId];

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setColumnWidth(columnId, currentWidth - 20);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setColumnWidth(columnId, currentWidth + 20);
      } else if (event.key === "Home") {
        event.preventDefault();
        setColumnWidth(columnId, columnConfig.minWidth);
      } else if (event.key === "End") {
        event.preventDefault();
        setColumnWidth(columnId, columnConfig.maxWidth);
      }
    },
    [columnWidths, setColumnWidth],
  );

  const resetColumnWidths = () => {
    setColumnWidths(defaultDashboardColumnWidths);
  };

  const openLedgerDetail = (row: HqDashboardRow) => {
    if (row.ledgerId) {
      router.push(getLedgerDetailHref(row, dashboard));
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-label="관제판 지점 목록">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div
          data-testid="hq-dashboard-refresh-status"
          role="status"
          aria-live="polite"
          className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
        >
          <span className="text-foreground font-medium">
            {isAutoRefreshing
              ? "갱신 중"
              : refreshError
                ? "갱신 실패"
                : "자동 갱신 대기"}
          </span>
          <span>주기 30초</span>
          <span className="tabular-nums">
            마지막 갱신{" "}
            {lastRefreshAttemptAt
              ? refreshTimeFormatter.format(lastRefreshAttemptAt)
              : "확인 중"}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="hidden md:inline-flex"
          onClick={resetColumnWidths}
        >
          컬럼 폭 초기화
        </Button>
      </div>

      {dashboard.rows.length === 0 ? (
        <div
          data-testid="hq-dashboard-empty-state"
          className="bg-card text-muted-foreground rounded-lg border p-6 text-sm shadow-sm"
        >
          {getDashboardEmptyStateMessage(dashboard)}
        </div>
      ) : (
        <>
          <div className="bg-card hidden overflow-x-auto rounded-lg border shadow-sm md:block">
            <Table
              className="table-fixed"
              style={{ minWidth: tableWidth, width: tableWidth }}
            >
              <colgroup>
                {dashboardColumnWidthConfig.map((column) => (
                  <col
                    key={column.id}
                    style={getColumnStyle(columnWidths, column.id)}
                  />
                ))}
              </colgroup>
              <TableHeader>
                <TableRow>
                  {dashboardColumnWidthConfig.map((column) => (
                    <TableHead
                      key={column.id}
                      data-testid={`hq-dashboard-column-header-${column.id}`}
                      className={cn(
                        "relative pr-5",
                        getColumnConfigClassName(column),
                      )}
                      style={getColumnStyle(columnWidths, column.id)}
                    >
                      <span className="block truncate">{column.label}</span>
                      <button
                        type="button"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`${column.label} 컬럼 폭 조절`}
                        aria-valuemin={column.minWidth}
                        aria-valuemax={column.maxWidth}
                        aria-valuenow={columnWidths[column.id]}
                        data-testid={`hq-dashboard-column-resizer-${column.id}`}
                        className="focus-visible:ring-ring absolute top-0 right-0 h-full w-3 cursor-col-resize touch-none border-0 bg-transparent p-0 focus-visible:ring-2 focus-visible:outline-none"
                        onPointerDown={(event) =>
                          startColumnResize(event, column.id)
                        }
                        onKeyDown={(event) =>
                          handleColumnResizeKeyDown(event, column.id)
                        }
                      >
                        <span
                          aria-hidden="true"
                          className="bg-border absolute top-2 right-1 h-[calc(100%-1rem)] w-px"
                        />
                      </button>
                    </TableHead>
                  ))}
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
                    <TableCell className={getColumnCellClassName("store")}>
                      {row.storeName}
                    </TableCell>
                    <TableCell className={getColumnCellClassName("priority")}>
                      <PriorityBadge row={row} />
                    </TableCell>
                    <TableCell
                      className={getColumnCellClassName("businessStatus")}
                    >
                      {row.businessStatus.label}
                    </TableCell>
                    <TableCell
                      className={getColumnCellClassName("ledgerStatus")}
                    >
                      <DashboardStatusBadge status={row.ledgerStatus} />
                    </TableCell>
                    <TableCell
                      className={getColumnCellClassName("salesAmount")}
                    >
                      {formatKrw(row.salesAmount.value)}
                    </TableCell>
                    <TableCell
                      className={getColumnCellClassName("salesDifference")}
                    >
                      {formatKrwMetric(row.salesDifference)}
                    </TableCell>
                    <TableCell
                      className={getColumnCellClassName("grossMarginRate")}
                    >
                      {formatPercentMetric(row.grossMarginRate)}
                    </TableCell>
                    <TableCell className={getColumnCellClassName("loss")}>
                      {formatLoss(row)}
                    </TableCell>
                    <TableCell className={getColumnCellClassName("signals")}>
                      <DashboardSignalSummary signals={row.signals} />
                    </TableCell>
                    <TableCell
                      className={getColumnCellClassName("latestReflected")}
                    >
                      {formatLatestReflected(row)}
                    </TableCell>
                    <TableCell
                      className={getColumnCellClassName("lastModifiedBy")}
                    >
                      {formatLastModifiedBy(row)}
                    </TableCell>
                    <TableCell
                      className={getColumnCellClassName("headquartersClosed")}
                    >
                      {formatHeadquartersClosed(row)}
                    </TableCell>
                    <TableCell className={getColumnCellClassName("detail")}>
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
                      {row.businessStatus.label} · {formatLatestReflected(row)}{" "}
                      · {formatLastModifiedBy(row)}
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
                    <dd className="font-medium tabular-nums">
                      {formatKrw(row.salesAmount.value)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">손실</dt>
                    <dd className="font-medium">{formatLoss(row)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">매출 차이</dt>
                    <dd className="font-medium tabular-nums">
                      {formatKrwMetric(row.salesDifference)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">마진율</dt>
                    <dd className="font-medium tabular-nums">
                      {formatPercentMetric(row.grossMarginRate)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">최신 반영</dt>
                    <dd className="font-medium tabular-nums">
                      {formatLatestReflected(row)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">마지막 수정자</dt>
                    <dd className="font-medium break-words">
                      {formatLastModifiedBy(row)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">본사 마감</dt>
                    <dd className="font-medium">
                      {formatHeadquartersClosed(row)}
                    </dd>
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
        </>
      )}
    </section>
  );
}

function parseStoredColumnWidths(value: string): DashboardColumnWidths {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return defaultDashboardColumnWidths;
    }

    const storedWidths = parsed as Partial<Record<DashboardColumnId, unknown>>;

    return Object.fromEntries(
      dashboardColumnWidthConfig.map((column) => {
        const storedWidth = storedWidths[column.id];
        const width =
          typeof storedWidth === "number"
            ? clampColumnWidth(column.id, storedWidth)
            : column.defaultWidth;

        return [column.id, width];
      }),
    ) as DashboardColumnWidths;
  } catch {
    return defaultDashboardColumnWidths;
  }
}

function clampColumnWidth(columnId: DashboardColumnId, width: number) {
  const column = dashboardColumnConfigById[columnId];

  return Math.min(
    column.maxWidth,
    Math.max(column.minWidth, Math.round(width)),
  );
}

function isDefaultColumnWidths(columnWidths: DashboardColumnWidths) {
  return dashboardColumnWidthConfig.every(
    (column) => columnWidths[column.id] === column.defaultWidth,
  );
}

function getColumnStyle(
  columnWidths: DashboardColumnWidths,
  columnId: DashboardColumnId,
): CSSProperties {
  const width = columnWidths[columnId];

  return { width, minWidth: width, maxWidth: width };
}

function getColumnCellClassName(columnId: DashboardColumnId) {
  const column = dashboardColumnConfigById[columnId];

  return cn(
    "min-w-0 overflow-hidden text-ellipsis",
    columnId === "store" && "font-medium",
    getColumnConfigClassName(column),
  );
}

function getColumnConfigClassName(column: DashboardColumnConfig) {
  return "className" in column ? column.className : undefined;
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
    return formatUnavailableMetric(metric);
  }

  return krwFormatter.format(metric.value);
}

function formatPercentMetric(metric: HqDashboardRow["grossMarginRate"]) {
  if (metric.value === null) {
    return formatUnavailableMetric(metric);
  }

  return percentFormatter.format(metric.value);
}

function formatUnavailableMetric(metric: HqDashboardRow["salesDifference"]) {
  if (metric.status === "data-insufficient") {
    return metric.label ?? metric.unavailableReason ?? "-";
  }

  return metric.label ?? metric.unavailableReason ?? "-";
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

function formatLatestReflected(row: HqDashboardRow) {
  if (row.latestReflectedAt === null) {
    return "입력 전";
  }

  return dateTimeFormatter.format(new Date(row.latestReflectedAt));
}

function formatLastModifiedBy(row: HqDashboardRow) {
  if (row.lastModifiedBy === null) {
    return "입력 전";
  }

  return row.lastModifiedBy.name ?? row.lastModifiedBy.email ?? "수정자 없음";
}

function getDashboardEmptyStateMessage(dashboard: HqDashboardData) {
  if (dashboard.emptyStateReason === "no-authorized-stores") {
    return "권한이 부여된 활성 지점이 없습니다. 사용자/권한에서 지점 배정을 확인해 주세요.";
  }

  if (
    dashboard.emptyStateReason === "no-active-stores" ||
    dashboard.summary.totalStores === 0
  ) {
    return "활성 지점이 없습니다. 기준정보에서 지점을 먼저 등록해 주세요.";
  }

  return "조건에 맞는 지점이 없습니다. 필터를 전체로 바꾸면 모든 지점을 볼 수 있습니다.";
}
