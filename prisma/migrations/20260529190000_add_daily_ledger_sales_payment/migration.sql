-- CreateEnum
CREATE TYPE "DailyLedgerStatus" AS ENUM ('IN_PROGRESS', 'IN_REVIEW', 'HEADQUARTERS_CLOSED', 'HOLIDAY');

-- CreateTable
CREATE TABLE "DailyLedger" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "closingDate" TIMESTAMP(3) NOT NULL,
    "status" "DailyLedgerStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "totalSalesAmount" INTEGER NOT NULL DEFAULT 0,
    "cashAmount" INTEGER NOT NULL DEFAULT 0,
    "cardAmount" INTEGER NOT NULL DEFAULT 0,
    "otherPaymentAmount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dailyLedger_storeId_closingDate_key" ON "DailyLedger"("storeId", "closingDate");

-- CreateIndex
CREATE INDEX "DailyLedger_status_idx" ON "DailyLedger"("status");

-- AddForeignKey
ALTER TABLE "DailyLedger"
ADD CONSTRAINT "DailyLedger_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DailyLedger"
ADD CONSTRAINT "DailyLedger_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DailyLedger"
ADD CONSTRAINT "DailyLedger_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
