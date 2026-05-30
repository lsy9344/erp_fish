-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "reason" TEXT;

-- CreateTable
CREATE TABLE "LedgerInventoryAdjustment" (
    "id" TEXT NOT NULL,
    "dailyLedgerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ledgerInventoryItemId" TEXT,
    "productName" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL,
    "productSpec" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "beforeQuantity" INTEGER NOT NULL,
    "beforeAmount" INTEGER NOT NULL,
    "afterQuantity" INTEGER NOT NULL,
    "afterAmount" INTEGER NOT NULL,
    "differenceQuantity" INTEGER NOT NULL,
    "differenceAmount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerInventoryAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerInventoryAdjustment_ledgerInventoryItemId_key" ON "LedgerInventoryAdjustment"("ledgerInventoryItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ledgerInventoryAdjustment_dailyLedgerId_productId_key" ON "LedgerInventoryAdjustment"("dailyLedgerId", "productId");

-- CreateIndex
CREATE INDEX "LedgerInventoryAdjustment_dailyLedgerId_idx" ON "LedgerInventoryAdjustment"("dailyLedgerId");

-- CreateIndex
CREATE INDEX "LedgerInventoryAdjustment_productId_idx" ON "LedgerInventoryAdjustment"("productId");

-- CreateIndex
CREATE INDEX "LedgerInventoryAdjustment_createdById_idx" ON "LedgerInventoryAdjustment"("createdById");

-- CreateIndex
CREATE INDEX "LedgerInventoryAdjustment_updatedById_idx" ON "LedgerInventoryAdjustment"("updatedById");

-- AddForeignKey
ALTER TABLE "LedgerInventoryAdjustment" ADD CONSTRAINT "LedgerInventoryAdjustment_dailyLedgerId_fkey" FOREIGN KEY ("dailyLedgerId") REFERENCES "DailyLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerInventoryAdjustment" ADD CONSTRAINT "LedgerInventoryAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerInventoryAdjustment" ADD CONSTRAINT "LedgerInventoryAdjustment_ledgerInventoryItemId_fkey" FOREIGN KEY ("ledgerInventoryItemId") REFERENCES "LedgerInventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerInventoryAdjustment" ADD CONSTRAINT "LedgerInventoryAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerInventoryAdjustment" ADD CONSTRAINT "LedgerInventoryAdjustment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
