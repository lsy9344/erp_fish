import "./_loadenv.mjs";

import { PrismaClient } from "../generated/prisma/index.js";
import {
  assertOpeningCarryoverIncidentPlans,
  assertOpeningCarryoverIncidentTargets,
  assertOpeningCarryoverRepairProtectedState,
  OPENING_CARRYOVER_REPAIR_INCIDENT_STORE_NAMES,
  parseOpeningCarryoverRepairOptions,
  planOpeningCarryoverRepair,
  requireOpeningCarryoverAuditEvidence,
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

const protectedLedgerScalarSelect = {
  id: true,
  storeId: true,
  closingDate: true,
  status: true,
  version: true,
  authorDisplayName: true,
  totalSalesAmount: true,
  cashAmount: true,
  cardAmount: true,
  otherPaymentAmount: true,
  workerCount: true,
  workMemo: true,
  submittedById: true,
  submittedAt: true,
  closedById: true,
  closedAt: true,
  lossReviewedById: true,
  lossReviewedAt: true,
  createdById: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,
};

const protectedInventoryItemSelect = {
  id: true,
  productId: true,
  currentQuantity: true,
  quantity: true,
};

function evidenceMismatch(message) {
  throw new Error(`EVIDENCE_MISMATCH: ${message}`);
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

function normalizeProtectedLedger(ledger) {
  return {
    id: ledger.id,
    storeId: ledger.storeId,
    closingDate: ledger.closingDate.toISOString(),
    status: ledger.status,
    version: ledger.version,
    authorDisplayName: ledger.authorDisplayName,
    totalSalesAmount: ledger.totalSalesAmount,
    cashAmount: ledger.cashAmount,
    cardAmount: ledger.cardAmount,
    otherPaymentAmount: ledger.otherPaymentAmount,
    workerCount: ledger.workerCount,
    workMemo: ledger.workMemo,
    submittedById: ledger.submittedById,
    submittedAt: ledger.submittedAt?.toISOString() ?? null,
    closedById: ledger.closedById,
    closedAt: ledger.closedAt?.toISOString() ?? null,
    lossReviewedById: ledger.lossReviewedById,
    lossReviewedAt: ledger.lossReviewedAt?.toISOString() ?? null,
    createdById: ledger.createdById,
    updatedById: ledger.updatedById,
    createdAt: ledger.createdAt.toISOString(),
    updatedAt: ledger.updatedAt.toISOString(),
  };
}

function normalizeProtectedInventoryItem(item) {
  return {
    id: item.id,
    productId: item.productId,
    currentQuantity: nullableDecimalToNumber(item.currentQuantity),
    quantity: nullableDecimalToNumber(item.quantity),
  };
}

function normalizeProtectedState(ledger, inventoryItems) {
  return {
    ledger: normalizeProtectedLedger(ledger),
    inventoryItems: inventoryItems.map(normalizeProtectedInventoryItem),
  };
}

async function loadTargetLedgers(client, options) {
  const ledgers = await client.dailyLedger.findMany({
    where: {
      closingDate: options.closingDate,
      store: {
        name: { in: [...OPENING_CARRYOVER_REPAIR_INCIDENT_STORE_NAMES] },
      },
    },
    select: {
      ...protectedLedgerScalarSelect,
      store: { select: { name: true } },
    },
    orderBy: [{ storeId: "asc" }, { id: "asc" }],
  });

  assertOpeningCarryoverIncidentTargets({
    date: options.date,
    targets: ledgers.map((ledger) => ({ storeName: ledger.store.name })),
  });

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
        ...protectedInventoryItemSelect,
        productName: true,
        productCategory: true,
        productSpec: true,
        unitPrice: true,
        previousQuantity: true,
        purchasedQuantity: true,
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
  const evidence = requireOpeningCarryoverAuditEvidence({
    audit,
    ledger: {
      id: ledger.id,
      storeId: ledger.storeId,
      storeName: ledger.store.name,
    },
    closingDate: options.closingDate,
  });
  const plan = planOpeningCarryoverRepair({
    auditItems: evidence.auditItems,
    currentItems: rows.map(normalizeCurrentItem),
    snapshots: snapshots.map((snapshot) => ({
      ...snapshot,
      quantity: decimalToNumber(snapshot.quantity),
    })),
  });

  return {
    ledger,
    actorId: evidence.actorId,
    plan,
    protectedBefore: normalizeProtectedState(ledger, rows),
  };
}

async function loadRepairPlansForLedgers(client, ledgers, options) {
  const entries = [];

  for (const ledger of ledgers) {
    entries.push(await loadLedgerRepairPlan(client, ledger, options));
  }

  assertOpeningCarryoverIncidentPlans({
    date: options.date,
    plans: entries.map((entry) => ({
      storeName: entry.ledger.store.name,
      createCount: entry.plan.creates.length,
      updateCount: entry.plan.updates.length,
      skipCount: entry.plan.skips.length,
    })),
  });

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
      AND "storeId" IN (
        SELECT "id"
        FROM "Store"
        WHERE "name" IN (
          ${OPENING_CARRYOVER_REPAIR_INCIDENT_STORE_NAMES[0]},
          ${OPENING_CARRYOVER_REPAIR_INCIDENT_STORE_NAMES[1]},
          ${OPENING_CARRYOVER_REPAIR_INCIDENT_STORE_NAMES[2]}
        )
      )
    ORDER BY "storeId", "id"
    FOR UPDATE
  `;

  return loadTargetLedgers(tx, options);
}

async function loadDryRunPlans(db, options) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return loadAllRepairPlans(tx, options);
    },
    {
      isolationLevel: "RepeatableRead",
      timeout: 120000,
      maxWait: 30000,
    },
  );
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

async function bumpChangedLedgerVersionInTx(tx, entry) {
  await tx.dailyLedger.update({
    where: {
      id: entry.ledger.id,
      version: entry.ledger.version,
    },
    data: { version: { increment: 1 } },
    select: { id: true },
  });
}

async function assertProtectedStateInTx(tx, entry) {
  const [ledger, inventoryItems] = await Promise.all([
    tx.dailyLedger.findUnique({
      where: { id: entry.ledger.id },
      select: protectedLedgerScalarSelect,
    }),
    tx.ledgerInventoryItem.findMany({
      where: { dailyLedgerId: entry.ledger.id },
      select: protectedInventoryItemSelect,
      orderBy: [{ productId: "asc" }, { id: "asc" }],
    }),
  ]);

  if (!ledger) {
    evidenceMismatch(`${entry.ledger.store.name}: ledger no longer exists`);
  }

  assertOpeningCarryoverRepairProtectedState({
    before: entry.protectedBefore,
    after: normalizeProtectedState(ledger, inventoryItems),
    plan: entry.plan,
  });
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
      const entries = await loadDryRunPlans(db, options);
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
            await bumpChangedLedgerVersionInTx(tx, entry);
            changedEntries.push(entry);
          }
        }

        for (const entry of transactionEntries) {
          await assertProtectedStateInTx(tx, entry);
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
