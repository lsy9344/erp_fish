import {
  type DailyLedgerStatus,
  type LedgerPurchaseSource,
} from "../../../generated/prisma";
import { type StoreEntryStepCompletion } from "./step-completion";

type PaymentAmounts = {
  totalSalesAmount: number;
  cashAmount: number;
  cardAmount: number;
  otherPaymentAmount: number;
};

export type LedgerSalesStepData = PaymentAmounts & {
  id: string;
  storeId: string;
  closingDate: string;
  updatedAt: string;
  version: number;
  authorDisplayName: string | null;
  status: DailyLedgerStatus;
  submittedById: string | null;
  submittedAt: string | null;
  closedById: string | null;
  closedAt: string | null;
  paymentDifferenceAmount: number;
};

export type LedgerExpenseLine = {
  id: string;
  ledgerInputCodeId: string;
  ledgerInputCodeName: string;
  amount: number;
  memo: string | null;
};

export type LedgerPurchaseLine = {
  id: string;
  productId: string | null;
  purchaseStandardId: string | null;
  sourceType: LedgerPurchaseSource;
  productName: string;
  productCategory: string;
  productSpec: string;
  unitPrice: number;
  quantity: number;
  amount: number;
  referenceInfo: string | null;
  // 3단계 매입 화면에 통합한 "오늘 팔 가격(예상)". StoreSalesPricePlan.plannedUnitPrice를
  // (storeId, closingDate=businessDate, productId)로 조회해 채운다. 품목이 없는 자유 입력
  // 행이나 계획이 없는 품목은 null이다. 본사 경로(toLedgerCostStepData)는 채우지 않는다.
  plannedUnitPrice: number | null;
  // "purchase" = 오늘 매입한(또는 자유 입력) 행. "carryover" = 어제 이월돼 오늘 팔린 품목으로,
  // 매입 행이 없어 판매 예정가를 넣을 곳이 없던 품목이다. carryover 행은 판매 예정가만 저장하고
  // ledgerPurchaseItem으로는 저장하지 않는다(0원 매입 행이 생기지 않게). GET/저장 응답에만 등장하고
  // 본사 경로(toLedgerCostStepData)는 채우지 않는다.
  kind: "purchase" | "carryover";
  // carryover 행 표시용 전일 재고 수량(매입 화면에 "전일재고 N"으로 노출). purchase 행은 0.
  previousQuantity: number;
};

export type LedgerLaborLine = {
  id: string;
  employeeId: string | null;
  workerName: string;
  amount: number;
  lateMemo: string | null;
  earlyLeaveMemo: string | null;
  specialMemo: string | null;
};

export type LedgerCostStepData = LedgerSalesStepData & {
  workerCount: number | null;
  workMemo: string | null;
  expenseItems: LedgerExpenseLine[];
  expenseTotal: number;
  purchaseItems: LedgerPurchaseLine[];
  purchaseTotal: number;
  laborItems: LedgerLaborLine[];
  payrollTotal: number;
  grossProfit: number;
  productivity: number | null;
  stepCompletion: StoreEntryStepCompletion;
};

// WO-10(2026-06-28): 급여액과 인건비 합계는 본사 전용이다. 지점장 응답에서
// 개인별 급여액(laborItems[].amount)과 합계(payrollTotal)를 제거한다. 근무자
// 명단/메모는 지점장이 선택·입력하므로 amount만 빠진 라인으로 내려준다.
export type StoreManagerLedgerLaborLine = Omit<LedgerLaborLine, "amount">;

export type StoreManagerLedgerCostStepData = Omit<
  LedgerCostStepData,
  "grossProfit" | "productivity" | "payrollTotal" | "laborItems"
> & {
  laborItems: StoreManagerLedgerLaborLine[];
};

export type LedgerPurchaseStepData = LedgerCostStepData;

export type LedgerSalesInput = PaymentAmounts & {
  storeId: string;
};
