ALTER TABLE "DailyLedger" ADD COLUMN "lossReviewedById" TEXT;
ALTER TABLE "DailyLedger" ADD COLUMN "lossReviewedAt" TIMESTAMP(3);

ALTER TABLE "DailyLedger" ADD CONSTRAINT "DailyLedger_lossReviewedById_fkey" FOREIGN KEY ("lossReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
