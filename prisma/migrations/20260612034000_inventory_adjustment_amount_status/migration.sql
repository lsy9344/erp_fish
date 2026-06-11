-- CreateEnum
CREATE TYPE "InventoryAdjustmentAmountStatus" AS ENUM ('POLICY_UNCONFIRMED', 'CONFIRMED');

-- AlterTable
ALTER TABLE "LedgerInventoryAdjustment"
ADD COLUMN "amountStatus" "InventoryAdjustmentAmountStatus" NOT NULL DEFAULT 'POLICY_UNCONFIRMED';
