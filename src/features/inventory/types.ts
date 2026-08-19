import {
  type DailyLedgerStatus,
  type InventoryAdjustmentAmountStatus,
  type InventoryCarryoverSource,
  type InventoryCarryoverStatus,
} from "../../../generated/prisma";
import { type StoreEntryStepCompletion } from "~/features/ledger/step-completion";
import { type InventoryFifoLotView } from "~/features/inventory/fifo-lots";
import { type PlannedUnitPriceSource } from "~/features/inventory/sales-price-carryover.ts";

export type { InventoryFifoLotView, PlannedUnitPriceSource };

export type InventoryPurchasePrice =
  | {
      kind: "AVERAGE";
      unitPrice: number;
    }
  | {
      kind: "TODAY" | "RECENT";
      businessDate: string;
      unitPrice: number;
    }
  | {
      kind: "OPENING";
      yearMonth: string;
      unitPrice: number;
    }
  | {
      // WO-25(2026-07-25) #1: 당일/최근 매입행이 없을 때, 전일 장부에서 이월된 단가(=FIFO
      // 롯트 단가와 동일 값)를 표시하기 위한 fallback. businessDate는 이월 원천 장부의 영업일.
      kind: "CARRYOVER";
      businessDate: string;
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
// 품목, 또는 0재고로 표에서 숨긴 품목. 사용자가 "품목 추가"에서 골라야만 표에 행이 생긴다.
export type InventoryManualProductOptionSource =
  | "UNGROUNDED"
  | "HIDDEN_ZERO_STOCK";

export type InventoryManualProductOption = {
  productId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  purchasePrice: InventoryPurchasePrice | null;
  plannedUnitPrice: number | null;
  /** UNGROUNDED=근거 없는 활성 품목, HIDDEN_ZERO_STOCK=표시 정책으로 숨긴 0재고 행 */
  source: InventoryManualProductOptionSource;
  /**
   * HIDDEN_ZERO_STOCK일 때만 채운다. 품목 추가 시 기존 행의 id/이월/조정 정책을
   * 그대로 복원해 신규 수동 행(buildManualInventoryRows)으로 오인하지 않게 한다.
   */
  restoredItem?: InventoryStepLine;
};

export type StoreManagerInventoryManualProductOption = Omit<
  InventoryManualProductOption,
  "restoredItem"
> & {
  plannedUnitPriceSource: PlannedUnitPriceSource | null;
  restoredItem?: StoreManagerInventoryStepLine;
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

// 재고 입력 카드에서 입고일별 매입단가를 확인할 수 있도록 lot 단가는 허용한다.
// 원수량·소진수량·잔량은 유지하되 원금액·소진금액·잔액은 계속 차단한다.
export type StoreManagerInventoryFifoLotView = Omit<
  InventoryFifoLotView,
  "originalAmount" | "consumedAmount" | "remainingAmount"
>;

// 기본·내부 단가와 최상위 unitPrice/금액 필드는 계속 차단한다. 카드 표시에 필요한
// lot별 매입단가와 기존 purchasePrice만 제한적으로 노출한다.
export type StoreManagerInventoryStepLine = Omit<
  InventoryStepLine,
  | "unitPrice"
  | "purchaseAmount"
  | "lossAmount"
  | "inventoryAmount"
  | "fifoLots"
  | "adjustment"
> & {
  plannedUnitPriceSource: PlannedUnitPriceSource | null;
  fifoLots: StoreManagerInventoryFifoLotView[];
  adjustment: StoreManagerInventoryAdjustmentView | null;
};

export type StoreManagerInventoryStepData = Omit<
  InventoryStepData,
  "items" | "manualProductOptions"
> & {
  items: StoreManagerInventoryStepLine[];
  manualProductOptions: StoreManagerInventoryManualProductOption[];
};
