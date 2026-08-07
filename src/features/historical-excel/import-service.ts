import { randomUUID } from "node:crypto";

import { PrismaClient, type Prisma } from "../../../generated/prisma/index.js";
import { writeAuditLog } from "../../server/audit.ts";
import {
  APPROVED_HISTORICAL_STORE_NAMES,
  type ParsedHistoricalWorkbook,
} from "./parser.ts";

const CHUNK_SIZE = 500;
const db = new PrismaClient();

export async function disconnectHistoricalImportDb() {
  await db.$disconnect();
}

function chunks<T>(values: T[], size = CHUNK_SIZE): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function requireOwnerImportActor(actorId: string) {
  const actor = await db.user.findFirst({
    where: {
      id: actorId,
      isActive: true,
      permissionProfiles: {
        some: { profile: { code: "OWNER", isActive: true } },
      },
    },
    select: { id: true },
  });
  if (!actor) {
    throw new Error("활성 OWNER 사용자의 actor id가 필요합니다.");
  }
  return actor;
}

export type HistoricalBatchResult = {
  id: string;
  fileHash: string;
  status: string;
  reused: boolean;
  rawRowCount: number;
  canonicalFactCount: number;
  roleCount: number;
  sourceNameCount: number;
};

const batchResultSelect = {
  id: true,
  fileHash: true,
  status: true,
  rawRowCount: true,
  canonicalFactCount: true,
  roleCount: true,
  sourceNameCount: true,
} as const;

type SelectedBatchResult = {
  id: string;
  fileHash: string;
  status: string;
  rawRowCount: number;
  canonicalFactCount: number;
  roleCount: number;
  sourceNameCount: number;
};

function reuseCompletedBatch(
  batch: SelectedBatchResult,
): HistoricalBatchResult {
  if (
    ["STAGED", "ACTIVE", "SUPERSEDED", "ROLLED_BACK"].includes(batch.status)
  ) {
    return { ...batch, reused: true };
  }

  throw new Error(
    `같은 hash의 미완료 batch ${batch.id}(${batch.status})가 있습니다. 원인을 확인한 뒤 별도 승인으로 정리해 주세요.`,
  );
}

export async function stageHistoricalWorkbook(
  parsed: ParsedHistoricalWorkbook,
  actorId: string,
): Promise<HistoricalBatchResult> {
  if (parsed.validationErrors.length > 0) {
    throw new Error(
      `승인 기준과 다른 workbook이라 stage를 중단했습니다: ${parsed.validationErrors.join("; ")}`,
    );
  }

  await requireOwnerImportActor(actorId);

  const existing = await db.historicalExcelImportBatch.findUnique({
    where: { fileHash: parsed.summary.fileHash },
    select: batchResultSelect,
  });
  if (existing) return reuseCompletedBatch(existing);

  // 정확히 일치하는 7개 지점만 연결한다. alias/fuzzy matching은 의도적으로 없다.
  const stores = await db.store.findMany({
    where: {
      name: { in: [...APPROVED_HISTORICAL_STORE_NAMES] },
      isActive: true,
    },
    select: { id: true, name: true },
  });
  const storeIdByName = new Map(stores.map((store) => [store.name, store.id]));
  const missingStoreNames = APPROVED_HISTORICAL_STORE_NAMES.filter(
    (name) => !storeIdByName.has(name),
  );
  if (missingStoreNames.length > 0) {
    throw new Error(
      `정확한 이름의 운영 지점이 없어 stage를 중단했습니다: ${missingStoreNames.join(", ")}`,
    );
  }

  const batchId = randomUUID();
  const rawIdByKey = new Map(
    parsed.rawRows.map((row) => [row.key, randomUUID()]),
  );
  const factIdByKey = new Map(
    parsed.dailyFacts.map((fact) => [fact.key, randomUUID()]),
  );
  const employeeIdByName = new Map(
    parsed.employees.map((employee) => [employee.originalName, randomUUID()]),
  );

  try {
    await db.historicalExcelImportBatch.create({
      data: {
        id: batchId,
        fileHash: parsed.summary.fileHash,
        sourceFileName: parsed.summary.sourceFileName,
        sourceFileSize: parsed.summary.sourceFileSize,
        sourceWorkbook: new Uint8Array(parsed.sourceWorkbook),
        status: "STAGING",
        sheetCount: parsed.summary.sheetCount,
        rawRowCount: parsed.summary.rawRowCount,
        canonicalFactCount: parsed.summary.canonicalFactCount,
        roleCount: parsed.summary.normalizedRoleCount,
        sourceNameCount: parsed.summary.sourceNameCount,
        duplicateStoreDateCount: parsed.summary.duplicateStoreDateCount,
        validationSummary: asInputJson(parsed.summary),
      },
    });

    for (const part of chunks(parsed.rawRows)) {
      await db.historicalExcelRawRow.createMany({
        data: part.map((row) => ({
          id: rawIdByKey.get(row.key)!,
          batchId,
          sheetIndex: row.sheetIndex,
          sheetName: row.sheetName,
          rowNumber: row.rowNumber,
          rawCells: asInputJson(row.rawCells),
        })),
      });
    }

    for (const part of chunks(parsed.dailyFacts)) {
      await db.historicalDailyFact.createMany({
        data: part.map((fact) => ({
          id: factIdByKey.get(fact.key)!,
          batchId,
          sourceRawRowId: rawIdByKey.get(fact.sourceRawRowKey)!,
          storeId: storeIdByName.get(fact.sourceStoreName)!,
          sourceStoreName: fact.sourceStoreName,
          businessDate: new Date(`${fact.businessDate}T00:00:00.000Z`),
          salesAmount: fact.salesAmount.value,
          grossProfit: fact.grossProfit.value,
          grossMarginRate: fact.grossMarginRate.value,
          sourceOperatingProfit: fact.sourceOperatingProfit.value,
          productivity: fact.productivity.value,
          workerCount: fact.workerCount.value,
          metricStatus: asInputJson({
            salesAmount: fact.salesAmount.status,
            grossProfit: fact.grossProfit.status,
            grossMarginRate: fact.grossMarginRate.status,
            sourceOperatingProfit: fact.sourceOperatingProfit.status,
            productivity: fact.productivity.status,
            workerCount: fact.workerCount.status,
          }),
        })),
      });
    }

    for (const part of chunks(parsed.employees)) {
      await db.historicalEmployee.createMany({
        data: part.map((employee) => ({
          id: employeeIdByName.get(employee.originalName)!,
          batchId,
          originalName: employee.originalName,
          reviewStatus: employee.reviewStatus,
          firstSeenWorkDate: new Date(
            `${employee.firstSeenWorkDate}T00:00:00.000Z`,
          ),
          lastSeenWorkDate: new Date(
            `${employee.lastSeenWorkDate}T00:00:00.000Z`,
          ),
          leadRoleCount: employee.leadRoleCount,
          memberRoleCount: employee.memberRoleCount,
          storeNames: asInputJson(employee.storeNames),
        })),
      });
    }

    for (const part of chunks(parsed.roles)) {
      await db.historicalEmployeeDailyRole.createMany({
        data: part.map((role) => ({
          id: randomUUID(),
          batchId,
          historicalEmployeeId: employeeIdByName.get(role.originalName)!,
          dailyFactId: factIdByKey.get(role.dailyFactKey)!,
          sourceRawRowId: rawIdByKey.get(role.sourceRawRowKey)!,
          businessDate: new Date(`${role.businessDate}T00:00:00.000Z`),
          storeId: storeIdByName.get(role.sourceStoreName)!,
          role: role.role,
          slotNumber: role.slotNumber,
          originalName: role.originalName,
        })),
      });
    }

    const [rawRowCount, canonicalFactCount, roleCount, sourceNameCount] =
      await Promise.all([
        db.historicalExcelRawRow.count({ where: { batchId } }),
        db.historicalDailyFact.count({ where: { batchId } }),
        db.historicalEmployeeDailyRole.count({ where: { batchId } }),
        db.historicalEmployee.count({ where: { batchId } }),
      ]);
    const actualCounts = {
      rawRowCount,
      canonicalFactCount,
      roleCount,
      sourceNameCount,
    };
    const expectedCounts = {
      rawRowCount: parsed.summary.rawRowCount,
      canonicalFactCount: parsed.summary.canonicalFactCount,
      roleCount: parsed.summary.normalizedRoleCount,
      sourceNameCount: parsed.summary.sourceNameCount,
    };
    if (
      Object.entries(expectedCounts).some(
        ([key, value]) =>
          actualCounts[key as keyof typeof actualCounts] !== value,
      )
    ) {
      throw new Error(
        `stage 행 수 검증에 실패했습니다: 기대 ${JSON.stringify(expectedCounts)}, 실제 ${JSON.stringify(actualCounts)}`,
      );
    }

    const staged = await db.$transaction(async (tx) => {
      const completed = await tx.historicalExcelImportBatch.update({
        where: { id: batchId },
        data: { status: "STAGED", stagedAt: new Date() },
        select: batchResultSelect,
      });
      await writeAuditLog(tx, {
        action: "historical_excel.staged",
        targetType: "HistoricalExcelImportBatch",
        targetId: batchId,
        actorId,
        before: { status: "STAGING" },
        after: {
          status: "STAGED",
          fileHash: parsed.summary.fileHash,
          rawRowCount,
          canonicalFactCount,
          roleCount,
          sourceNameCount,
        },
      });
      return completed;
    });
    return { ...staged, reused: false };
  } catch (error) {
    // 부분 chunk는 삭제하지 않는다. FAILED batch와 hash가 남아 재실행 시 행이 늘지 않고,
    // 운영자가 원인을 확인한 뒤 별도 승인으로 처리할 수 있다.
    await db.historicalExcelImportBatch
      .update({ where: { id: batchId }, data: { status: "FAILED" } })
      .catch(() => undefined);

    // 동일 hash의 동시 stage가 먼저 끝난 경우 기존 batch를 멱등 반환한다.
    const raced = await db.historicalExcelImportBatch.findUnique({
      where: { fileHash: parsed.summary.fileHash },
      select: batchResultSelect,
    });
    if (raced && raced.id !== batchId) return reuseCompletedBatch(raced);
    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "UNKNOWN";
    // Prisma createMany 오류 원문에는 전체 raw row가 포함될 수 있어 CLI/운영 로그에
    // 개인정보를 재출력하지 않는다. batch id와 안전한 코드만 남긴다.
    throw new Error(
      `과거 Excel stage가 실패해 batch ${batchId}를 FAILED로 표시했습니다. 오류 코드: ${errorCode}`,
    );
  }
}

export async function activateHistoricalBatch(
  requestedBatchId: string | undefined,
  actorId: string,
): Promise<HistoricalBatchResult> {
  await requireOwnerImportActor(actorId);
  return db.$transaction(
    async (tx) => {
      const target = requestedBatchId
        ? await tx.historicalExcelImportBatch.findUnique({
            where: { id: requestedBatchId },
            select: batchResultSelect,
          })
        : await tx.historicalExcelImportBatch.findFirst({
            where: { status: "STAGED" },
            orderBy: { stagedAt: "desc" },
            select: batchResultSelect,
          });
      if (!target) throw new Error("활성화할 STAGED batch가 없습니다.");
      if (target.status === "ACTIVE") return { ...target, reused: true };
      if (!["STAGED", "ROLLED_BACK", "SUPERSEDED"].includes(target.status)) {
        throw new Error(
          `batch ${target.id} 상태(${target.status})는 활성화할 수 없습니다.`,
        );
      }

      const current = await tx.historicalExcelImportBatch.findFirst({
        where: { status: "ACTIVE" },
        select: { id: true },
      });
      if (current && current.id !== target.id) {
        await tx.historicalExcelImportBatch.update({
          where: { id: current.id },
          data: { status: "SUPERSEDED", deactivatedAt: new Date() },
        });
      }
      const active = await tx.historicalExcelImportBatch.update({
        where: { id: target.id },
        data: {
          status: "ACTIVE",
          previousActiveBatchId:
            current && current.id !== target.id ? current.id : null,
          activatedAt: new Date(),
          deactivatedAt: null,
        },
        select: batchResultSelect,
      });
      await writeAuditLog(tx, {
        action: "historical_excel.activated",
        targetType: "HistoricalExcelImportBatch",
        targetId: target.id,
        actorId,
        before: { status: target.status },
        after: {
          status: "ACTIVE",
          previousActiveBatchId:
            current && current.id !== target.id ? current.id : null,
        },
      });
      return { ...active, reused: false };
    },
    { isolationLevel: "Serializable" },
  );
}

export async function rollbackHistoricalBatch(
  requestedBatchId: string | undefined,
  actorId: string,
): Promise<{
  rolledBackBatchId: string;
  restoredBatchId: string | null;
}> {
  await requireOwnerImportActor(actorId);
  return db.$transaction(
    async (tx) => {
      const active = await tx.historicalExcelImportBatch.findFirst({
        where: requestedBatchId
          ? { id: requestedBatchId, status: "ACTIVE" }
          : { status: "ACTIVE" },
        select: { id: true, previousActiveBatchId: true },
      });
      if (!active) throw new Error("rollback할 ACTIVE batch가 없습니다.");

      // partial unique active index를 지키기 위해 현재 노출을 먼저 내린 뒤 이전 노출을 복원한다.
      await tx.historicalExcelImportBatch.update({
        where: { id: active.id },
        data: { status: "ROLLED_BACK", deactivatedAt: new Date() },
      });

      let restoredBatchId: string | null = null;
      if (active.previousActiveBatchId) {
        const previous = await tx.historicalExcelImportBatch.findUnique({
          where: { id: active.previousActiveBatchId },
          select: { id: true, status: true },
        });
        if (previous && previous.status !== "FAILED") {
          await tx.historicalExcelImportBatch.update({
            where: { id: previous.id },
            data: { status: "ACTIVE", deactivatedAt: null },
          });
          restoredBatchId = previous.id;
        }
      }

      await writeAuditLog(tx, {
        action: "historical_excel.rolled_back",
        targetType: "HistoricalExcelImportBatch",
        targetId: active.id,
        actorId,
        before: { status: "ACTIVE" },
        after: { status: "ROLLED_BACK", restoredBatchId },
      });

      return { rolledBackBatchId: active.id, restoredBatchId };
    },
    { isolationLevel: "Serializable" },
  );
}
