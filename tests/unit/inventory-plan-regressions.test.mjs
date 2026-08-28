import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import test from "node:test";

const root = process.cwd();

async function readProjectFile(...segments) {
  return readFile(path.join(root, ...segments), "utf8");
}

test("FIFO rejects an Int-overflowing aggregate even when every lot amount fits", async () => {
  const fifoPath = path.join(
    root,
    "src",
    "features",
    "inventory",
    "fifo-lots.ts",
  );
  const { calculateFifoLotSnapshots } = await import(
    pathToFileURL(fifoPath).href
  );

  assert.throws(
    () =>
      calculateFifoLotSnapshots({
        previousLots: [
          {
            sourceType: "PREVIOUS_CARRYOVER",
            sourceLedgerId: "previous-ledger",
            sourcePurchaseItemId: null,
            sourceBusinessDate: new Date("2026-07-19T00:00:00.000Z"),
            unitPrice: 1_500_000_000,
            remainingQuantity: 1,
          },
          {
            sourceType: "PREVIOUS_CARRYOVER",
            sourceLedgerId: "previous-ledger",
            sourcePurchaseItemId: null,
            sourceBusinessDate: new Date("2026-07-20T00:00:00.000Z"),
            unitPrice: 1_500_000_000,
            remainingQuantity: 1,
          },
        ],
        legacyOpening: { unitPrice: 1, quantity: 0 },
        purchases: [],
        closingQuantity: 2,
        businessDate: new Date("2026-07-21T00:00:00.000Z"),
      }),
    /FIFO_AMOUNT_UNAVAILABLE/,
  );
});

test("FIFO rejects an Int-overflowing consumed aggregate when the remainder fits", async () => {
  const fifoPath = path.join(
    root,
    "src",
    "features",
    "inventory",
    "fifo-lots.ts",
  );
  const { calculateFifoLotSnapshots } = await import(
    pathToFileURL(fifoPath).href
  );

  assert.throws(
    () =>
      calculateFifoLotSnapshots({
        previousLots: [
          {
            sourceType: "PREVIOUS_CARRYOVER",
            sourceLedgerId: "previous-ledger",
            sourcePurchaseItemId: null,
            sourceBusinessDate: new Date("2026-07-19T00:00:00.000Z"),
            unitPrice: 1_500_000_000,
            remainingQuantity: 1,
          },
          {
            sourceType: "PREVIOUS_CARRYOVER",
            sourceLedgerId: "previous-ledger",
            sourcePurchaseItemId: null,
            sourceBusinessDate: new Date("2026-07-20T00:00:00.000Z"),
            unitPrice: 1_500_000_000,
            remainingQuantity: 1,
          },
        ],
        legacyOpening: { unitPrice: 1, quantity: 0 },
        purchases: [],
        closingQuantity: 0,
        businessDate: new Date("2026-07-21T00:00:00.000Z"),
      }),
    /FIFO_AMOUNT_UNAVAILABLE/,
  );
});

test("FIFO persistence reuses a prepared snapshot without rereading its sources", async () => {
  const fifoPath = path.join(
    root,
    "src",
    "features",
    "inventory",
    "fifo-lots.ts",
  );
  const { refreshLedgerInventoryFifoLots } = await import(
    pathToFileURL(fifoPath).href
  );
  const inventoryUpdates = [];
  const createdLots = [];
  const unexpectedRead = () => {
    throw new Error("prepared FIFO persistence must not reread sources");
  };
  const tx = {
    dailyLedger: { findUnique: unexpectedRead },
    ledgerInventoryItem: {
      findMany: async () => [
        {
          id: "inventory-item",
          productId: "product-1",
          unitPrice: 100,
          previousQuantity: 2,
          currentQuantity: 1,
          quantity: 1,
          carryoverLedgerId: null,
        },
      ],
      update: async (input) => {
        inventoryUpdates.push(input);
      },
    },
    ledgerInventoryFifoLot: {
      deleteMany: async () => undefined,
      findMany: unexpectedRead,
      createMany: async ({ data }) => {
        createdLots.push(...data);
      },
    },
    ledgerLossLotAllocation: {
      deleteMany: async () => undefined,
    },
    ledgerPurchaseItem: { findMany: unexpectedRead },
    ledgerLossItem: { findMany: unexpectedRead },
    // 품목 금액은 왕복 수를 품목 수와 분리하려고 벌크 UPDATE 한 번으로 쓴다.
    $executeRawUnsafe: async (sql, ...params) => {
      inventoryUpdates.push({ sql, params });
      return 1;
    },
  };
  const fifo = {
    lots: [
      {
        lotOriginKey: "lot-1",
        sourceType: "PREVIOUS_CARRYOVER",
        sourceLedgerId: "previous-ledger",
        sourcePurchaseItemId: null,
        sourceBusinessDate: new Date("2026-07-20T00:00:00.000Z"),
        unitPrice: 100,
        originalQuantity: 2,
        consumedQuantity: 1,
        lossQuantity: 0,
        soldQuantity: 1,
        remainingQuantity: 1,
        originalAmount: 200,
        consumedAmount: 100,
        lossAmount: 0,
        soldAmount: 100,
        remainingAmount: 100,
        sortOrder: 0,
      },
    ],
    consumedAmount: 100,
    lossAmount: 0,
    soldAmount: 100,
    lossAllocations: [],
    remainingAmount: 100,
    containsLegacyOpening: false,
  };

  await refreshLedgerInventoryFifoLots(
    tx,
    "ledger-1",
    new Map([["product-1", { purchasedQuantity: 0, lossItems: [], fifo }]]),
  );

  assert.equal(inventoryUpdates.length, 1);
  assert.match(inventoryUpdates[0].sql, /UPDATE "LedgerInventoryItem"/);
  assert.deepEqual(inventoryUpdates[0].params, ["inventory-item", "0", 100]);
  assert.equal(createdLots.length, 1);
  assert.equal(createdLots[0].ledgerInventoryItemId, "inventory-item");
  assert.equal(createdLots[0].remainingAmount, 100);
});

test("every follow-up mutation response recomputes and forwards the inventory gate", async () => {
  const source = await readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  const dtoCalls =
    source.match(
      /toStoreManagerLedgerCostStepData\(\s*afterLedger,\s*inventoryGate\.complete,?\s*\)/g,
    ) ?? [];

  assert.equal(dtoCalls.length, 5);
  assert.match(source, /action:\s*"ledger\.sales_payment\.updated"/);
  assert.match(source, /action:\s*"ledger\.expenses\.saved"/);
  assert.match(source, /action:\s*"ledger\.purchases\.saved"/);
  assert.match(source, /action:\s*"ledger\.work_info\.saved"/);
  assert.match(source, /action:\s*"ledger\.labor\.saved"/);
});

test("inventory save reuses its validated FIFO snapshot after CAS", async () => {
  const source = await readProjectFile(
    "src",
    "features",
    "inventory",
    "actions.ts",
  );
  const transaction = source.slice(
    source.indexOf("const result = await db.$transaction"),
    source.indexOf('if ("ok" in result)'),
  );

  assert.match(
    transaction,
    /const fifoPreflight\s*=\s*await getLedgerInventoryFifoAmountErrorProductIdsInTx\(/,
  );
  assert.match(transaction, /fifoPreflight\.invalidProductIds/);
  assert.match(
    transaction,
    /refreshLedgerInventoryFifoLots\(\s*tx,\s*before\.id,\s*fifoPreflight\.snapshotsByProductId,?\s*\)/,
  );
  assert.ok(
    transaction.indexOf("getLedgerInventoryFifoAmountErrorProductIdsInTx(") <
      transaction.indexOf("dailyLedger.updateMany("),
  );
});

test("입고분 판매가 검사는 화면 DOM이 아닌 React 입력 상태를 기준으로 한다", async () => {
  const source = await readProjectFile(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );
  const validation = source.slice(
    source.indexOf("function validateRequiredPlannedUnitPrices"),
    source.indexOf("function validateInventorySaveAdjustments"),
  );
  const submission = source.slice(
    source.indexOf("const submittedLotPrices"),
    source.indexOf("const pendingReceipt"),
  );

  assert.doesNotMatch(validation, /lotPriceRefs\.current/);
  assert.doesNotMatch(submission, /lotPriceRefs\.current/);
  assert.match(validation, /item\.lotPriceInputs\[lot\.lotOriginKey\]/);
  assert.match(submission, /item\.lotPriceInputs\[lot\.lotOriginKey\]/);
});

test("입고날짜별 판매가 칸은 입고 정보 바로 옆에 고정한다", async () => {
  const source = await readProjectFile(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );

  assert.match(
    source,
    /sm:grid-cols-\[minmax\(12rem,15rem\)_8rem_7rem\][^"\n]*sm:justify-start/,
  );
  assert.doesNotMatch(source, /sm:grid-cols-\[minmax\(0,1fr\)_8rem_7rem\]/);
});
