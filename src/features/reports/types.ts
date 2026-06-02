import type {
  DashboardLedgerStatusKey,
  HqDashboardRow,
  HqDashboardSummary,
} from "../dashboard/types.ts";
import type { LedgerReviewMetric } from "../../server/calculations/ledger.ts";

export type DailyMeetingReportDatePreset = "today" | "yesterday" | "custom";

export type DailyMeetingReportMetricKind = "money" | "percent" | "boolean";

export type DailyMeetingReportMetricStatus =
  | "original"
  | "corrected"
  | "zero"
  | "empty"
  | "holiday"
  | "data-insufficient"
  | "needs-review";

export type DailyMeetingReportMetricValue = LedgerReviewMetric & {
  kind: DailyMeetingReportMetricKind;
};

export type DailyMeetingReportMetricEvidence = {
  label: string;
  kind: DailyMeetingReportMetricKind;
  original: DailyMeetingReportMetricValue;
  applied: DailyMeetingReportMetricValue;
  isCorrected: boolean;
  status: DailyMeetingReportMetricStatus;
  statusLabel: string;
  unavailableReason: string | null;
  ledgerDetailHref: string | null;
  correctionTimelineHref: string | null;
};

export type DailyMeetingReportMetricEvidenceMap = {
  salesAmount: DailyMeetingReportMetricEvidence;
  grossMarginRate: DailyMeetingReportMetricEvidence;
  salesDifference: DailyMeetingReportMetricEvidence;
  loss: DailyMeetingReportMetricEvidence;
};

export type DailyMeetingReportMetricEvidenceInput = {
  label: string;
  kind: DailyMeetingReportMetricKind;
  ledgerId: string | null;
  ledgerStatus: DashboardLedgerStatusKey;
  original: LedgerReviewMetric;
  applied: LedgerReviewMetric;
  correctionCount: number;
  hasUnappliedCorrections: boolean;
};

export type DailyMeetingReportRow = HqDashboardRow & {
  metricEvidence: DailyMeetingReportMetricEvidenceMap;
};

export type DailyMeetingReportData = {
  datePreset: DailyMeetingReportDatePreset;
  dateQuery: string;
  dateInput: string;
  closingDate: string;
  rows: DailyMeetingReportRow[];
  summary: HqDashboardSummary;
};

export type StoreComparisonReportDateRange = {
  startDate: Date;
  endDate: Date;
  startDateInput: string;
  endDateInput: string;
  errorMessage: string | null;
};

export type StoreComparisonStatusCounts = {
  missingDayCount: number;
  inProgressCount: number;
  reviewCount: number;
  closedCount: number;
  holidayCount: number;
};

export type StoreComparisonReportMetricEvidenceMap = {
  salesAmount: DailyMeetingReportMetricEvidence;
  grossProfit: DailyMeetingReportMetricEvidence;
  grossMarginRate: DailyMeetingReportMetricEvidence;
  operatingProfit: DailyMeetingReportMetricEvidence;
  productivity: DailyMeetingReportMetricEvidence;
  averageInventory: DailyMeetingReportMetricEvidence;
  averageSales: DailyMeetingReportMetricEvidence;
  inventoryToSalesRatio: DailyMeetingReportMetricEvidence;
  loss: DailyMeetingReportMetricEvidence;
};

export type StoreComparisonReportRow = {
  storeId: string;
  storeName: string;
  statusCounts: StoreComparisonStatusCounts;
  salesAmount: LedgerReviewMetric;
  grossProfit: LedgerReviewMetric;
  grossMarginRate: LedgerReviewMetric;
  operatingProfit: LedgerReviewMetric;
  productivity: LedgerReviewMetric;
  averageInventory: LedgerReviewMetric;
  averageSales: LedgerReviewMetric;
  inventoryToSalesRatio: LedgerReviewMetric;
  hasLoss: boolean | null;
  metricEvidence: StoreComparisonReportMetricEvidenceMap;
};

export type StoreComparisonReportData = {
  range: StoreComparisonReportDateRange;
  rows: StoreComparisonReportRow[];
};
