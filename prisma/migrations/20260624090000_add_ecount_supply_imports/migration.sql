-- WO(2026-06-24): 이카운트 출고/입고 업로드 전환.
-- 원본 보존(EcountImportBatch/EcountImportLine), 지점/품목 alias 매핑,
-- LedgerPurchaseItem에 원본 추적/장부 적용 단가 분리 필드를 추가한다.

-- AlterTable: LedgerPurchaseItem 원본 추적 + 적용 단가 분리 필드
ALTER TABLE "LedgerPurchaseItem"
    ADD COLUMN "ecountImportLineId" TEXT,
    ADD COLUMN "sourceUnitPrice" INTEGER,
    ADD COLUMN "unitPriceOverrideReason" TEXT,
    ADD COLUMN "unitPriceUpdatedById" TEXT,
    ADD COLUMN "unitPriceUpdatedAt" TIMESTAMP(3);

-- CreateTable: EcountImportBatch
CREATE TABLE "EcountImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "errorMessage" TEXT,
    "voidReason" TEXT,
    "uploadedById" TEXT NOT NULL,
    "committedById" TEXT,
    "voidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "EcountImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EcountImportLine
CREATE TABLE "EcountImportLine" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "dateNo" TEXT NOT NULL,
    "rawStoreName" TEXT NOT NULL,
    "storeId" TEXT,
    "rawProductName" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "productCategory" TEXT NOT NULL,
    "productSpec" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "supplyAmount" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "errorMessage" TEXT,
    "ledgerPurchaseItemId" TEXT,

    CONSTRAINT "EcountImportLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StoreExternalAlias
CREATE TABLE "StoreExternalAlias" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ECOUNT',
    "rawName" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "StoreExternalAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProductExternalAlias
CREATE TABLE "ProductExternalAlias" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ECOUNT',
    "rawName" TEXT NOT NULL,
    "rawSpec" TEXT NOT NULL DEFAULT '',
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ProductExternalAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LedgerPurchaseItem_ecountImportLineId_key" ON "LedgerPurchaseItem"("ecountImportLineId");
CREATE INDEX "LedgerPurchaseItem_unitPriceUpdatedById_idx" ON "LedgerPurchaseItem"("unitPriceUpdatedById");

CREATE UNIQUE INDEX "EcountImportBatch_fileHash_key" ON "EcountImportBatch"("fileHash");
CREATE INDEX "EcountImportBatch_createdAt_idx" ON "EcountImportBatch"("createdAt");
CREATE INDEX "EcountImportBatch_status_idx" ON "EcountImportBatch"("status");
CREATE INDEX "EcountImportBatch_uploadedById_idx" ON "EcountImportBatch"("uploadedById");

CREATE UNIQUE INDEX "EcountImportLine_batchId_rowNumber_key" ON "EcountImportLine"("batchId", "rowNumber");
CREATE INDEX "EcountImportLine_storeId_idx" ON "EcountImportLine"("storeId");
CREATE INDEX "EcountImportLine_productId_idx" ON "EcountImportLine"("productId");
CREATE INDEX "EcountImportLine_status_idx" ON "EcountImportLine"("status");

CREATE UNIQUE INDEX "StoreExternalAlias_provider_rawName_key" ON "StoreExternalAlias"("provider", "rawName");
CREATE INDEX "StoreExternalAlias_storeId_idx" ON "StoreExternalAlias"("storeId");
CREATE INDEX "StoreExternalAlias_updatedById_idx" ON "StoreExternalAlias"("updatedById");

CREATE UNIQUE INDEX "ProductExternalAlias_provider_rawName_rawSpec_key" ON "ProductExternalAlias"("provider", "rawName", "rawSpec");
CREATE INDEX "ProductExternalAlias_productId_idx" ON "ProductExternalAlias"("productId");
CREATE INDEX "ProductExternalAlias_updatedById_idx" ON "ProductExternalAlias"("updatedById");

-- AddForeignKey
ALTER TABLE "LedgerPurchaseItem" ADD CONSTRAINT "LedgerPurchaseItem_ecountImportLineId_fkey" FOREIGN KEY ("ecountImportLineId") REFERENCES "EcountImportLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedgerPurchaseItem" ADD CONSTRAINT "LedgerPurchaseItem_unitPriceUpdatedById_fkey" FOREIGN KEY ("unitPriceUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EcountImportBatch" ADD CONSTRAINT "EcountImportBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EcountImportBatch" ADD CONSTRAINT "EcountImportBatch_committedById_fkey" FOREIGN KEY ("committedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EcountImportBatch" ADD CONSTRAINT "EcountImportBatch_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EcountImportLine" ADD CONSTRAINT "EcountImportLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "EcountImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EcountImportLine" ADD CONSTRAINT "EcountImportLine_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EcountImportLine" ADD CONSTRAINT "EcountImportLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StoreExternalAlias" ADD CONSTRAINT "StoreExternalAlias_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreExternalAlias" ADD CONSTRAINT "StoreExternalAlias_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProductExternalAlias" ADD CONSTRAINT "ProductExternalAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductExternalAlias" ADD CONSTRAINT "ProductExternalAlias_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
