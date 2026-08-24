-- Preserve one immutable origin key for every purchase row. Existing rows use
-- their already-unique id; new keys are supplied by the database UUID default.
ALTER TABLE "LedgerPurchaseItem" ADD COLUMN "lotOriginKey" TEXT;

UPDATE "LedgerPurchaseItem"
SET "lotOriginKey" = "id"
WHERE "lotOriginKey" IS NULL;

ALTER TABLE "LedgerPurchaseItem" ALTER COLUMN "lotOriginKey" SET NOT NULL;
ALTER TABLE "LedgerPurchaseItem" ALTER COLUMN "lotOriginKey"
SET DEFAULT (gen_random_uuid())::text;

CREATE UNIQUE INDEX "LedgerPurchaseItem_lotOriginKey_key"
ON "LedgerPurchaseItem"("lotOriginKey");

-- Extend FIFO snapshots with the immutable origin and the explicit split
-- between loss consumption and sale consumption. Historical snapshots did not
-- store that split, so their consumed amount is conservatively treated as sale.
ALTER TABLE "LedgerInventoryFifoLot"
  ADD COLUMN "lotOriginKey" TEXT,
  ADD COLUMN "lossQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "soldQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "lossAmount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "soldAmount" INTEGER NOT NULL DEFAULT 0;

UPDATE "LedgerInventoryFifoLot" AS lot
SET "lotOriginKey" = COALESCE(
      purchase."lotOriginKey",
      'legacy:' || lot."productId" || ':' ||
      COALESCE(to_char(lot."sourceBusinessDate", 'YYYY-MM-DD'), 'unknown') || ':' ||
      lot."unitPrice"::text || ':' || lot."sortOrder"::text
    ),
    "soldQuantity" = lot."consumedQuantity",
    "soldAmount" = lot."consumedAmount"
FROM "LedgerPurchaseItem" AS purchase
WHERE purchase."id" = lot."sourcePurchaseItemId";

UPDATE "LedgerInventoryFifoLot" AS lot
SET "lotOriginKey" = 'legacy:' || lot."productId" || ':' ||
    COALESCE(to_char(lot."sourceBusinessDate", 'YYYY-MM-DD'), 'unknown') || ':' ||
    lot."unitPrice"::text || ':' || lot."sortOrder"::text,
    "soldQuantity" = lot."consumedQuantity",
    "soldAmount" = lot."consumedAmount"
WHERE lot."lotOriginKey" IS NULL;

ALTER TABLE "LedgerInventoryFifoLot" ALTER COLUMN "lotOriginKey" SET NOT NULL;
ALTER TABLE "LedgerInventoryFifoLot" ALTER COLUMN "lotOriginKey"
SET DEFAULT (gen_random_uuid())::text;

CREATE INDEX "LedgerInventoryFifoLot_dailyLedgerId_lotOriginKey_idx"
ON "LedgerInventoryFifoLot"("dailyLedgerId", "lotOriginKey");

-- Per-ledger, per-origin sale prices. The old StoreSalesPricePlan table stays
-- in place as the legacy product-level default.
CREATE TABLE "LedgerLotSalesPricePlan" (
  "id" TEXT NOT NULL,
  "dailyLedgerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "lotOriginKey" TEXT NOT NULL,
  "plannedUnitPrice" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT NOT NULL,

  CONSTRAINT "LedgerLotSalesPricePlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ledgerLotSalesPricePlan_dailyLedgerId_lotOriginKey_key"
ON "LedgerLotSalesPricePlan"("dailyLedgerId", "lotOriginKey");
CREATE INDEX "LedgerLotSalesPricePlan_dailyLedgerId_productId_idx"
ON "LedgerLotSalesPricePlan"("dailyLedgerId", "productId");
CREATE INDEX "LedgerLotSalesPricePlan_lotOriginKey_idx"
ON "LedgerLotSalesPricePlan"("lotOriginKey");
CREATE INDEX "LedgerLotSalesPricePlan_createdById_idx"
ON "LedgerLotSalesPricePlan"("createdById");
CREATE INDEX "LedgerLotSalesPricePlan_updatedById_idx"
ON "LedgerLotSalesPricePlan"("updatedById");

ALTER TABLE "LedgerLotSalesPricePlan"
  ADD CONSTRAINT "LedgerLotSalesPricePlan_dailyLedgerId_fkey"
  FOREIGN KEY ("dailyLedgerId") REFERENCES "DailyLedger"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerLotSalesPricePlan"
  ADD CONSTRAINT "LedgerLotSalesPricePlan_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerLotSalesPricePlan"
  ADD CONSTRAINT "LedgerLotSalesPricePlan_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerLotSalesPricePlan"
  ADD CONSTRAINT "LedgerLotSalesPricePlan_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- FIFO loss allocations are stored separately because FIFO rows are rebuilt
-- after inventory, purchase, or loss edits.
CREATE TABLE "LedgerLossLotAllocation" (
  "id" TEXT NOT NULL,
  "dailyLedgerId" TEXT NOT NULL,
  "ledgerLossItemId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "lotOriginKey" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "plannedUnitPrice" INTEGER NOT NULL,
  "costAmount" INTEGER NOT NULL,
  "grossLossAmount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LedgerLossLotAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LedgerLossLotAllocation_dailyLedgerId_productId_idx"
ON "LedgerLossLotAllocation"("dailyLedgerId", "productId");
CREATE INDEX "LedgerLossLotAllocation_ledgerLossItemId_idx"
ON "LedgerLossLotAllocation"("ledgerLossItemId");
CREATE INDEX "LedgerLossLotAllocation_dailyLedgerId_lotOriginKey_idx"
ON "LedgerLossLotAllocation"("dailyLedgerId", "lotOriginKey");

ALTER TABLE "LedgerLossLotAllocation"
  ADD CONSTRAINT "LedgerLossLotAllocation_dailyLedgerId_fkey"
  FOREIGN KEY ("dailyLedgerId") REFERENCES "DailyLedger"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerLossLotAllocation"
  ADD CONSTRAINT "LedgerLossLotAllocation_ledgerLossItemId_fkey"
  FOREIGN KEY ("ledgerLossItemId") REFERENCES "LedgerLossItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LedgerLossLotAllocation"
  ADD CONSTRAINT "LedgerLossLotAllocation_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
