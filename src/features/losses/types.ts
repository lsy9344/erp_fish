import { type DailyLedgerStatus } from "../../../generated/prisma";
import { type StoreEntryStepCompletion } from "~/features/ledger/step-completion";

export type LossProductOption = {
  id: string;
  name: string;
  category: string;
  spec: string;
  // 선택적 참고 단가(본사 매입가 아님). 손실액 산정에는 쓰지 않는다.
  defaultUnitPrice: number | null;
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
  recoveredAmount: number;
  amount: number;
  reason: string;
  // point_summary 검토 후속(2026-06-24): 회의 결정상 손실액은 "팔고자 한 희망 판매가격"
  // 기준이다. 해당 품목에 당일 판매가 계획(StoreSalesPricePlan)이 있어 손실액이 판매가
  // 기준으로 산정됐으면 true. 가격 정책 전환(2026-06-24): 판매가 계획이 없으면 더 이상
  // 품목 마스터 단가로 폴백하지 않고 손실액을 산정하지 않는다(false면 unitPrice/amount=0,
  // 화면에 "판매가 계획 없음 · 미산정"으로 표시).
  usedPlannedPrice: boolean;
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
