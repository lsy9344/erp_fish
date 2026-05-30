import { type DailyLedgerStatus } from "../../../generated/prisma";

export type LossProductOption = {
  id: string;
  name: string;
  category: string;
  spec: string;
  defaultUnitPrice: number;
};

export type LossTypeOption = {
  id: string;
  name: string;
  displayOrder: number;
};

export type LossLineItem = {
  id: string;
  productId: string;
  ledgerInputCodeId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  unitPrice: number;
  lossTypeName: string;
  quantity: number;
  amount: number;
  reason: string;
};

export type LossProductSummary = {
  productId: string;
  productName: string;
  quantity: number;
  amount: number;
};

export type LossSignalCandidate = LossProductSummary & {
  exceededQuantity: boolean;
  exceededAmount: boolean;
};

export type LossStepData = {
  id: string;
  storeId: string;
  closingDate: string;
  updatedAt: string;
  status: DailyLedgerStatus;
  productOptions: LossProductOption[];
  lossTypeOptions: LossTypeOption[];
  lossItems: LossLineItem[];
  summary: {
    totalQuantity: number;
    totalAmount: number;
    byProduct: LossProductSummary[];
  };
  signalCandidates: LossSignalCandidate[];
};
