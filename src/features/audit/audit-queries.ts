import type { Prisma } from "../../../generated/prisma";
import {
  AUDIT_HISTORY_TARGET_TYPES,
  formatAuditJsonValue,
  getAuditActionLabel,
  getAuditTargetTypeLabel,
  getSnapshotDisplayName,
  isAuditHistoryTargetType,
  isValidAuditHistoryDateString,
  type AuditHistoryTargetType,
  type AuditHistoryTargetTypeFilter,
} from "~/features/audit/audit-format";
import { requireHeadquartersUser } from "~/server/authz";
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
  beforeText: string;
  afterText: string;
};

export type AuditHistoryActorOption = {
  id: string;
  label: string;
};

export type AuditHistoryResult = {
  items: AuditHistoryItem[];
  actorOptions: AuditHistoryActorOption[];
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
    createdAt: true;
    actor: {
      select: {
        name: true;
        email: true;
      };
    };
  };
}>;

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

function buildAuditHistoryWhere(filters: AuditHistoryFilters) {
  const where: Prisma.AuditLogWhereInput = {
    targetType: { in: [...AUDIT_HISTORY_TARGET_TYPES] },
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

  return where;
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

async function resolveTargetNames(logs: AuditLogWithActor[]) {
  const ids = groupTargetIds(logs);
  const [stores, users, products, purchaseStandards, ledgerInputCodes] =
    await Promise.all([
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
    ]);

  const names = new Map<string, string>();

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

  return names;
}

function toActorLabel(actor: { name: string | null; email: string | null }) {
  return actor.name ?? actor.email ?? "시스템";
}

async function getAuditActorOptions() {
  const rows = await db.auditLog.findMany({
    where: {
      targetType: { in: [...AUDIT_HISTORY_TARGET_TYPES] },
    },
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
      label: toActorLabel(row.actor),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko-KR"));
}

export async function getAuditHistoryForHeadquarters(
  filters: Partial<AuditHistoryFilters> = {},
): Promise<AuditHistoryResult> {
  await requireHeadquartersUser();

  const normalizedFilters: AuditHistoryFilters = {
    targetType: filters.targetType ?? "all",
    actorId: filters.actorId ?? "all",
    from: filters.from ?? "",
    to: filters.to ?? "",
  };
  const [logs, actorOptions] = await Promise.all([
    db.auditLog.findMany({
      where: buildAuditHistoryWhere(normalizedFilters),
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
        createdAt: true,
        actor: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }),
    getAuditActorOptions(),
  ]);
  const targetNames = await resolveTargetNames(logs);
  const items = logs
    .filter((log): log is AuditLogWithActor & { targetType: AuditHistoryTargetType } =>
      isAuditHistoryTargetType(log.targetType),
    )
    .map<AuditHistoryItem>((log) => ({
      id: log.id,
      createdAt: log.createdAt.toISOString(),
      actorId: log.actorId,
      actorName: toActorLabel(log.actor),
      targetType: log.targetType,
      targetTypeLabel: getAuditTargetTypeLabel(log.targetType),
      targetName:
        targetNames.get(targetKey(log.targetType, log.targetId)) ??
        getSnapshotDisplayName(log.after) ??
        getSnapshotDisplayName(log.before) ??
        log.targetId,
      action: log.action,
      actionLabel: getAuditActionLabel(log.action),
      beforeText: formatAuditJsonValue(log.before),
      afterText: formatAuditJsonValue(log.after),
    }));

  return {
    items,
    actorOptions,
    filters: normalizedFilters,
    nextCursor: null,
  };
}
