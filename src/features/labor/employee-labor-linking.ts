import { Prisma } from "../../../generated/prisma/index.js";

export type EmployeeLaborLinkResult = {
  linkedLaborItemCount: number;
  filledLinkedZeroAmountCount: number;
  linkedDailyLedgerCount: number;
  linkedDailyLedgerIds: string[];
};

const noLinkedLaborItems: EmployeeLaborLinkResult = {
  linkedLaborItemCount: 0,
  filledLinkedZeroAmountCount: 0,
  linkedDailyLedgerCount: 0,
  linkedDailyLedgerIds: [],
};

function normalizedEmployeeName(name: string) {
  return name.trim().toLocaleLowerCase("ko-KR");
}

export async function lockEmployeeNamesInTx(
  tx: Prisma.TransactionClient,
  names: readonly string[],
) {
  const normalizedNames = [...new Set(names.map(normalizedEmployeeName))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "ko"));

  for (const name of normalizedNames) {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${name}))`,
    );
  }
}

export async function linkExistingLaborItemsInTx({
  tx,
  employee,
  actorId,
  canEditLedgers,
  includeClosedLedgers = false,
  storeIds,
  fillLinkedZeroAmounts = false,
  auditReason,
}: {
  tx: Prisma.TransactionClient;
  employee: {
    id: string;
    name: string;
    hireDate: Date;
    isActive: boolean;
    dailyWage: number | null;
  };
  actorId: string;
  canEditLedgers: boolean;
  includeClosedLedgers?: boolean;
  storeIds?: readonly string[];
  fillLinkedZeroAmounts?: boolean;
  auditReason?: string;
}): Promise<EmployeeLaborLinkResult> {
  if (!employee.isActive || !canEditLedgers) return noLinkedLaborItems;

  const editableStatuses = includeClosedLedgers
    ? (["IN_PROGRESS", "IN_REVIEW", "HEADQUARTERS_CLOSED"] as const)
    : (["IN_PROGRESS", "IN_REVIEW"] as const);
  const ledgerWhere: Prisma.DailyLedgerWhereInput = {
    status: { in: [...editableStatuses] },
    closingDate: { gte: employee.hireDate },
    ...(storeIds && storeIds.length > 0
      ? { storeId: { in: [...storeIds] } }
      : {}),
  };

  // 이름만 같은 다른 직원이 한 명이라도 있으면 미연결 행은 자동 연결하지 않는다.
  // 이미 employeeId로 연결된 행의 0원 보완은 동명이인과 무관하게 안전하다.
  let sameNameEmployeeCount = await tx.employee.count({
    where: {
      name: { equals: employee.name, mode: "insensitive" },
    },
  });
  async function loadTargetItems(allowUnlinked: boolean) {
    const unlinkedItems = allowUnlinked
      ? await tx.ledgerLaborItem.findMany({
          where: {
            employeeId: null,
            workerName: { equals: employee.name, mode: "insensitive" },
            dailyLedger: ledgerWhere,
          },
          select: {
            id: true,
            amount: true,
            dailyLedgerId: true,
          },
        })
      : [];
    const linkedZeroItems =
      fillLinkedZeroAmounts && (employee.dailyWage ?? 0) > 0
        ? await tx.ledgerLaborItem.findMany({
            where: {
              employeeId: employee.id,
              amount: 0,
              dailyLedger: ledgerWhere,
            },
            select: { id: true, dailyLedgerId: true },
          })
        : [];

    return { unlinkedItems, linkedZeroItems };
  }

  const initialTargets = await loadTargetItems(sameNameEmployeeCount === 1);
  const initialDailyLedgerIds = [
    ...new Set(
      [...initialTargets.unlinkedItems, ...initialTargets.linkedZeroItems].map(
        (item) => item.dailyLedgerId,
      ),
    ),
  ];
  if (initialDailyLedgerIds.length === 0) return noLinkedLaborItems;
  initialDailyLedgerIds.sort();

  // 장부 상태를 바꾸는 저장과 경합하지 않도록 부모 장부를 먼저 잠근 뒤,
  // 현재 상태가 여전히 편집 가능한 행만 다시 읽는다.
  const lockedLedgers = await tx.$queryRaw<{ id: string; status: string }[]>(
    Prisma.sql`SELECT "id", "status" FROM "DailyLedger" WHERE "id" IN (${Prisma.join(
      initialDailyLedgerIds,
    )}) ORDER BY "id" FOR UPDATE`,
  );
  sameNameEmployeeCount = await tx.employee.count({
    where: {
      name: { equals: employee.name, mode: "insensitive" },
    },
  });
  const { unlinkedItems, linkedZeroItems } = await loadTargetItems(
    sameNameEmployeeCount === 1,
  );
  const lockedLedgerIds = new Set(lockedLedgers.map((ledger) => ledger.id));
  const unlockedTarget = [...unlinkedItems, ...linkedZeroItems].find(
    (item) => !lockedLedgerIds.has(item.dailyLedgerId),
  );
  if (unlockedTarget) {
    throw new Error("새 근무기록이 동시에 추가되어 다시 시도해야 합니다.");
  }

  if (unlinkedItems.length === 0 && linkedZeroItems.length === 0) {
    return noLinkedLaborItems;
  }

  const zeroAmountIds = unlinkedItems
    .filter((item) => item.amount === 0)
    .map((item) => item.id);
  const nonZeroAmountIds = unlinkedItems
    .filter((item) => item.amount !== 0)
    .map((item) => item.id);

  if (zeroAmountIds.length > 0) {
    const updated = await tx.ledgerLaborItem.updateMany({
      where: {
        id: { in: zeroAmountIds },
        employeeId: null,
        dailyLedger: ledgerWhere,
      },
      data: {
        employeeId: employee.id,
        workerName: employee.name,
        amount: employee.dailyWage ?? 0,
        updatedById: actorId,
      },
    });
    if (updated.count !== zeroAmountIds.length) {
      throw new Error("직원 근무기록이 동시에 변경되어 다시 시도해야 합니다.");
    }
  }

  if (nonZeroAmountIds.length > 0) {
    const updated = await tx.ledgerLaborItem.updateMany({
      where: {
        id: { in: nonZeroAmountIds },
        employeeId: null,
        dailyLedger: ledgerWhere,
      },
      data: {
        employeeId: employee.id,
        workerName: employee.name,
        updatedById: actorId,
      },
    });
    if (updated.count !== nonZeroAmountIds.length) {
      throw new Error("직원 근무기록이 동시에 변경되어 다시 시도해야 합니다.");
    }
  }

  if (linkedZeroItems.length > 0) {
    const updated = await tx.ledgerLaborItem.updateMany({
      where: {
        id: { in: linkedZeroItems.map((item) => item.id) },
        employeeId: employee.id,
        amount: 0,
        dailyLedger: ledgerWhere,
      },
      data: {
        workerName: employee.name,
        amount: employee.dailyWage ?? 0,
        updatedById: actorId,
      },
    });
    if (updated.count !== linkedZeroItems.length) {
      throw new Error("직원 근무기록이 동시에 변경되어 다시 시도해야 합니다.");
    }
  }

  const dailyLedgerIds = [
    ...new Set(
      [...unlinkedItems, ...linkedZeroItems].map((item) => item.dailyLedgerId),
    ),
  ];
  const updatedLedgers = await tx.dailyLedger.updateMany({
    where: { id: { in: dailyLedgerIds }, ...ledgerWhere },
    data: {
      version: { increment: 1 },
      updatedById: actorId,
    },
  });
  if (updatedLedgers.count !== dailyLedgerIds.length) {
    throw new Error("장부 상태가 변경되어 다시 시도해야 합니다.");
  }

  if (auditReason) {
    const targetItemIds = [
      ...unlinkedItems.map((item) => item.id),
      ...linkedZeroItems.map((item) => item.id),
    ];
    const afterItems = await tx.ledgerLaborItem.findMany({
      where: { id: { in: targetItemIds } },
      select: {
        id: true,
        dailyLedgerId: true,
        employeeId: true,
        amount: true,
      },
    });
    const statusByLedgerId = new Map(
      lockedLedgers.map((ledger) => [ledger.id, ledger.status]),
    );

    for (const dailyLedgerId of dailyLedgerIds) {
      const status = statusByLedgerId.get(dailyLedgerId) ?? "UNKNOWN";
      await tx.auditLog.create({
        data: {
          action: "ledger.employee_link.backfilled",
          targetType: "DailyLedger",
          targetId: dailyLedgerId,
          actorId,
          before: {
            laborItems: [
              ...unlinkedItems,
              ...linkedZeroItems.map((item) => ({ ...item, amount: 0 })),
            ]
              .filter((item) => item.dailyLedgerId === dailyLedgerId)
              .map((item) => ({
                id: item.id,
                employeeId: unlinkedItems.some(
                  (unlinkedItem) => unlinkedItem.id === item.id,
                )
                  ? null
                  : employee.id,
                amount: item.amount,
              })),
          },
          after: {
            laborItems: afterItems
              .filter((item) => item.dailyLedgerId === dailyLedgerId)
              .map(({ id, employeeId, amount }) => ({
                id,
                employeeId,
                amount,
              })),
            ledgerStatusAtEdit: status,
            closedEdit: status === "HEADQUARTERS_CLOSED",
          },
          reason: auditReason,
        },
      });
    }
  }

  return {
    linkedLaborItemCount: unlinkedItems.length,
    filledLinkedZeroAmountCount: linkedZeroItems.length,
    linkedDailyLedgerCount: dailyLedgerIds.length,
    linkedDailyLedgerIds: dailyLedgerIds,
  };
}
