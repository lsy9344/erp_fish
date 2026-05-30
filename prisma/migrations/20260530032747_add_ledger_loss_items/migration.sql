-- CreateTable
CREATE TABLE "LedgerLossItem" (
    "id" TEXT NOT NULL,
    "dailyLedgerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "ledgerInputCodeId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL,
    "productSpec" TEXT NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "lossTypeName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerLossItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerLossItem_dailyLedgerId_idx" ON "LedgerLossItem"("dailyLedgerId");

-- CreateIndex
CREATE INDEX "LedgerLossItem_productId_idx" ON "LedgerLossItem"("productId");

-- CreateIndex
CREATE INDEX "LedgerLossItem_ledgerInputCodeId_idx" ON "LedgerLossItem"("ledgerInputCodeId");

-- CreateIndex
CREATE INDEX "LedgerLossItem_createdById_idx" ON "LedgerLossItem"("createdById");

-- CreateIndex
CREATE INDEX "LedgerLossItem_updatedById_idx" ON "LedgerLossItem"("updatedById");

-- AddForeignKey
ALTER TABLE "LedgerLossItem" ADD CONSTRAINT "LedgerLossItem_dailyLedgerId_fkey" FOREIGN KEY ("dailyLedgerId") REFERENCES "DailyLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLossItem" ADD CONSTRAINT "LedgerLossItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLossItem" ADD CONSTRAINT "LedgerLossItem_ledgerInputCodeId_fkey" FOREIGN KEY ("ledgerInputCodeId") REFERENCES "LedgerInputCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLossItem" ADD CONSTRAINT "LedgerLossItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLossItem" ADD CONSTRAINT "LedgerLossItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
