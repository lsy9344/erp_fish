import type { Prisma } from "../../../generated/prisma";

import type { InventoryCarryoverDetailView, InventoryStepLine } from "./types";

function toCarryoverDetailData(
  ledgerInventoryItemId: string,
  detail: InventoryCarryoverDetailView,
) {
  return {
    ledgerInventoryItemId,
    source: detail.source,
    status: detail.status,
    resolvedQuantity: detail.resolvedQuantity,
    sourceLedgerId: detail.sourceLedgerId,
    sourceLedgerClosingDate: detail.sourceLedgerClosingDate
      ? new Date(detail.sourceLedgerClosingDate)
      : null,
    sourceLedgerStatus: detail.sourceLedgerStatus,
    sourceYearMonth: detail.sourceYearMonth,
    sourceSnapshotId: detail.sourceSnapshotId,
    sourcePreviousQuantity: detail.sourcePreviousQuantity,
    sourcePurchasedQuantity: detail.sourcePurchasedQuantity,
    sourceLossQuantity: detail.sourceLossQuantity,
    sourceCurrentQuantity: detail.sourceCurrentQuantity,
    sourceQuantity: detail.sourceQuantity,
    message: detail.message,
  };
}

export async function persistLedgerInventoryCarryoverDetail(
  tx: Prisma.TransactionClient,
  ledgerInventoryItemId: string,
  detail: InventoryCarryoverDetailView,
) {
  const data = toCarryoverDetailData(ledgerInventoryItemId, detail);

  await tx.ledgerInventoryCarryoverDetail.upsert({
    where: { ledgerInventoryItemId },
    create: data,
    update: data,
  });
}

export async function persistLedgerInventoryCarryoverDetails(
  tx: Prisma.TransactionClient,
  dailyLedgerId: string,
  items: InventoryStepLine[],
) {
  if (items.length === 0) {
    return;
  }

  const rows = await tx.ledgerInventoryItem.findMany({
    where: {
      dailyLedgerId,
      productId: { in: items.map((item) => item.productId) },
    },
    select: {
      id: true,
      productId: true,
    },
  });
  const itemByProductId = new Map(items.map((item) => [item.productId, item]));
  const data = rows.flatMap((row) => {
    const item = itemByProductId.get(row.productId);

    return item
      ? [toCarryoverDetailData(row.id, item.previousQuantityDetail)]
      : [];
  });

  if (data.length === 0) {
    return;
  }

  await tx.ledgerInventoryCarryoverDetail.createMany({
    data,
    skipDuplicates: true,
  });
}
