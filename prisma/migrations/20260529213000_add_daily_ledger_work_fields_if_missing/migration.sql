-- AlterTable
ALTER TABLE "DailyLedger"
  ADD COLUMN IF NOT EXISTS "workerCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "workMemo" TEXT;
