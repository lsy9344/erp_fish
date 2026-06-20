WITH ranked AS (
  SELECT
    id,
    "productId",
    FIRST_VALUE(id) OVER (
      PARTITION BY "productId"
      ORDER BY "isActive" DESC, "updatedAt" DESC, id DESC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY "productId"
      ORDER BY "isActive" DESC, "updatedAt" DESC, id DESC
    ) AS row_number
  FROM "PurchaseStandard"
)
UPDATE "LedgerPurchaseItem"
SET "purchaseStandardId" = ranked.keep_id
FROM ranked
WHERE "LedgerPurchaseItem"."purchaseStandardId" = ranked.id
  AND ranked.row_number > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "productId"
      ORDER BY "isActive" DESC, "updatedAt" DESC, id DESC
    ) AS row_number
  FROM "PurchaseStandard"
)
DELETE FROM "PurchaseStandard"
USING ranked
WHERE "PurchaseStandard".id = ranked.id
  AND ranked.row_number > 1;

DROP INDEX IF EXISTS "PurchaseStandard_productId_idx";

CREATE UNIQUE INDEX "PurchaseStandard_productId_key" ON "PurchaseStandard"("productId");
