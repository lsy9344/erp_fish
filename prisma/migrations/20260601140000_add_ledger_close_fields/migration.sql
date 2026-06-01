-- AlterTable
ALTER TABLE "DailyLedger" ADD COLUMN "closedById" TEXT;

ALTER TABLE "DailyLedger" ADD COLUMN "closedAt" TIMESTAMP(3);

CREATE INDEX "DailyLedger_closedById_idx" ON "DailyLedger"("closedById");

ALTER TABLE "DailyLedger"
ADD CONSTRAINT "DailyLedger_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;