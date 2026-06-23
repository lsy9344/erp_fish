-- CreateTable
CREATE TABLE "LedgerInputCodeStoreAlias" (
    "id" TEXT NOT NULL,
    "ledgerInputCodeId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedgerInputCodeStoreAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerInputCodeStoreAlias_ledgerInputCodeId_storeId_key" ON "LedgerInputCodeStoreAlias"("ledgerInputCodeId", "storeId");

-- CreateIndex
CREATE INDEX "LedgerInputCodeStoreAlias_storeId_idx" ON "LedgerInputCodeStoreAlias"("storeId");

-- CreateIndex
CREATE INDEX "LedgerInputCodeStoreAlias_createdById_idx" ON "LedgerInputCodeStoreAlias"("createdById");

-- CreateIndex
CREATE INDEX "LedgerInputCodeStoreAlias_updatedById_idx" ON "LedgerInputCodeStoreAlias"("updatedById");

-- AddForeignKey
ALTER TABLE "LedgerInputCodeStoreAlias" ADD CONSTRAINT "LedgerInputCodeStoreAlias_ledgerInputCodeId_fkey" FOREIGN KEY ("ledgerInputCodeId") REFERENCES "LedgerInputCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerInputCodeStoreAlias" ADD CONSTRAINT "LedgerInputCodeStoreAlias_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerInputCodeStoreAlias" ADD CONSTRAINT "LedgerInputCodeStoreAlias_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerInputCodeStoreAlias" ADD CONSTRAINT "LedgerInputCodeStoreAlias_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
