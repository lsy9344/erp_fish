import type {
  DashboardBusinessStatus,
  DashboardLedgerStatus,
  DashboardLedgerStatusKey,
  DashboardSignalSummary,
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

export type StoreComparisonReportStoreOption = {
  id: string;
  name: string;
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
  hasUnappliedCorrections: boolean;
  metricEvidence: StoreComparisonReportMetricEvidenceMap;
};

export type StoreComparisonReportData = {
  range: StoreComparisonReportDateRange;
  stores: StoreComparisonReportStoreOption[];
  selectedStoreId: string | null;
  selectedStoreName: string | null;
  errorMessages: string[];
  rows: StoreComparisonReportRow[];
};

export type MonthlyClosingAnomalyReportMonthRange = {
  monthInput: string;
  startDate: Date;
  endDate: Date;
  startDateInput: string;
  endDateInput: string;
  errorMessage: string | null;
  isFutureMonth: boolean;
};

export type MonthlyClosingAnomalyReportStoreOption = {
  id: string;
  name: string;
};

export type MonthlyClosingAnomalyStatusCounts = StoreComparisonStatusCounts;

export type MonthlyClosingAnomalyDay = {
  dateInput: string;
  dateLabel: string;
  storeId: string;
  storeName: string;
  ledgerId: string | null;
  ledgerDetailHref: string | null;
  businessStatus: DashboardBusinessStatus;
  ledgerStatus: DashboardLedgerStatus;
  hasUnappliedCorrections: boolean;
  signals: DashboardSignalSummary[];
  metricEvidence: DailyMeetingReportMetricEvidenceMap;
};

export type MonthlyAnomalyItem = {
  id: string;
  dateInput: string;
  dateLabel: string;
  storeId: string;
  storeName: string;
  ledgerId: string;
  ledgerDetailHref: string;
  label: string;
  severity: DashboardSignalSummary["severity"];
  detail: string | null;
  correctionTimelineHref: string | null;
  metricEvidence: DailyMeetingReportMetricEvidence | null;
};

export type MonthlyClosingKpiMetricEvidenceMap = {
  salesAmount: DailyMeetingReportMetricEvidence;
  grossProfit: DailyMeetingReportMetricEvidence;
  grossMarginRate: DailyMeetingReportMetricEvidence;
  operatingProfit: DailyMeetingReportMetricEvidence;
  averageInventory: DailyMeetingReportMetricEvidence;
  averageSales: DailyMeetingReportMetricEvidence;
  inventoryToSalesRatio: DailyMeetingReportMetricEvidence;
  lossTotal: DailyMeetingReportMetricEvidence;
};

export type MonthlyClosingKpiSummary = {
  salesAmount: LedgerReviewMetric;
  grossProfit: LedgerReviewMetric;
  grossMarginRate: LedgerReviewMetric;
  operatingProfit: LedgerReviewMetric;
  lossTotal: LedgerReviewMetric;
  averageInventory: LedgerReviewMetric;
  averageSales: LedgerReviewMetric;
  inventoryToSalesRatio: LedgerReviewMetric;
  appliedCorrectionCount: number;
  metricEvidence: MonthlyClosingKpiMetricEvidenceMap;
};

export type MonthlyLossTypeSummary = {
  lossTypeName: string;
  quantity: number;
  amount: number;
};

export type MonthlyLossMetricEvidenceMap = {
  totalAmount: DailyMeetingReportMetricEvidence;
};

export type MonthlyLossSummary = {
  totalQuantity: number;
  totalAmount: number;
  hasRecordedLoss: boolean;
  metricEvidence: MonthlyLossMetricEvidenceMap;
  byType: MonthlyLossTypeSummary[];
};

export type MonthlyInventoryFlowMetricEvidenceMap = {
  previousAmount: DailyMeetingReportMetricEvidence;
  purchaseAmount: DailyMeetingReportMetricEvidence;
  lossAmount: DailyMeetingReportMetricEvidence;
  currentAmount: DailyMeetingReportMetricEvidence;
  adjustmentDifferenceAmount: DailyMeetingReportMetricEvidence;
};

export type MonthlyInventoryFlowSummary = {
  previousQuantity: LedgerReviewMetric;
  previousAmount: LedgerReviewMetric;
  purchaseQuantity: LedgerReviewMetric;
  purchaseAmount: LedgerReviewMetric;
  lossQuantity: LedgerReviewMetric;
  lossAmount: LedgerReviewMetric;
  currentQuantity: LedgerReviewMetric;
  currentAmount: LedgerReviewMetric;
  adjustmentDifferenceQuantity: LedgerReviewMetric;
  adjustmentDifferenceAmount: LedgerReviewMetric;
  metricEvidence: MonthlyInventoryFlowMetricEvidenceMap;
};

export type MonthlyTopRevenueItemSummary = {
  status: "available" | "needs-review" | "data-insufficient";
  statusLabel: string;
  productName: string | null;
  salesAmount: LedgerReviewMetric;
  note: string;
};

export type MonthlyCalculationDay = {
  dateInput: string;
  dateLabel: string;
  inclusion: "included" | "excluded";
  reason: string;
  ledgerStatusLabel: string;
  ledgerDetailHref: string | null;
};

export type MonthlyClosingAnomalyReportData = {
  monthRange: MonthlyClosingAnomalyReportMonthRange;
  stores: MonthlyClosingAnomalyReportStoreOption[];
  selectedStoreId: string | null;
  selectedStoreName: string | null;
  statusCounts: MonthlyClosingAnomalyStatusCounts;
  unfinishedDayCount: number;
  hasUnfinishedDays: boolean;
  monthlyKpis: MonthlyClosingKpiSummary;
  monthlyLossSummary: MonthlyLossSummary;
  monthlyInventoryFlow: MonthlyInventoryFlowSummary;
  topRevenueItem: MonthlyTopRevenueItemSummary;
  calculationDays: MonthlyCalculationDay[];
  days: MonthlyClosingAnomalyDay[];
  anomalyItems: MonthlyAnomalyItem[];
  errorMessages: string[];
};
