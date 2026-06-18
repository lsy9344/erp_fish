ALTER TABLE "AnomalyThresholdSetting"
  ADD COLUMN "marginRateBps" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AnomalyThresholdSetting"
  ALTER COLUMN "marginRateBps" DROP DEFAULT;

ALTER TABLE "AnomalyThresholdSetting"
  DROP COLUMN "salesDropRateBps",
  DROP COLUMN "grossMarginDropBps",
  DROP COLUMN "salesDifferenceAmount",
  DROP COLUMN "lossAmount";
