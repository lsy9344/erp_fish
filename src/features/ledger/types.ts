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
  // WO-12(2026-06-28): 본사 매입 수정 화면에서 원본 이카운트 단가와 장부 적용 단가를
  // 나란히 보여주기 위한 본사 전용 필드. 지점장 응답에서는 response-shaping이 제거한다.
  sourceUnitPrice?: number | null;
  unitPriceOverridden?: boolean;
  unitPriceOverrideReason?: string | null;
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
  | "grossProfit"
  | "productivity"
  | "payrollTotal"
  | "laborItems"
  | "paymentDifferenceAmount"
> & {
  laborItems: StoreManagerLedgerLaborLine[];
};

export type LedgerPurchaseStepData = LedgerCostStepData;

export type LedgerSalesInput = PaymentAmounts & {
  storeId: string;
};
