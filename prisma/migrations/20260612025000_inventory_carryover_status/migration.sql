-- Extend inventory carryover source to represent the latest saved ledger even
-- when headquarters has not closed it yet.
ALTER TYPE "InventoryCarryoverSource" ADD VALUE 'PREVIOUS_SAVED_LEDGER';

CREATE TYPE "InventoryCarryoverStatus" AS ENUM (
  'PREVIOUS_CARRYOVER',
  'REVIEW_REQUIRED',
  'CARRYOVER_EMPTY',
  'CARRYOVER_RECHECK_REQUIRED',
  'OPENING_CARRYOVER',
  'DATA_INSUFFICIENT',
  'POLICY_UNCONFIRMED'
);

ALTER TABLE "LedgerInventoryItem"
  ADD COLUMN "carryoverStatus" "InventoryCarryoverStatus" NOT NULL DEFAULT 'DATA_INSUFFICIENT';

UPDATE "LedgerInventoryItem"
SET "carryoverStatus" = CASE
  WHEN "carryoverSource" = 'OPENING_SNAPSHOT' THEN 'OPENING_CARRYOVER'::"InventoryCarryoverStatus"
  WHEN "carryoverSource" = 'PREVIOUS_CLOSED_LEDGER' THEN 'PREVIOUS_CARRYOVER'::"InventoryCarryoverStatus"
  ELSE 'CARRYOVER_EMPTY'::"InventoryCarryoverStatus"
END;
