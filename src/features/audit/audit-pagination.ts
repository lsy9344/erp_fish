import type { Prisma } from "../../../generated/prisma";

export type AuditHistoryCursor = { createdAt: string; id: string };

export function parseAuditHistoryCursor(
  value: string | string[] | undefined,
): AuditHistoryCursor | null {
  if (!value || Array.isArray(value) || value.length > 512) return null;
  const [createdAt, id, extra] = value.split("|");
  if (
    !createdAt ||
    !id ||
    extra !== undefined ||
    !Number.isFinite(Date.parse(createdAt))
  )
    return null;
  const parsedDate = new Date(createdAt);
  if (parsedDate.toISOString() !== createdAt) return null;
  return { createdAt, id };
}

export function auditHistoryCursorWhere(
  cursor: AuditHistoryCursor,
): Prisma.AuditLogWhereInput {
  const createdAt = new Date(cursor.createdAt);
  return {
    OR: [
      { createdAt: { lt: createdAt } },
      { createdAt, id: { lt: cursor.id } },
    ],
  };
}
