import { Prisma, UserRole } from "../../../generated/prisma/index.js";
import type { CorrectionTargetType } from "../../../generated/prisma/index.js";
import { redirect } from "next/navigation";

import {
  getHeadquartersStoreScope,
  requireAppUser,
  requireHeadquartersLedgerScope,
  requireReportAccess,
} from "../../server/authz.ts";
import { db } from "../../server/db.ts";
import { getLedgerCostStepDataByIdInTx } from "../ledger/queries.ts";
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
  supersededAt: true,
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
    // DESIGN.md D9: 이력 목록에는 supersede 여부만 함께 보여주고 기록은 지우지 않는다.
    supersededAt: record.supersededAt?.toISOString() ?? null,
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
      // DESIGN.md D9: 직접 수정으로 대체된 정정은 새 정정의 이전 반영값 기준으로
      // 참조되지 않는다.
      supersededAt: null,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: correctionRecordSelect,
  });
}

/**
 * DESIGN.md D9: 마스터 직접 저장이 덮어쓴 대상의 활성 정정만 supersede한다.
 * 기록은 삭제하지 않고 supersededAt만 채워 이력으로 보존하며, 이후 읽기 시점
 * overlay에서 제외된다. 저장 CAS 통과 후 감사 로그 기록 전 같은 트랜잭션에서 호출한다.
 *
 * targetIds/fieldKeys는 실제로 덮어쓴 대상으로 범위를 좁힐 때 사용한다. 빈 배열은
 * "덮어쓴 대상이 없음"으로 보고 아무것도 supersede하지 않는다. 섹션 전체를 재저장하는
 * action은 기존 행 id 전체를 targetIds로 넘겨 삭제된 행의 정정까지 확실히 대체한다.
 */
export async function supersedeCorrectionRecordsInTx(
  tx: Prisma.TransactionClient,
  input: {
    dailyLedgerId: string;
    targetTypes: readonly CorrectionTargetType[];
    targetIds?: readonly string[];
    fieldKeys?: readonly string[];
    supersededAt?: Date;
  },
) {
  if (input.targetTypes.length === 0) {
    return { count: 0 };
  }

  if (input.targetIds?.length === 0 || input.fieldKeys?.length === 0) {
    return { count: 0 };
  }

  return tx.correctionRecord.updateMany({
    where: {
      dailyLedgerId: input.dailyLedgerId,
      supersededAt: null,
      targetType: { in: [...input.targetTypes] },
      ...(input.targetIds !== undefined
        ? { targetId: { in: [...input.targetIds] } }
        : {}),
      ...(input.fieldKeys !== undefined
        ? { fieldKey: { in: [...input.fieldKeys] } }
        : {}),
    },
    data: { supersededAt: input.supersededAt ?? new Date() },
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

/**
 * 장부 상세의 충돌 토큰과 정정 overlay를 같은 Repeatable Read snapshot에서 읽는다.
 * 장부 조회와 정정 조회 사이에 다른 정정이 커밋되면 화면에 최신 토큰과 오래된
 * 정정 목록이 섞일 수 있으므로, 직접 저장이 보지 못한 정정을 supersede하지 않게 한다.
 */
export async function getLedgerCostStepDataAndCorrectionRecords(
  ledgerId: string,
) {
  await requireReportAccess();
  await requireHeadquartersLedgerScope(ledgerId);

  return db.$transaction(
    async (tx) => ({
      ledger: await getLedgerCostStepDataByIdInTx(tx, ledgerId),
      correctionRecords: await getCorrectionRecordsForLedgerInTx(tx, ledgerId),
    }),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
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
    // DESIGN.md D9: 마스터 직접 수정으로 대체된 정정은 읽기 시점 overlay에서
    // 제외한다(이력 목록 조회는 그대로 반환). 이 한 지점이 대시보드·상세·리포트·
    // 알림·cron의 공통 overlay 진입점이다.
    if (record.supersededAt !== null) {
      continue;
    }

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
