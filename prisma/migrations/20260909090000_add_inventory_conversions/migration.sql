ALTER TYPE "InventoryCarryoverSource" ADD VALUE 'CONVERSION';
ALTER TYPE "InventoryLotSource" ADD VALUE 'CONVERSION';

ALTER TABLE "LedgerInventoryItem"
  ADD COLUMN "conversionInQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "conversionOutQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE "LedgerInventoryConversion" (
  "id" TEXT NOT NULL,
  "dailyLedgerId" TEXT NOT NULL,
  "sourceProductId" TEXT NOT NULL,
  "targetProductId" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "sourceQuantityBefore" DECIMAL(12,2) NOT NULL,
  "sourceQuantityAfter" DECIMAL(12,2) NOT NULL,
  "targetQuantityBefore" DECIMAL(12,2) NOT NULL,
  "targetQuantityAfter" DECIMAL(12,2) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LedgerInventoryConversion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LedgerInventoryConversionAllocation" (
  "id" TEXT NOT NULL,
  "conversionId" TEXT NOT NULL,
  "sourceLotOriginKey" TEXT NOT NULL,
  "sourceBusinessDate" TIMESTAMP(3),
  "unitCost" INTEGER NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL,
  "costAmount" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LedgerInventoryConversionAllocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LedgerInventoryConversion_dailyLedgerId_sourceProductId_idx"
ON "LedgerInventoryConversion"("dailyLedgerId", "sourceProductId");
CREATE INDEX "LedgerInventoryConversion_dailyLedgerId_targetProductId_idx"
ON "LedgerInventoryConversion"("dailyLedgerId", "targetProductId");
CREATE INDEX "LedgerInventoryConversion_createdById_idx"
ON "LedgerInventoryConversion"("createdById");
CREATE UNIQUE INDEX "LedgerInventoryConversionAllocation_conversionId_sortOrder_key"
ON "LedgerInventoryConversionAllocation"("conversionId", "sortOrder");
CREATE INDEX "LedgerInventoryConversionAllocation_sourceLotOriginKey_idx"
ON "LedgerInventoryConversionAllocation"("sourceLotOriginKey");

ALTER TABLE "LedgerInventoryConversion"
  ADD CONSTRAINT "LedgerInventoryConversion_dailyLedgerId_fkey"
  FOREIGN KEY ("dailyLedgerId") REFERENCES "DailyLedger"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerInventoryConversion"
  ADD CONSTRAINT "LedgerInventoryConversion_sourceProductId_fkey"
  FOREIGN KEY ("sourceProductId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerInventoryConversion"
  ADD CONSTRAINT "LedgerInventoryConversion_targetProductId_fkey"
  FOREIGN KEY ("targetProductId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerInventoryConversion"
  ADD CONSTRAINT "LedgerInventoryConversion_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerInventoryConversionAllocation"
  ADD CONSTRAINT "LedgerInventoryConversionAllocation_conversionId_fkey"
  FOREIGN KEY ("conversionId") REFERENCES "LedgerInventoryConversion"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LedgerInventoryFifoLot"
  ADD COLUMN "sourceConversionAllocationId" TEXT,
  ADD COLUMN "conversionOutQuantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "conversionOutAmount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "LedgerInventoryFifoLot_sourceConversionAllocationId_idx"
ON "LedgerInventoryFifoLot"("sourceConversionAllocationId");

ALTER TABLE "LedgerInventoryFifoLot"
  ADD CONSTRAINT "LedgerInventoryFifoLot_sourceConversionAllocationId_fkey"
  FOREIGN KEY ("sourceConversionAllocationId")
  REFERENCES "LedgerInventoryConversionAllocation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
