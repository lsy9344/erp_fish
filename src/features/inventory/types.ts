import {
  type DailyLedgerStatus,
  type InventoryAdjustmentAmountStatus,
  type InventoryCarryoverSource,
  type InventoryCarryoverStatus,
} from "../../../generated/prisma";
import { type StoreEntryStepCompletion } from "~/features/ledger/step-completion";
import { type InventoryFifoLotView } from "~/features/inventory/fifo-lots";

export type { InventoryFifoLotView };

export type InventoryStepLine = {
  id: string;
  productId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
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

// 2026-06-22 결정: FIFO 재고금액(inventoryAmount)과 판매 lot 이력(fifoLots)은
// 지점장에게도 노출한다. 단가/매입액/손실액과 조정 금액은 계속 차단한다.
export type StoreManagerInventoryStepLine = Omit<
  InventoryStepLine,
  "unitPrice" | "purchaseAmount" | "lossAmount" | "adjustment"
> & {
  adjustment: StoreManagerInventoryAdjustmentView | null;
};

export type StoreManagerInventoryStepData = Omit<InventoryStepData, "items"> & {
  items: StoreManagerInventoryStepLine[];
};
