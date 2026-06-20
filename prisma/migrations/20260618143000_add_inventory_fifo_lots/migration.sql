-- CreateEnum
CREATE TYPE "InventoryLotSource" AS ENUM ('OPENING', 'PREVIOUS_CARRYOVER', 'PURCHASE', 'LEGACY_OPENING');

-- CreateTable
CREATE TABLE "LedgerInventoryFifoLot" (
    "id" TEXT NOT NULL,
    "dailyLedgerId" TEXT NOT NULL,
    "ledgerInventoryItemId" TEXT,
    "productId" TEXT NOT NULL,
    "sourceType" "InventoryLotSource" NOT NULL,
    "sourceLedgerId" TEXT,
    "sourcePurchaseItemId" TEXT,
    "unitPrice" INTEGER NOT NULL,
    "originalQuantity" INTEGER NOT NULL,
    "consumedQuantity" INTEGER NOT NULL,
    "remainingQuantity" INTEGER NOT NULL,
    "originalAmount" INTEGER NOT NULL,
    "consumedAmount" INTEGER NOT NULL,
    "remainingAmount" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerInventoryFifoLot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledgerInventoryFifoLot_dailyLedgerId_productId_sortOrder_key" ON "LedgerInventoryFifoLot"("dailyLedgerId", "productId", "sortOrder");

-- CreateIndex
CREATE INDEX "LedgerInventoryFifoLot_dailyLedgerId_productId_idx" ON "LedgerInventoryFifoLot"("dailyLedgerId", "productId");

-- CreateIndex
CREATE INDEX "LedgerInventoryFifoLot_ledgerInventoryItemId_idx" ON "LedgerInventoryFifoLot"("ledgerInventoryItemId");

-- CreateIndex
CREATE INDEX "LedgerInventoryFifoLot_productId_idx" ON "LedgerInventoryFifoLot"("productId");

-- CreateIndex
CREATE INDEX "LedgerInventoryFifoLot_sourceType_idx" ON "LedgerInventoryFifoLot"("sourceType");

-- CreateIndex
CREATE INDEX "LedgerInventoryFifoLot_sourcePurchaseItemId_idx" ON "LedgerInventoryFifoLot"("sourcePurchaseItemId");

-- AddForeignKey
ALTER TABLE "LedgerInventoryFifoLot" ADD CONSTRAINT "LedgerInventoryFifoLot_dailyLedgerId_fkey" FOREIGN KEY ("dailyLedgerId") REFERENCES "DailyLedger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerInventoryFifoLot" ADD CONSTRAINT "LedgerInventoryFifoLot_ledgerInventoryItemId_fkey" FOREIGN KEY ("ledgerInventoryItemId") REFERENCES "LedgerInventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerInventoryFifoLot" ADD CONSTRAINT "LedgerInventoryFifoLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerInventoryFifoLot" ADD CONSTRAINT "LedgerInventoryFifoLot_sourcePurchaseItemId_fkey" FOREIGN KEY ("sourcePurchaseItemId") REFERENCES "LedgerPurchaseItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
