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
  currentQuantity: number | null;
  quantity: number | null;
  inventoryAmount: number | null;
  carryoverSource: InventoryCarryoverSource;
  carryoverLedgerId: string | null;
  isModified: boolean;
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
  status: DailyLedgerStatus;
  items: InventoryStepLine[];
  carryover: InventoryCarryoverState;
};
