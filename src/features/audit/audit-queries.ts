import type { Prisma } from "../../../generated/prisma";
import { PermissionAction } from "../../../generated/prisma";
import {
  AUDIT_HISTORY_TARGET_TYPES,
  AUDIT_TARGET_TYPE_OPTIONS,
  formatAuditChangeSummary,
  formatAuditJsonValue,
  getAuditActionLabel,
  getAuditTargetTypeLabel,
  getSnapshotDisplayName,
  isAuditHistoryTargetType,
  isValidAuditHistoryDateString,
  type AuditHistoryTargetType,
  type AuditHistoryTargetTypeFilter,
} from "~/features/audit/audit-format";
import { omitSensitiveFields } from "~/server/sensitive-fields";
import {
  getHeadquartersStoreScope,
  hasActionPermission,
  requireAuditHistoryAccess,
} from "~/server/authz";
import { db } from "~/server/db";

export const AUDIT_HISTORY_PAGE_SIZE = 50;

export type AuditHistoryFilters = {
  targetType: AuditHistoryTargetTypeFilter;
  actorId: string;
  from: string;
  to: string;
};

export type AuditHistorySearchParams = {
  targetType?: string | string[];
  actorId?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

export type AuditHistoryItem = {
  id: string;
  createdAt: string;
  actorId: string;
  actorName: string;
  targetType: AuditHistoryTargetType;
  targetTypeLabel: string;
  targetName: string;
  action: string;
  actionLabel: string;
  reasonText: string;
  changeSummaryText: string;
  beforeText: string;
  afterText: string;
  // WO-05(2026-06-28): 장부/정정 이력은 장부 상세 링크. 그 외 대상은 null.
  ledgerDetailHref: string | null;
};

export type AuditHistoryActorOption = {
  id: string;
  label: string;
};

export type AuditHistoryTargetTypeOption =
  (typeof AUDIT_TARGET_TYPE_OPTIONS)[number];

export type AuditHistoryResult = {
  items: AuditHistoryItem[];
  actorOptions: AuditHistoryActorOption[];
  visibleTargetTypeOptions: AuditHistoryTargetTypeOption[];
  filters: AuditHistoryFilters;
  nextCursor: { createdAt: string; id: string } | null;
};

type AuditLogWithActor = Prisma.AuditLogGetPayload<{
  select: {
    id: true;
    action: true;
    targetType: true;
    targetId: true;
    actorId: true;
    before: true;
    after: true;
    reason: true;
    createdAt: true;
    actor: {
      select: {
        name: true;
        email: true;
      };
    };
  };
}>;

type ScopedAuditTargetFilters = {
  storeIds: string[];
  dailyLedgerIds: string[];
  correctionRecordIds: string[];
};

function normalizeSingleParam(value: string | string[] | undefined) {
  if (Array.isArray(value) || !value) {
    return "";
  }

  return value.trim();
}

export function normalizeAuditHistoryTargetTypeFilter(
  value: string | string[] | undefined,
): AuditHistoryTargetTypeFilter {
  const normalized = normalizeSingleParam(value);

  return isAuditHistoryTargetType(normalized) ? normalized : "all";
}

export function normalizeAuditHistoryActorFilter(
  value: string | string[] | undefined,
) {
  return normalizeSingleParam(value) || "all";
}

export function normalizeAuditHistoryDateFilter(
  value: string | string[] | undefined,
) {
  const normalized = normalizeSingleParam(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return "";
  }

  return isValidAuditHistoryDateString(normalized) ? normalized : "";
}

export function normalizeAuditHistoryFilters(
  params: AuditHistorySearchParams,
): AuditHistoryFilters {
  return {
    targetType: normalizeAuditHistoryTargetTypeFilter(params.targetType),
    actorId: normalizeAuditHistoryActorFilter(params.actorId),
    from: normalizeAuditHistoryDateFilter(params.from),
    to: normalizeAuditHistoryDateFilter(params.to),
  };
}

function toStartOfKoreanDate(value: string) {
  return new Date(`${value}T00:00:00.000+09:00`);
}

function toEndOfKoreanDate(value: string) {
  return new Date(`${value}T23:59:59.999+09:00`);
}

function buildScopedAuditTargetWhere(
  targetType: AuditHistoryTargetTypeFilter,
  scopedTargets: ScopedAuditTargetFilters,
): Prisma.AuditLogWhereInput | null {
  if (targetType === "DailyLedger") {
    return { targetId: { in: scopedTargets.dailyLedgerIds } };
  }

  if (targetType === "CorrectionRecord") {
    return { targetId: { in: scopedTargets.correctionRecordIds } };
  }

  if (targetType !== "all") {
    return null;
  }

  return {
    OR: [
      { targetType: { notIn: ["DailyLedger", "CorrectionRecord"] } },
      {
        targetType: "DailyLedger",
        targetId: { in: scopedTargets.dailyLedgerIds },
      },
      {
        targetType: "CorrectionRecord",
        targetId: { in: scopedTargets.correctionRecordIds },
      },
    ],
  };
}

function buildAuditHistoryWhere(
  filters: AuditHistoryFilters,
  scopedTargets?: ScopedAuditTargetFilters,
  allowedTargetTypes: AuditHistoryTargetType[] = [
    ...AUDIT_HISTORY_TARGET_TYPES,
  ],
) {
  const where: Prisma.AuditLogWhereInput = {
    targetType: { in: allowedTargetTypes },
  };

  if (filters.targetType !== "all") {
    where.targetType = filters.targetType;
  }

  if (filters.actorId !== "all") {
    where.actorId = filters.actorId;
  }

  const createdAt: Prisma.DateTimeFilter = {};

  if (filters.from) {
    createdAt.gte = toStartOfKoreanDate(filters.from);
  }

  if (filters.to) {
    createdAt.lte = toEndOfKoreanDate(filters.to);
  }

  if (createdAt.gte || createdAt.lte) {
    where.createdAt = createdAt;
  }

  if (scopedTargets) {
    const scopedTargetWhere = buildScopedAuditTargetWhere(
      filters.targetType,
      scopedTargets,
    );

    if (scopedTargetWhere) {
      where.AND = [scopedTargetWhere];
    }
  }

  return where;
}

async function getScopedAuditTargetFilters(
  storeIds: string[],
): Promise<ScopedAuditTargetFilters> {
  if (storeIds.length === 0) {
    return {
      storeIds,
      dailyLedgerIds: [],
      correctionRecordIds: [],
    };
  }

  const [dailyLedgers, correctionRecords] = await Promise.all([
    db.dailyLedger.findMany({
      where: { storeId: { in: storeIds } },
      select: { id: true },
    }),
    db.correctionRecord.findMany({
      where: { dailyLedger: { storeId: { in: storeIds } } },
      select: { id: true },
    }),
  ]);

  return {
    storeIds,
    dailyLedgerIds: dailyLedgers.map((ledger) => ledger.id),
    correctionRecordIds: correctionRecords.map((record) => record.id),
  };
}

function groupTargetIds(logs: AuditLogWithActor[]) {
  const ids = new Map<AuditHistoryTargetType, Set<string>>();

  for (const type of AUDIT_HISTORY_TARGET_TYPES) {
    ids.set(type, new Set());
  }

  for (const log of logs) {
    if (isAuditHistoryTargetType(log.targetType)) {
      ids.get(log.targetType)?.add(log.targetId);
    }
  }

  return ids;
}

function targetKey(targetType: string, targetId: string) {
  return `${targetType}:${targetId}`;
}

function formatDailyLedgerTargetName(input: {
  store: { name: string };
  closingDate: Date;
}) {
  const date = new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeZone: "Asia/Seoul",
  }).format(input.closingDate);

  return `${input.store.name} ${date}`;
}

async function resolveTargetNames(
  logs: AuditLogWithActor[],
  storeIds: string[],
) {
  const ids = groupTargetIds(logs);
  const [
    stores,
    users,
    products,
    purchaseStandards,
    ledgerInputCodes,
    dailyLedgers,
    correctionRecords,
    anomalyThresholdSettings,
  ] = await Promise.all([
    db.store.findMany({
      where: { id: { in: [...(ids.get("Store") ?? [])] } },
      select: { id: true, name: true },
    }),
    db.user.findMany({
      where: { id: { in: [...(ids.get("User") ?? [])] } },
      select: { id: true, name: true, email: true },
    }),
    db.product.findMany({
      where: { id: { in: [...(ids.get("Product") ?? [])] } },
      select: { id: true, name: true },
    }),
    db.purchaseStandard.findMany({
      where: { id: { in: [...(ids.get("PurchaseStandard") ?? [])] } },
      select: {
        id: true,
        product: {
          select: { name: true },
        },
      },
    }),
    db.ledgerInputCode.findMany({
      where: { id: { in: [...(ids.get("LedgerInputCode") ?? [])] } },
      select: { id: true, name: true },
    }),
    db.dailyLedger.findMany({
      where: {
        id: { in: [...(ids.get("DailyLedger") ?? [])] },
        storeId: { in: storeIds },
      },
      select: {
        id: true,
        closingDate: true,
        store: {
          select: { name: true },
        },
      },
    }),
    db.correctionRecord.findMany({
      where: {
        id: { in: [...(ids.get("CorrectionRecord") ?? [])] },
        dailyLedger: { storeId: { in: storeIds } },
      },
      select: {
        id: true,
        fieldKey: true,
        targetType: true,
        dailyLedgerId: true,
        dailyLedger: {
          select: {
            closingDate: true,
            store: {
              select: { name: true },
            },
          },
        },
      },
    }),
    db.anomalyThresholdSetting.findMany({
      where: { id: { in: [...(ids.get("AnomalyThresholdSetting") ?? [])] } },
      select: { id: true },
    }),
  ]);

  const names = new Map<string, string>();
  // WO-05(2026-06-28): 장부와 연결된 이력은 장부 상세 링크를 제공한다.
  const ledgerHrefs = new Map<string, string>();

  for (const store of stores) {
    names.set(targetKey("Store", store.id), store.name);
  }

  for (const user of users) {
    names.set(targetKey("User", user.id), user.name ?? user.email ?? user.id);
  }

  for (const product of products) {
    names.set(targetKey("Product", product.id), product.name);
  }

  for (const standard of purchaseStandards) {
    names.set(
      targetKey("PurchaseStandard", standard.id),
      standard.product.name,
    );
  }

  for (const code of ledgerInputCodes) {
    names.set(targetKey("LedgerInputCode", code.id), code.name);
  }

  for (const ledger of dailyLedgers) {
    names.set(
      targetKey("DailyLedger", ledger.id),
      formatDailyLedgerTargetName(ledger),
    );
    ledgerHrefs.set(
      targetKey("DailyLedger", ledger.id),
      `/app/ledgers/${ledger.id}`,
    );
  }

  for (const correction of correctionRecords) {
    names.set(
      targetKey("CorrectionRecord", correction.id),
      `${formatDailyLedgerTargetName(correction.dailyLedger)} ${correction.fieldKey}`,
    );
    ledgerHrefs.set(
      targetKey("CorrectionRecord", correction.id),
      `/app/ledgers/${correction.dailyLedgerId}`,
    );
  }

  for (const setting of anomalyThresholdSettings) {
    names.set(
      targetKey("AnomalyThresholdSetting", setting.id),
      "이상 신호 기준값",
    );
  }

  return { names, ledgerHrefs };
}

// WO-06(2026-06-28): 변경자 표시는 name → email → id 순으로 떨어진다. actorId가 있는데
// "시스템"으로 보이지 않게 한다(실제 actor 정보 손실과 무명 시스템 작업을 구분).
function toActorLabel(
  actor: { name: string | null; email: string | null } | null | undefined,
  actorId?: string,
) {
  return actor?.name ?? actor?.email ?? actorId ?? "시스템";
}

async function getAuditActorOptions(
  scopedTargets: ScopedAuditTargetFilters,
  allowedTargetTypes: AuditHistoryTargetType[],
) {
  const rows = await db.auditLog.findMany({
    where: buildAuditHistoryWhere(
      { targetType: "all", actorId: "all", from: "", to: "" },
      scopedTargets,
      allowedTargetTypes,
    ),
    distinct: ["actorId"],
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      actorId: true,
      actor: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  return rows
    .map<AuditHistoryActorOption>((row) => ({
      id: row.actorId,
      label: toActorLabel(row.actor, row.actorId),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko-KR"));
}

async function getAllowedAuditHistoryTargetTypes(currentUserId: string) {
  const [canManageUsers, canExport] = await Promise.all([
    hasActionPermission(currentUserId, PermissionAction.USER_PERMISSION_MANAGE),
    hasActionPermission(currentUserId, PermissionAction.EXPORT_CREATE),
  ]);
  const allowedTargetTypes: AuditHistoryTargetType[] = [
    "Store",
    "Product",
    "PurchaseStandard",
    "LedgerInputCode",
    "DailyLedger",
    "CorrectionRecord",
    "AnomalyThresholdSetting",
    "EcountImportBatch",
    "StoreExternalAlias",
    "ProductExternalAlias",
  ];

  if (canManageUsers) {
    allowedTargetTypes.push("User");
  }

  if (canExport) {
    allowedTargetTypes.push("ReportExport");
  }

  return allowedTargetTypes;
}

function getVisibleTargetTypeOptions(
  allowedTargetTypes: AuditHistoryTargetType[],
) {
  return AUDIT_TARGET_TYPE_OPTIONS.filter((option) =>
    allowedTargetTypes.includes(option.value),
  );
}

export async function getAuditHistoryForHeadquarters(
  filters: Partial<AuditHistoryFilters> = {},
): Promise<AuditHistoryResult> {
  const currentUser = await requireAuditHistoryAccess();
  const storeScope = await getHeadquartersStoreScope();
  const scopedTargets = await getScopedAuditTargetFilters(storeScope.storeIds);
  const allowedTargetTypes = await getAllowedAuditHistoryTargetTypes(
    currentUser.id,
  );

  let normalizedFilters: AuditHistoryFilters = {
    targetType: filters.targetType ?? "all",
    actorId: filters.actorId ?? "all",
    from: filters.from ?? "",
    to: filters.to ?? "",
  };

  if (
    normalizedFilters.targetType !== "all" &&
    !allowedTargetTypes.includes(normalizedFilters.targetType)
  ) {
    normalizedFilters = {
      ...normalizedFilters,
      targetType: "all",
    };
  }

  const visibleTargetTypeOptions =
    getVisibleTargetTypeOptions(allowedTargetTypes);
  const [logs, actorOptions] = await Promise.all([
    db.auditLog.findMany({
      where: buildAuditHistoryWhere(
        normalizedFilters,
        scopedTargets,
        allowedTargetTypes,
      ),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: AUDIT_HISTORY_PAGE_SIZE,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        actorId: true,
        before: true,
        after: true,
        reason: true,
        createdAt: true,
        actor: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }),
    getAuditActorOptions(scopedTargets, allowedTargetTypes),
  ]);
  const { names: targetNames, ledgerHrefs } = await resolveTargetNames(
    logs,
    scopedTargets.storeIds,
  );
  const items = logs
    .filter(
      (
        log,
      ): log is AuditLogWithActor & { targetType: AuditHistoryTargetType } =>
        isAuditHistoryTargetType(log.targetType),
    )
    .map<AuditHistoryItem>((log) => {
      const safeBefore = omitSensitiveFields(log.before) as
        | Prisma.JsonValue
        | null
        | undefined;
      const safeAfter = omitSensitiveFields(log.after) as
        | Prisma.JsonValue
        | null
        | undefined;

      return {
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        actorId: log.actorId,
        actorName: toActorLabel(log.actor, log.actorId),
        targetType: log.targetType,
        targetTypeLabel: getAuditTargetTypeLabel(log.targetType),
        targetName:
          targetNames.get(targetKey(log.targetType, log.targetId)) ??
          getSnapshotDisplayName(safeAfter) ??
          getSnapshotDisplayName(safeBefore) ??
          log.targetId,
        action: log.action,
        actionLabel: getAuditActionLabel(log.action),
        reasonText: log.reason ?? "-",
        changeSummaryText: formatAuditChangeSummary(safeBefore, safeAfter),
        beforeText: formatAuditJsonValue(safeBefore),
        afterText: formatAuditJsonValue(safeAfter),
        ledgerDetailHref:
          ledgerHrefs.get(targetKey(log.targetType, log.targetId)) ?? null,
      };
    });

  return {
    items,
    actorOptions,
    visibleTargetTypeOptions,
    filters: normalizedFilters,
    nextCursor: null,
  };
}
