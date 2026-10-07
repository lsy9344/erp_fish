import { Prisma } from "../../../generated/prisma/index.js";
import { actionError, actionOk } from "../../lib/action-result.ts";

export async function applyEmployeePastWageInTx({
  tx,
  employeeId,
  amount,
  startDate,
  endDate,
  storeIds,
  actorId,
  canEditClosedLedgers,
  reason,
}: {
  tx: Prisma.TransactionClient;
  employeeId: string;
  amount: number;
  startDate: string;
  endDate: string;
  storeIds: string[];
  actorId: string;
  canEditClosedLedgers: boolean;
  reason: string;
}) {
  const ledgerWhere: Prisma.DailyLedgerWhereInput = {
    storeId: { in: storeIds },
    closingDate: {
      gte: new Date(`${startDate}T00:00:00.000Z`),
      lte: new Date(`${endDate}T23:59:59.999Z`),
    },
    status: { in: ["IN_PROGRESS", "IN_REVIEW", "HEADQUARTERS_CLOSED"] },
  };
  const targets = await tx.dailyLedger.findMany({
    where: { ...ledgerWhere, ledgerLaborItems: { some: { employeeId } } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (targets.length === 0) return actionOk({ updatedLaborItemCount: 0 });

  // 장부 저장·마감과 같은 부모 행을 잠근 뒤 현재 상태와 금액을 다시 읽는다.
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "DailyLedger" WHERE "id" IN (${Prisma.join(
      targets.map(({ id }) => id),
    )}) ORDER BY "id" FOR UPDATE`,
  );
  const ledgers = await tx.dailyLedger.findMany({
    where: { ...ledgerWhere, id: { in: targets.map(({ id }) => id) } },
    select: {
      id: true,
      status: true,
      ledgerLaborItems: {
        where: { employeeId, amount: { not: amount } },
        select: { id: true, amount: true },
      },
    },
  });
  if (
    !canEditClosedLedgers &&
    ledgers.some(
      (ledger) =>
        ledger.status === "HEADQUARTERS_CLOSED" &&
        ledger.ledgerLaborItems.length > 0,
    )
  ) {
    return actionError(
      "FORBIDDEN",
      "선택한 기간에 마감된 장부가 있습니다. 마감 장부 수정 권한이 필요합니다.",
    );
  }

  const changedLedgers = ledgers.filter(
    (ledger) => ledger.ledgerLaborItems.length > 0,
  );
  const itemIds = changedLedgers.flatMap((ledger) =>
    ledger.ledgerLaborItems.map(({ id }) => id),
  );
  if (itemIds.length === 0) return actionOk({ updatedLaborItemCount: 0 });
  const updated = await tx.ledgerLaborItem.updateMany({
    where: { id: { in: itemIds }, employeeId },
    data: { amount, updatedById: actorId },
  });
  if (updated.count !== itemIds.length) {
    throw new Error("근무기록이 동시에 변경되어 다시 시도해야 합니다.");
  }
  const updatedLedgers = await tx.dailyLedger.updateMany({
    where: { id: { in: changedLedgers.map(({ id }) => id) } },
    data: { version: { increment: 1 }, updatedById: actorId },
  });
  if (updatedLedgers.count !== changedLedgers.length) {
    throw new Error("장부가 동시에 변경되어 다시 시도해야 합니다.");
  }
  await tx.auditLog.createMany({
    data: changedLedgers.map((ledger) => ({
      action: "ledger.employee_wage.updated",
      targetType: "DailyLedger",
      targetId: ledger.id,
      actorId,
      before: { laborItems: ledger.ledgerLaborItems },
      after: {
        laborItems: ledger.ledgerLaborItems.map(({ id }) => ({ id, amount })),
        ledgerStatusAtEdit: ledger.status,
        closedEdit: ledger.status === "HEADQUARTERS_CLOSED",
        startDate,
        endDate,
      },
      reason,
    })),
  });
  return actionOk({ updatedLaborItemCount: updated.count });
}
