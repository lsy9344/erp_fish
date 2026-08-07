-- 승인된 고객 Excel의 원본/과거 실적/과거 직원 역할을 운영 장부와 분리해 추가한다.
-- DailyLedger, LedgerLaborItem, Employee의 기존 컬럼과 행은 변경하지 않는다.
CREATE TYPE "HistoricalEmployeeRole" AS ENUM ('LEAD', 'MEMBER');

CREATE TABLE "HistoricalExcelImportBatch" (
    "id" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "sourceFileName" TEXT NOT NULL,
    "sourceFileSize" INTEGER NOT NULL,
    "sourceWorkbook" BYTEA NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STAGING',
    "sheetCount" INTEGER NOT NULL,
    "rawRowCount" INTEGER NOT NULL,
    "canonicalFactCount" INTEGER NOT NULL,
    "roleCount" INTEGER NOT NULL,
    "sourceNameCount" INTEGER NOT NULL,
    "duplicateStoreDateCount" INTEGER NOT NULL,
    "validationSummary" JSONB NOT NULL,
    "previousActiveBatchId" TEXT,
    "stagedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HistoricalExcelImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HistoricalExcelRawRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sheetIndex" INTEGER NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawCells" JSONB NOT NULL,

    CONSTRAINT "HistoricalExcelRawRow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HistoricalDailyFact" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sourceRawRowId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sourceStoreName" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "salesAmount" DECIMAL(24,8),
    "grossProfit" DECIMAL(24,8),
    "grossMarginRate" DECIMAL(24,12),
    "sourceOperatingProfit" DECIMAL(24,8),
    "productivity" DECIMAL(24,8),
    "workerCount" DECIMAL(12,4),
    "metricStatus" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalDailyFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HistoricalEmployee" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'UNLINKED',
    "firstSeenWorkDate" TIMESTAMP(3) NOT NULL,
    "lastSeenWorkDate" TIMESTAMP(3) NOT NULL,
    "leadRoleCount" INTEGER NOT NULL DEFAULT 0,
    "memberRoleCount" INTEGER NOT NULL DEFAULT 0,
    "storeNames" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalEmployee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HistoricalEmployeeDailyRole" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "historicalEmployeeId" TEXT NOT NULL,
    "dailyFactId" TEXT NOT NULL,
    "sourceRawRowId" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,
    "role" "HistoricalEmployeeRole" NOT NULL,
    "slotNumber" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalEmployeeDailyRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HistoricalExcelImportBatch_fileHash_key" ON "HistoricalExcelImportBatch"("fileHash");
CREATE INDEX "HistoricalExcelImportBatch_status_idx" ON "HistoricalExcelImportBatch"("status");
CREATE INDEX "HistoricalExcelImportBatch_activatedAt_idx" ON "HistoricalExcelImportBatch"("activatedAt");
-- 동시에 활성 batch가 둘 생기지 않도록 activation transaction의 DB 불변식을 고정한다.
CREATE UNIQUE INDEX "HistoricalExcelImportBatch_single_active_key"
  ON "HistoricalExcelImportBatch"("status") WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "HistoricalExcelRawRow_batchId_sheetIndex_rowNumber_key" ON "HistoricalExcelRawRow"("batchId", "sheetIndex", "rowNumber");
CREATE UNIQUE INDEX "HistoricalExcelRawRow_id_batchId_key" ON "HistoricalExcelRawRow"("id", "batchId");
CREATE INDEX "HistoricalExcelRawRow_batchId_sheetName_idx" ON "HistoricalExcelRawRow"("batchId", "sheetName");

CREATE UNIQUE INDEX "HistoricalDailyFact_batchId_storeId_businessDate_key" ON "HistoricalDailyFact"("batchId", "storeId", "businessDate");
CREATE UNIQUE INDEX "HistoricalDailyFact_id_batchId_key" ON "HistoricalDailyFact"("id", "batchId");
CREATE INDEX "HistoricalDailyFact_batchId_businessDate_idx" ON "HistoricalDailyFact"("batchId", "businessDate");
CREATE INDEX "HistoricalDailyFact_storeId_businessDate_idx" ON "HistoricalDailyFact"("storeId", "businessDate");

CREATE UNIQUE INDEX "HistoricalEmployee_batchId_originalName_key" ON "HistoricalEmployee"("batchId", "originalName");
CREATE UNIQUE INDEX "HistoricalEmployee_id_batchId_key" ON "HistoricalEmployee"("id", "batchId");
CREATE INDEX "HistoricalEmployee_batchId_firstSeenWorkDate_idx" ON "HistoricalEmployee"("batchId", "firstSeenWorkDate");
CREATE INDEX "HistoricalEmployee_originalName_idx" ON "HistoricalEmployee"("originalName");

CREATE UNIQUE INDEX "HistoricalEmployeeDailyRole_batchId_sourceRawRowId_role_slotNumber_key" ON "HistoricalEmployeeDailyRole"("batchId", "sourceRawRowId", "role", "slotNumber");
CREATE INDEX "HistoricalEmployeeDailyRole_historicalEmployeeId_businessDate_idx" ON "HistoricalEmployeeDailyRole"("historicalEmployeeId", "businessDate");
CREATE INDEX "HistoricalEmployeeDailyRole_storeId_businessDate_idx" ON "HistoricalEmployeeDailyRole"("storeId", "businessDate");
CREATE INDEX "HistoricalEmployeeDailyRole_batchId_businessDate_idx" ON "HistoricalEmployeeDailyRole"("batchId", "businessDate");

ALTER TABLE "HistoricalExcelRawRow" ADD CONSTRAINT "HistoricalExcelRawRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "HistoricalExcelImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistoricalDailyFact" ADD CONSTRAINT "HistoricalDailyFact_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "HistoricalExcelImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistoricalDailyFact" ADD CONSTRAINT "HistoricalDailyFact_sourceRawRowId_batchId_fkey" FOREIGN KEY ("sourceRawRowId", "batchId") REFERENCES "HistoricalExcelRawRow"("id", "batchId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistoricalDailyFact" ADD CONSTRAINT "HistoricalDailyFact_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistoricalEmployee" ADD CONSTRAINT "HistoricalEmployee_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "HistoricalExcelImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistoricalEmployeeDailyRole" ADD CONSTRAINT "HistoricalEmployeeDailyRole_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "HistoricalExcelImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistoricalEmployeeDailyRole" ADD CONSTRAINT "HistoricalEmployeeDailyRole_historicalEmployeeId_batchId_fkey" FOREIGN KEY ("historicalEmployeeId", "batchId") REFERENCES "HistoricalEmployee"("id", "batchId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistoricalEmployeeDailyRole" ADD CONSTRAINT "HistoricalEmployeeDailyRole_dailyFactId_batchId_fkey" FOREIGN KEY ("dailyFactId", "batchId") REFERENCES "HistoricalDailyFact"("id", "batchId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistoricalEmployeeDailyRole" ADD CONSTRAINT "HistoricalEmployeeDailyRole_sourceRawRowId_batchId_fkey" FOREIGN KEY ("sourceRawRowId", "batchId") REFERENCES "HistoricalExcelRawRow"("id", "batchId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HistoricalEmployeeDailyRole" ADD CONSTRAINT "HistoricalEmployeeDailyRole_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
