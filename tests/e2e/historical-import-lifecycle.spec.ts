import { expect, test } from "@playwright/test";
import { PrismaClient } from "../../generated/prisma/index.js";
import {
  activateHistoricalBatch,
  disconnectHistoricalImportDb,
  rollbackHistoricalBatch,
  stageHistoricalWorkbook,
} from "../../src/features/historical-excel/import-service.ts";
import {
  APPROVED_HISTORICAL_STORE_NAMES,
  type ParsedHistoricalWorkbook,
} from "../../src/features/historical-excel/parser.ts";

const prisma = new PrismaClient();
const firstBatchId = "e2e-history-life-1";
const secondBatchId = "e2e-history-life-2";
const stagedHash = "e2e-history-stage-idempotent-hash";
const fixedBatchIds = [firstBatchId, secondBatchId];
const storeIdPrefix = "e2e-history-approved-store-";

async function getOwnerId() {
  const owner = await prisma.user.findUnique({
    where: { email: "owner@example.com" },
    select: { id: true },
  });
  if (!owner) throw new Error("E2E OWNER fixture가 없습니다.");
  return owner.id;
}

async function cleanup() {
  const actorId = await getOwnerId();
  let owned = await prisma.historicalExcelImportBatch.findMany({
    where: {
      OR: [{ id: { in: fixedBatchIds } }, { fileHash: stagedHash }],
    },
    select: { id: true, status: true },
  });

  // 중단된 테스트가 ACTIVE를 남겨도 이전 외부 batch를 먼저 복원한다.
  while (owned.some((batch) => batch.status === "ACTIVE")) {
    const active = owned.find((batch) => batch.status === "ACTIVE")!;
    await rollbackHistoricalBatch(active.id, actorId);
    owned = await prisma.historicalExcelImportBatch.findMany({
      where: { id: { in: owned.map((batch) => batch.id) } },
      select: { id: true, status: true },
    });
  }

  const batchIds = owned.map((batch) => batch.id);
  if (batchIds.length > 0) {
    await prisma.historicalEmployeeDailyRole.deleteMany({
      where: { batchId: { in: batchIds } },
    });
    await prisma.historicalEmployee.deleteMany({
      where: { batchId: { in: batchIds } },
    });
    await prisma.historicalDailyFact.deleteMany({
      where: { batchId: { in: batchIds } },
    });
    await prisma.historicalExcelRawRow.deleteMany({
      where: { batchId: { in: batchIds } },
    });
    await prisma.auditLog.deleteMany({
      where: {
        targetType: "HistoricalExcelImportBatch",
        targetId: { in: batchIds },
      },
    });
    await prisma.historicalExcelImportBatch.deleteMany({
      where: { id: { in: batchIds } },
    });
  }

  await prisma.store.deleteMany({
    where: { id: { startsWith: storeIdPrefix } },
  });
}

async function ensureApprovedStores() {
  for (const [index, name] of APPROVED_HISTORICAL_STORE_NAMES.entries()) {
    const existing = await prisma.store.findUnique({
      where: { name },
      select: { id: true },
    });
    if (!existing) {
      await prisma.store.create({
        data: {
          id: `${storeIdPrefix}${index + 1}`,
          name,
          isActive: true,
        },
      });
    }
  }
}

function batchData(id: string, hash: string) {
  return {
    id,
    fileHash: hash,
    sourceFileName: `${id}.xlsx`,
    sourceFileSize: 1,
    sourceWorkbook: new Uint8Array([1]),
    status: "STAGED",
    sheetCount: 10,
    rawRowCount: 1,
    canonicalFactCount: 0,
    roleCount: 0,
    sourceNameCount: 0,
    duplicateStoreDateCount: 0,
    validationSummary: { validation: "APPROVED" },
    stagedAt: new Date(),
  };
}

function parsedStageFixture(): ParsedHistoricalWorkbook {
  const date = "2020-01-01";
  const sourceStoreName = APPROVED_HISTORICAL_STORE_NAMES[0];
  return {
    sourceWorkbook: new Uint8Array([1, 2, 3]),
    summary: {
      fileHash: stagedHash,
      sourceFileName: "fixture.xlsx",
      sourceFileSize: 3,
      sheetCount: 10,
      sheetNames: [],
      rawRowCount: 1,
      canonicalFactCount: 1,
      normalizedRoleCount: 1,
      rawRoleCellCount: 1,
      sourceNameCount: 1,
      duplicateStoreDateCount: 0,
      ignoredInputRowCount: 0,
      unknownStoreNames: [],
      firstBusinessDate: date,
      lastBusinessDate: date,
    },
    rawRows: [
      {
        key: "1:2",
        sheetIndex: 1,
        sheetName: "입력",
        rowNumber: 2,
        rawCells: {
          cellCount: 1,
          hidden: false,
          height: null,
          outlineLevel: 0,
          values: [date],
          types: [3],
          numberFormats: [null],
          blankColumns: [],
          formulas: [],
        },
      },
    ],
    dailyFacts: [
      {
        key: `${sourceStoreName}|${date}`,
        sourceRawRowKey: "1:2",
        sourceStoreName,
        businessDate: date,
        salesAmount: { value: "100", status: "VALUE", original: 100 },
        grossProfit: { value: "30", status: "VALUE", original: 30 },
        grossMarginRate: { value: "0.3", status: "VALUE", original: 0.3 },
        sourceOperatingProfit: {
          value: "20",
          status: "VALUE",
          original: 20,
        },
        productivity: { value: "100", status: "VALUE", original: 100 },
        workerCount: { value: "1", status: "VALUE", original: 1 },
      },
    ],
    employees: [
      {
        originalName: "과거테스트",
        reviewStatus: "UNLINKED",
        firstSeenWorkDate: date,
        lastSeenWorkDate: date,
        leadRoleCount: 1,
        memberRoleCount: 0,
        storeNames: [sourceStoreName],
      },
    ],
    roles: [
      {
        sourceRawRowKey: "1:2",
        dailyFactKey: `${sourceStoreName}|${date}`,
        sourceStoreName,
        businessDate: date,
        role: "LEAD",
        slotNumber: 1,
        originalName: "과거테스트",
      },
    ],
    validationErrors: [],
  };
}

test.beforeEach(cleanup);

test.afterAll(async () => {
  await cleanup();
  await Promise.all([prisma.$disconnect(), disconnectHistoricalImportDb()]);
});

test("same staged workbook is idempotent and preserves operational rows", async () => {
  await ensureApprovedStores();
  const actorId = await getOwnerId();
  const operationalBefore = {
    ledgers: await prisma.dailyLedger.count(),
    labor: await prisma.ledgerLaborItem.count(),
    employees: await prisma.employee.count(),
  };

  const first = await stageHistoricalWorkbook(parsedStageFixture(), actorId);
  const second = await stageHistoricalWorkbook(parsedStageFixture(), actorId);

  expect(first.reused).toBe(false);
  expect(second).toMatchObject({
    id: first.id,
    reused: true,
    status: "STAGED",
  });
  expect(
    await prisma.historicalExcelRawRow.count({ where: { batchId: first.id } }),
  ).toBe(1);
  expect(
    await prisma.historicalDailyFact.count({ where: { batchId: first.id } }),
  ).toBe(1);
  expect(
    await prisma.historicalEmployeeDailyRole.count({
      where: { batchId: first.id },
    }),
  ).toBe(1);
  expect(
    await prisma.auditLog.count({
      where: { action: "historical_excel.staged", targetId: first.id },
    }),
  ).toBe(1);
  expect({
    ledgers: await prisma.dailyLedger.count(),
    labor: await prisma.ledgerLaborItem.count(),
    employees: await prisma.employee.count(),
  }).toEqual(operationalBefore);
});

test("historical batch activation is single-active and rollback restores exposure without deleting raw", async () => {
  const actorId = await getOwnerId();
  await prisma.historicalExcelImportBatch.create({
    data: batchData(firstBatchId, "e2e-history-life-hash-1"),
  });
  await prisma.historicalExcelRawRow.create({
    data: {
      id: "e2e-history-life-raw",
      batchId: firstBatchId,
      sheetIndex: 1,
      sheetName: "입력",
      rowNumber: 1,
      rawCells: { values: ["원본"] },
    },
  });

  const first = await activateHistoricalBatch(firstBatchId, actorId);
  expect(first.status).toBe("ACTIVE");
  const same = await activateHistoricalBatch(firstBatchId, actorId);
  expect(same.reused).toBe(true);

  await prisma.historicalExcelImportBatch.create({
    data: batchData(secondBatchId, "e2e-history-life-hash-2"),
  });
  const second = await activateHistoricalBatch(secondBatchId, actorId);
  expect(second.status).toBe("ACTIVE");
  expect(
    await prisma.historicalExcelImportBatch.count({
      where: { status: "ACTIVE" },
    }),
  ).toBe(1);

  const rolledBack = await rollbackHistoricalBatch(secondBatchId, actorId);
  expect(rolledBack).toEqual({
    rolledBackBatchId: secondBatchId,
    restoredBatchId: firstBatchId,
  });
  expect(
    await prisma.historicalExcelImportBatch.findUnique({
      where: { id: firstBatchId },
      select: { status: true },
    }),
  ).toEqual({ status: "ACTIVE" });
  expect(
    await prisma.historicalExcelRawRow.count({
      where: { batchId: firstBatchId },
    }),
  ).toBe(1);

  // 첫 batch가 활성화되기 전의 외부 상태까지 복원해 다른 테스트를 훼손하지 않는다.
  await rollbackHistoricalBatch(firstBatchId, actorId);
  expect(
    await prisma.auditLog.count({
      where: {
        targetId: { in: fixedBatchIds },
        action: {
          in: ["historical_excel.activated", "historical_excel.rolled_back"],
        },
      },
    }),
  ).toBeGreaterThanOrEqual(4);
});
