-- AlterTable
ALTER TABLE "DailyLedger"
ADD COLUMN "submittedById" TEXT,
ADD COLUMN "submittedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DailyLedger_submittedById_idx" ON "DailyLedger"("submittedById");

-- AddForeignKey
ALTER TABLE "DailyLedger" ADD CONSTRAINT "DailyLedger_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
