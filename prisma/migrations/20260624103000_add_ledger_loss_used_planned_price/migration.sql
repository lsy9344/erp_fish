-- Store whether each loss amount was calculated from the store manager's sales price plan.
ALTER TABLE "LedgerLossItem"
ADD COLUMN "usedPlannedPrice" BOOLEAN NOT NULL DEFAULT false;
