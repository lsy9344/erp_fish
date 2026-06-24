import type { DailyLedgerStatus } from "../../../generated/prisma";
import type {
  LedgerReviewMetric,
  LedgerReviewSummary,
} from "~/server/calculations/ledger";

export type LedgerReviewMissingItem = {
  id: string;
  label: string;
  href: string;
  status: "missing" | "review";
  detail: string;
};

export type LedgerReviewWarning = {
  id: string;
  label: string;
  detail: string;
  amount?: number;
};

export type LedgerReviewSignal = {
  id: string;
  label: string;
  detail: string;
  amount?: number;
  quantity?: number;
};

export type LedgerReviewStepId =
  | "sales"
  | "expenses"
  | "purchases"
  | "inventory"
  | "losses"
  | "work";

export type LedgerReviewStepStatus =
  | "saved"
  | "missing"
  | "review"
  | "needs-attention";

export type LedgerReviewStepMetric = {
  id: string;
  label: string;
  value: number | string | null;
  kind: "krw" | "signed-krw" | "text" | "status";
  status: LedgerReviewMetric["status"];
  detail?: string;
};

export type LedgerReviewStepSummary = {
  id: LedgerReviewStepId;
  label: string;
  status: LedgerReviewStepStatus;
  detail: string;
  href: string;
  metrics: LedgerReviewStepMetric[];
};

// WO-04(2026-06-22): 지점장 당일 검토 화면의 "오늘 많이 팔린 품목" 카드용 안전 데이터.
// 재고 흐름에서 추정한 판매 수량과 추정 매출만 노출하고, 단가/FIFO/차액 등 민감값은 담지 않는다.
//
// point_summary 검토 후속(2026-06-24): 추정 매출은 회의 결정대로 "지점장 판매가 계획"
// (StoreSalesPricePlan.plannedUnitPrice) 기준으로 계산한다. 판매가 계획이 없는 품목은
// 매입/적용 단가로 폴백하되, salesBasis="cost"로 표시해 화면에서 '판매가 미반영(추정)'을
// 명확히 구분할 수 있게 한다.
export type StoreManagerTopSoldItem = {
  productId: string;
  productName: string;
  soldQuantity: number;
  estimatedSalesAmount: number;
  // "planned": 판매가 계획 기준, "cost": 판매가 계획이 없어 매입/적용 단가로 폴백.
  salesBasis: "planned" | "cost";
};

export type LedgerReviewStepData = {
  id: string;
  storeId: string;
  closingDate: string;
  updatedAt: string;
  version: number;
  authorDisplayName: string | null;
  status: DailyLedgerStatus;
  submittedById: string | null;
  submittedAt: string | null;
  summary: LedgerReviewSummary;
  missingItems: LedgerReviewMissingItem[];
  warnings: LedgerReviewWarning[];
  signals: LedgerReviewSignal[];
  stepSummaries: LedgerReviewStepSummary[];
  topSoldItems: StoreManagerTopSoldItem[];
};

// point_summary 검토 후속(2026-06-24): 지점장에게도 "아침 판매가 계획 vs 저녁 실제"
// 비교를 노출한다. 단 계획 매출(plannedSalesTotal)과 계획 대비 실제 차이
// (plannedVsActualSalesDifference)는 지점장 본인 판매가 계획과 이미 보이는 총매출만으로
// 산출되므로 안전하게 노출하고, 계획 마진율(plannedGrossMarginRate)은 마진율(%) 노출 정책과
// 동일하게 status가 ok일 때만 노출한다. 계획 매출이익(plannedGrossProfit)은 절대 이익(원가
// 역산 가능)이라 매출이익 차단 정책에 따라 지점장 요약에서 제외한다.
export type StoreManagerLedgerReviewSummary = Pick<
  LedgerReviewSummary,
  | "totalSales"
  | "grossMarginRate"
  | "workerCount"
  | "inventoryAmount"
  | "plannedSalesTotal"
  | "plannedGrossMarginRate"
  | "plannedVsActualSalesDifference"
>;

export type StoreManagerLedgerReviewSignal = Omit<LedgerReviewSignal, "amount">;

// 역산 부정행위 방지(point_summary.md:37): 결제 차액(amount)은 지점장 검토 화면에
// 절대 노출하지 않는다. signal과 동일하게 warning에서도 amount를 제거한다.
export type StoreManagerLedgerReviewWarning = Omit<
  LedgerReviewWarning,
  "amount"
>;

export type StoreManagerLedgerReviewStepData = Omit<
  LedgerReviewStepData,
  "summary" | "signals" | "warnings"
> & {
  summary: StoreManagerLedgerReviewSummary;
  signals: StoreManagerLedgerReviewSignal[];
  warnings: StoreManagerLedgerReviewWarning[];
};

export type LedgerSubmitForReviewResult = {
  status: "submitted" | "already-in-review";
  ledger: Pick<
    LedgerReviewStepData,
    | "id"
    | "storeId"
    | "closingDate"
    | "updatedAt"
    | "version"
    | "authorDisplayName"
    | "status"
    | "submittedById"
    | "submittedAt"
  >;
};
