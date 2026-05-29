import { type DailyLedgerStatus } from "../../../generated/prisma";

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
  status: DailyLedgerStatus;
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
  productId: string;
  purchaseStandardId: string | null;
  productName: string;
  productCategory: string;
  productSpec: string;
  unitPrice: number;
  quantity: number;
  amount: number;
  referenceInfo: string | null;
};

export type LedgerCostStepData = LedgerSalesStepData & {
  workerCount: number | null;
  workMemo: string | null;
  expenseItems: LedgerExpenseLine[];
  expenseTotal: number;
  purchaseItems: LedgerPurchaseLine[];
  purchaseTotal: number;
  grossProfit: number;
  productivity: number | null;
};

export type LedgerPurchaseStepData = LedgerCostStepData;

export type LedgerSalesInput = PaymentAmounts & {
  storeId: string;
};
