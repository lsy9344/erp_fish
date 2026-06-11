import { type DailyLedgerStatus } from "../../../generated/prisma";
import { type StoreEntryStepCompletion } from "~/features/ledger/step-completion";

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
  version: number;
  authorDisplayName: string | null;
  status: DailyLedgerStatus;
  stepCompletion: StoreEntryStepCompletion;
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

export type StoreManagerLossProductOption = Omit<
  LossProductOption,
  "defaultUnitPrice"
>;

export type StoreManagerLossLineItem = Omit<
  LossLineItem,
  "unitPrice" | "amount"
>;

export type StoreManagerLossProductSummary = Omit<LossProductSummary, "amount">;

export type StoreManagerLossSignalCandidate = Omit<
  LossSignalCandidate,
  "amount" | "exceededAmount"
>;

export type StoreManagerLossStepData = Omit<
  LossStepData,
  "productOptions" | "lossItems" | "summary" | "signalCandidates"
> & {
  productOptions: StoreManagerLossProductOption[];
  lossItems: StoreManagerLossLineItem[];
  summary: {
    totalQuantity: number;
    byProduct: StoreManagerLossProductSummary[];
  };
  signalCandidates: StoreManagerLossSignalCandidate[];
};
