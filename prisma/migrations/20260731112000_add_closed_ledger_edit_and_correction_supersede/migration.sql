-- AlterEnum
ALTER TYPE "PermissionAction" ADD VALUE IF NOT EXISTS 'LEDGER_CLOSED_EDIT';

-- AlterTable
ALTER TABLE "CorrectionRecord"
ADD COLUMN "supersededAt" TIMESTAMP(3),
ADD COLUMN "supersededById" TEXT,
ADD COLUMN "supersedeReason" TEXT;

-- CreateIndex
CREATE INDEX "CorrectionRecord_supersededById_idx" ON "CorrectionRecord"("supersededById");

-- CreateIndex
CREATE INDEX "CorrectionRecord_dailyLedgerId_supersededAt_idx" ON "CorrectionRecord"("dailyLedgerId", "supersededAt");

-- CreateIndex
CREATE INDEX "CorrectionRecord_active_target_createdAt_idx" ON "CorrectionRecord"("dailyLedgerId", "targetType", "targetId", "fieldKey", "supersededAt", "createdAt");

-- AddForeignKey
ALTER TABLE "CorrectionRecord" ADD CONSTRAINT "CorrectionRecord_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
