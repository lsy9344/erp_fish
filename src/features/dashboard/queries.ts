import type { DailyLedgerStatus } from "../../../generated/prisma";
import {
  calculateLedgerReviewSummary,
  type LedgerReviewMetric,
} from "../../server/calculations/ledger.ts";
import type {
  DashboardBusinessStatus,
  DashboardDatePreset,
  DashboardLedgerStatus,
  DashboardSignalSummary,
  HqDashboardData,
  HqDashboardRow,
  HqDashboardSummary,
} from "./types.ts";

const SEOUL_TIME_ZONE = "Asia/Seoul";
const pendingSignal: DashboardSignalSummary = {
  id: "thresholds-pending",
  label: "기준값 설정 전",
  severity: "info",
  detail: "기준값 기반 이상 신호는 후속 스토리에서 계산합니다.",
};
type DashboardStoreRecord = {
  id: string;
  name: string;
};

type DashboardLedgerRecord = {
  id: string;
  storeId: string;
  closingDate: Date;
  status: DailyLedgerStatus;
  totalSalesAmount: number;
  cashAmount: number;
  cardAmount: number;
  otherPaymentAmount: number;
  workerCount: number | null;
  updatedAt: Date;
  updatedBy: {
    name: string | null;
    email: string | null;
  };
  _count: {
    ledgerLossItems: number;
  };
};

export function getDashboardDatePreset(value: unknown): DashboardDatePreset {
  return value === "yesterday" ? "yesterday" : "today";
}

export function getDashboardDate(
  datePreset: DashboardDatePreset,
  inputDate = new Date(),
) {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(inputDate)
    .split("-");
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0),
  );

  if (datePreset === "yesterday") {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return date;
}

export function mapDashboardLedgerStatus(
  status: DailyLedgerStatus | null,
): DashboardLedgerStatus {
  switch (status) {
    case "IN_PROGRESS":
      return { key: "IN_PROGRESS", label: "입력중" };
    case "IN_REVIEW":
      return { key: "IN_REVIEW", label: "검토대기" };
    case "HEADQUARTERS_CLOSED":
      return { key: "HEADQUARTERS_CLOSED", label: "본사마감" };
    case "HOLIDAY":
      return { key: "HOLIDAY", label: "휴무" };
    default:
      return { key: "EMPTY", label: "미입력" };
  }
}

export function mapDashboardBusinessStatus(
  status: DailyLedgerStatus | null,
): DashboardBusinessStatus {
  if (status === "HOLIDAY") {
    return { key: "HOLIDAY", label: "휴무일" };
  }

  if (status === null) {
    return { key: "UNKNOWN", label: "확인 필요" };
  }

  return { key: "OPEN", label: "영업일" };
}

export async function getHqDashboardRows({
  datePreset = "today",
}: {
  datePreset?: DashboardDatePreset;
} = {}): Promise<HqDashboardData> {
  const { requireHeadquartersUser } = await import("../../server/authz.ts");
  await requireHeadquartersUser();

  const preset = getDashboardDatePreset(datePreset);
  const closingDate = getDashboardDate(preset);
  const { db } = await import("../../server/db.ts");
  const stores = await db.store.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
      },
  });
  const storeIds = stores.map((store) => store.id);
  const ledgers =
    storeIds.length === 0
      ? []
      : await db.dailyLedger.findMany({
          where: {
            storeId: { in: storeIds },
            closingDate,
          },
          select: {
            id: true,
            storeId: true,
            closingDate: true,
            status: true,
            totalSalesAmount: true,
            cashAmount: true,
            cardAmount: true,
            otherPaymentAmount: true,
            workerCount: true,
            updatedAt: true,
            updatedBy: {
              select: {
                name: true,
                email: true,
              },
            },
            _count: {
              select: {
                ledgerLossItems: true,
              },
            },
          },
        });
  const ledgerByStoreId = new Map<string, DashboardLedgerRecord>(
    ledgers.map((ledger) => [ledger.storeId, ledger]),
  );
  const rows = stores.map((store) =>
    toDashboardRow(store, ledgerByStoreId.get(store.id) ?? null, closingDate),
  );

  return {
    datePreset: preset,
    closingDate: closingDate.toISOString(),
    rows,
    summary: summarizeDashboardRows(rows),
  };
}

function toDashboardRow(
  store: DashboardStoreRecord,
  ledger: DashboardLedgerRecord | null,
  closingDate: Date,
): HqDashboardRow {
  if (ledger === null) {
    return {
      storeId: store.id,
      storeName: store.name,
      ledgerId: null,
      closingDate: closingDate.toISOString(),
      businessStatus: mapDashboardBusinessStatus(null),
      ledgerStatus: mapDashboardLedgerStatus(null),
      salesAmount: unavailable("계산 불가"),
      grossMarginRate: unavailable("계산 불가"),
      salesDifference: unavailable("계산 기준 확인 필요"),
      hasLoss: null,
      lastModifiedBy: null,
      lastModifiedAt: null,
      isHeadquartersClosed: false,
      signals: [pendingSignal],
    };
  }

  const reviewSummary = calculateLedgerReviewSummary({
    totalSalesAmount: ledger.totalSalesAmount,
    cashAmount: ledger.cashAmount,
    cardAmount: ledger.cardAmount,
    otherPaymentAmount: ledger.otherPaymentAmount,
    workerCount: ledger.workerCount,
    expenseTotal: 0,
    inventoryItems: [],
  });

  return {
    storeId: store.id,
    storeName: store.name,
    ledgerId: ledger.id,
    closingDate: ledger.closingDate.toISOString(),
    businessStatus: mapDashboardBusinessStatus(ledger.status),
    ledgerStatus: mapDashboardLedgerStatus(ledger.status),
    salesAmount: reviewSummary.totalSales,
    grossMarginRate: reviewSummary.grossMarginRate,
    salesDifference: reviewSummary.salesDifference,
    hasLoss: ledger._count.ledgerLossItems > 0,
    lastModifiedBy: ledger.updatedBy,
    lastModifiedAt: ledger.updatedAt.toISOString(),
    isHeadquartersClosed: ledger.status === "HEADQUARTERS_CLOSED",
    signals: [pendingSignal],
  };
}

function summarizeDashboardRows(rows: HqDashboardRow[]): HqDashboardSummary {
  return {
    totalStores: rows.length,
    closedCount: rows.filter((row) => row.isHeadquartersClosed).length,
    reviewCount: rows.filter((row) => row.ledgerStatus.key === "IN_REVIEW")
      .length,
    emptyCount: rows.filter((row) => row.ledgerStatus.key === "EMPTY").length,
    lossCount: rows.filter((row) => row.hasLoss === true).length,
  };
}

function unavailable(
  unavailableReason: NonNullable<LedgerReviewMetric["unavailableReason"]>,
): LedgerReviewMetric {
  return {
    value: null,
    unavailableReason,
  };
}
