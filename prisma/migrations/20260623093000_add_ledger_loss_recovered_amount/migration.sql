ALTER TABLE "LedgerLossItem" ADD COLUMN "recoveredAmount" INTEGER;

UPDATE "LedgerLossItem"
SET "recoveredAmount" = GREATEST(("unitPrice" * "quantity") - "amount", 0)
WHERE "recoveredAmount" IS NULL;

ALTER TABLE "LedgerLossItem" ALTER COLUMN "recoveredAmount" SET NOT NULL;
ALTER TABLE "LedgerLossItem" ALTER COLUMN "recoveredAmount" SET DEFAULT 0;
