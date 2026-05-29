-- AlterTable
ALTER TABLE "DailyLedger"
  ADD COLUMN "workerCount" INTEGER,
  ADD COLUMN "workMemo" TEXT;

-- CreateTable
CREATE TABLE "LedgerExpense" (
    "id" TEXT NOT NULL,
    "dailyLedgerId" TEXT NOT NULL,
    "ledgerInputCodeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "memo" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerExpense_dailyLedgerId_idx" ON "LedgerExpense"("dailyLedgerId");

CREATE INDEX "LedgerExpense_ledgerInputCodeId_idx" ON "LedgerExpense"("ledgerInputCodeId");

-- AddForeignKey
ALTER TABLE "LedgerExpense"
ADD CONSTRAINT "LedgerExpense_dailyLedgerId_fkey"
  FOREIGN KEY ("dailyLedgerId") REFERENCES "DailyLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerExpense"
ADD CONSTRAINT "LedgerExpense_ledgerInputCodeId_fkey"
  FOREIGN KEY ("ledgerInputCodeId") REFERENCES "LedgerInputCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerExpense"
ADD CONSTRAINT "LedgerExpense_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LedgerExpense"
ADD CONSTRAINT "LedgerExpense_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
