-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "dailyWage" INTEGER,
ADD COLUMN     "desiredCashAmount" INTEGER,
ADD COLUMN     "desiredInsuranceAmount" INTEGER;

-- AlterTable
ALTER TABLE "LedgerInventoryCarryoverDetail" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "DailyLedger_storeId_closingDate_idx" ON "DailyLedger"("storeId", "closingDate");

-- RenameIndex
ALTER INDEX "CorrectionRecord_dailyLedgerId_targetType_targetId_fieldKey_cre" RENAME TO "CorrectionRecord_dailyLedgerId_targetType_targetId_fieldKey_idx";
