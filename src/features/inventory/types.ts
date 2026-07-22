import {
  type DailyLedgerStatus,
  type InventoryAdjustmentAmountStatus,
  type InventoryCarryoverSource,
  type InventoryCarryoverStatus,
} from "../../../generated/prisma";
import { type StoreEntryStepCompletion } from "~/features/ledger/step-completion";
import { type InventoryFifoLotView } from "~/features/inventory/fifo-lots";

export type { InventoryFifoLotView };

export type InventoryPurchasePrice =
  | {
      kind: "TODAY" | "RECENT";
      businessDate: string;
      unitPrice: number;
    }
  | {
      kind: "OPENING";
      yearMonth: string;
      unitPrice: number;
    };

export type InventoryStepLine = {
  id: string;
  productId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  purchasePrice: InventoryPurchasePrice | null;
  plannedUnitPrice: number | null;
  unitPrice: number;
  previousQuantity: number;
  purchasedQuantity: number;
  purchaseAmount: number;
  lossQuantity: number;
  lossAmount: number;
  currentQuantity: number | null;
  quantity: number | null;
  inventoryAmount: number | null;
  fifoLots: InventoryFifoLotView[];
  carryoverSource: InventoryCarryoverSource;
  carryoverStatus: InventoryCarryoverStatus;
  carryoverLedgerId: string | null;
  previousQuantityDetail: InventoryCarryoverDetailView;
  isModified: boolean;
  adjustment: InventoryAdjustmentView | null;
};

export type InventoryCarryoverHistoryRow = {
  ledgerId: string;
  closingDate: string;
  ledgerStatus: DailyLedgerStatus;
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number | null;
  currentQuantity: number | null;
  quantity: number | null;
};

export type InventoryCarryoverDetailView = {
  source: InventoryCarryoverSource;
  status: InventoryCarryoverStatus;
  resolvedQuantity: number;
  sourceLedgerId: string | null;
  sourceLedgerClosingDate: string | null;
  sourceLedgerStatus: DailyLedgerStatus | null;
  sourceYearMonth: string | null;
  sourceSnapshotId: string | null;
  sourcePreviousQuantity: number | null;
  sourcePurchasedQuantity: number | null;
  sourceLossQuantity: number | null;
  sourceCurrentQuantity: number | null;
  sourceQuantity: number | null;
  message: string;
  history: InventoryCarryoverHistoryRow[];
};

export type InventoryAdjustmentView = {
  id: string;
  beforeQuantity: number;
  beforeAmount: number;
  afterQuantity: number;
  afterAmount: number;
  differenceQuantity: number;
  differenceAmount: number;
  amountStatus: InventoryAdjustmentAmountStatus;
  reason: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InventoryCarryoverState = {
  status: "loaded" | "manual";
  source: InventoryCarryoverSource;
  message: string;
};

// 근거(저장행/당일 매입/당일 손실/이월) 없이 기본 표에 자동으로 펼치지 않는 활성
// 품목. 사용자가 "품목 추가"에서 골라야만 표에 행이 생긴다.
export type InventoryManualProductOption = {
  productId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  purchasePrice: InventoryPurchasePrice | null;
  plannedUnitPrice: number | null;
};

export type InventoryStepData = {
  id: string;
  storeId: string;
  closingDate: string;
  updatedAt: string;
  version: number;
  authorDisplayName: string | null;
  status: DailyLedgerStatus;
  stepCompletion: StoreEntryStepCompletion;
  items: InventoryStepLine[];
  manualProductOptions: InventoryManualProductOption[];
  carryover: InventoryCarryoverState;
};

export type StoreManagerInventoryAdjustmentView = Omit<
  InventoryAdjustmentView,
  "beforeAmount" | "afterAmount" | "differenceAmount"
>;

// 정책 반전(2026-06-28, client-review-checklist-2026-06-28.md §4): 지점장 전날재고/재고
// 화면에는 품목·수량·FIFO 기준일/lot 식별만 노출하고 금액·단가·원가·마진은 제외한다.
// 따라서 lot 뷰에서 단가/금액 필드(unitPrice·*Amount)를 떼고 수량·입고일·lot 식별만 남긴다.
export type StoreManagerInventoryFifoLotView = Omit<
  InventoryFifoLotView,
  "unitPrice" | "originalAmount" | "consumedAmount" | "remainingAmount"
>;

// FIFO·기본·내부 단가와 최상위 unitPrice/금액 필드는 계속 차단한다. 고객이 승인한
// 당일·최근 실제 매입단가와 승인된 월초 표시 단가만 중첩 purchasePrice 예외로 노출한다.
export type StoreManagerInventoryStepLine = Omit<
  InventoryStepLine,
  | "unitPrice"
  | "purchaseAmount"
  | "lossAmount"
  | "inventoryAmount"
  | "fifoLots"
  | "adjustment"
> & {
  fifoLots: StoreManagerInventoryFifoLotView[];
  adjustment: StoreManagerInventoryAdjustmentView | null;
};

export type StoreManagerInventoryStepData = Omit<InventoryStepData, "items"> & {
  items: StoreManagerInventoryStepLine[];
};
