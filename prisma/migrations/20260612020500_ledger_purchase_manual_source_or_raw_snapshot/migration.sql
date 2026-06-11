CREATE TYPE "LedgerPurchaseSource" AS ENUM ('MANUAL');

ALTER TABLE "LedgerPurchaseItem"
  ADD COLUMN "sourceType" "LedgerPurchaseSource" NOT NULL DEFAULT 'MANUAL',
  ALTER COLUMN "productId" DROP NOT NULL;

CREATE INDEX "LedgerPurchaseItem_sourceType_idx" ON "LedgerPurchaseItem"("sourceType");
