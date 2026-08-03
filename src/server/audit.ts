import type { Prisma } from "../../generated/prisma";

export type AuditActorContext = {
  actorRole: string;
  requiredAction: string;
};

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

export function withAuditActorContext<T extends Record<string, unknown>>(
  snapshot: T,
  actorContext: AuditActorContext,
): Prisma.InputJsonObject {
  return {
    ...snapshot,
    actorContext: {
      actorRole: actorContext.actorRole,
      requiredAction: actorContext.requiredAction,
    },
  } as Prisma.InputJsonObject;
}

/**
 * DESIGN.md D8: 본사 장부 저장 감사 payload에 편집 시점의 장부 상태와 마감 편집
 * 여부를 문맥으로 남긴다. before/after는 실제 적용된 유효값 기준이고, 이 문맥은
 * after에 함께 기록해 마감 장부 직접 수정 이력을 구분할 수 있게 한다.
 */
export function withLedgerEditContext<T extends object>(
  snapshot: T,
  context: { ledgerStatusAtEdit: string; closedEdit: boolean },
): Prisma.InputJsonObject {
  return { ...snapshot, ...context };
}
