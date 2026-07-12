import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  assertOpeningCarryoverIncidentPlans,
  assertOpeningCarryoverIncidentTargets,
  assertOpeningCarryoverRepairProtectedState,
  parseOpeningCarryoverRepairOptions,
  planOpeningCarryoverRepair,
  requireOpeningCarryoverAuditEvidence,
} from "../../src/features/inventory/opening-carryover-repair.ts";

const openingDetail = {
  source: "OPENING_SNAPSHOT",
  status: "OPENING_CARRYOVER",
  resolvedQuantity: 8,
  sourceLedgerId: null,
  sourceLedgerClosingDate: null,
  sourceLedgerStatus: null,
  sourceYearMonth: "2026-07",
  sourceSnapshotId: "snapshot-1",
  sourcePreviousQuantity: 8,
  sourcePurchasedQuantity: null,
  sourceLossQuantity: null,
  sourceCurrentQuantity: null,
  sourceQuantity: 8,
  message: "월초 재고 스냅샷에서 넘어온 품목입니다.",
  history: [],
};

const auditItem = {
  id: "product-1",
  productId: "product-1",
  productName: "광어",
  productCategory: "활어",
  productSpec: "1kg",
  unitPrice: 12000,
  previousQuantity: 8,
  purchasedQuantity: 0,
  currentQuantity: 8,
  quantity: 8,
  inventoryAmount: 96000,
  isModified: false,
  carryoverSource: "OPENING_SNAPSHOT",
  carryoverStatus: "OPENING_CARRYOVER",
  carryoverLedgerId: null,
  previousQuantityDetail: openingDetail,
};

const snapshot = {
  id: "snapshot-1",
  productId: "product-1",
  yearMonth: "2026-07",
  quantity: 8,
};

const protectedLedger = {
  id: "ledger-1",
  storeId: "store-1",
  closingDate: "2026-07-11T00:00:00.000Z",
  status: "IN_PROGRESS",
  version: 4,
  authorDisplayName: "제일수산 점장",
  totalSalesAmount: 100000,
  cashAmount: 20000,
  cardAmount: 70000,
  otherPaymentAmount: 10000,
  workerCount: 3,
  workMemo: "사용자 입력",
  submittedById: null,
  submittedAt: null,
  closedById: null,
  closedAt: null,
  lossReviewedById: "actor-1",
  lossReviewedAt: "2026-07-11T09:00:00.000Z",
  createdById: "actor-1",
  updatedById: "actor-2",
  createdAt: "2026-07-11T08:00:00.000Z",
  updatedAt: "2026-07-11T10:00:00.000Z",
};

const protectedInventoryItem = {
  id: "existing-item",
  productId: "existing-product",
  currentQuantity: 3,
  quantity: 4,
};

const protectedCreate = {
  productId: "created-product",
  currentQuantity: 8,
  quantity: 8,
};

function changedProtectedState(overrides = {}) {
  return {
    ledger: {
      ...protectedLedger,
      version: protectedLedger.version + 1,
      updatedAt: "2026-07-11T10:00:01.000Z",
      ...overrides,
    },
    inventoryItems: [
      protectedInventoryItem,
      { id: "created-item", ...protectedCreate },
    ],
  };
}

const protectedBefore = {
  ledger: protectedLedger,
  inventoryItems: [protectedInventoryItem],
};

const changedProtectedPlan = {
  creates: [protectedCreate],
  updates: [],
};

const root = process.cwd();

function plan(overrides = {}) {
  return planOpeningCarryoverRepair({
    auditItems: [auditItem],
    currentItems: [],
    snapshots: [snapshot],
    ...overrides,
  });
}

function requireAudit(overrides = {}) {
  return requireOpeningCarryoverAuditEvidence({
    audit: {
      actorId: "actor-1",
      before: {
        id: "ledger-1",
        storeId: "store-1",
        closingDate: "2026-07-11T00:00:00.000Z",
        items: [auditItem],
      },
      ...overrides,
    },
    ledger: {
      id: "ledger-1",
      storeId: "store-1",
      storeName: "제일수산",
    },
    closingDate: new Date("2026-07-11T00:00:00.000Z"),
  });
}

test("first-save audit requires a nonempty actor and boolean isModified", () => {
  assert.equal(requireAudit().actorId, "actor-1");
  assert.throws(() => requireAudit({ actorId: " " }), /EVIDENCE_MISMATCH/);
  assert.throws(() => requireAudit({ actorId: 7 }), /EVIDENCE_MISMATCH/);

  for (const isModified of [undefined, "false", null]) {
    assert.throws(
      () =>
        requireAudit({
          before: {
            id: "ledger-1",
            storeId: "store-1",
            closingDate: "2026-07-11T00:00:00.000Z",
            items: [{ ...auditItem, isModified }],
          },
        }),
      /EVIDENCE_MISMATCH/,
    );
  }
});

test("first-save audit rejects primitive rows and returns only validated opening items", () => {
  assert.throws(
    () =>
      requireAudit({
        before: {
          id: "ledger-1",
          storeId: "store-1",
          closingDate: "2026-07-11T00:00:00.000Z",
          items: [auditItem, null],
        },
      }),
    /EVIDENCE_MISMATCH/,
  );

  const result = requireAudit({
    before: {
      id: "ledger-1",
      storeId: "store-1",
      closingDate: "2026-07-11T00:00:00.000Z",
      items: [{ carryoverSource: "MANUAL" }, auditItem],
    },
  });

  assert.deepEqual(result.auditItems, [auditItem]);
});

test("repair planning rejects empty opening evidence", () => {
  assert.throws(() => plan({ auditItems: [] }), /EVIDENCE_MISMATCH/);
});

test("missing current opening row is planned as a create", () => {
  const result = plan();

  assert.equal(result.creates.length, 1);
  assert.equal(result.creates[0].productId, auditItem.productId);
  assert.equal(result.creates[0].currentQuantity, auditItem.currentQuantity);
  assert.equal(result.creates[0].quantity, auditItem.quantity);
  assert.equal(result.creates[0].previousQuantity, auditItem.previousQuantity);
  assert.deepEqual(result.creates[0].previousQuantityDetail, openingDetail);
  assert.deepEqual(result.updates, []);
});

test("current MANUAL row gets only its opening basis fields updated", () => {
  const currentItem = {
    ...auditItem,
    id: "current-item",
    previousQuantity: 0,
    currentQuantity: 3,
    quantity: 4,
    carryoverSource: "MANUAL",
    carryoverStatus: "DATA_INSUFFICIENT",
    previousQuantityDetail: {
      ...openingDetail,
      source: "MANUAL",
      status: "DATA_INSUFFICIENT",
      resolvedQuantity: 0,
      sourceSnapshotId: null,
    },
  };

  const result = plan({ currentItems: [currentItem] });

  assert.deepEqual(result.updates[0], {
    id: "current-item",
    previousQuantity: 8,
    carryoverSource: "OPENING_SNAPSHOT",
    carryoverStatus: "OPENING_CARRYOVER",
    carryoverLedgerId: null,
    previousQuantityDetail: auditItem.previousQuantityDetail,
  });
  assert.equal("currentQuantity" in result.updates[0], false);
  assert.equal("quantity" in result.updates[0], false);
  assert.deepEqual(result.creates, []);
});

test("correct OPENING_SNAPSHOT row is skipped", () => {
  const currentItem = { ...auditItem, id: "current-item" };

  const result = plan({ currentItems: [currentItem] });

  assert.deepEqual(result.creates, []);
  assert.deepEqual(result.updates, []);
  assert.deepEqual(result.skips, [
    { id: "current-item", productId: "product-1" },
  ]);
});

test("missing or quantity-mismatched snapshot evidence is rejected", () => {
  assert.throws(() => plan({ snapshots: [] }), /EVIDENCE_MISMATCH/);
  assert.throws(
    () => plan({ snapshots: [{ ...snapshot, id: "wrong-snapshot" }] }),
    /EVIDENCE_MISMATCH/,
  );
  assert.throws(
    () => plan({ snapshots: [{ ...snapshot, quantity: 9 }] }),
    /EVIDENCE_MISMATCH/,
  );
  assert.throws(
    () =>
      plan({
        snapshots: [
          snapshot,
          {
            ...snapshot,
            id: "snapshot-2",
            productId: "product-2",
          },
        ],
      }),
    /EVIDENCE_MISMATCH/,
  );
});

test("contradictory opening detail evidence is rejected before planning writes", () => {
  const invalidDetails = [
    ["detail source", { source: "MANUAL" }],
    ["detail status", { status: "DATA_INSUFFICIENT" }],
    ["source ledger id", { sourceLedgerId: "ledger-1" }],
    [
      "source ledger date",
      { sourceLedgerClosingDate: "2026-07-10T00:00:00.000Z" },
    ],
    ["source ledger status", { sourceLedgerStatus: "IN_PROGRESS" }],
    ["source month", { sourceYearMonth: "2026-06" }],
    ["source snapshot id", { sourceSnapshotId: null }],
    ["resolved quantity", { resolvedQuantity: 7 }],
    ["source previous quantity", { sourcePreviousQuantity: 7 }],
    ["purchased quantity", { sourcePurchasedQuantity: 0 }],
    ["loss quantity", { sourceLossQuantity: 0 }],
    ["current quantity", { sourceCurrentQuantity: 8 }],
    ["source quantity", { sourceQuantity: 7 }],
    ["empty message", { message: " " }],
    ["non-array history", { history: {} }],
  ];

  for (const [label, detailPatch] of invalidDetails) {
    assert.throws(
      () =>
        plan({
          auditItems: [
            {
              ...auditItem,
              previousQuantityDetail: {
                ...auditItem.previousQuantityDetail,
                ...detailPatch,
              },
            },
          ],
        }),
      /EVIDENCE_MISMATCH/,
      label,
    );
  }
});

test("duplicate evidence and unrelated current carryover sources are rejected", () => {
  assert.throws(
    () => plan({ auditItems: [auditItem, { ...auditItem }] }),
    /EVIDENCE_MISMATCH/,
  );
  assert.throws(
    () => plan({ snapshots: [snapshot, { ...snapshot, id: "snapshot-2" }] }),
    /EVIDENCE_MISMATCH/,
  );
  assert.throws(
    () =>
      plan({
        currentItems: [
          {
            ...auditItem,
            id: "current-item",
            carryoverSource: "PREVIOUS_SAVED_LEDGER",
          },
        ],
      }),
    /EVIDENCE_MISMATCH/,
  );
});

test("wrong OPENING_SNAPSHOT basis is repaired from audited evidence", () => {
  const currentItem = {
    ...auditItem,
    id: "current-item",
    previousQuantity: 7,
  };

  const result = plan({ currentItems: [currentItem] });

  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].previousQuantity, 8);
});

test("OPENING_SNAPSHOT row with missing carryover detail is repaired", () => {
  const currentItem = {
    ...auditItem,
    id: "current-item",
    previousQuantityDetail: null,
  };

  const result = plan({ currentItems: [currentItem] });

  assert.equal(result.updates.length, 1);
  assert.deepEqual(
    result.updates[0].previousQuantityDetail,
    auditItem.previousQuantityDetail,
  );
});

test("running the planner against already repaired rows is idempotent", () => {
  const first = plan();
  const repairedItem = { id: "created-item", ...first.creates[0] };

  const second = plan({ currentItems: [repairedItem] });

  assert.equal(second.creates.length, 0);
  assert.equal(second.updates.length, 0);
  assert.equal(second.skips.length, 1);
});

test("protected-state assertion accepts only the planned version and inventory additions", () => {
  assert.doesNotThrow(() =>
    assertOpeningCarryoverRepairProtectedState({
      before: protectedBefore,
      after: changedProtectedState(),
      plan: changedProtectedPlan,
    }),
  );
  assert.doesNotThrow(() =>
    assertOpeningCarryoverRepairProtectedState({
      before: protectedBefore,
      after: protectedBefore,
      plan: { creates: [], updates: [] },
    }),
  );
  assert.doesNotThrow(() =>
    assertOpeningCarryoverRepairProtectedState({
      before: protectedBefore,
      after: {
        ledger: changedProtectedState().ledger,
        inventoryItems: [protectedInventoryItem],
      },
      plan: { creates: [], updates: [{ id: "existing-item" }] },
    }),
  );
});

test("protected-state assertion rejects every changed ledger business scalar", () => {
  for (const key of Object.keys(protectedLedger).filter(
    (field) => field !== "version" && field !== "updatedAt",
  )) {
    const value = protectedLedger[key];
    const changedValue =
      typeof value === "number"
        ? value + 1
        : value === null
          ? "changed"
          : `${value}-changed`;

    assert.throws(
      () =>
        assertOpeningCarryoverRepairProtectedState({
          before: protectedBefore,
          after: changedProtectedState({ [key]: changedValue }),
          plan: changedProtectedPlan,
        }),
      /EVIDENCE_MISMATCH/,
      key,
    );
  }
});

test("protected-state assertion requires the exact version and updatedAt transition", () => {
  for (const ledgerPatch of [
    { version: protectedLedger.version },
    { version: protectedLedger.version + 2 },
    { updatedAt: protectedLedger.updatedAt },
    { updatedAt: "2026-07-11T09:59:59.000Z" },
  ]) {
    assert.throws(
      () =>
        assertOpeningCarryoverRepairProtectedState({
          before: protectedBefore,
          after: changedProtectedState(ledgerPatch),
          plan: changedProtectedPlan,
        }),
      /EVIDENCE_MISMATCH/,
    );
  }

  assert.throws(
    () =>
      assertOpeningCarryoverRepairProtectedState({
        before: protectedBefore,
        after: {
          ...protectedBefore,
          ledger: { ...protectedLedger, version: protectedLedger.version + 1 },
        },
        plan: { creates: [], updates: [] },
      }),
    /EVIDENCE_MISMATCH/,
  );
});

test("protected-state assertion rejects removed or quantity-changed existing rows", () => {
  for (const inventoryItems of [
    [{ id: "created-item", ...protectedCreate }],
    [
      { ...protectedInventoryItem, currentQuantity: 2 },
      { id: "created-item", ...protectedCreate },
    ],
    [
      { ...protectedInventoryItem, quantity: 2 },
      { id: "created-item", ...protectedCreate },
    ],
    [
      { ...protectedInventoryItem, productId: "changed-product" },
      { id: "created-item", ...protectedCreate },
    ],
  ]) {
    assert.throws(
      () =>
        assertOpeningCarryoverRepairProtectedState({
          before: protectedBefore,
          after: { ...changedProtectedState(), inventoryItems },
          plan: changedProtectedPlan,
        }),
      /EVIDENCE_MISMATCH/,
    );
  }
});

test("protected-state assertion rejects missing, unexpected, or quantity-changed created rows", () => {
  for (const inventoryItems of [
    [protectedInventoryItem],
    [
      protectedInventoryItem,
      { id: "created-item", ...protectedCreate, currentQuantity: 7 },
    ],
    [
      protectedInventoryItem,
      { id: "created-item", ...protectedCreate, quantity: 7 },
    ],
    [
      protectedInventoryItem,
      { id: "created-item", ...protectedCreate },
      {
        id: "unexpected-item",
        productId: "unexpected-product",
        currentQuantity: 1,
        quantity: 1,
      },
    ],
  ]) {
    assert.throws(
      () =>
        assertOpeningCarryoverRepairProtectedState({
          before: protectedBefore,
          after: { ...changedProtectedState(), inventoryItems },
          plan: changedProtectedPlan,
        }),
      /EVIDENCE_MISMATCH/,
    );
  }
});

test("repair options require an exact date and one explicit mode", () => {
  const env = {
    DATABASE_URL: "postgresql://postgres:pw@localhost:5432/erp_fish",
  };

  assert.throws(
    () => parseOpeningCarryoverRepairOptions(["--dry-run"], env),
    /--date=YYYY-MM-DD/,
  );
  assert.throws(
    () =>
      parseOpeningCarryoverRepairOptions(
        ["--date=2026-02-30", "--dry-run"],
        env,
      ),
    /--date=YYYY-MM-DD/,
  );
  assert.throws(
    () =>
      parseOpeningCarryoverRepairOptions(
        ["--date=2026-07-12", "--dry-run"],
        env,
      ),
    /2026-07-11/,
  );
  assert.throws(
    () => parseOpeningCarryoverRepairOptions(["--date=2026-07-11"], env),
    /--dry-run.*--yes/,
  );
  assert.throws(
    () =>
      parseOpeningCarryoverRepairOptions(
        ["--date=2026-07-11", "--dry-run", "--yes"],
        env,
      ),
    /exactly one/i,
  );

  const options = parseOpeningCarryoverRepairOptions(
    ["--date=2026-07-11", "--dry-run"],
    env,
  );

  assert.equal(options.date, "2026-07-11");
  assert.equal(options.closingDate.toISOString(), "2026-07-11T00:00:00.000Z");
  assert.equal(options.yearMonth, "2026-07");
  assert.equal(options.isDryRun, true);
});

test("repair options reject unknown and duplicate arguments", () => {
  const env = {
    DATABASE_URL: "postgresql://postgres:pw@localhost:5432/erp_fish",
  };

  assert.throws(
    () =>
      parseOpeningCarryoverRepairOptions(
        ["--date=2026-07-11", "--dry-run", "--store=store-1"],
        env,
      ),
    /Unknown argument/,
  );

  for (const args of [
    ["--date=2026-07-11", "--date=2026-07-11", "--dry-run"],
    ["--date=2026-07-11", "--dry-run", "--dry-run"],
    ["--date=2026-07-11", "--yes", "--yes"],
  ]) {
    assert.throws(
      () => parseOpeningCarryoverRepairOptions(args, env),
      /Duplicate argument/,
    );
  }
});

test("incident target manifest requires the exact three stores", () => {
  const targets = [
    { storeName: "제일수산" },
    { storeName: "삼국유통" },
    { storeName: "강서수산" },
  ];

  assert.doesNotThrow(() =>
    assertOpeningCarryoverIncidentTargets({
      date: "2026-07-11",
      targets,
    }),
  );

  for (const invalidTargets of [
    targets.slice(0, 2),
    [...targets.slice(0, 2), { storeName: "미등록지점" }],
    [targets[0], targets[0], targets[2]],
    [...targets, { storeName: "미등록지점" }],
  ]) {
    assert.throws(
      () =>
        assertOpeningCarryoverIncidentTargets({
          date: "2026-07-11",
          targets: invalidTargets,
        }),
      /EVIDENCE_MISMATCH/,
    );
  }
});

test("incident plan manifest requires 25, 25, and 21 opening items", () => {
  const plans = [
    { storeName: "제일수산", createCount: 5, updateCount: 0, skipCount: 20 },
    { storeName: "삼국유통", createCount: 15, updateCount: 0, skipCount: 10 },
    { storeName: "강서수산", createCount: 4, updateCount: 0, skipCount: 17 },
  ];

  assert.doesNotThrow(() =>
    assertOpeningCarryoverIncidentPlans({
      date: "2026-07-11",
      plans,
    }),
  );
  assert.throws(
    () =>
      assertOpeningCarryoverIncidentPlans({
        date: "2026-07-11",
        plans: [{ ...plans[0], skipCount: 19 }, plans[1], plans[2]],
      }),
    /EVIDENCE_MISMATCH/,
  );
  assert.throws(
    () =>
      assertOpeningCarryoverIncidentPlans({
        date: "2026-07-12",
        plans,
      }),
    /EVIDENCE_MISMATCH/,
  );
});

test("remote repair writes require both --yes and the remote allow flag", () => {
  const remoteEnv = {
    DATABASE_URL:
      "postgresql://user:pw@ep-example-pooler.us-east-1.aws.neon.tech/erp_fish",
  };

  assert.doesNotThrow(() =>
    parseOpeningCarryoverRepairOptions(
      ["--date=2026-07-11", "--dry-run"],
      remoteEnv,
    ),
  );
  assert.throws(
    () =>
      parseOpeningCarryoverRepairOptions(
        ["--date=2026-07-11", "--yes"],
        remoteEnv,
      ),
    /ALLOW_REMOTE_INVENTORY_REPAIR=yes/,
  );

  const options = parseOpeningCarryoverRepairOptions(
    ["--date=2026-07-11", "--yes"],
    { ...remoteEnv, ALLOW_REMOTE_INVENTORY_REPAIR: "yes" },
  );

  assert.equal(options.isDryRun, false);
  assert.equal(options.host, "ep-example-pooler.us-east-1.aws.neon.tech");
});

test("repair command wires audited evidence, one transaction, and derived refreshes", () => {
  const source = readFileSync(
    path.join(root, "scripts", "repair-opening-inventory-carryover.mjs"),
    "utf8",
  );

  assert.match(source, /import "\.\/_loadenv\.mjs"/);
  assert.match(source, /parseOpeningCarryoverRepairOptions/);
  assert.match(source, /closingDate:\s*options\.closingDate/);
  assert.match(source, /HEADQUARTERS_CLOSED/);
  assert.match(source, /HOLIDAY/);
  assert.match(source, /action:\s*"ledger\.inventory\.saved"/);
  assert.match(source, /orderBy:\s*\[?\{\s*createdAt:\s*"asc"/);
  assert.match(source, /requireOpeningCarryoverAuditEvidence/);
  assert.match(source, /assertOpeningCarryoverIncidentTargets/);
  assert.match(source, /assertOpeningCarryoverIncidentPlans/);
  assert.match(source, /yearMonth:\s*options\.yearMonth/);
  assert.match(source, /if \(options\.isDryRun\)/);
  assert.equal(source.match(/\.\$transaction\(/g)?.length, 2);
  assert.match(source, /isolationLevel:\s*"Serializable"/);
  assert.match(source, /SELECT\s+"id"\s+FROM\s+"DailyLedger"[\s\S]*FOR UPDATE/);
  assert.match(
    source,
    /lockAndLoadTargetLedgersInTx\(tx, options\)[\s\S]*loadRepairPlansForLedgers/,
  );
  assert.match(source, /persistLedgerInventoryCarryoverDetail/);
  assert.match(source, /syncLedgerInventoryPurchasedQuantitiesInTx/);
  assert.match(source, /reconcileLedgerInventoryAdjustments/);
  assert.match(source, /refreshLedgerInventoryFifoLots/);
  assert.match(
    source,
    /action:\s*"inventory_opening_snapshot\.carryover_repaired"/,
  );
  assert.match(source, /과거재고 이월 누락 복구/);
  assert.match(source, /assertIdempotent/);
  assert.match(source, /isModified:\s*create\.isModified/);
  assert.match(
    source,
    /where:\s*\{\s*id:\s*update\.id,\s*dailyLedgerId:\s*ledger\.id\s*\}/,
  );
  assert.doesNotMatch(source, /dailyLedger\.(?:create|upsert)/);
});

test("changed repair plans bump only the ledger version before commit", () => {
  const source = readFileSync(
    path.join(root, "scripts", "repair-opening-inventory-carryover.mjs"),
    "utf8",
  );
  const bumpFunction = source.match(
    /async function bumpChangedLedgerVersionInTx[\s\S]*?\r?\n}\r?\n/,
  );

  assert.ok(bumpFunction);
  assert.match(bumpFunction[0], /dailyLedger\.update/);
  assert.match(bumpFunction[0], /version:\s*\{\s*increment:\s*1\s*\}/);
  assert.doesNotMatch(bumpFunction[0], /status\s*:/);
  assert.match(
    source,
    /if \(await applyRepairPlan\(tx, entry\)\) \{\s*await bumpChangedLedgerVersionInTx\(tx, entry\);\s*changedEntries\.push\(entry\)/,
  );
});

test("repair command verifies protected state before idempotency and audit writes", () => {
  const source = readFileSync(
    path.join(root, "scripts", "repair-opening-inventory-carryover.mjs"),
    "utf8",
  );

  assert.match(source, /assertOpeningCarryoverRepairProtectedState/);
  assert.match(source, /protectedBefore/);
  assert.match(source, /async function assertProtectedStateInTx/);
  assert.match(source, /authorDisplayName:\s*true/);
  assert.match(source, /totalSalesAmount:\s*true/);
  assert.match(source, /lossReviewedAt:\s*true/);
  assert.match(source, /currentQuantity:\s*true/);
  assert.match(source, /quantity:\s*true/);

  const transactionBody = source.slice(
    source.indexOf("const entries = await db.$transaction"),
  );
  const protectedStateIndex = transactionBody.indexOf(
    "await assertProtectedStateInTx(tx, entry)",
  );
  const idempotencyIndex = transactionBody.indexOf(
    "await assertIdempotent(tx, entry, options)",
  );
  const auditIndex = transactionBody.indexOf(
    "await writeRepairAudit(tx, entry, options)",
  );

  assert.ok(protectedStateIndex >= 0);
  assert.ok(protectedStateIndex < idempotencyIndex);
  assert.ok(idempotencyIndex < auditIndex);
});

test("dry-run planning uses one coherent read-only RepeatableRead transaction", () => {
  const source = readFileSync(
    path.join(root, "scripts", "repair-opening-inventory-carryover.mjs"),
    "utf8",
  );
  const dryRunFunction = source.match(
    /async function loadDryRunPlans[\s\S]*?\r?\n}\r?\n/,
  );

  assert.ok(dryRunFunction);
  assert.match(dryRunFunction[0], /SET TRANSACTION READ ONLY/);
  assert.match(dryRunFunction[0], /isolationLevel:\s*"RepeatableRead"/);
  assert.match(dryRunFunction[0], /loadAllRepairPlans\(tx, options\)/);
  assert.doesNotMatch(dryRunFunction[0], /FOR UPDATE|applyRepairPlan/);
  assert.match(
    source,
    /if \(options\.isDryRun\) \{\s*const entries = await loadDryRunPlans\(db, options\)/,
  );
});

test("repair command is exposed and Node-loadable inventory imports stay relative", () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(root, "package.json"), "utf8"),
  );
  const auditFormat = readFileSync(
    path.join(root, "src", "features", "audit", "audit-format.ts"),
    "utf8",
  );
  const reconciliation = readFileSync(
    path.join(
      root,
      "src",
      "features",
      "inventory",
      "adjustment-reconciliation.ts",
    ),
    "utf8",
  );

  assert.equal(
    packageJson.scripts["db:repair:opening-inventory"],
    "node --experimental-strip-types scripts/repair-opening-inventory-carryover.mjs",
  );
  assert.match(
    auditFormat,
    /"inventory_opening_snapshot\.carryover_repaired":\s*"과거재고 이월 누락 복구"/,
  );
  assert.doesNotMatch(reconciliation, /from "~\//);
  assert.match(
    reconciliation,
    /\.\.\/\.\.\/server\/calculations\/inventory\.ts/,
  );
  assert.match(reconciliation, /\.\/inventory-persist-policy\.ts/);
  assert.match(reconciliation, /\.\.\/\.\.\/lib\/decimal\.ts/);
});
