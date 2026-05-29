-- CreateEnum
CREATE TYPE "LedgerInputCodeGroup" AS ENUM ('PAYMENT_METHOD', 'EXPENSE_ITEM', 'LOSS_TYPE');

-- CreateTable
CREATE TABLE "LedgerInputCode" (
    "id" TEXT NOT NULL,
    "group" "LedgerInputCodeGroup" NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "LedgerInputCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerInputCode_group_name_key" ON "LedgerInputCode"("group", "name");

-- CreateIndex
CREATE INDEX "LedgerInputCode_group_displayOrder_idx" ON "LedgerInputCode"("group", "displayOrder");

-- CreateIndex
CREATE INDEX "LedgerInputCode_isActive_idx" ON "LedgerInputCode"("isActive");

-- CreateIndex
CREATE INDEX "LedgerInputCode_updatedById_idx" ON "LedgerInputCode"("updatedById");

-- AddForeignKey
ALTER TABLE "LedgerInputCode" ADD CONSTRAINT "LedgerInputCode_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
