import type { DailyLedgerStatus } from "../../../generated/prisma";
import type { LedgerReviewMetric } from "../../server/calculations/ledger.ts";

export type DashboardDatePreset = "today" | "yesterday";

export type DashboardLedgerStatusKey = DailyLedgerStatus | "EMPTY";

export type DashboardLedgerStatus = {
  key: DashboardLedgerStatusKey;
  label: "미입력" | "입력중" | "검토대기" | "본사마감" | "휴무";
};

export type DashboardBusinessStatus = {
  key: "OPEN" | "HOLIDAY" | "UNKNOWN";
  label: "영업일" | "휴무일" | "확인 필요";
};

export type DashboardSignalSeverity = "info" | "warning" | "critical";

export type DashboardSignalSummary = {
  id: string;
  label: string;
  severity: DashboardSignalSeverity;
  detail?: string;
};

export type HqDashboardRow = {
  storeId: string;
  storeName: string;
  ledgerId: string | null;
  closingDate: string;
  businessStatus: DashboardBusinessStatus;
  ledgerStatus: DashboardLedgerStatus;
  salesAmount: LedgerReviewMetric;
  grossMarginRate: LedgerReviewMetric;
  salesDifference: LedgerReviewMetric;
  hasLoss: boolean | null;
  lastModifiedBy: {
    name: string | null;
    email: string | null;
  } | null;
  lastModifiedAt: string | null;
  isHeadquartersClosed: boolean;
  signals: DashboardSignalSummary[];
};

export type HqDashboardSummary = {
  totalStores: number;
  closedCount: number;
  reviewCount: number;
  emptyCount: number;
  lossCount: number;
};

export type HqDashboardData = {
  datePreset: DashboardDatePreset;
  closingDate: string;
  rows: HqDashboardRow[];
  summary: HqDashboardSummary;
};
