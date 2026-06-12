ALTER TABLE "AnomalyThresholdSetting"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "AnomalyThresholdSetting_isActive_idx" ON "AnomalyThresholdSetting"("isActive");
