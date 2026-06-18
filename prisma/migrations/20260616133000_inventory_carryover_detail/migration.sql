-- Persist the source details used by the previous-stock popup.
CREATE TABLE "LedgerInventoryCarryoverDetail" (
    "id" TEXT NOT NULL,
    "ledgerInventoryItemId" TEXT NOT NULL,
    "source" "InventoryCarryoverSource" NOT NULL,
    "status" "InventoryCarryoverStatus" NOT NULL,
    "resolvedQuantity" INTEGER NOT NULL,
    "sourceLedgerId" TEXT,
    "sourceLedgerClosingDate" TIMESTAMP(3),
    "sourceLedgerStatus" "DailyLedgerStatus",
    "sourceYearMonth" TEXT,
    "sourceSnapshotId" TEXT,
    "sourcePreviousQuantity" INTEGER,
    "sourcePurchasedQuantity" INTEGER,
    "sourceLossQuantity" INTEGER,
    "sourceCurrentQuantity" INTEGER,
    "sourceQuantity" INTEGER,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerInventoryCarryoverDetail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LedgerInventoryCarryoverDetail_ledgerInventoryItemId_key" ON "LedgerInventoryCarryoverDetail"("ledgerInventoryItemId");
CREATE INDEX "LedgerInventoryCarryoverDetail_sourceLedgerId_idx" ON "LedgerInventoryCarryoverDetail"("sourceLedgerId");
CREATE INDEX "LedgerInventoryCarryoverDetail_sourceSnapshotId_idx" ON "LedgerInventoryCarryoverDetail"("sourceSnapshotId");
CREATE INDEX "LedgerInventoryCarryoverDetail_source_status_idx" ON "LedgerInventoryCarryoverDetail"("source", "status");

ALTER TABLE "LedgerInventoryCarryoverDetail"
  ADD CONSTRAINT "LedgerInventoryCarryoverDetail_ledgerInventoryItemId_fkey"
  FOREIGN KEY ("ledgerInventoryItemId") REFERENCES "LedgerInventoryItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "LedgerInventoryCarryoverDetail" (
  "id",
  "ledgerInventoryItemId",
  "source",
  "status",
  "resolvedQuantity",
  "sourceLedgerId",
  "sourceLedgerClosingDate",
  "sourceLedgerStatus",
  "sourceYearMonth",
  "sourceSnapshotId",
  "sourcePreviousQuantity",
  "sourcePurchasedQuantity",
  "sourceLossQuantity",
  "sourceCurrentQuantity",
  "sourceQuantity",
  "message",
  "createdAt",
  "updatedAt"
)
SELECT
  'carryover_' || item."id",
  item."id",
  item."carryoverSource",
  item."carryoverStatus",
  item."previousQuantity",
  item."carryoverLedgerId",
  source_ledger."closingDate",
  source_ledger."status",
  CASE
    WHEN item."carryoverSource" = 'OPENING_SNAPSHOT' THEN snapshot."yearMonth"
    ELSE NULL
  END,
  snapshot."id",
  COALESCE(source_item."previousQuantity", CASE WHEN item."carryoverSource" = 'OPENING_SNAPSHOT' THEN snapshot."quantity" ELSE NULL END),
  source_item."purchasedQuantity",
  source_loss."quantity",
  source_item."currentQuantity",
  COALESCE(source_item."quantity", CASE WHEN item."carryoverSource" = 'OPENING_SNAPSHOT' THEN snapshot."quantity" ELSE NULL END),
  CASE
    WHEN item."carryoverStatus" = 'PREVIOUS_CARRYOVER' THEN '직전 본사 마감 장부의 당일재고 후보입니다.'
    WHEN item."carryoverStatus" = 'REVIEW_REQUIRED' THEN '직전 저장 장부의 당일재고 후보입니다. 본사 마감 전 값이므로 확인이 필요합니다.'
    WHEN item."carryoverStatus" = 'OPENING_CARRYOVER' THEN '월초 재고 스냅샷에서 넘어온 품목입니다.'
    WHEN item."carryoverStatus" = 'CARRYOVER_RECHECK_REQUIRED' THEN '마감 또는 정정으로 이월 기준이 바뀔 수 있습니다. 기존 입력값은 자동으로 덮어쓰지 않습니다.'
    WHEN item."carryoverStatus" = 'CARRYOVER_EMPTY' THEN '전일 장부나 이월 근거가 부족합니다. 표시된 값은 확인이 필요한 후보입니다.'
    WHEN item."carryoverStatus" = 'POLICY_UNCONFIRMED' THEN '기준 확인 필요 상태입니다.'
    ELSE '이월 기준 데이터가 부족합니다.'
  END,
  item."createdAt",
  item."updatedAt"
FROM "LedgerInventoryItem" item
JOIN "DailyLedger" ledger ON ledger."id" = item."dailyLedgerId"
LEFT JOIN "DailyLedger" source_ledger ON source_ledger."id" = item."carryoverLedgerId"
LEFT JOIN "LedgerInventoryItem" source_item
  ON source_item."dailyLedgerId" = item."carryoverLedgerId"
  AND source_item."productId" = item."productId"
LEFT JOIN (
  SELECT "dailyLedgerId", "productId", SUM("quantity")::INTEGER AS "quantity"
  FROM "LedgerLossItem"
  GROUP BY "dailyLedgerId", "productId"
) source_loss
  ON source_loss."dailyLedgerId" = item."carryoverLedgerId"
  AND source_loss."productId" = item."productId"
LEFT JOIN "InventoryOpeningSnapshot" snapshot
  ON item."carryoverSource" = 'OPENING_SNAPSHOT'
  AND snapshot."storeId" = ledger."storeId"
  AND snapshot."productId" = item."productId"
  AND snapshot."yearMonth" = to_char(ledger."closingDate", 'YYYY-MM');
