import {
  type DailyLedgerStatus,
  type InventoryCarryoverSource,
} from "../../../generated/prisma";

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
  carryoverSource: InventoryCarryoverSource;
  carryoverLedgerId: string | null;
  isModified: boolean;
  adjustment: InventoryAdjustmentView | null;
};

export type InventoryAdjustmentView = {
  id: string;
  beforeQuantity: number;
  beforeAmount: number;
  afterQuantity: number;
  afterAmount: number;
  differenceQuantity: number;
  differenceAmount: number;
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

export type InventoryStepData = {
  id: string;
  storeId: string;
  closingDate: string;
  updatedAt: string;
  status: DailyLedgerStatus;
  items: InventoryStepLine[];
  carryover: InventoryCarryoverState;
};
