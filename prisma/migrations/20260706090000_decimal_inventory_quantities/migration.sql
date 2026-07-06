-- Allow inventory-related quantities to preserve up to two decimal places.
-- Existing integer quantities are cast to NUMERIC(12,2), e.g. 3 -> 3.00.

ALTER TABLE "LedgerPurchaseItem"
  ALTER COLUMN "quantity" TYPE NUMERIC(12,2) USING "quantity"::NUMERIC(12,2);

ALTER TABLE "LedgerInventoryItem"
  ALTER COLUMN "previousQuantity" TYPE NUMERIC(12,2) USING "previousQuantity"::NUMERIC(12,2),
  ALTER COLUMN "purchasedQuantity" TYPE NUMERIC(12,2) USING "purchasedQuantity"::NUMERIC(12,2),
  ALTER COLUMN "purchasedQuantity" SET DEFAULT 0,
  ALTER COLUMN "currentQuantity" TYPE NUMERIC(12,2) USING "currentQuantity"::NUMERIC(12,2),
  ALTER COLUMN "quantity" TYPE NUMERIC(12,2) USING "quantity"::NUMERIC(12,2);

ALTER TABLE "LedgerInventoryCarryoverDetail"
  ALTER COLUMN "resolvedQuantity" TYPE NUMERIC(12,2) USING "resolvedQuantity"::NUMERIC(12,2),
  ALTER COLUMN "sourcePreviousQuantity" TYPE NUMERIC(12,2) USING "sourcePreviousQuantity"::NUMERIC(12,2),
  ALTER COLUMN "sourcePurchasedQuantity" TYPE NUMERIC(12,2) USING "sourcePurchasedQuantity"::NUMERIC(12,2),
  ALTER COLUMN "sourceLossQuantity" TYPE NUMERIC(12,2) USING "sourceLossQuantity"::NUMERIC(12,2),
  ALTER COLUMN "sourceCurrentQuantity" TYPE NUMERIC(12,2) USING "sourceCurrentQuantity"::NUMERIC(12,2),
  ALTER COLUMN "sourceQuantity" TYPE NUMERIC(12,2) USING "sourceQuantity"::NUMERIC(12,2);

ALTER TABLE "LedgerInventoryFifoLot"
  ALTER COLUMN "originalQuantity" TYPE NUMERIC(12,2) USING "originalQuantity"::NUMERIC(12,2),
  ALTER COLUMN "consumedQuantity" TYPE NUMERIC(12,2) USING "consumedQuantity"::NUMERIC(12,2),
  ALTER COLUMN "remainingQuantity" TYPE NUMERIC(12,2) USING "remainingQuantity"::NUMERIC(12,2);

ALTER TABLE "LedgerInventoryAdjustment"
  ALTER COLUMN "beforeQuantity" TYPE NUMERIC(12,2) USING "beforeQuantity"::NUMERIC(12,2),
  ALTER COLUMN "afterQuantity" TYPE NUMERIC(12,2) USING "afterQuantity"::NUMERIC(12,2),
  ALTER COLUMN "differenceQuantity" TYPE NUMERIC(12,2) USING "differenceQuantity"::NUMERIC(12,2);

ALTER TABLE "LedgerLossItem"
  ALTER COLUMN "quantity" TYPE NUMERIC(12,2) USING "quantity"::NUMERIC(12,2);

ALTER TABLE "InventoryOpeningSnapshot"
  ALTER COLUMN "quantity" TYPE NUMERIC(12,2) USING "quantity"::NUMERIC(12,2);

ALTER TABLE "EcountImportLine"
  ALTER COLUMN "quantity" TYPE NUMERIC(12,2) USING "quantity"::NUMERIC(12,2);
