import type { DailyLedgerStatus } from "../../../generated/prisma";
import type { LedgerReviewMetric } from "../../server/calculations/ledger.ts";

export type DashboardDatePreset = "today" | "yesterday";

export type DashboardSortMode = "priority" | "store-name";

export type DashboardFilterMode = "all" | "needs-attention";

export type DashboardEmptyStateReason =
  | "no-active-stores"
  | "no-authorized-stores"
  | "filtered-empty"
  | null;

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

export type DashboardCorrectionState = {
  appliedCorrectionCount: number;
  hasAppliedCorrections: boolean;
  hasUnappliedCorrections: boolean;
};

export type HqDashboardPriority = {
  rank: number;
  label:
    | "심각 이상"
    | "경고 이상"
    | "검토대기"
    | "입력중"
    | "미입력"
    | "확인 필요"
    | "정상"
    | "휴무";
  reasons: string[];
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
  latestReflectedAt: string | null;
  lastModifiedBy: {
    name: string | null;
    email: string | null;
  } | null;
  lastModifiedAt: string | null;
  isHeadquartersClosed: boolean;
  correctionState: DashboardCorrectionState;
  signals: DashboardSignalSummary[];
  priority: HqDashboardPriority;
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
  sortMode: DashboardSortMode;
  filterMode: DashboardFilterMode;
  closingDate: string;
  rows: HqDashboardRow[];
  summary: HqDashboardSummary;
  emptyStateReason: DashboardEmptyStateReason;
};
