import type { DailyLedgerStatus } from "../../../generated/prisma";
import type {
  LedgerReviewMetric,
  LedgerReviewSummary,
} from "~/server/calculations/ledger";
import type { StoreEntryStepCompletion } from "~/features/ledger/step-completion";

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
  quantityLabel?: string;
  quantityText?: string;
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
  // 7단계 검토 화면의 단계 네비게이션 "저장됨" 뱃지용. 다른 1~6단계 화면과 동일하게
  // getStoreEntryStepCompletion 결과를 그대로 전달한다(불리언만, 민감 회계지표 없음).
  stepCompletion: StoreEntryStepCompletion;
  topSoldItems: StoreManagerTopSoldItem[];
};

// WO(2026-06-26): 계획 판매가 비교 지표는 원가/마진 역산 여지가 있어 본사 전용으로 둔다.
// 지점장 요약은 총매출·마진율·근무인원·재고금액만 유지하고, 7단계 그래프용 topSoldItems는
// 별도 안전 타입(StoreManagerTopSoldItem)으로 계속 노출한다.
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
