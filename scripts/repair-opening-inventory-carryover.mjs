import "./_loadenv.mjs";

import { PrismaClient } from "../generated/prisma/index.js";
import {
  parseOpeningCarryoverRepairOptions,
  planOpeningCarryoverRepair,
} from "../src/features/inventory/opening-carryover-repair.ts";
import { persistLedgerInventoryCarryoverDetail } from "../src/features/inventory/carryover-detail-persistence.ts";
import {
  reconcileLedgerInventoryAdjustments,
  syncLedgerInventoryPurchasedQuantitiesInTx,
} from "../src/features/inventory/adjustment-reconciliation.ts";
import { refreshLedgerInventoryFifoLots } from "../src/features/inventory/fifo-lots.ts";
import {
  decimalToNumber,
  nullableDecimalToNumber,
} from "../src/lib/decimal.ts";

const REPAIR_REASON = "과거재고 이월 누락 복구";

function evidenceMismatch(message) {
  throw new Error(`EVIDENCE_MISMATCH: ${message}`);
}

function isJsonObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireAuditItems(audit, ledger, options) {
  if (!audit || !isJsonObject(audit.before)) {
    evidenceMismatch(
      `${ledger.store.name}: first inventory-save audit is missing`,
    );
  }

  if (
    audit.before.id !== ledger.id ||
    audit.before.storeId !== ledger.storeId ||
    audit.before.closingDate !== options.closingDate.toISOString() ||
    !Array.isArray(audit.before.items)
  ) {
    evidenceMismatch(
      `${ledger.store.name}: inventory-save audit target differs`,
    );
  }

  const openingItems = audit.before.items.filter(
    (item) => isJsonObject(item) && item.carryoverSource === "OPENING_SNAPSHOT",
  );

  if (openingItems.length === 0) {
    evidenceMismatch(`${ledger.store.name}: opening audit evidence is missing`);
  }

  for (const item of openingItems) {
    if (
      typeof item.id !== "string" ||
      typeof item.productId !== "string" ||
      typeof item.productName !== "string" ||
      typeof item.productCategory !== "string" ||
      typeof item.productSpec !== "string" ||
      typeof item.unitPrice !== "number" ||
      typeof item.previousQuantity !== "number" ||
      (item.currentQuantity !== null &&
        typeof item.currentQuantity !== "number") ||
      (item.quantity !== null && typeof item.quantity !== "number") ||
      !isJsonObject(item.previousQuantityDetail)
    ) {
      evidenceMismatch(`${ledger.store.name}: opening audit item is malformed`);
    }
  }

  return audit.before.items;
}

function normalizeCarryoverDetail(detail) {
  if (!detail) {
    return null;
  }

  return {
    source: detail.source,
    status: detail.status,
    resolvedQuantity: decimalToNumber(detail.resolvedQuantity),
    sourceLedgerId: detail.sourceLedgerId,
    sourceLedgerClosingDate:
      detail.sourceLedgerClosingDate?.toISOString() ?? null,
    sourceLedgerStatus: detail.sourceLedgerStatus,
    sourceYearMonth: detail.sourceYearMonth,
    sourceSnapshotId: detail.sourceSnapshotId,
    sourcePreviousQuantity: nullableDecimalToNumber(
      detail.sourcePreviousQuantity,
    ),
    sourcePurchasedQuantity: nullableDecimalToNumber(
      detail.sourcePurchasedQuantity,
    ),
    sourceLossQuantity: nullableDecimalToNumber(detail.sourceLossQuantity),
    sourceCurrentQuantity: nullableDecimalToNumber(
      detail.sourceCurrentQuantity,
    ),
    sourceQuantity: nullableDecimalToNumber(detail.sourceQuantity),
    message: detail.message,
    history: [],
  };
}

function normalizeCurrentItem(item) {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    productCategory: item.productCategory,
    productSpec: item.productSpec,
    unitPrice: item.unitPrice,
    previousQuantity: decimalToNumber(item.previousQuantity),
    purchasedQuantity: decimalToNumber(item.purchasedQuantity),
    currentQuantity: nullableDecimalToNumber(item.currentQuantity),
    quantity: nullableDecimalToNumber(item.quantity),
    inventoryAmount: item.inventoryAmount,
    isModified: item.isModified,
    carryoverSource: item.carryoverSource,
    carryoverStatus: item.carryoverStatus,
    carryoverLedgerId: item.carryoverLedgerId,
    previousQuantityDetail: normalizeCarryoverDetail(item.carryoverDetail),
  };
}

async function loadTargetLedgers(client, options) {
  const ledgers = await client.dailyLedger.findMany({
    where: { closingDate: options.closingDate },
    select: {
      id: true,
      storeId: true,
      status: true,
      store: { select: { name: true } },
    },
    orderBy: [{ storeId: "asc" }, { id: "asc" }],
  });

  if (ledgers.length === 0) {
    evidenceMismatch(`no ledgers found for ${options.date}`);
  }

  for (const ledger of ledgers) {
    if (
      ledger.status === "HEADQUARTERS_CLOSED" ||
      ledger.status === "HOLIDAY"
    ) {
      evidenceMismatch(
        `${ledger.store.name}: ledger status ${ledger.status} is not repairable`,
      );
    }
  }

  return ledgers;
}

async function loadLedgerRepairPlan(client, ledger, options) {
  const [audit, rows, snapshots] = await Promise.all([
    client.auditLog.findFirst({
      where: {
        action: "ledger.inventory.saved",
        targetType: "DailyLedger",
        targetId: ledger.id,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { actorId: true, before: true },
    }),
    client.ledgerInventoryItem.findMany({
      where: { dailyLedgerId: ledger.id },
      select: {
        id: true,
        productId: true,
        productName: true,
        productCategory: true,
        productSpec: true,
        unitPrice: true,
        previousQuantity: true,
        purchasedQuantity: true,
        currentQuantity: true,
        quantity: true,
        inventoryAmount: true,
        isModified: true,
        carryoverSource: true,
        carryoverStatus: true,
        carryoverLedgerId: true,
        carryoverDetail: true,
      },
      orderBy: [{ productId: "asc" }, { id: "asc" }],
    }),
    client.inventoryOpeningSnapshot.findMany({
      where: {
        storeId: ledger.storeId,
        yearMonth: options.yearMonth,
      },
      select: { id: true, productId: true, yearMonth: true, quantity: true },
      orderBy: [{ productId: "asc" }, { id: "asc" }],
    }),
  ]);
  const auditItems = requireAuditItems(audit, ledger, options);
  const plan = planOpeningCarryoverRepair({
    auditItems,
    currentItems: rows.map(normalizeCurrentItem),
    snapshots: snapshots.map((snapshot) => ({
      ...snapshot,
      quantity: decimalToNumber(snapshot.quantity),
    })),
  });

  return {
    ledger,
    actorId: audit.actorId,
    plan,
  };
}

async function loadRepairPlansForLedgers(client, ledgers, options) {
  const entries = [];

  for (const ledger of ledgers) {
    entries.push(await loadLedgerRepairPlan(client, ledger, options));
  }

  return entries;
}

async function loadAllRepairPlans(client, options) {
  const ledgers = await loadTargetLedgers(client, options);

  return loadRepairPlansForLedgers(client, ledgers, options);
}

async function lockAndLoadTargetLedgersInTx(tx, options) {
  await tx.$queryRaw`
    SELECT "id"
    FROM "DailyLedger"
    WHERE "closingDate" = ${options.closingDate}
    ORDER BY "storeId", "id"
    FOR UPDATE
  `;

  return loadTargetLedgers(tx, options);
}

function printPlans(entries, mode) {
  console.log(`${mode}: ${entries.length}개 지점`);

  for (const entry of entries) {
    console.log(
      `[${entry.ledger.store.name}] create=${entry.plan.creates.length} update=${entry.plan.updates.length} skip=${entry.plan.skips.length}`,
    );
  }
}

async function applyRepairPlan(tx, entry) {
  const { actorId, ledger, plan } = entry;

  for (const create of plan.creates) {
    const row = await tx.ledgerInventoryItem.create({
      data: {
        dailyLedgerId: ledger.id,
        productId: create.productId,
        productName: create.productName,
        productCategory: create.productCategory,
        productSpec: create.productSpec,
        unitPrice: create.unitPrice,
        previousQuantity: create.previousQuantity,
        currentQuantity: create.currentQuantity,
        quantity: create.quantity,
        isModified: create.isModified,
        carryoverSource: create.carryoverSource,
        carryoverStatus: create.carryoverStatus,
        carryoverLedgerId: create.carryoverLedgerId,
        createdById: actorId,
        updatedById: actorId,
      },
      select: { id: true },
    });

    await persistLedgerInventoryCarryoverDetail(
      tx,
      row.id,
      create.previousQuantityDetail,
    );
  }

  for (const update of plan.updates) {
    await tx.ledgerInventoryItem.update({
      where: { id: update.id, dailyLedgerId: ledger.id },
      data: {
        previousQuantity: update.previousQuantity,
        carryoverSource: update.carryoverSource,
        carryoverStatus: update.carryoverStatus,
        carryoverLedgerId: update.carryoverLedgerId,
        updatedById: actorId,
      },
    });

    await persistLedgerInventoryCarryoverDetail(
      tx,
      update.id,
      update.previousQuantityDetail,
    );
  }

  if (plan.creates.length === 0 && plan.updates.length === 0) {
    return false;
  }

  await syncLedgerInventoryPurchasedQuantitiesInTx(tx, ledger.id, actorId);
  await reconcileLedgerInventoryAdjustments(tx, ledger.id, actorId);
  await refreshLedgerInventoryFifoLots(tx, ledger.id);
  return true;
}

async function assertIdempotent(tx, entry, options) {
  const second = await loadLedgerRepairPlan(tx, entry.ledger, options);

  if (second.plan.creates.length > 0 || second.plan.updates.length > 0) {
    evidenceMismatch(
      `${entry.ledger.store.name}: second repair plan is not empty`,
    );
  }
}

async function writeRepairAudit(tx, entry, options) {
  const { ledger, plan } = entry;
  const totalCount =
    plan.creates.length + plan.updates.length + plan.skips.length;

  await tx.auditLog.create({
    data: {
      action: "inventory_opening_snapshot.carryover_repaired",
      targetType: "DailyLedger",
      targetId: ledger.id,
      actorId: entry.actorId,
      before: {
        date: options.date,
        createCount: plan.creates.length,
        updateCount: plan.updates.length,
        skipCount: plan.skips.length,
      },
      after: {
        date: options.date,
        createCount: 0,
        updateCount: 0,
        skipCount: totalCount,
      },
      reason: REPAIR_REASON,
    },
  });
}

async function main() {
  const options = parseOpeningCarryoverRepairOptions(
    process.argv.slice(2),
    process.env,
  );
  const db = new PrismaClient({ datasourceUrl: options.datasourceUrl });

  console.log(
    `대상 DB: ${options.host}/${options.database} · 영업일: ${options.date}`,
  );

  try {
    if (options.isDryRun) {
      const entries = await loadAllRepairPlans(db, options);
      printPlans(entries, "DRY-RUN");
      console.log("실제 변경 없이 종료합니다.");
      return;
    }

    const entries = await db.$transaction(
      async (tx) => {
        const lockedLedgers = await lockAndLoadTargetLedgersInTx(tx, options);
        const transactionEntries = await loadRepairPlansForLedgers(
          tx,
          lockedLedgers,
          options,
        );
        const changedEntries = [];

        for (const entry of transactionEntries) {
          if (await applyRepairPlan(tx, entry)) {
            changedEntries.push(entry);
          }
        }

        for (const entry of transactionEntries) {
          await assertIdempotent(tx, entry, options);
        }

        for (const entry of changedEntries) {
          await writeRepairAudit(tx, entry, options);
        }

        return transactionEntries;
      },
      {
        isolationLevel: "Serializable",
        timeout: 120000,
        maxWait: 30000,
      },
    );

    printPlans(entries, "COMMITTED");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
