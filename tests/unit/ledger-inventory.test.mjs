import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

function readProjectFile(...segments) {
  return readFileSync(assertProjectFile(...segments), "utf8");
}

function migrationDirNames() {
  const migrationDir = assertProjectFile("prisma", "migrations");

  return readdirSync(migrationDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

test("ledger inventory models and migration preserve inventory snapshots", () => {
  const schema = readProjectFile("prisma", "schema.prisma");

  assert.match(
    schema,
    /enum\s+InventoryCarryoverSource\s*{[^}]*OPENING_SNAPSHOT[^}]*PREVIOUS_CLOSED_LEDGER[^}]*PREVIOUS_SAVED_LEDGER[^}]*MANUAL[^}]*}/s,
  );
  assert.match(
    schema,
    /enum\s+InventoryCarryoverStatus\s*{[^}]*PREVIOUS_CARRYOVER[^}]*REVIEW_REQUIRED[^}]*CARRYOVER_EMPTY[^}]*CARRYOVER_RECHECK_REQUIRED[^}]*OPENING_CARRYOVER[^}]*DATA_INSUFFICIENT[^}]*POLICY_UNCONFIRMED[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+LedgerInventoryItem\s*{[^}]*dailyLedgerId\s+String[^}]*productId\s+String[^}]*productName\s+String[^}]*productCategory\s+String[^}]*productSpec\s+String[^}]*unitPrice\s+Int[^}]*previousQuantity\s+Int[^}]*purchasedQuantity\s+Int[^}]*currentQuantity\s+Int\?[^}]*inventoryAmount\s+Int\?[^}]*carryoverSource\s+InventoryCarryoverSource[^}]*carryoverStatus\s+InventoryCarryoverStatus[^}]*carryoverLedgerId\s+String\?[^}]*@@index\(\[dailyLedgerId\]\)[^}]*@@index\(\[productId\]\)/s,
  );
  assert.match(
    schema,
    /model\s+LedgerInventoryItem\s*{[^}]*currentQuantity\s+Int\?[^}]*quantity\s+Int\?[^}]*inventoryAmount\s+Int\?/s,
    "inventory rows should persist current inventory and quantity separately",
  );
  assert.match(
    schema,
    /model\s+LedgerInventoryItem\s*{[^}]*carryoverDetail\s+LedgerInventoryCarryoverDetail\?/s,
    "inventory rows should have one carryover detail record",
  );
  assert.match(
    schema,
    /model\s+LedgerInventoryCarryoverDetail\s*{[^}]*ledgerInventoryItemId\s+String\s+@unique[^}]*source\s+InventoryCarryoverSource[^}]*status\s+InventoryCarryoverStatus[^}]*resolvedQuantity\s+Int[^}]*sourceLedgerId\s+String\?[^}]*sourceLedgerClosingDate\s+DateTime\?[^}]*sourceLedgerStatus\s+DailyLedgerStatus\?[^}]*sourceYearMonth\s+String\?[^}]*sourceSnapshotId\s+String\?[^}]*sourcePreviousQuantity\s+Int\?[^}]*sourcePurchasedQuantity\s+Int\?[^}]*sourceLossQuantity\s+Int\?[^}]*sourceCurrentQuantity\s+Int\?[^}]*sourceQuantity\s+Int\?[^}]*message\s+String/s,
    "carryover detail should persist the source data needed for the previous-stock popup",
  );
  assert.match(
    schema,
    /model\s+InventoryOpeningSnapshot\s*{[^}]*storeId\s+String[^}]*yearMonth\s+String[^}]*productId\s+String[^}]*productName\s+String[^}]*productCategory\s+String[^}]*productSpec\s+String[^}]*unitPrice\s+Int[^}]*quantity\s+Int[^}]*@@unique\(\[storeId,\s*yearMonth,\s*productId\]/s,
  );
  assert.match(
    schema,
    /model\s+DailyLedger\s*{[^}]*ledgerInventoryItems\s+LedgerInventoryItem\[\]/s,
  );

  const migrationName = migrationDirNames().find((name) =>
    name.includes("add_ledger_inventory_items"),
  );
  assert.ok(migrationName, "inventory migration should exist");

  const migration = readFileSync(
    assertProjectFile("prisma", "migrations", migrationName, "migration.sql"),
    "utf8",
  );
  assert.ok(
    migration.includes('CREATE TABLE "LedgerInventoryItem"'),
    "migration should create LedgerInventoryItem",
  );
  assert.ok(
    migration.includes('CREATE TABLE "InventoryOpeningSnapshot"'),
    "migration should create InventoryOpeningSnapshot",
  );
  assert.ok(
    migration.includes('"previousQuantity" INTEGER NOT NULL') &&
      migration.includes('"currentQuantity" INTEGER') &&
      migration.includes('"quantity" INTEGER') &&
      migration.includes('"inventoryAmount" INTEGER'),
    "migration should store carryover, current inventory, quantity, and calculated amount",
  );

  const statusMigrationName = migrationDirNames().find((name) =>
    name.includes("inventory_carryover_status"),
  );
  assert.ok(statusMigrationName, "carryover status migration should exist");

  const statusMigration = readFileSync(
    assertProjectFile(
      "prisma",
      "migrations",
      statusMigrationName,
      "migration.sql",
    ),
    "utf8",
  );
  assert.ok(
    statusMigration.includes("ADD VALUE 'PREVIOUS_SAVED_LEDGER'") &&
      statusMigration.includes('CREATE TYPE "InventoryCarryoverStatus"') &&
      statusMigration.includes(
        '"carryoverStatus" "InventoryCarryoverStatus"',
      ) &&
      statusMigration.includes('UPDATE "LedgerInventoryItem"') &&
      statusMigration.includes("'OPENING_CARRYOVER'::") &&
      statusMigration.includes("'PREVIOUS_CARRYOVER'::") &&
      statusMigration.includes("'CARRYOVER_EMPTY'::"),
    "migration should add previous saved ledger source and row carryover status",
  );

  const detailMigrationName = migrationDirNames().find((name) =>
    name.includes("inventory_carryover_detail"),
  );
  assert.ok(detailMigrationName, "carryover detail migration should exist");

  const detailMigration = readFileSync(
    assertProjectFile(
      "prisma",
      "migrations",
      detailMigrationName,
      "migration.sql",
    ),
    "utf8",
  );
  assert.ok(
    detailMigration.includes('CREATE TABLE "LedgerInventoryCarryoverDetail"') &&
      detailMigration.includes(
        'CREATE UNIQUE INDEX "LedgerInventoryCarryoverDetail_ledgerInventoryItemId_key"',
      ) &&
      detailMigration.includes("ON DELETE CASCADE") &&
      detailMigration.includes('INSERT INTO "LedgerInventoryCarryoverDetail"'),
    "migration should create and backfill carryover detail rows",
  );
});

test("ledger inventory adjustment model and audit reason are persisted", () => {
  const schema = readProjectFile("prisma", "schema.prisma");

  assert.match(
    schema,
    /model\s+AuditLog\s*{[^}]*reason\s+String\?/s,
    "AuditLog should expose a structured reason column",
  );
  assert.match(
    schema,
    /model\s+DailyLedger\s*{[^}]*ledgerInventoryAdjustments\s+LedgerInventoryAdjustment\[\]/s,
    "DailyLedger should expose inventory adjustment rows",
  );
  assert.match(
    schema,
    /model\s+Product\s*{[^}]*ledgerInventoryAdjustments\s+LedgerInventoryAdjustment\[\]/s,
    "Product should relate to inventory adjustment rows",
  );
  assert.match(
    schema,
    /model\s+User\s*{[^}]*createdLedgerInventoryAdjustments\s+LedgerInventoryAdjustment\[\]\s+@relation\("LedgerInventoryAdjustmentCreatedBy"\)[^}]*updatedLedgerInventoryAdjustments\s+LedgerInventoryAdjustment\[\]\s+@relation\("LedgerInventoryAdjustmentUpdatedBy"\)/s,
    "User should track adjustment authors",
  );
  assert.match(
    schema,
    /model\s+LedgerInventoryAdjustment\s*{[^}]*dailyLedgerId\s+String[^}]*productId\s+String[^}]*ledgerInventoryItemId\s+String\?[^}]*productName\s+String[^}]*productCategory\s+String[^}]*productSpec\s+String[^}]*unitPrice\s+Int[^}]*beforeQuantity\s+Int[^}]*beforeAmount\s+Int[^}]*afterQuantity\s+Int[^}]*afterAmount\s+Int[^}]*differenceQuantity\s+Int[^}]*differenceAmount\s+Int[^}]*amountStatus\s+InventoryAdjustmentAmountStatus[^}]*reason\s+String[^}]*createdById\s+String[^}]*updatedById\s+String[^}]*@@unique\(\[dailyLedgerId,\s*productId\]/s,
    "LedgerInventoryAdjustment should store before/after snapshots, policy status, and one original adjustment per ledger product",
  );
  assert.match(
    schema,
    /enum\s+InventoryAdjustmentAmountStatus\s*{[^}]*POLICY_UNCONFIRMED[^}]*CONFIRMED[^}]*}/s,
    "inventory adjustment amounts should carry an explicit policy status",
  );
  assert.match(
    schema,
    /enum\s+InventoryLotSource\s*{[^}]*OPENING[^}]*PREVIOUS_CARRYOVER[^}]*PURCHASE[^}]*LEGACY_OPENING[^}]*}/s,
    "FIFO lot source should distinguish opening, carryover, purchase, and legacy opening lots",
  );
  assert.match(
    schema,
    /model\s+DailyLedger\s*{[^}]*ledgerInventoryFifoLots\s+LedgerInventoryFifoLot\[\]/s,
    "DailyLedger should expose FIFO lot snapshots",
  );
  assert.match(
    schema,
    /model\s+Product\s*{[^}]*ledgerInventoryFifoLots\s+LedgerInventoryFifoLot\[\]/s,
    "Product should relate to FIFO lot snapshots",
  );
  assert.match(
    schema,
    /model\s+LedgerPurchaseItem\s*{[^}]*ledgerInventoryFifoLots\s+LedgerInventoryFifoLot\[\]/s,
    "purchase rows should relate to FIFO purchase lots",
  );
  assert.match(
    schema,
    /model\s+LedgerInventoryFifoLot\s*{[^}]*dailyLedgerId\s+String[^}]*productId\s+String[^}]*sourceType\s+InventoryLotSource[^}]*sourceLedgerId\s+String\?[^}]*sourcePurchaseItemId\s+String\?[^}]*unitPrice\s+Int[^}]*originalQuantity\s+Int[^}]*consumedQuantity\s+Int[^}]*remainingQuantity\s+Int[^}]*originalAmount\s+Int[^}]*consumedAmount\s+Int[^}]*remainingAmount\s+Int[^}]*sortOrder\s+Int[^}]*@@index\(\[dailyLedgerId,\s*productId\]\)/s,
    "FIFO lot snapshots should persist quantities, amounts, source links, and stable sort order",
  );

  const migrationName = migrationDirNames().find((name) =>
    name.includes("add_ledger_inventory_adjustments"),
  );
  assert.ok(migrationName, "inventory adjustment migration should exist");

  const migration = readFileSync(
    assertProjectFile("prisma", "migrations", migrationName, "migration.sql"),
    "utf8",
  );
  assert.ok(
    migration.includes('ALTER TABLE "AuditLog" ADD COLUMN "reason" TEXT'),
    "migration should add AuditLog.reason",
  );
  assert.ok(
    migration.includes('CREATE TABLE "LedgerInventoryAdjustment"'),
    "migration should create LedgerInventoryAdjustment",
  );
  assert.ok(
    migration.includes('"differenceQuantity" INTEGER NOT NULL') &&
      migration.includes('"differenceAmount" INTEGER NOT NULL'),
    "migration should store signed difference values",
  );

  const policyMigrationName = migrationDirNames().find((name) =>
    name.includes("inventory_adjustment_amount_status"),
  );
  assert.ok(
    policyMigrationName,
    "inventory adjustment amount status migration should exist",
  );

  const policyMigration = readFileSync(
    assertProjectFile(
      "prisma",
      "migrations",
      policyMigrationName,
      "migration.sql",
    ),
    "utf8",
  );
  assert.ok(
    policyMigration.includes('CREATE TYPE "InventoryAdjustmentAmountStatus"') &&
      policyMigration.includes('"amountStatus"') &&
      policyMigration.includes("'POLICY_UNCONFIRMED'"),
    "migration should mark existing adjustment amount fields as policy-unconfirmed",
  );

  const fifoMigrationName = migrationDirNames().find((name) =>
    name.includes("add_inventory_fifo_lots"),
  );
  assert.ok(fifoMigrationName, "FIFO lot migration should exist");

  const fifoMigration = readFileSync(
    assertProjectFile(
      "prisma",
      "migrations",
      fifoMigrationName,
      "migration.sql",
    ),
    "utf8",
  );
  assert.ok(
    fifoMigration.includes('CREATE TYPE "InventoryLotSource"') &&
      fifoMigration.includes('CREATE TABLE "LedgerInventoryFifoLot"') &&
      fifoMigration.includes('"remainingAmount" INTEGER NOT NULL'),
    "migration should create FIFO source enum and lot snapshot table",
  );
});

test("inventory schema validates current inventory and quantity separately", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "schemas.ts",
  );
  const { ledgerInventorySchema } = await import(
    pathToFileURL(schemaPath).href
  );

  const payload = {
    storeId: "store-gangnam",
    ledgerId: "ledger-1",
    closingDate: "2026-06-11",
    version: 1,
    items: [
      {
        productId: "product-1",
        currentQuantity: "5",
        quantity: "3",
      },
    ],
  };

  assert.equal(ledgerInventorySchema.safeParse(payload).success, true);
  const parsedBlank = ledgerInventorySchema.parse({
    ...payload,
    items: [{ productId: "product-1", currentQuantity: "", quantity: "" }],
  });
  assert.equal(parsedBlank.items[0].currentQuantity, null);
  assert.equal(parsedBlank.items[0].quantity, null);

  for (const value of [-1, 1.5, "1,000"]) {
    const parsed = ledgerInventorySchema.safeParse({
      ...payload,
      items: [
        { productId: "product-1", currentQuantity: value, quantity: "1" },
      ],
    });

    assert.equal(parsed.success, false);
  }

  const invalidQuantity = ledgerInventorySchema.safeParse({
    ...payload,
    items: [
      { productId: "product-1", currentQuantity: "1", quantity: "1,000" },
    ],
  });
  assert.equal(invalidQuantity.success, false);

  const blankProduct = ledgerInventorySchema.safeParse({
    ...payload,
    items: [{ productId: " ", currentQuantity: "1", quantity: "1" }],
  });
  assert.equal(blankProduct.success, false);
});

test("inventory adjustment schema requires reason and safe actual quantity", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "schemas.ts",
  );
  const { ledgerInventoryAdjustmentSchema } = await import(
    pathToFileURL(schemaPath).href
  );

  const payload = {
    storeId: "store-gangnam",
    ledgerId: "ledger-1",
    closingDate: "2026-06-11",
    version: 1,
    productId: "product-1",
    actualQuantity: "5",
    reason: "실사 재고 차이 확인",
  };

  const parsed = ledgerInventoryAdjustmentSchema.parse(payload);
  assert.equal(parsed.actualQuantity, 5);
  assert.equal(parsed.reason, "실사 재고 차이 확인");

  for (const reason of ["", "   "]) {
    const invalid = ledgerInventoryAdjustmentSchema.safeParse({
      ...payload,
      reason,
    });
    assert.equal(invalid.success, false);
    assert.equal(invalid.error.issues[0].message, "조정 사유를 입력해 주세요.");
  }

  for (const actualQuantity of [-1, 1.5, "1,000", ""]) {
    const invalid = ledgerInventoryAdjustmentSchema.safeParse({
      ...payload,
      actualQuantity,
    });
    assert.equal(invalid.success, false);
  }

  assert.equal(
    ledgerInventoryAdjustmentSchema.safeParse({ ...payload, productId: " " })
      .success,
    false,
  );
  assert.equal(
    ledgerInventoryAdjustmentSchema.safeParse({ ...payload, storeId: " " })
      .success,
    false,
  );
});

test("inventory calculations expose amount and calculation unavailable states", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "inventory.ts",
  );
  const { calculateInventoryAmount } = await import(
    pathToFileURL(calcPath).href
  );

  assert.equal(calculateInventoryAmount(5, 12000), 60000);
  assert.equal(calculateInventoryAmount(0, 12000), 0);
  assert.equal(calculateInventoryAmount(null, 12000), null);
  assert.equal(calculateInventoryAmount(5, null), null);
  assert.equal(calculateInventoryAmount(2_147_483_647, 2), null);
});

test("inventory loss badges describe loss amount without sale amount ambiguity", () => {
  const componentSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );

  assert.match(componentSource, /손실액 \$\{formatKrw\(item\.lossAmount\)\}/);
});

test("inventory adjustment calculations derive before after and signed differences", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "inventory.ts",
  );
  const { calculateSystemInventoryQuantity, calculateInventoryAdjustment } =
    await import(pathToFileURL(calcPath).href);

  assert.equal(
    calculateSystemInventoryQuantity({
      previousQuantity: 7,
      purchasedQuantity: 3,
    }),
    10,
  );

  assert.deepEqual(
    calculateInventoryAdjustment({
      beforeQuantity: 10,
      beforeAmount: 120000,
      afterQuantity: 8,
      unitPrice: 12000,
    }),
    {
      beforeQuantity: 10,
      beforeAmount: 120000,
      afterQuantity: 8,
      afterAmount: 96000,
      differenceQuantity: -2,
      differenceAmount: -24000,
    },
  );
  assert.equal(
    calculateInventoryAdjustment({
      beforeQuantity: 2_147_483_647,
      beforeAmount: 2_147_483_647,
      afterQuantity: 2_147_483_647,
      unitPrice: 2,
    }),
    null,
  );
});

test("FIFO lot calculation consumes oldest lots first and marks legacy opening lots", async () => {
  const fifoPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "fifo-lots.ts",
  );
  const { calculateFifoLotSnapshots } = await import(
    pathToFileURL(fifoPath).href
  );

  const result = calculateFifoLotSnapshots({
    previousLots: [
      {
        sourceType: "PREVIOUS_CARRYOVER",
        sourceLedgerId: "previous-ledger",
        sourcePurchaseItemId: null,
        unitPrice: 100,
        remainingQuantity: 10,
      },
    ],
    legacyOpening: {
      unitPrice: 999,
      quantity: 10,
    },
    purchases: [
      {
        id: "purchase-1",
        unitPrice: 200,
        quantity: 10,
      },
    ],
    closingQuantity: 5,
  });

  assert.equal(result.consumedAmount, 2_000);
  assert.equal(result.remainingAmount, 1_000);
  assert.equal(result.containsLegacyOpening, false);
  assert.deepEqual(
    result.lots.map((lot) => ({
      sourceType: lot.sourceType,
      unitPrice: lot.unitPrice,
      originalQuantity: lot.originalQuantity,
      consumedQuantity: lot.consumedQuantity,
      remainingQuantity: lot.remainingQuantity,
      consumedAmount: lot.consumedAmount,
      remainingAmount: lot.remainingAmount,
    })),
    [
      {
        sourceType: "PREVIOUS_CARRYOVER",
        unitPrice: 100,
        originalQuantity: 10,
        consumedQuantity: 10,
        remainingQuantity: 0,
        consumedAmount: 1_000,
        remainingAmount: 0,
      },
      {
        sourceType: "PURCHASE",
        unitPrice: 200,
        originalQuantity: 10,
        consumedQuantity: 5,
        remainingQuantity: 5,
        consumedAmount: 1_000,
        remainingAmount: 1_000,
      },
    ],
  );

  const legacyResult = calculateFifoLotSnapshots({
    previousLots: [],
    legacyOpening: {
      unitPrice: 100,
      quantity: 10,
    },
    purchases: [],
    closingQuantity: 5,
  });

  assert.equal(legacyResult.containsLegacyOpening, true);
  assert.equal(legacyResult.consumedAmount, 500);
  assert.equal(legacyResult.remainingAmount, 500);
  assert.equal(legacyResult.lots[0].sourceType, "LEGACY_OPENING");

  const carriedLegacyResult = calculateFifoLotSnapshots({
    previousLots: [
      {
        sourceType: "LEGACY_OPENING",
        sourceLedgerId: "previous-ledger",
        sourcePurchaseItemId: null,
        unitPrice: 100,
        remainingQuantity: 5,
      },
    ],
    legacyOpening: {
      unitPrice: 100,
      quantity: 0,
    },
    purchases: [],
    closingQuantity: 3,
  });

  assert.equal(carriedLegacyResult.containsLegacyOpening, true);
  assert.equal(carriedLegacyResult.consumedAmount, 200);
  assert.equal(carriedLegacyResult.remainingAmount, 300);
  assert.equal(carriedLegacyResult.lots[0].sourceType, "LEGACY_OPENING");

  // WO-G(2026-06-22): lot의 영업 기준일(sourceBusinessDate)을 보존/지정한다.
  // - PURCHASE / 기초 lot: 현재 장부의 businessDate를 사용한다.
  // - 이월 lot(PREVIOUS_CARRYOVER): 원천 영업일을 그대로 보존한다.
  const businessDate = new Date("2026-06-22T00:00:00.000Z");
  const carryoverDate = new Date("2026-05-01T00:00:00.000Z");
  const dateResult = calculateFifoLotSnapshots({
    previousLots: [
      {
        sourceType: "PREVIOUS_CARRYOVER",
        sourceLedgerId: "previous-ledger",
        sourcePurchaseItemId: null,
        sourceBusinessDate: carryoverDate,
        unitPrice: 100,
        remainingQuantity: 5,
      },
    ],
    legacyOpening: { unitPrice: 100, quantity: 0 },
    purchases: [{ id: "purchase-1", unitPrice: 200, quantity: 5 }],
    closingQuantity: 10,
    businessDate,
  });

  const carryoverLot = dateResult.lots.find(
    (lot) => lot.sourceType === "PREVIOUS_CARRYOVER",
  );
  const purchaseLot = dateResult.lots.find(
    (lot) => lot.sourceType === "PURCHASE",
  );
  assert.equal(
    carryoverLot.sourceBusinessDate.getTime(),
    carryoverDate.getTime(),
    "carryover lot must preserve its original business date",
  );
  assert.equal(
    purchaseLot.sourceBusinessDate.getTime(),
    businessDate.getTime(),
    "purchase lot must use the current ledger business date",
  );

  // 원천 영업일이 없는 이월 lot은 현재 businessDate로 보정한다.
  const fallbackResult = calculateFifoLotSnapshots({
    previousLots: [
      {
        sourceType: "PREVIOUS_CARRYOVER",
        sourceLedgerId: "previous-ledger",
        sourcePurchaseItemId: null,
        sourceBusinessDate: null,
        unitPrice: 100,
        remainingQuantity: 5,
      },
    ],
    legacyOpening: { unitPrice: 100, quantity: 0 },
    purchases: [],
    closingQuantity: 5,
    businessDate,
  });
  assert.equal(
    fallbackResult.lots[0].sourceBusinessDate.getTime(),
    businessDate.getTime(),
  );
});

// WO-G(2026-06-22): 스키마와 마이그레이션에 FIFO lot 영업 기준일이 추가된다.
test("LedgerInventoryFifoLot has sourceBusinessDate column and migration", () => {
  const schema = readProjectFile("prisma", "schema.prisma");

  assert.match(
    schema,
    /model\s+LedgerInventoryFifoLot\s*{[^}]*sourceBusinessDate\s+DateTime\?/s,
  );

  const migrationDir = assertProjectFile("prisma", "migrations");
  const sql = readdirSync(migrationDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(migrationDir, entry.name, "migration.sql"))
    .filter((sqlPath) => existsSync(sqlPath))
    .map((sqlPath) => readFileSync(sqlPath, "utf8"))
    .find((content) =>
      /ALTER TABLE "LedgerInventoryFifoLot" ADD COLUMN "sourceBusinessDate"/.test(
        content,
      ),
    );

  assert.ok(
    sql,
    "a migration must add LedgerInventoryFifoLot.sourceBusinessDate",
  );
});

test("purchase, loss, and inventory save actions refresh FIFO lot snapshots", () => {
  // WO-02(2026-06-22): 매입/손실/재고 저장 후 FIFO lot snapshot과 inventoryAmount가
  // 자동 최신화되도록, 각 저장 액션이 refreshLedgerInventoryFifoLots를 호출해야 한다.
  const actionFiles = [
    ["src", "features", "inventory", "actions.ts"],
    ["src", "features", "inventory", "hq-edit-actions.ts"],
    ["src", "features", "ledger", "actions.ts"],
    ["src", "features", "ledger", "hq-edit-actions.ts"],
    ["src", "features", "losses", "actions.ts"],
    ["src", "features", "losses", "hq-edit-actions.ts"],
  ];

  for (const segments of actionFiles) {
    const source = readProjectFile(...segments);
    const label = segments.join("/");

    assert.match(
      source,
      /refreshLedgerInventoryFifoLots\(/,
      `${label} should call refreshLedgerInventoryFifoLots after saving`,
    );
    assert.match(
      source,
      /from\s+"[^"]*fifo-lots"/,
      `${label} should import the FIFO lot engine`,
    );
  }
});

test("inventory normal save requires matching adjustment record for changed actual quantities", async () => {
  const guardPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "adjustment-save-guard.ts",
  );
  const { getInventorySaveAdjustmentErrors } = await import(
    pathToFileURL(guardPath).href
  );
  const items = [
    {
      productId: "product-1",
      previousQuantity: 10,
      purchasedQuantity: 3,
      lossQuantity: 1,
      currentQuantity: 9,
    },
    {
      productId: "product-2",
      previousQuantity: 5,
      purchasedQuantity: 0,
      lossQuantity: 0,
      currentQuantity: 5,
    },
    {
      productId: "product-3",
      previousQuantity: 2,
      purchasedQuantity: 0,
      lossQuantity: 0,
      currentQuantity: null,
    },
  ];

  assert.deepEqual(getInventorySaveAdjustmentErrors(items, []), {
    "items.0.currentQuantity": ["재고 차이 조정 사유를 먼저 저장해 주세요."],
  });
  assert.deepEqual(
    getInventorySaveAdjustmentErrors(items, [
      { productId: "product-1", afterQuantity: 8 },
    ]),
    {
      "items.0.currentQuantity": ["재고 차이 조정 사유를 먼저 저장해 주세요."],
    },
  );
  assert.deepEqual(
    getInventorySaveAdjustmentErrors(items, [
      { productId: "product-1", afterQuantity: 9 },
    ]),
    {},
  );
});

test("store inventory save does not overwrite untouched rows with null (prev-day carryover stays non-zero)", async () => {
  const policyPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "inventory-persist-policy.ts",
  );
  const { shouldPersistInventoryLine } = await import(
    pathToFileURL(policyPath).href
  );

  // 이미 DB에 저장된 행(id !== productId)은 사용자가 값을 바꾸지 않아도 보존을
  // 위해 항상 다시 기록한다. 그래야 delete+recreate 후에도 기존 값이 살아남는다.
  const persistedRow = {
    id: "inv-cuid-1",
    productId: "product-1",
    currentQuantity: 7,
    quantity: 7,
  };
  assert.equal(shouldPersistInventoryLine(persistedRow, 7, 7), true);

  // 아직 저장된 적 없는 seed 행(id === productId)을 빈 채(null)로 두면 기록하지
  // 않는다. 기록하면 currentQuantity=null이 박혀 다음 날 전일재고가 0이 된다.
  const untouchedSeedRow = {
    id: "product-2",
    productId: "product-2",
    currentQuantity: null,
    quantity: null,
  };
  assert.equal(shouldPersistInventoryLine(untouchedSeedRow, null, null), false);

  // seed 행이라도 사용자가 값을 입력하면 기록한다.
  assert.equal(shouldPersistInventoryLine(untouchedSeedRow, 5, 5), true);

  // 저장된 행의 값이 바뀌면 기록한다.
  assert.equal(shouldPersistInventoryLine(persistedRow, 9, 9), true);

  // 지점장 저장 경로(actions.ts)도 본사와 동일한 가드로 빈 행을 건너뛰는지 확인한다.
  const actionSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "actions.ts",
  );
  assert.match(
    actionSource,
    /shouldPersistInventoryLine\(item, currentQuantity, quantity\)/,
    "store inventory save should reuse the shared persist guard",
  );
  assert.match(
    actionSource,
    /const rowsToPersist = before\.items\.flatMap/,
    "store inventory save should build a filtered rowsToPersist list",
  );
  assert.match(
    actionSource,
    /rowsToPersist\.length > 0[\s\S]*createMany[\s\S]*persistLedgerInventoryCarryoverDetails[\s\S]*rowsToPersist\.some/,
    "store inventory save should only persist carryover details for persisted rows",
  );

  // 본사 경로(hq-edit-actions.ts)도 같은 공유 가드를 import해 정책을 공유한다.
  const hqSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "hq-edit-actions.ts",
  );
  assert.match(
    hqSource,
    /from\s+"\.\/inventory-persist-policy"/,
    "HQ inventory save should import the shared persist guard",
  );
  assert.doesNotMatch(
    hqSource,
    /function\s+shouldPersistInventoryLine/,
    "shouldPersistInventoryLine should be defined once in the shared module, not duplicated",
  );
});

test("inventory queries and actions implement carryover, purchase aggregation, and audit contracts", () => {
  const typeSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "types.ts",
  );
  assert.match(typeSource, /export\s+type\s+InventoryCarryoverDetailView/);
  assert.match(
    typeSource,
    /previousQuantityDetail:\s+InventoryCarryoverDetailView/,
  );
  assert.match(typeSource, /export\s+type\s+InventoryCarryoverHistoryRow/);
  assert.match(typeSource, /history:\s+InventoryCarryoverHistoryRow\[\]/);

  const querySource = readProjectFile(
    "src",
    "features",
    "inventory",
    "queries.ts",
  );
  assert.match(querySource, /export\s+async\s+function\s+getInventoryStepData/);
  assert.match(
    querySource,
    /InventoryOpeningSnapshot|inventoryOpeningSnapshot/,
  );
  assert.match(querySource, /HEADQUARTERS_CLOSED/);
  assert.match(
    querySource,
    /PREVIOUS_SAVED_LEDGER/,
    "carryover should support the latest saved ledger before headquarters close",
  );
  assert.match(querySource, /PREVIOUS_CLOSED_LEDGER/);
  assert.match(querySource, /OPENING_SNAPSHOT/);
  assert.match(querySource, /REVIEW_REQUIRED/);
  assert.match(querySource, /CARRYOVER_EMPTY/);
  assert.match(querySource, /CARRYOVER_RECHECK_REQUIRED/);
  assert.match(querySource, /DATA_INSUFFICIENT/);
  assert.match(querySource, /isPreviousCalendarDate/);
  assert.match(
    querySource,
    /getYearMonth\(priorLedger\.closingDate\) === yearMonth/,
    "same-month prior ledgers should be used before month opening snapshots",
  );
  assert.match(
    querySource,
    /월초 스냅샷이나 전일 장부가 없어 가장 최근 저장 장부/,
    "older saved ledgers should still be shown as carryover-empty candidates when opening data is missing",
  );
  assert.match(querySource, /ledgerPurchaseItems/);
  assert.match(querySource, /purchasedQuantity/);
  assert.match(querySource, /purchaseAmount/);
  assert.match(querySource, /carryoverDetail/);
  assert.match(querySource, /toCarryoverDetailView/);
  assert.match(querySource, /buildLedgerCarryoverDetail/);
  assert.match(querySource, /buildSnapshotCarryoverDetail/);
  assert.match(querySource, /attachCarryoverHistories/);
  assert.match(querySource, /historyLimit/);
  assert.match(querySource, /sourceLossQuantity/);
  assert.match(
    querySource,
    /getActiveProductBases/,
    "manual and empty carryover states should still show active products",
  );

  const actionSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "actions.ts",
  );
  assert.match(actionSource, /"use server"/);
  assert.match(
    actionSource,
    /export\s+async\s+function\s+saveLedgerInventoryItems/,
  );
  assert.match(actionSource, /ledgerInventorySchema\.safeParse/);
  assert.match(actionSource, /requireStoreManagerLedgerEditAccess\(/);
  assert.match(actionSource, /db\.\$transaction/);
  assert.match(actionSource, /!isLedgerEditable\(before\.status\)/);
  assert.match(actionSource, /tx\.ledgerInventoryItem\.deleteMany/);
  assert.match(actionSource, /tx\.ledgerInventoryItem\.createMany/);
  assert.match(actionSource, /persistLedgerInventoryCarryoverDetails/);
  assert.match(actionSource, /carryoverStatus:\s*item\.carryoverStatus/);
  assert.match(
    actionSource,
    /reconcileLedgerInventoryAdjustments\(/,
    "normal inventory save should keep existing adjustment records in sync",
  );
  assert.match(
    actionSource,
    /getInventorySaveAdjustmentErrors\(/,
    "normal inventory save should reject changed actual quantities without matching adjustment records",
  );
  assert.match(
    actionSource,
    /editableLedger\.count !== 1\)\s*{\s*throw new Error\("LEDGER_CONFLICT"\)/,
    "inventory save should report stale version races as ledger conflicts",
  );
  assert.match(actionSource, /action:\s*"ledger\.inventory\.saved"/);
  assert.match(actionSource, /writeAuditLog\(/);
  assert.match(actionSource, /revalidateInventoryPaths\(\)/);
  assert.match(actionSource, /revalidateStoreEntryPaths\(\["inventory"\]\)/);
});

test("inventory adjustment query action and audit contracts are wired", () => {
  const typeSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "types.ts",
  );
  assert.match(typeSource, /export\s+type\s+InventoryAdjustmentView/);
  assert.match(typeSource, /adjustment:\s+InventoryAdjustmentView\s+\|\s+null/);

  const querySource = readProjectFile(
    "src",
    "features",
    "inventory",
    "queries.ts",
  );
  assert.match(
    querySource,
    /ledgerInventoryAdjustment\.findMany|ledgerInventoryAdjustments/,
  );
  assert.match(querySource, /createdBy:\s*{[\s\S]*select:\s*{[\s\S]*name:/);
  assert.match(querySource, /adjustment:/);
  assert.match(querySource, /amountStatus:\s*true/);
  assert.match(
    querySource,
    /amountStatus:\s*adjustment\.amountStatus/,
    "queries should expose adjustment amount policy status",
  );
  const safeMapperSource = querySource.slice(
    querySource.indexOf("export function toStoreManagerInventoryStepData"),
  );
  assert.doesNotMatch(
    safeMapperSource,
    /beforeAmount:\s*adjustment\.beforeAmount|afterAmount:\s*adjustment\.afterAmount|differenceAmount:\s*adjustment\.differenceAmount/s,
    "store manager safe mapper should not include adjustment amount fields",
  );

  const actionSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "actions.ts",
  );
  assert.match(
    actionSource,
    /export\s+async\s+function\s+saveLedgerInventoryAdjustment/,
  );
  assert.match(actionSource, /ledgerInventoryAdjustmentSchema\.safeParse/);
  assert.match(actionSource, /requireStoreManagerLedgerEditAccess\(/);
  assert.match(actionSource, /db\.\$transaction/);
  assert.match(actionSource, /editableLedgerStatuses/);
  assert.match(actionSource, /isLedgerEditable/);
  assert.match(actionSource, /getLedgerEditBlockReason/);
  assert.match(actionSource, /tx\.ledgerInventoryAdjustment\.upsert/);
  assert.match(actionSource, /tx\.ledgerInventoryItem\.upsert/);
  assert.match(actionSource, /amountStatus:\s*"POLICY_UNCONFIRMED"/);
  assert.match(actionSource, /재고 기준을 계산할 수 없습니다/);
  assert.match(
    actionSource,
    /differenceQuantity\s*===\s*0/,
    "zero-difference adjustments should be blocked",
  );
  assert.match(
    actionSource,
    /status:\s*{\s*in:\s*\[\s*\.\.\.editableLedgerStatuses\s*\]\s*}/,
    "adjustment save should lock or conditionally guard editable ledger status",
  );
  assert.match(
    actionSource,
    /editableLedger\.count !== 1\)\s*{[\s\S]*ledgerConflictErrorFromMeta<StoreManagerInventoryStepData>\([\s\S]*section:\s*"inventory-adjustment"[\s\S]*clientValues:[\s\S]*serverValues:[\s\S]*reloadRequired:\s*true/s,
    "adjustment save should report stale version races as structured ledger conflicts",
  );
  assert.doesNotMatch(
    actionSource,
    /quantity:\s*adjustment\.afterQuantity/,
    "adjustment save should not overwrite the separate quantity field",
  );
  assert.match(actionSource, /action:\s*"ledger\.inventory_adjustment\.saved"/);
  assert.match(actionSource, /reason:\s*parsed\.data\.reason/);
  assert.match(actionSource, /revalidateInventoryPaths\(\)/);
  assert.match(actionSource, /revalidateDashboardAndReports\(\)/);

  const auditSource = readProjectFile("src", "server", "audit.ts");
  assert.match(auditSource, /reason\?:\s*string\s*\|\s*null/);
  assert.match(auditSource, /reason:\s*input\.reason\s*\?\?\s*undefined/);
});

test("inventory adjustment validation does not mutate ledger version on rejected requests", () => {
  const actionSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "actions.ts",
  );
  const storeAdjustmentSource = actionSource.slice(
    actionSource.indexOf("export async function saveLedgerInventoryAdjustment"),
    actionSource.indexOf(
      "const inventoryItem = await tx.ledgerInventoryItem.upsert",
    ),
  );
  const zeroDifferenceGuardIndex = storeAdjustmentSource.indexOf(
    "adjustment.differenceQuantity === 0",
  );
  const ledgerMutationIndex = storeAdjustmentSource.indexOf(
    "const editableLedger = await tx.dailyLedger.updateMany",
  );

  assert.ok(
    zeroDifferenceGuardIndex >= 0,
    "store adjustment save should reject zero-difference adjustments",
  );
  assert.ok(
    ledgerMutationIndex > zeroDifferenceGuardIndex,
    "store adjustment save should only increment the ledger version after validation succeeds",
  );
});

test("inventory UI is wired to the canonical inventory route", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "inventory",
    "page.tsx",
  );
  assert.match(pageSource, /InventoryStepClient/);
  assert.match(pageSource, /getInventoryStepData/);
  assert.match(pageSource, /requireStoreManagerLedgerEditAccess/);
  assert.doesNotMatch(pageSource, /재고 입력 준비/);

  const componentSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );
  // 재고 화면 용어는 중앙 사전(terms.ts)으로 분리됐다. 화면에 노출되는 용어가
  // 컴포넌트 또는 용어 사전 중 한 곳에 존재하는지 함께 확인한다.
  const termsSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "terms.ts",
  );
  const inventoryUiSource = `${componentSource}\n${termsSource}`;
  const inventoryTableSource = componentSource.slice(
    componentSource.indexOf('<Table aria-label="재고 품목"'),
    componentSource.indexOf("<TableBody>{renderRows(tab)}</TableBody>"),
  );
  assert.match(componentSource, /saveLedgerInventoryItems/);
  assert.match(componentSource, /inventoryTerms/);
  assert.match(componentSource, /냉동/);
  assert.match(componentSource, /생물/);
  assert.match(
    componentSource,
    /전일 이월 재고를 불러왔습니다\. 변경된 품목만 수정하세요\./,
  );
  assert.match(componentSource, /이월 공백/);
  assert.match(componentSource, /검토 필요/);
  assert.match(componentSource, /이월 재확인 필요/);
  assert.match(componentSource, /월초 이월/);
  assert.match(componentSource, /데이터 부족/);
  assert.match(componentSource, /기준 확인 필요/);
  assert.match(componentSource, /ROW_PAGE_SIZE = 50/);
  assert.match(componentSource, /ROW_PAGING_THRESHOLD = 30/);
  assert.match(componentSource, /scrollIntoView/);
  assert.match(componentSource, /inputMode="numeric"/);
  assert.match(componentSource, /className="h-11 tabular-nums"/);
  assert.match(componentSource, /tabular-nums/);
  assert.match(inventoryUiSource, /전일재고 이력/);
  assert.match(componentSource, /previousQuantityDetail/);
  assert.match(componentSource, /전일재고 이력 보기/);
  assert.match(componentSource, /날짜별 수량 흐름/);
  assert.match(componentSource, /현재 장부 전일재고/);
  assert.match(componentSource, /기준 장부 시작 수량/);
  assert.match(componentSource, /기준 장부 마감 수량/);
  assert.match(componentSource, /월초 스냅샷 수량/);
  assert.match(componentSource, /getCarryoverQuantityTimeline/);
  assert.match(componentSource, /이전 날짜 재고 이력/);
  assert.match(componentSource, /h-\[min\(90vh,42rem\)\]/);
  assert.match(componentSource, /grid-rows-\[auto_minmax\(0,1fr\)\]/);
  assert.match(componentSource, /overflow-hidden/);
  assert.match(componentSource, /min-h-0 overflow-y-auto overscroll-contain/);
  assert.match(componentSource, /max-h-\[18rem\]/);
  assert.match(componentSource, /overscroll-contain/);
  assert.match(componentSource, /history\.map/);
  assert.match(componentSource, /Dialog/);
  assert.match(componentSource, /overflow-x-auto/);
  assert.match(
    componentSource,
    /const viewTabs = \["전체", \.\.\.categories\]/,
  );
  assert.match(componentSource, /function resolveItemViewTab/);
  assert.match(componentSource, /if \(activeCategory === "전체"\)/);
  assert.match(
    componentSource,
    /return normalizeCategory\(item\.productCategory\)/,
  );
  assert.match(componentSource, /MAX_INVENTORY_INTEGER/);
  assert.match(componentSource, /수정됨/);
  assert.match(componentSource, /aria-label=.*수정됨/s);
  assert.match(componentSource, /min-h-11/);
  assert.match(componentSource, /saveLedgerInventoryAdjustment/);
  assert.match(componentSource, /조정 필요/);
  assert.match(componentSource, /조정됨/);
  assert.match(componentSource, /조정 사유/);
  assert.match(componentSource, /조정 전/);
  assert.match(componentSource, /조정 후/);
  assert.match(inventoryUiSource, /당일 판매량/);
  assert.match(
    componentSource,
    /return systemQuantity - actualQuantity;/,
    "당일 판매량은 기준재고에서 당일재고를 뺀 판매 흐름으로 표시해야 한다",
  );
  assert.doesNotMatch(
    componentSource,
    /return `\$\{formatQuantity\(value\)\}개`;/,
    "당일 판매량 수량 단위는 한 번만 표시해야 한다",
  );
  assert.match(
    componentSource,
    /조정 차이/,
    "강제 실사 보정의 signed 차이는 당일 판매량과 별도 라벨로 보여야 한다",
  );
  assert.match(inventoryUiSource, /실제 POS 판매 수량과 다를 수 있습니다/);
  assert.match(componentSource, /금액 기준 확인 필요/);
  assert.match(componentSource, /amountStatus === "CONFIRMED"/);
  assert.match(inventoryUiSource, /상태\/조정/);
  assert.match(
    termsSource,
    /statusAndAdjustmentHelp:\s*\n\s*"시스템이 계산한 재고와 입력한 재고\(당일재고\)가 다릅니다\. 다른 사유를 입력하세요\."/,
  );
  assert.match(
    componentSource,
    /\$\{inventoryTerms\.statusAndAdjustment\}: \$\{inventoryTerms\.statusAndAdjustmentHelp\}/,
    "status/adjustment table header should expose help text through an accessible tooltip label",
  );
  assert.match(
    componentSource,
    /<TooltipContent[\s\S]*\{inventoryTerms\.statusAndAdjustmentHelp\}[\s\S]*<\/TooltipContent>/,
    "status/adjustment table header should show the same tooltip content pattern as neighboring headers",
  );
  assert.doesNotMatch(
    inventoryTableSource,
    /inventoryTerms\.inventoryAmount|inventoryTerms\.inventoryAmountHelp/,
    "inventory entry table should not show inventory amount column or help",
  );
  assert.doesNotMatch(
    componentSource,
    /inventoryTerms\.inventoryAmount|inventoryTerms\.inventoryAmountHelp/,
    "inventory entry page should not render inventory amount labels",
  );
  assert.doesNotMatch(
    componentSource,
    /formatKrw\(item\.inventoryAmount\)/,
    "inventory rows should not display per-item inventory amount",
  );
  assert.doesNotMatch(
    componentSource,
    /재고금액은 선입선출/,
    "inventory entry help text should not mention inventory amount",
  );
  assert.match(componentSource, /formatKrw\(item\.lossAmount\)/);
  assert.match(componentSource, /getLedgerEditBlockReason/);
  assert.match(componentSource, /isLedgerReadOnly/);
  assert.match(componentSource, /휴무 장부/);
  assert.match(
    componentSource,
    /재고 조정 저장이 끝난 뒤 다시 저장해 주세요\./,
  );
  assert.match(componentSource, /reasonRefs/);
  assert.match(componentSource, /setAdjustmentErrors\({}\)/);
  assert.match(componentSource, /setFieldErrors\({}\)/);
  assert.match(
    componentSource,
    /actualQuantityError/,
    "adjustment quantity validation should be shown on the row",
  );
  assert.match(
    componentSource,
    /const actualQuantityInput =\s*currentQuantityRefs\.current\[item\.productId\]\?\.value \?\?\s*item\.currentQuantityInput/,
    "adjustment save should submit the latest visible actual quantity",
  );
  assert.match(componentSource, /actualQuantity:\s*actualQuantityInput/);
  assert.match(
    componentSource,
    /const adjustmentNeeded = !adjusted && isAdjustmentNeeded\(item\)/,
  );
  assert.match(
    componentSource,
    /const adjustmentActionLabel = adjusted \? "수정" : "조정"/,
  );
  assert.match(
    componentSource,
    /const isAdjustmentSavePending = savingAdjustmentProductId !== null/,
  );
  assert.match(
    componentSource,
    /disabled={savingAdjustmentProductId !== null \|\| isClosed}/,
  );
  assert.match(
    componentSource,
    /disabled={isSaving \|\| isClosed \|\| isAdjustmentSavePending}/,
    "full draft save should be disabled while an adjustment save is pending",
  );
  assert.match(
    componentSource,
    /mergeAdjustedLineState/,
    "saving one adjustment should not discard other unsaved row edits",
  );
  assert.match(
    componentSource,
    /validateInventorySaveAdjustments/,
    "full inventory save should block rows that still need adjustment reasons",
  );
});

test("ledger purchase save reconciles inventory adjustments affected by purchase totals", () => {
  const actionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );

  assert.match(
    actionSource,
    /reconcileLedgerInventoryAdjustments\(/,
    "purchase changes should refresh adjustment before and difference values",
  );
});

test("ledger loss save reconciles inventory adjustments affected by loss totals", () => {
  const actionSource = readProjectFile(
    "src",
    "features",
    "losses",
    "actions.ts",
  );

  assert.match(
    actionSource,
    /reconcileLedgerInventoryAdjustments\(/,
    "loss changes should refresh adjustment before and difference values",
  );
});
