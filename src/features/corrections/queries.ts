import type {
  CorrectionTargetType,
  Prisma,
} from "../../../generated/prisma/index.js";
import { UserRole } from "../../../generated/prisma/index.js";
import { redirect } from "next/navigation";

import {
  getHeadquartersStoreScope,
  requireAppUser,
  requireHeadquartersLedgerScope,
  requireReportAccess,
} from "../../server/authz.ts";
import { db } from "../../server/db.ts";
import type {
  CorrectionAppliedValue,
  CorrectionRecordListItem,
} from "./types.ts";
import { correctionTargetTypeLabels } from "./types.ts";

type CorrectionTargetIdentity = {
  dailyLedgerId: string;
  targetType: CorrectionTargetType;
  targetId: string;
  fieldKey: string;
};

const correctionRecordSelect = {
  id: true,
  dailyLedgerId: true,
  targetType: true,
  targetId: true,
  fieldKey: true,
  originalValue: true,
  previousAppliedValue: true,
  correctedValue: true,
  reason: true,
  createdAt: true,
  createdBy: {
    select: {
      name: true,
      email: true,
    },
  },
} as const;

type CorrectionRecordPayload = Prisma.CorrectionRecordGetPayload<{
  select: typeof correctionRecordSelect;
}>;

export function buildCorrectionTargetKey(input: CorrectionTargetIdentity) {
  return [
    input.dailyLedgerId,
    input.targetType,
    input.targetId,
    input.fieldKey,
  ].join(":");
}

export function formatCorrectionTargetLabel(input: {
  targetType: CorrectionTargetType;
  fieldKey: string;
  originalValue?: Prisma.JsonValue;
  correctedValue?: Prisma.JsonValue;
}) {
  const valueLabel =
    getCorrectionValueLabel(input.correctedValue) ??
    getCorrectionValueLabel(input.originalValue);

  if (valueLabel) {
    return valueLabel;
  }

  return `${correctionTargetTypeLabels[input.targetType]} · ${input.fieldKey}`;
}

function getCorrectionValueLabel(value: Prisma.JsonValue | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const label = value.label;

  return typeof label === "string" && label.trim() ? label.trim() : null;
}

function toCorrectionRecordListItem(
  record: CorrectionRecordPayload,
): CorrectionRecordListItem {
  return {
    id: record.id,
    dailyLedgerId: record.dailyLedgerId,
    targetType: record.targetType,
    targetId: record.targetId,
    fieldKey: record.fieldKey,
    targetLabel: formatCorrectionTargetLabel(record),
    originalValue: record.originalValue,
    previousAppliedValue: record.previousAppliedValue,
    correctedValue: record.correctedValue,
    reason: record.reason,
    createdAt: record.createdAt.toISOString(),
    createdBy: record.createdBy,
  };
}

export async function getLatestCorrectionByTargetInTx(
  tx: Prisma.TransactionClient,
  input: CorrectionTargetIdentity,
) {
  return tx.correctionRecord.findFirst({
    where: {
      dailyLedgerId: input.dailyLedgerId,
      targetType: input.targetType,
      targetId: input.targetId,
      fieldKey: input.fieldKey,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: correctionRecordSelect,
  });
}

export async function getCorrectionRecordsForLedgerInTx(
  tx: Prisma.TransactionClient,
  ledgerId: string,
) {
  const records = await tx.correctionRecord.findMany({
    where: { dailyLedgerId: ledgerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: correctionRecordSelect,
  });

  return records.map(toCorrectionRecordListItem);
}

export async function getCorrectionRecordsForLedger(ledgerId: string) {
  await requireReportAccess();
  await requireHeadquartersLedgerScope(ledgerId);

  return db.$transaction((tx) =>
    getCorrectionRecordsForLedgerInTx(tx, ledgerId),
  );
}

export function getLatestCorrectionValueMap(
  records: CorrectionRecordListItem[],
) {
  const sortedRecords = records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      const createdAtOrder =
        Date.parse(right.record.createdAt) - Date.parse(left.record.createdAt);

      return createdAtOrder || left.index - right.index;
    })
    .map((item) => item.record);
  const latestByTarget = new Map<string, CorrectionAppliedValue>();

  for (const record of sortedRecords) {
    const key = buildCorrectionTargetKey(record);

    if (latestByTarget.has(key)) {
      continue;
    }

    latestByTarget.set(key, {
      key,
      correctionId: record.id,
      dailyLedgerId: record.dailyLedgerId,
      targetType: record.targetType,
      targetId: record.targetId,
      fieldKey: record.fieldKey,
      targetLabel: record.targetLabel,
      originalValue: record.originalValue,
      previousAppliedValue: record.previousAppliedValue,
      correctedValue: record.correctedValue,
      latestAppliedValue: record.correctedValue,
      reason: record.reason,
      createdAt: record.createdAt,
      createdBy: record.createdBy,
    });
  }

  return latestByTarget;
}

export async function getLatestCorrectionValuesForLedger(ledgerId: string) {
  const records = await getCorrectionRecordsForLedger(ledgerId);

  return getLatestCorrectionValueMap(records);
}

export async function getLatestCorrectionValuesForLedgers(ledgerIds: string[]) {
  await requireReportAccess();
  const storeScope = await getHeadquartersStoreScope();

  return getLatestCorrectionValuesForLedgersScoped(
    ledgerIds,
    storeScope.storeIds,
  );
}

// WO-G/WO-E(2026-06-22): 세션 권한 게이트 없이(내부 스케줄러/배치 경로) 명시적
// storeIds 범위로 최신 정정 값을 조회한다. 호출자는 자신이 권한을 가진 storeIds만
// 넘겨야 한다. (예: LINE 아침 요약 cron, HR 생산성 분석은 전체 활성 매장 범위.)
export async function getLatestCorrectionValuesForLedgersScoped(
  ledgerIds: string[],
  storeIds: string[],
) {
  if (ledgerIds.length === 0) {
    return new Map<string, ReturnType<typeof getLatestCorrectionValueMap>>();
  }

  const records = await db.correctionRecord.findMany({
    where: {
      dailyLedgerId: { in: ledgerIds },
      dailyLedger: {
        storeId: { in: storeIds },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: correctionRecordSelect,
  });
  const recordsByLedgerId = new Map<string, CorrectionRecordListItem[]>();

  for (const record of records.map(toCorrectionRecordListItem)) {
    const ledgerRecords = recordsByLedgerId.get(record.dailyLedgerId) ?? [];

    ledgerRecords.push(record);
    recordsByLedgerId.set(record.dailyLedgerId, ledgerRecords);
  }

  return new Map<string, ReturnType<typeof getLatestCorrectionValueMap>>(
    ledgerIds.map((ledgerId) => [
      ledgerId,
      getLatestCorrectionValueMap(recordsByLedgerId.get(ledgerId) ?? []),
    ]),
  );
}

export async function getStoreReadableCorrectionRecordsForLedger(
  ledgerId: string,
  storeId: string,
) {
  const user = await requireAppUser();

  if (user.role === UserRole.STORE_MANAGER) {
    const ledger = await db.dailyLedger.findFirst({
      where: {
        id: ledgerId,
        storeId,
        store: {
          isActive: true,
          assignments: {
            some: {
              userId: user.id,
            },
          },
        },
      },
      select: { id: true },
    });

    if (!ledger) {
      redirect("/app/unauthorized");
    }
  } else if (user.role !== UserRole.HEADQUARTERS) {
    redirect("/app/unauthorized");
  }

  return db.$transaction((tx) =>
    getCorrectionRecordsForLedgerInTx(tx, ledgerId),
  );
}
