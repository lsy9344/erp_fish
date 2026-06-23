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
export type StoreManagerTopSoldItem = {
  productId: string;
  productName: string;
  soldQuantity: number;
  estimatedSalesAmount: number;
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

export type StoreManagerLedgerReviewSummary = Pick<
  LedgerReviewSummary,
  "totalSales" | "grossMarginRate" | "workerCount" | "inventoryAmount"
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
