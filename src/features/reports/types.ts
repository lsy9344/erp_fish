import type {
  DashboardBusinessStatus,
  DashboardLedgerStatus,
  DashboardLedgerStatusKey,
  DashboardSignalSummary,
  HqDashboardRow,
  HqDashboardSummary,
} from "../dashboard/types.ts";
import type { LedgerReviewMetric } from "../../server/calculations/ledger.ts";

export const MONTHLY_PNL_COMPANY_WIDE_STORE_ID = "__company_wide__";

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
  expectedGrossMarginRate: LedgerReviewMetric;
  reportMarginGapThresholdBps: number;
  metricEvidence: DailyMeetingReportMetricEvidenceMap;
};

export type DailySalesChangeRow = {
  storeId: string;
  storeName: string;
  currentSales: LedgerReviewMetric;
  previousSales: LedgerReviewMetric;
  difference: LedgerReviewMetric;
  rate: LedgerReviewMetric;
};

export type DailyInventoryRatioRow = {
  storeId: string;
  storeName: string;
  inventoryAmount: LedgerReviewMetric;
  salesAmount: LedgerReviewMetric;
  deviationAmount: LedgerReviewMetric;
  deviationRate: LedgerReviewMetric;
};

export type DailySalesPositionRow = {
  rank: number;
  storeId: string;
  storeName: string;
  salesAmount: LedgerReviewMetric;
  share: LedgerReviewMetric;
  difference: LedgerReviewMetric;
  rate: LedgerReviewMetric;
};

export type DailySalesPositionExclusion = {
  storeId: string;
  storeName: string;
  reason: string;
};

export type DailySalesAnalysis = {
  salesChanges: DailySalesChangeRow[];
  inventoryRatios: DailyInventoryRatioRow[];
  positions: DailySalesPositionRow[];
  excludedPositions: DailySalesPositionExclusion[];
};

export type DailyAttendanceStatus =
  | "지각"
  | "조퇴"
  | "특이사항"
  | "직원 미연결";

export type DailyAttendanceRow = {
  storeId: string;
  storeName: string;
  workerName: string;
  statuses: DailyAttendanceStatus[];
  lateMemo: string | null;
  earlyLeaveMemo: string | null;
  specialMemo: string | null;
};

export type DailyAttendanceReport = {
  summary: {
    exceptionWorkers: number;
    late: number;
    earlyLeave: number;
    special: number;
  };
  rows: DailyAttendanceRow[];
};

export type DailyMeetingReportData = {
  datePreset: DailyMeetingReportDatePreset;
  dateQuery: string;
  dateInput: string;
  closingDate: string;
  rows: DailyMeetingReportRow[];
  summary: HqDashboardSummary;
  // WO-03(2026-06-22): 냉동/생물 카테고리별 추정 매출 차트 데이터.
  categoryPerformance: ProductCategoryPerformance[];
  // WO(2026-06-25): 당일 품목별 추정 이익률 + 전체 판매분 합산 요약.
  productProfitability: ProductProfitabilitySummary;
  salesAnalysis: DailySalesAnalysis;
  attendance: DailyAttendanceReport;
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

// 미팅 요구(매출 상위5/하위5 품목)는 품목별 매출액이 필요하나 시스템은 매출을
// 일단위 총액으로만 기록한다. 따라서 판매량(전일재고+매입-당일재고) × 단가로
// '추정 매출'을 산출해 순위를 매긴다. 추정치임을 basisLabel/note로 명시한다.
//
// point_summary 검토 후속(2026-06-24): 단가는 회의 결정대로 지점장 판매가 계획
// (plannedUnitPrice)을 우선 사용하고, 없으면 매입단가로 폴백한다. 폴백한 품목은
// salesBasis="cost"로 표시한다.
export type MonthlyRevenueRankingItem = {
  productId: string;
  productName: string;
  soldQuantity: number;
  estimatedSalesAmount: number;
  salesBasis: "planned" | "cost";
};

export type MonthlyRevenueRankingSummary = {
  status: "available" | "data-insufficient";
  statusLabel: string;
  basisLabel: string;
  note: string;
  top: MonthlyRevenueRankingItem[];
  bottom: MonthlyRevenueRankingItem[];
  // 판매가 계획이 없어 매입단가로 폴백한 품목 수.
  salesPriceFallbackItemCount: number;
};

// WO-07(2026-06-22): 본사 전용 지출 합계. 지점 일일 장부와 분리된 별도 라인으로,
// 월간 리포트에는 총액과 지점 귀속/본사 공통 분리 금액을 함께 노출한다.
export type MonthlyHeadquartersExpenseSummary = {
  totalAmount: number;
  storeAttributedAmount: number;
  unattributedAmount: number;
  count: number;
};

export type MonthlyCalculationDay = {
  dateInput: string;
  dateLabel: string;
  inclusion: "included" | "excluded";
  reason: string;
  ledgerStatusLabel: string;
  ledgerDetailHref: string | null;
};

// WO-08(2026-06-22): 손익(P&L) 리포트 준비도. 손익 계산에 필요한 입력값 중 어떤 것이
// 실측으로 확보됐고, 어떤 것이 추정/미구현 상태인지 화면에 명시해 의사결정 혼선을 줄인다.
export type MonthlyProfitAndLossInputAvailability =
  | "actual"
  | "estimated"
  | "unavailable";

export type MonthlyProfitAndLossInput = {
  key: string;
  label: string;
  availability: MonthlyProfitAndLossInputAvailability;
  availabilityLabel: string;
  source: string;
  note: string;
};

export type MonthlyProfitAndLossReadiness = {
  statusLabel: string;
  actualCount: number;
  estimatedCount: number;
  unavailableCount: number;
  note: string;
  inputs: MonthlyProfitAndLossInput[];
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
  revenueRanking: MonthlyRevenueRankingSummary;
  profitAndLossReadiness: MonthlyProfitAndLossReadiness;
  calculationDays: MonthlyCalculationDay[];
  days: MonthlyClosingAnomalyDay[];
  anomalyItems: MonthlyAnomalyItem[];
  errorMessages: string[];
  // WO-03(2026-06-22): 냉동/생물 카테고리별 추정 매출 차트 데이터.
  categoryPerformance: ProductCategoryPerformance[];
};

export type ProductCategoryPerformance = {
  category: "냉동" | "생물" | "기타";
  salesAmount: number;
  grossMarginRate: number | null;
  statusLabel: "확정" | "추정" | "계산 불가";
  // point_summary 검토 후속(2026-06-24): 추정 매출은 지점장 판매가 계획 기준.
  // 판매가 계획이 없어 매입단가로 폴백한 판매 품목 수. 0보다 크면 "판매가 일부 미반영"
  // 안내를 화면에 띄운다.
  salesPriceFallbackItemCount: number;
};

// WO(2026-06-25): 당일 품목별 추정 이익률. 카테고리 차트와 같은 계산 기준
// (판매량=전일+매입−당일, 판매가 계획 우선·없으면 매입단가 폴백, 원가는 FIFO 우선)을
// 품목 단위로 그대로 펼친 추정값이다. 확정 POS 매출/원가가 아니다.
export type ProductProfitabilityReportItem = {
  productId: string;
  productName: string;
  // WO-04(2026-06-28): 표에 규격 컬럼을 노출하기 위해 규격을 함께 내려준다.
  productSpec: string;
  productCategory: "냉동" | "생물";
  soldQuantity: number;
  estimatedSalesAmount: number;
  estimatedCogsAmount: number;
  estimatedGrossProfit: number;
  estimatedGrossMarginRate: number | null;
  // 판매가 계획을 썼으면 "planned", 매입단가로 폴백했으면 "cost".
  salesBasis: "planned" | "cost";
  // 추정/판매가 미반영(폴백)/계산 불가(매출 0) 상태.
  statusLabel: "추정" | "판매가 미반영" | "계산 불가";
};

// WO(2026-06-25): 당일 전체 판매분 합산 요약. 품목 행을 합산해 만들며 냉동/생물
// 카테고리 합계와 숫자가 일치한다.
export type ProductProfitabilitySummary = {
  items: ProductProfitabilityReportItem[];
  totalSalesAmount: number;
  totalCogsAmount: number;
  totalGrossProfit: number;
  totalGrossMarginRate: number | null;
  // 판매가 계획이 없어 매입단가로 폴백한 품목 수.
  salesPriceFallbackItemCount: number;
  // 추정 매출이 0이라 이익률을 못 내는 품목 수.
  unavailableItemCount: number;
};

// (2026-06-30) 월별 xlsx "품목매출" 시트용 기간 합산 품목 매출. 일별 회의 리포트의
// 월 마지막 날 대표값이 아니라 조회 시작일~종료일 전체를 store×product 단위로 합산한다.
export type ProductSalesPeriodItem = {
  startDateInput: string;
  endDateInput: string;
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
  productSpec: string;
  // 냉동/생물 외에 "기준 미정"(분류 미확정 신규 품목) 등도 그대로 노출한다.
  // 품목별 매출 시트는 데이터 완결성을 위해 분류 미확정 품목도 누락하지 않는다.
  productCategory: string;
  soldQuantity: number;
  estimatedSalesAmount: number;
  estimatedCogsAmount: number;
  estimatedGrossProfit: number;
  estimatedGrossMarginRate: number | null;
  salesBasis: "planned" | "cost";
  statusLabel: "추정" | "판매가 미반영" | "계산 불가";
  lossQuantity: number;
  lossAmount: number;
  currentQuantity: number | null;
};

export type ProductSalesPeriodReportData = {
  startDateInput: string;
  endDateInput: string;
  selectedStoreId: string | null;
  selectedStoreName: string | null;
  scopedStoreIds: string[];
  items: ProductSalesPeriodItem[];
};
