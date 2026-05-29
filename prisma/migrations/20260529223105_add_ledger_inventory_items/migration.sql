-- CreateEnum
CREATE TYPE "InventoryCarryoverSource" AS ENUM ('OPENING_SNAPSHOT', 'PREVIOUS_CLOSED_LEDGER', 'MANUAL');

-- CreateTable
CREATE TABLE "LedgerInventoryItem" (
    "id" TEXT NOT NULL,
    "dailyLedgerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL,
    "productSpec" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "previousQuantity" INTEGER NOT NULL,
    "purchasedQuantity" INTEGER NOT NULL DEFAULT 0,
    "currentQuantity" INTEGER,
    "quantity" INTEGER,
    "inventoryAmount" INTEGER,
    "isModified" BOOLEAN NOT NULL DEFAULT false,
    "carryoverSource" "InventoryCarryoverSource" NOT NULL DEFAULT 'MANUAL',
    "carryoverLedgerId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerInventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryOpeningSnapshot" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL,
    "productSpec" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryOpeningSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledgerInventoryItem_dailyLedgerId_productId_key" ON "LedgerInventoryItem"("dailyLedgerId", "productId");

-- CreateIndex
CREATE INDEX "LedgerInventoryItem_dailyLedgerId_idx" ON "LedgerInventoryItem"("dailyLedgerId");

-- CreateIndex
CREATE INDEX "LedgerInventoryItem_productId_idx" ON "LedgerInventoryItem"("productId");

-- CreateIndex
CREATE INDEX "LedgerInventoryItem_carryoverLedgerId_idx" ON "LedgerInventoryItem"("carryoverLedgerId");

-- CreateIndex
CREATE UNIQUE INDEX "inventoryOpeningSnapshot_storeId_yearMonth_productId_key" ON "InventoryOpeningSnapshot"("storeId", "yearMonth", "productId");

-- CreateIndex
CREATE INDEX "InventoryOpeningSnapshot_storeId_yearMonth_idx" ON "InventoryOpeningSnapshot"("storeId", "yearMonth");

-- CreateIndex
CREATE INDEX "InventoryOpeningSnapshot_productId_idx" ON "InventoryOpeningSnapshot"("productId");

-- AddForeignKey
ALTER TABLE "LedgerInventoryItem" ADD CONSTRAINT "LedgerInventoryItem_dailyLedgerId_fkey" FOREIGN KEY ("dailyLedgerId") REFERENCES "DailyLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerInventoryItem" ADD CONSTRAINT "LedgerInventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerInventoryItem" ADD CONSTRAINT "LedgerInventoryItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerInventoryItem" ADD CONSTRAINT "LedgerInventoryItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryOpeningSnapshot" ADD CONSTRAINT "InventoryOpeningSnapshot_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryOpeningSnapshot" ADD CONSTRAINT "InventoryOpeningSnapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
