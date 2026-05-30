import type { Prisma } from "../../generated/prisma";

type AuditLogInput = {
  action: string;
  targetType: string;
  targetId: string;
  actorId: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  reason?: string | null;
};

export async function writeAuditLog(
  tx: Prisma.TransactionClient,
  input: AuditLogInput,
) {
  return tx.auditLog.create({
    data: {
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      actorId: input.actorId,
      before: input.before ?? undefined,
      after: input.after ?? undefined,
      reason: input.reason ?? undefined,
    },
  });
}
