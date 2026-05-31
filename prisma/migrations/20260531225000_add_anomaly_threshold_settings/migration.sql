CREATE TABLE "AnomalyThresholdSetting" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
  "salesDropRateBps" INTEGER NOT NULL,
  "grossMarginDropBps" INTEGER NOT NULL,
  "salesDifferenceAmount" INTEGER NOT NULL,
  "lossAmount" INTEGER NOT NULL,
  "inventoryDifferenceQuantity" INTEGER NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AnomalyThresholdSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnomalyThresholdSetting_scope_key" ON "AnomalyThresholdSetting"("scope");

CREATE INDEX "AnomalyThresholdSetting_updatedById_idx" ON "AnomalyThresholdSetting"("updatedById");

ALTER TABLE "AnomalyThresholdSetting" ADD CONSTRAINT "AnomalyThresholdSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnomalyThresholdSetting" ADD CONSTRAINT "AnomalyThresholdSetting_scope_check" CHECK ("scope" = 'GLOBAL');
