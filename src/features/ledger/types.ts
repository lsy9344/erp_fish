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

export type StoreManagerLedgerCostStepData = Omit<
  LedgerCostStepData,
  "grossProfit" | "productivity"
>;

export type LedgerPurchaseStepData = LedgerCostStepData;

export type LedgerSalesInput = PaymentAmounts & {
  storeId: string;
};
