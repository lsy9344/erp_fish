import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  parseOpeningCarryoverRepairOptions,
  planOpeningCarryoverRepair,
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
  quantity: 8,
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
  assert.match(source, /audit\.before\.items/);
  assert.match(source, /yearMonth:\s*options\.yearMonth/);
  assert.match(source, /if \(options\.isDryRun\)/);
  assert.equal(source.match(/\.\$transaction\(/g)?.length, 1);
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
  assert.doesNotMatch(source, /dailyLedger\.(?:create|update|upsert)/);
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
