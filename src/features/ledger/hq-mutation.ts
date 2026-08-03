import { Prisma } from "../../../generated/prisma";

import { writeAuditLog } from "~/server/audit";
import { getHeadquartersEditableLedgerStatuses } from "./status-policy";

export async function updateHqLedgerMutationTokenInTx(
  tx: Prisma.TransactionClient,
  input: {
    ledgerId: string;
    expectedUpdatedAt: Date;
    actorId: string;
    allowClosedEdit: boolean;
    data?: Prisma.DailyLedgerUncheckedUpdateManyInput;
  },
) {
  const updated = await tx.dailyLedger.updateMany({
    where: {
      id: input.ledgerId,
      status: {
        in: [...getHeadquartersEditableLedgerStatuses(input.allowClosedEdit)],
      },
      updatedAt: input.expectedUpdatedAt,
    },
    data: {
      ...input.data,
      updatedById: input.actorId,
      version: { increment: 1 },
    },
  });

  return updated.count === 1;
}

export async function invalidateCarryoverDependentsInTx(
  tx: Prisma.TransactionClient,
  input: {
    sourceLedgerId: string;
    productIds: string[];
    actorId: string;
    reason: string;
  },
) {
  const productIds = [...new Set(input.productIds)].filter(Boolean);

  if (productIds.length === 0) {
    return { targetLedgerIds: [] as string[] };
  }

  // The target ledger is the concurrency boundary for every edit path. Lock it
  // before loading the rows to invalidate so a writer that was already in
  // flight finishes first and this transaction re-reads its final carryover
  // state. Already-invalid rows are locked too: bumping their ledger version
  // prevents an acknowledgement that read a stale source snapshot from
  // committing after this source edit. Stable ordering also prevents two
  // multi-ledger invalidations from deadlocking each other.
  const lockedTargetLedgers = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT ledger."id"
      FROM "DailyLedger" AS ledger
      WHERE ledger."status" <> 'HOLIDAY'
        AND EXISTS (
          SELECT 1
          FROM "LedgerInventoryItem" AS item
          WHERE item."dailyLedgerId" = ledger."id"
            AND item."carryoverLedgerId" = ${input.sourceLedgerId}
            AND item."productId" IN (${Prisma.join(productIds)})
        )
      ORDER BY ledger."id"
      FOR UPDATE OF ledger
    `,
  );

  if (lockedTargetLedgers.length === 0) {
    return { targetLedgerIds: [] as string[] };
  }

  const lockedTargetLedgerIds = lockedTargetLedgers.map((ledger) => ledger.id);
  const dependentItems = await tx.ledgerInventoryItem.findMany({
    where: {
      dailyLedgerId: { in: lockedTargetLedgerIds },
      carryoverLedgerId: input.sourceLedgerId,
      productId: { in: productIds },
      dailyLedger: { status: { not: "HOLIDAY" } },
    },
    select: {
      id: true,
      dailyLedgerId: true,
      productId: true,
      carryoverStatus: true,
    },
  });

  if (dependentItems.length === 0) {
    return { targetLedgerIds: [] as string[] };
  }

  const itemsToInvalidate = dependentItems.filter(
    (item) => item.carryoverStatus !== "CARRYOVER_RECHECK_REQUIRED",
  );
  const itemIds = itemsToInvalidate.map((item) => item.id);
  const targetLedgerIds = [
    ...new Set(dependentItems.map((item) => item.dailyLedgerId)),
  ];

  const inventoryUpdate = await tx.ledgerInventoryItem.updateMany({
    where: {
      id: { in: itemIds },
      carryoverStatus: { not: "CARRYOVER_RECHECK_REQUIRED" },
    },
    data: { carryoverStatus: "CARRYOVER_RECHECK_REQUIRED" },
  });

  if (inventoryUpdate.count !== itemsToInvalidate.length) {
    throw new Error("CARRYOVER_INVALIDATION_CONFLICT");
  }

  const carryoverDetails = await tx.ledgerInventoryCarryoverDetail.findMany({
    where: { ledgerInventoryItemId: { in: itemIds } },
    select: { id: true },
  });
  const carryoverDetailIds = carryoverDetails.map((detail) => detail.id);
  const detailUpdate = await tx.ledgerInventoryCarryoverDetail.updateMany({
    where: { id: { in: carryoverDetailIds } },
    data: {
      status: "CARRYOVER_RECHECK_REQUIRED",
      message:
        "원천 장부가 수정되어 이월 수량과 FIFO 원가 근거를 다시 확인해야 합니다.",
    },
  });

  if (detailUpdate.count !== carryoverDetails.length) {
    throw new Error("CARRYOVER_INVALIDATION_CONFLICT");
  }

  const ledgerUpdate = await tx.dailyLedger.updateMany({
    where: { id: { in: targetLedgerIds } },
    data: {
      updatedById: input.actorId,
      version: { increment: 1 },
    },
  });

  if (ledgerUpdate.count !== targetLedgerIds.length) {
    throw new Error("CARRYOVER_INVALIDATION_CONFLICT");
  }

  for (const targetLedgerId of targetLedgerIds) {
    const affectedItems = dependentItems.filter(
      (item) => item.dailyLedgerId === targetLedgerId,
    );
    const newlyInvalidatedItems = affectedItems.filter(
      (item) => item.carryoverStatus !== "CARRYOVER_RECHECK_REQUIRED",
    );

    if (newlyInvalidatedItems.length === 0) {
      continue;
    }

    await writeAuditLog(tx, {
      action: "ledger.inventory.carryover.invalidated_by_source_edit",
      targetType: "DailyLedger",
      targetId: targetLedgerId,
      actorId: input.actorId,
      before: {
        sourceLedgerId: input.sourceLedgerId,
        items: newlyInvalidatedItems.map((item) => ({
          productId: item.productId,
          carryoverStatus: item.carryoverStatus,
        })),
      },
      after: {
        sourceLedgerId: input.sourceLedgerId,
        items: newlyInvalidatedItems.map((item) => ({
          productId: item.productId,
          carryoverStatus: "CARRYOVER_RECHECK_REQUIRED",
        })),
      },
      reason: input.reason,
    });
  }

  return { targetLedgerIds };
}
