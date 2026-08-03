import type { DailyLedgerStatus } from "../../../generated/prisma";
import type { LedgerReviewMetric } from "../../server/calculations/ledger.ts";

export type DashboardDatePreset = "today" | "yesterday";

export type DashboardSortMode = "priority" | "store-name";

export type DashboardFilterMode = "all" | "needs-attention";

// WO-07(2026-06-22): 관제판 표시 밀도. 요약 카드 그리드와 표 컨테이너 폭에 적용한다.
export type DashboardDensity = "default" | "wide" | "compact";

export type DashboardEmptyStateReason =
  | "no-active-stores"
  | "no-authorized-stores"
  | "filtered-empty"
  | null;

export type DashboardLedgerStatusKey = DailyLedgerStatus | "EMPTY";

export type DashboardLedgerStatus = {
  key: DashboardLedgerStatusKey;
  label: "미입력" | "입력 중" | "검토 대기" | "본사 마감" | "휴무";
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

/**
 * threshold와 shortfall은 이상 신호 및 우선순위 계산 계약을 위해 유지한다.
 * 관리자 홈 UI는 currentLabel만 렌더링한다.
 */
export type DashboardMarginDisplay = {
  currentLabel: string;
  targetLabel: string | null;
  shortfallAmountLabel: string | null;
};

export type DashboardInventoryAmount = Omit<LedgerReviewMetric, "label"> & {
  label?: string;
};

export type HqDashboardPriority = {
  rank: number;
  label:
    | "심각 이상"
    | "경고 이상"
    | "검토 대기"
    | "입력 중"
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
  closingSalesAmount: LedgerReviewMetric;
  carryoverSalesAmount: LedgerReviewMetric;
  operatingSalesAmount: LedgerReviewMetric;
  // WO-14 part2(2026-06-29): 분석 매출(판매한 가격 기준 추정 매출, 장부 AE4). 관제판 매출 셀의
  // 장부 매출 바로 아래에 함께 보여준다. 계획 미입력 등으로 계산 불가면 status로 구분한다.
  analysisSalesAmount: LedgerReviewMetric;
  // Daily meeting report rows reuse this contract but do not render the dashboard sales cell.
  inventoryAmount?: DashboardInventoryAmount;
  grossMarginRate: LedgerReviewMetric;
  // 장부 이익률(C17 기준). marginDisplay는 장부 원값 라벨을 담는다.
  marginDisplay: DashboardMarginDisplay;
  // WO-14 part3(2026-06-29): 분석 이익률(판매한 가격 기준 추정 이익률, 장부 AE5). 관제판 마진
  // 셀의 장부 이익률 바로 아래에 함께 보여준다.
  analysisMarginDisplay: DashboardMarginDisplay;
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
