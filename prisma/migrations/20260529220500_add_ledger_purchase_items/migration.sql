-- CreateTable
CREATE TABLE "LedgerPurchaseItem" (
    "id" TEXT NOT NULL,
    "dailyLedgerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "purchaseStandardId" TEXT,
    "productName" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL,
    "productSpec" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "referenceInfo" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerPurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerPurchaseItem_dailyLedgerId_idx" ON "LedgerPurchaseItem"("dailyLedgerId");

-- CreateIndex
CREATE INDEX "LedgerPurchaseItem_productId_idx" ON "LedgerPurchaseItem"("productId");

-- CreateIndex
CREATE INDEX "LedgerPurchaseItem_purchaseStandardId_idx" ON "LedgerPurchaseItem"("purchaseStandardId");

-- AddForeignKey
ALTER TABLE "LedgerPurchaseItem" ADD CONSTRAINT "LedgerPurchaseItem_dailyLedgerId_fkey" FOREIGN KEY ("dailyLedgerId") REFERENCES "DailyLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerPurchaseItem" ADD CONSTRAINT "LedgerPurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerPurchaseItem" ADD CONSTRAINT "LedgerPurchaseItem_purchaseStandardId_fkey" FOREIGN KEY ("purchaseStandardId") REFERENCES "PurchaseStandard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerPurchaseItem" ADD CONSTRAINT "LedgerPurchaseItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerPurchaseItem" ADD CONSTRAINT "LedgerPurchaseItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
