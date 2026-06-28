-- WO-13(2026-06-28): 품목군(category)별 장기재고 기준일 설정.
CREATE TABLE "LongStockThresholdSetting" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "thresholdDays" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LongStockThresholdSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LongStockThresholdSetting_category_key" ON "LongStockThresholdSetting"("category");

CREATE INDEX "LongStockThresholdSetting_isActive_idx" ON "LongStockThresholdSetting"("isActive");

CREATE INDEX "LongStockThresholdSetting_updatedById_idx" ON "LongStockThresholdSetting"("updatedById");

ALTER TABLE "LongStockThresholdSetting" ADD CONSTRAINT "LongStockThresholdSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
