-- CreateTable
CREATE TABLE "LedgerLaborItem" (
    "id" TEXT NOT NULL,
    "dailyLedgerId" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "lateMemo" TEXT,
    "earlyLeaveMemo" TEXT,
    "specialMemo" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerLaborItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerLaborItem_dailyLedgerId_idx" ON "LedgerLaborItem"("dailyLedgerId");

-- CreateIndex
CREATE INDEX "LedgerLaborItem_createdById_idx" ON "LedgerLaborItem"("createdById");

-- CreateIndex
CREATE INDEX "LedgerLaborItem_updatedById_idx" ON "LedgerLaborItem"("updatedById");

-- AddForeignKey
ALTER TABLE "LedgerLaborItem" ADD CONSTRAINT "LedgerLaborItem_dailyLedgerId_fkey" FOREIGN KEY ("dailyLedgerId") REFERENCES "DailyLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLaborItem" ADD CONSTRAINT "LedgerLaborItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerLaborItem" ADD CONSTRAINT "LedgerLaborItem_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
