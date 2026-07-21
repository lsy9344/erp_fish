ALTER TABLE "Store"
  ADD COLUMN "reportMarginGapThresholdBps" INTEGER NOT NULL DEFAULT 150;

ALTER TABLE "Store"
  ADD CONSTRAINT "Store_reportMarginGapThresholdBps_check"
  CHECK (
    "reportMarginGapThresholdBps" >= 1
    AND "reportMarginGapThresholdBps" <= 10000
  );
