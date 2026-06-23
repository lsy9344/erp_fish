-- WO-G(2026-06-22): FIFO lot의 실제 영업 기준일을 보존한다.
-- 장기 체화 재고 판정이 데이터 입력 시각(createdAt)이 아니라 영업일을 기준으로 동작하도록 한다.

-- AlterTable
ALTER TABLE "LedgerInventoryFifoLot" ADD COLUMN "sourceBusinessDate" TIMESTAMP(3);

-- Backfill: 기존 lot은 매입 행의 영업 기준일(매입 장부의 closingDate)을 우선 사용하고,
-- 매입 행이 없는 이월/기초/legacy lot은 자신이 속한 장부의 closingDate로 보정한다.
UPDATE "LedgerInventoryFifoLot" AS lot
SET "sourceBusinessDate" = purchaseLedger."closingDate"
FROM "LedgerPurchaseItem" AS purchaseItem
JOIN "DailyLedger" AS purchaseLedger
  ON purchaseLedger."id" = purchaseItem."dailyLedgerId"
WHERE lot."sourcePurchaseItemId" = purchaseItem."id";

UPDATE "LedgerInventoryFifoLot" AS lot
SET "sourceBusinessDate" = ledger."closingDate"
FROM "DailyLedger" AS ledger
WHERE lot."dailyLedgerId" = ledger."id"
  AND lot."sourceBusinessDate" IS NULL;

-- CreateIndex
CREATE INDEX "LedgerInventoryFifoLot_sourceBusinessDate_idx" ON "LedgerInventoryFifoLot"("sourceBusinessDate");
