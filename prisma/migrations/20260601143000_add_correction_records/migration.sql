-- CreateEnum
CREATE TYPE "CorrectionTargetType" AS ENUM (
  'LEDGER_FIELD',
  'PAYMENT_FIELD',
  'EXPENSE_ROW',
  'PURCHASE_ROW',
  'INVENTORY_ROW',
  'LOSS_ROW',
  'CALCULATED_METRIC'
);

-- CreateTable
CREATE TABLE "CorrectionRecord" (
  "id" TEXT NOT NULL,
  "dailyLedgerId" TEXT NOT NULL,
  "targetType" "CorrectionTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "fieldKey" TEXT NOT NULL,
  "originalValue" JSONB NOT NULL,
  "previousAppliedValue" JSONB NOT NULL,
  "correctedValue" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CorrectionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorrectionRecord_dailyLedgerId_idx" ON "CorrectionRecord"("dailyLedgerId");

-- CreateIndex
CREATE INDEX "CorrectionRecord_createdById_idx" ON "CorrectionRecord"("createdById");

-- CreateIndex
CREATE INDEX "CorrectionRecord_createdAt_idx" ON "CorrectionRecord"("createdAt");

-- CreateIndex
CREATE INDEX "CorrectionRecord_dailyLedgerId_targetType_targetId_fieldKey_createdAt_idx" ON "CorrectionRecord"("dailyLedgerId", "targetType", "targetId", "fieldKey", "createdAt");

-- AddForeignKey
ALTER TABLE "CorrectionRecord" ADD CONSTRAINT "CorrectionRecord_dailyLedgerId_fkey" FOREIGN KEY ("dailyLedgerId") REFERENCES "DailyLedger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectionRecord" ADD CONSTRAINT "CorrectionRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
