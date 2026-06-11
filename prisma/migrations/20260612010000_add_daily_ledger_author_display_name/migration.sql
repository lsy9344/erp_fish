-- Add display-only author name for the daily ledger flow.
ALTER TABLE "DailyLedger" ADD COLUMN "authorDisplayName" TEXT;
