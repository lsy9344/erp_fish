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
    /model\s+LedgerInventoryItem\s*{[^}]*dailyLedgerId\s+String[^}]*productId\s+String[^}]*productName\s+String[^}]*productCategory\s+String[^}]*productSpec\s+String[^}]*unitPrice\s+Int[^}]*previousQuantity\s+Decimal\s+@db\.Decimal\(12,\s*2\)[^}]*purchasedQuantity\s+Decimal\s+@default\(0\)\s+@db\.Decimal\(12,\s*2\)[^}]*currentQuantity\s+Decimal\?\s+@db\.Decimal\(12,\s*2\)[^}]*inventoryAmount\s+Int\?[^}]*carryoverSource\s+InventoryCarryoverSource[^}]*carryoverStatus\s+InventoryCarryoverStatus[^}]*carryoverLedgerId\s+String\?[^}]*@@index\(\[dailyLedgerId\]\)[^}]*@@index\(\[productId\]\)/s,
  );
  assert.match(
    schema,
    /model\s+LedgerInventoryItem\s*{[^}]*currentQuantity\s+Decimal\?\s+@db\.Decimal\(12,\s*2\)[^}]*quantity\s+Decimal\?\s+@db\.Decimal\(12,\s*2\)[^}]*inventoryAmount\s+Int\?/s,
    "inventory rows should persist current inventory and quantity separately",
  );
  assert.match(
    schema,
    /model\s+LedgerInventoryItem\s*{[^}]*carryoverDetail\s+LedgerInventoryCarryoverDetail\?/s,
    "inventory rows should have one carryover detail record",
  );
  assert.match(
    schema,
    /model\s+LedgerInventoryCarryoverDetail\s*{[^}]*ledgerInventoryItemId\s+String\s+@unique[^}]*source\s+InventoryCarryoverSource[^}]*status\s+InventoryCarryoverStatus[^}]*resolvedQuantity\s+Decimal\s+@db\.Decimal\(12,\s*2\)[^}]*sourceLedgerId\s+String\?[^}]*sourceLedgerClosingDate\s+DateTime\?[^}]*sourceLedgerStatus\s+DailyLedgerStatus\?[^}]*sourceYearMonth\s+String\?[^}]*sourceSnapshotId\s+String\?[^}]*sourcePreviousQuantity\s+Decimal\?\s+@db\.Decimal\(12,\s*2\)[^}]*sourcePurchasedQuantity\s+Decimal\?\s+@db\.Decimal\(12,\s*2\)[^}]*sourceLossQuantity\s+Decimal\?\s+@db\.Decimal\(12,\s*2\)[^}]*sourceCurrentQuantity\s+Decimal\?\s+@db\.Decimal\(12,\s*2\)[^}]*sourceQuantity\s+Decimal\?\s+@db\.Decimal\(12,\s*2\)[^}]*message\s+String/s,
    "carryover detail should persist the source data needed for the previous-stock popup",
  );
  assert.match(
    schema,
    /model\s+InventoryOpeningSnapshot\s*{[^}]*storeId\s+String[^}]*yearMonth\s+String[^}]*productId\s+String[^}]*productName\s+String[^}]*productCategory\s+String[^}]*productSpec\s+String[^}]*unitPrice\s+Int[^}]*quantity\s+Decimal\s+@db\.Decimal\(12,\s*2\)[^}]*@@unique\(\[storeId,\s*yearMonth,\s*productId\]/s,
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
    /model\s+LedgerInventoryAdjustment\s*{[^}]*dailyLedgerId\s+String[^}]*productId\s+String[^}]*ledgerInventoryItemId\s+String\?[^}]*productName\s+String[^}]*productCategory\s+String[^}]*productSpec\s+String[^}]*unitPrice\s+Int[^}]*beforeQuantity\s+Decimal\s+@db\.Decimal\(12,\s*2\)[^}]*beforeAmount\s+Int[^}]*afterQuantity\s+Decimal\s+@db\.Decimal\(12,\s*2\)[^}]*afterAmount\s+Int[^}]*differenceQuantity\s+Decimal\s+@db\.Decimal\(12,\s*2\)[^}]*differenceAmount\s+Int[^}]*amountStatus\s+InventoryAdjustmentAmountStatus[^}]*reason\s+String[^}]*createdById\s+String[^}]*updatedById\s+String[^}]*@@unique\(\[dailyLedgerId,\s*productId\]/s,
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
    /model\s+LedgerInventoryFifoLot\s*{[^}]*dailyLedgerId\s+String[^}]*productId\s+String[^}]*sourceType\s+InventoryLotSource[^}]*sourceLedgerId\s+String\?[^}]*sourcePurchaseItemId\s+String\?[^}]*unitPrice\s+Int[^}]*originalQuantity\s+Decimal\s+@db\.Decimal\(12,\s*2\)[^}]*consumedQuantity\s+Decimal\s+@db\.Decimal\(12,\s*2\)[^}]*remainingQuantity\s+Decimal\s+@db\.Decimal\(12,\s*2\)[^}]*originalAmount\s+Int[^}]*consumedAmount\s+Int[^}]*remainingAmount\s+Int[^}]*sortOrder\s+Int[^}]*@@index\(\[dailyLedgerId,\s*productId\]\)/s,
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
  const parsedDecimal = ledgerInventorySchema.parse({
    ...payload,
    items: [
      { productId: "product-1", currentQuantity: "2.2", quantity: "1.5" },
    ],
  });
  assert.equal(parsedDecimal.items[0].currentQuantity, 2.2);
  assert.equal(parsedDecimal.items[0].quantity, 1.5);

  const parsedBlank = ledgerInventorySchema.parse({
    ...payload,
    items: [
      {
        productId: "product-1",
        currentQuantity: "",
        quantity: "",
        unitPrice: "",
      },
    ],
  });
  assert.equal(parsedBlank.items[0].currentQuantity, null);
  assert.equal(parsedBlank.items[0].quantity, null);
  assert.equal(parsedBlank.items[0].unitPrice, null);

  const parsedUnitPrice = ledgerInventorySchema.parse({
    ...payload,
    items: [{ ...payload.items[0], unitPrice: "7000" }],
  });
  assert.equal(parsedUnitPrice.items[0].unitPrice, 7000);

  for (const unitPrice of [-1, "1.5", "1,000"]) {
    const parsed = ledgerInventorySchema.safeParse({
      ...payload,
      items: [{ ...payload.items[0], unitPrice }],
    });

    assert.equal(parsed.success, false);
    assert.equal(
      parsed.error.issues[0].message,
      "매입단가는 0원 이상의 정수여야 합니다.",
    );
  }

  for (const value of [-1, "2.28", "1,000"]) {
    const parsed = ledgerInventorySchema.safeParse({
      ...payload,
      items: [
        { productId: "product-1", currentQuantity: value, quantity: "1" },
      ],
    });

    assert.equal(parsed.success, false);
    assert.equal(
      parsed.error.issues[0].message,
      "재고 수량은 0 이상이고 소수점 첫째 자리까지 입력할 수 있습니다.",
    );
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

test("store inventory schema accepts two decimals and requires planned price without widening HQ", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "schemas.ts",
  );
  const { ledgerInventorySchema, ledgerStoreManagerInventorySchema } =
    await import(pathToFileURL(schemaPath).href);
  const base = {
    storeId: "store-gangnam",
    ledgerId: "ledger-1",
    closingDate: "2026-07-21",
    version: 1,
  };

  for (const quantity of ["0", "1", "1.2", "1.23", "9999999999.99"]) {
    const parsed = ledgerStoreManagerInventorySchema.parse({
      ...base,
      items: [
        {
          productId: "product-1",
          currentQuantity: quantity,
          quantity,
          unitPrice: null,
          plannedUnitPrice: "0",
          adjustmentReason: null,
        },
      ],
    });
    assert.equal(parsed.items[0].currentQuantity, Number(quantity));
    assert.equal(parsed.items[0].plannedUnitPrice, 0);
  }

  for (const quantity of [
    "-1",
    ".5",
    "1.",
    "1.234",
    "1,000",
    "1e2",
    "10000000000",
  ]) {
    assert.equal(
      ledgerStoreManagerInventorySchema.safeParse({
        ...base,
        items: [
          {
            productId: "product-1",
            currentQuantity: quantity,
            quantity,
            plannedUnitPrice: "7000",
          },
        ],
      }).success,
      false,
    );
  }

  assert.equal(
    ledgerStoreManagerInventorySchema.safeParse({
      ...base,
      items: [{ productId: "product-1", currentQuantity: "1", quantity: "1" }],
    }).success,
    false,
  );
  assert.equal(
    ledgerInventorySchema.safeParse({
      ...base,
      items: [
        { productId: "product-1", currentQuantity: "1.23", quantity: "1.23" },
      ],
    }).success,
    false,
    "shared/HQ schema must keep the one-decimal contract",
  );
});

test("planned margin uses purchase price and formats unavailable and negative results", async () => {
  const helperPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "planned-margin.ts",
  );
  const { calculatePlannedMarginRate, formatPlannedMarginRate } = await import(
    pathToFileURL(helperPath).href
  );

  assert.equal(
    formatPlannedMarginRate(calculatePlannedMarginRate(50_000, 71_429)),
    "30.0%",
  );
  assert.equal(
    formatPlannedMarginRate(calculatePlannedMarginRate(80, 50)),
    "-60.0%",
  );
  assert.equal(
    formatPlannedMarginRate(calculatePlannedMarginRate(null, 50)),
    "계산 불가",
  );
  assert.equal(
    formatPlannedMarginRate(calculatePlannedMarginRate(50, 0)),
    "계산 불가",
  );
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
    assert.equal(invalid.error.issues[0].message, "바꾼 이유를 입력해 주세요.");
  }

  const decimal = ledgerInventoryAdjustmentSchema.parse({
    ...payload,
    actualQuantity: "1.5",
  });
  assert.equal(decimal.actualQuantity, 1.5);

  for (const actualQuantity of [-1, "2.28", "1,000", ""]) {
    const invalid = ledgerInventoryAdjustmentSchema.safeParse({
      ...payload,
      actualQuantity,
    });
    assert.equal(invalid.success, false);
    assert.equal(
      invalid.error.issues[0].message,
      "실제 재고 수량은 0 이상이고 소수점 첫째 자리까지 입력할 수 있습니다.",
    );
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

test("stock decimal validation enforces numeric boundaries and resolves only scoped stored quantities", async () => {
  const validationPath = assertProjectFile("src", "lib", "validation.ts");
  const validationSource = readProjectFile("src", "lib", "validation.ts");
  const {
    MAX_VALIDATION_DECIMAL,
    consumeStoredPurchaseQuantity,
    getPurchaseQuantityIdentity,
    isNonNegativeDecimalInRange,
  } = await import(pathToFileURL(validationPath).href);

  assert.equal(isNonNegativeDecimalInRange(2.2), true);
  assert.equal(isNonNegativeDecimalInRange(2.28), false);
  assert.equal(isNonNegativeDecimalInRange(9_999_999_999.9), true);
  assert.equal(isNonNegativeDecimalInRange(10_000_000_000), false);
  assert.equal(MAX_VALIDATION_DECIMAL, 9_999_999_999.9);

  assert.doesNotMatch(
    validationSource,
    /export function resolveStoredDecimalQuantity/,
  );
  const storedRow = {
    productId: "product-1",
    purchaseStandardId: "standard-1",
    sourceType: "MANUAL",
    productName: "광어",
    productCategory: "생물",
    productSpec: "1kg",
    referenceInfo: "거래처 A",
  };
  const storedQuantityById = new Map([
    [
      "stored-row",
      { quantity: 2.28, identity: getPurchaseQuantityIdentity(storedRow) },
    ],
  ]);
  const consumedIds = new Set();
  assert.equal(
    consumeStoredPurchaseQuantity(
      "stored-row",
      null,
      storedRow,
      storedQuantityById,
      consumedIds,
    ),
    2.28,
  );
  assert.equal(
    consumeStoredPurchaseQuantity(
      "stored-row",
      null,
      storedRow,
      storedQuantityById,
      consumedIds,
    ),
    null,
  );
  assert.equal(
    consumeStoredPurchaseQuantity(
      "forged-row",
      null,
      storedRow,
      storedQuantityById,
      new Set(),
    ),
    null,
  );
});

test("stock draft quantities allow only exact persisted legacy strings", async () => {
  const decimalPath = assertProjectFile("src", "lib", "decimal.ts");
  const { parseStockQuantityDraft, toStockQuantitySaveInput } = await import(
    pathToFileURL(decimalPath).href
  );

  assert.equal(typeof parseStockQuantityDraft, "function");
  assert.equal(typeof toStockQuantitySaveInput, "function");

  assert.equal(parseStockQuantityDraft("2.28", 2.28), 2.28);
  assert.equal(parseStockQuantityDraft(" 2.28 ", 2.28), null);
  assert.equal(parseStockQuantityDraft("02.28", 2.28), null);
  assert.equal(parseStockQuantityDraft("2.280", 2.28), null);
  assert.equal(parseStockQuantityDraft("2.28", null), null);
  assert.equal(parseStockQuantityDraft("2.28", 1.28), null);
  assert.equal(parseStockQuantityDraft("1.5", null), 1.5);

  assert.equal(toStockQuantitySaveInput("2.28", 2.28), null);
  assert.equal(toStockQuantitySaveInput(" 2.28 ", 2.28), " 2.28 ");
  assert.equal(toStockQuantitySaveInput("02.28", 2.28), "02.28");
  assert.equal(toStockQuantitySaveInput("2.280", 2.28), "2.280");
  assert.equal(toStockQuantitySaveInput("2.28", null), "2.28");
  assert.equal(toStockQuantitySaveInput("1.5", 1.5), "1.5");
});

async function loadPurchasePriceHelper() {
  const helperPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "purchase-price.ts",
  );

  return import(pathToFileURL(helperPath).href);
}

test("inventory purchase price uses target-day purchases", async () => {
  const { resolveInventoryPurchasePrices } = await loadPurchasePriceHelper();

  const prices = resolveInventoryPurchasePrices("2026-07-16", [
    {
      productId: "p1",
      businessDate: "2026-07-15",
      quantity: 1,
      amount: 10_000,
    },
    {
      productId: "p1",
      businessDate: "2026-07-16",
      quantity: 1,
      amount: 12_000,
    },
  ]);

  assert.deepEqual(prices.get("p1"), {
    kind: "TODAY",
    businessDate: "2026-07-16",
    unitPrice: 12_000,
  });
});

test("inventory purchase price uses the most recent prior business date", async () => {
  const { resolveInventoryPurchasePrices } = await loadPurchasePriceHelper();

  const prices = resolveInventoryPurchasePrices("2026-07-16", [
    {
      productId: "p1",
      businessDate: "2026-07-12",
      quantity: 1,
      amount: 9_000,
    },
    {
      productId: "p1",
      businessDate: "2026-07-15",
      quantity: 1,
      amount: 11_000,
    },
  ]);

  assert.deepEqual(prices.get("p1"), {
    kind: "RECENT",
    businessDate: "2026-07-15",
    unitPrice: 11_000,
  });
});

test("inventory purchase price ignores zero-quantity dates when finding the latest purchase", async () => {
  const { resolveInventoryPurchasePrices } = await loadPurchasePriceHelper();

  const prices = resolveInventoryPurchasePrices("2026-07-16", [
    {
      productId: "p1",
      businessDate: "2026-07-15",
      quantity: 1,
      amount: 11_000,
    },
    {
      productId: "p1",
      businessDate: "2026-07-16",
      quantity: 0,
      amount: 0,
    },
  ]);

  assert.deepEqual(prices.get("p1"), {
    kind: "RECENT",
    businessDate: "2026-07-15",
    unitPrice: 11_000,
  });
});

test("inventory purchase price uses a same-day quantity-weighted average", async () => {
  const { resolveInventoryPurchasePrices } = await loadPurchasePriceHelper();

  const prices = resolveInventoryPurchasePrices("2026-07-16", [
    {
      productId: "p1",
      businessDate: "2026-07-16",
      quantity: 2,
      amount: 20_000,
    },
    {
      productId: "p1",
      businessDate: "2026-07-16",
      quantity: 1,
      amount: 20_000,
    },
  ]);

  assert.equal(prices.get("p1")?.unitPrice, 13_333);
});

test("inventory purchase price ignores future and null-product rows", async () => {
  const { resolveInventoryPurchasePrices } = await loadPurchasePriceHelper();

  const prices = resolveInventoryPurchasePrices("2026-07-16", [
    {
      productId: "p1",
      businessDate: "2026-07-17",
      quantity: 1,
      amount: 99_000,
    },
    {
      productId: "future-only",
      businessDate: "2026-07-17",
      quantity: 1,
      amount: 77_000,
    },
    {
      productId: null,
      businessDate: "2026-07-16",
      quantity: 1,
      amount: 88_000,
    },
    {
      productId: "p1",
      businessDate: "2026-07-15",
      quantity: 1,
      amount: 10_000,
    },
  ]);

  assert.deepEqual(prices.get("p1"), {
    kind: "RECENT",
    businessDate: "2026-07-15",
    unitPrice: 10_000,
  });
  assert.equal(prices.get("future-only"), null);
  assert.equal(prices.has(""), false);
});

test("inventory purchase price returns null without positive selected-day quantity", async () => {
  const { resolveInventoryPurchasePrices } = await loadPurchasePriceHelper();

  const prices = resolveInventoryPurchasePrices("2026-07-16", [
    {
      productId: "zero",
      businessDate: "2026-07-16",
      quantity: 0,
      amount: 12_000,
    },
    {
      productId: "negative",
      businessDate: "2026-07-16",
      quantity: -1,
      amount: 12_000,
    },
  ]);

  assert.equal(prices.get("zero"), null);
  assert.equal(prices.get("negative"), null);
  assert.equal(prices.get("missing") ?? null, null);
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
  assert.equal(calculateInventoryAmount(2.28, 205000), 467400);
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
  assert.equal(
    calculateSystemInventoryQuantity({
      previousQuantity: 1.25,
      purchasedQuantity: 2.5,
      lossQuantity: 0.75,
    }),
    3,
  );

  assert.deepEqual(
    calculateInventoryAdjustment({
      beforeQuantity: 10,
      beforeAmount: 120000,
      afterQuantity: 8.25,
      unitPrice: 12000,
    }),
    {
      beforeQuantity: 10,
      beforeAmount: 120000,
      afterQuantity: 8.25,
      afterAmount: 99000,
      differenceQuantity: -1.75,
      differenceAmount: -21000,
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

  const decimalResult = calculateFifoLotSnapshots({
    previousLots: [
      {
        sourceType: "PREVIOUS_CARRYOVER",
        sourceLedgerId: "previous-ledger",
        sourcePurchaseItemId: null,
        unitPrice: 100,
        remainingQuantity: 1.25,
      },
    ],
    legacyOpening: {
      unitPrice: 999,
      quantity: 0,
    },
    purchases: [
      {
        id: "purchase-decimal",
        unitPrice: 200,
        quantity: 2.5,
      },
    ],
    closingQuantity: 2,
  });

  assert.deepEqual(
    decimalResult.lots.map((lot) => ({
      originalQuantity: lot.originalQuantity,
      consumedQuantity: lot.consumedQuantity,
      remainingQuantity: lot.remainingQuantity,
      consumedAmount: lot.consumedAmount,
      remainingAmount: lot.remainingAmount,
    })),
    [
      {
        originalQuantity: 1.25,
        consumedQuantity: 1.25,
        remainingQuantity: 0,
        consumedAmount: 125,
        remainingAmount: 0,
      },
      {
        originalQuantity: 2.5,
        consumedQuantity: 0.5,
        remainingQuantity: 2,
        consumedAmount: 100,
        remainingAmount: 400,
      },
    ],
  );

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

// WO(2026-06-25, OQ-7/OQ-17): 모든 재고품목이 FIFO 계산 대상이고, 아침 본사 출고는
// 당일 판매 전 입고 lot으로 본다. 판매 수량은 마감 입력값으로 역산하며(사용 가능 수량 -
// 마감 재고), 오래된 lot(전일 이월)부터 차감한다.
//
// 작업지시서 권장 시나리오:
//   전일 이월 30개 @ 900원, 당일 본사 출고 70개 @ 1,000원
//   판매 예정가 1,300원, 마감 재고 15개
// 단가가 다른 이월 lot과 당일 출고 lot이 있을 때 FIFO가 오래된 lot부터 차감하는지 검증한다.
test("OQ-17 reverse-calc consumes oldest lots first from morning HQ shipment", async () => {
  const fifoPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "fifo-lots.ts",
  );
  const { calculateFifoLotSnapshots } = await import(
    pathToFileURL(fifoPath).href
  );

  const scenario = {
    previousLots: [
      {
        sourceType: "PREVIOUS_CARRYOVER",
        sourceLedgerId: "yesterday",
        sourcePurchaseItemId: null,
        unitPrice: 900,
        remainingQuantity: 30,
      },
    ],
    legacyOpening: { unitPrice: 0, quantity: 0 },
    // 아침 본사 출고/지점 입고 lot. 당일 판매 전 입고로 본다.
    purchases: [{ id: "hq-shipment", unitPrice: 1_000, quantity: 70 }],
    // 마감 현재 재고. 판매 수량은 (사용 가능 수량 - 마감 재고)로 역산된다.
    closingQuantity: 15,
  };

  const result = calculateFifoLotSnapshots(scenario);

  // 사용 가능 100개 - 마감 15개 = 85개가 lot에서 차감된다.
  // FIFO: 전일 이월 30개 @ 900원(27,000) -> 당일 출고 55개 @ 1,000원(55,000) = 82,000원.
  // ponytail: 현 엔진은 판매/손실을 한 묶음(소비량)으로 차감한다. 작업지시서 예시의
  //   "판매 80 + 폐기 5" 분리(COGS 77,000 / 폐기 5,000)는 손실 수량을 별도 차감하는
  //   후속 FIFO 구현 story 범위다(작업지시서 "제외" 항목). 여기서는 오래된 lot 우선 차감과
  //   판매 예정가 비의존성만 고정한다.
  assert.equal(result.consumedAmount, 82_000);
  assert.equal(result.remainingAmount, 15_000);
  assert.equal(result.containsLegacyOpening, false);
  assert.deepEqual(
    result.lots.map((lot) => ({
      sourceType: lot.sourceType,
      unitPrice: lot.unitPrice,
      consumedQuantity: lot.consumedQuantity,
      remainingQuantity: lot.remainingQuantity,
    })),
    [
      {
        sourceType: "PREVIOUS_CARRYOVER",
        unitPrice: 900,
        consumedQuantity: 30,
        remainingQuantity: 0,
      },
      {
        sourceType: "PURCHASE",
        unitPrice: 1_000,
        consumedQuantity: 55,
        remainingQuantity: 15,
      },
    ],
  );

  // 작업지시서 완료 기준: 판매 예정가를 바꿔도 FIFO 원가와 재고금액은 바뀌지 않는다.
  // calculateFifoLotSnapshots는 판매 예정가를 입력으로 받지 않으므로(FIFO 원가는 출고/이월
  // 단가로만 계산), 어떤 판매 예정가에도 같은 결과를 낸다. 같은 입력 재계산으로 이를 고정한다.
  const recomputed = calculateFifoLotSnapshots(scenario);
  assert.equal(recomputed.consumedAmount, result.consumedAmount);
  assert.equal(recomputed.remainingAmount, result.remainingAmount);
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

test("inventory normal save requires a reason only for real overstock", async () => {
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
      currentQuantity: 13,
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
    "items.0.adjustmentReason": ["재고 차이를 고친 이유를 먼저 저장해 주세요."],
  });
  assert.deepEqual(
    getInventorySaveAdjustmentErrors(items, [
      { productId: "product-1", afterQuantity: 12 },
    ]),
    {
      "items.0.adjustmentReason": [
        "재고 차이를 고친 이유를 먼저 저장해 주세요.",
      ],
    },
  );
  assert.deepEqual(
    getInventorySaveAdjustmentErrors(items, [
      { productId: "product-1", afterQuantity: 13 },
    ]),
    {},
  );
  assert.deepEqual(
    getInventorySaveAdjustmentErrors(
      [
        {
          productId: "manual-product",
          previousQuantity: 0,
          purchasedQuantity: 0,
          lossQuantity: 0,
          currentQuantity: 3,
          carryoverSource: "MANUAL",
          carryoverStatus: "CARRYOVER_EMPTY",
          carryoverLedgerId: null,
        },
      ],
      [],
    ),
    {},
    "manual first-entry rows should not require an adjustment reason on later saves",
  );

  for (const item of [
    {
      productId: "purchase-sale",
      previousQuantity: 2,
      purchasedQuantity: 6,
      lossQuantity: 0,
      currentQuantity: 2,
    },
    {
      productId: "carryover-sale",
      previousQuantity: 5,
      purchasedQuantity: 0,
      lossQuantity: 0,
      currentQuantity: 2,
    },
    {
      productId: "loss-mixed-shortage",
      previousQuantity: 5,
      purchasedQuantity: 2,
      lossQuantity: 1,
      currentQuantity: 3,
    },
    {
      productId: "equal",
      previousQuantity: 5,
      purchasedQuantity: 2,
      lossQuantity: 1,
      currentQuantity: 6,
    },
  ]) {
    assert.deepEqual(
      getInventorySaveAdjustmentErrors([item], []),
      {},
      `${item.productId} should not require an adjustment reason`,
    );
  }

  assert.deepEqual(
    getInventorySaveAdjustmentErrors(
      [
        {
          productId: "incoming-reason",
          previousQuantity: 1,
          purchasedQuantity: 2,
          lossQuantity: 0,
          currentQuantity: 4,
        },
      ],
      [],
      new Map([["incoming-reason", "counted case"]]),
    ),
    {},
    "an incoming reason should allow real overstock",
  );
});

test("inventory save errors follow submitted product identity instead of row order", async () => {
  const helperPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "inventory-save-errors.ts",
  );
  const { mapInventorySaveErrors } = await import(
    pathToFileURL(helperPath).href
  );

  const mapped = mapInventorySaveErrors(
    {
      "items.0.adjustmentReason": ["reason for submitted product-2"],
      "items.1.quantity": ["quantity for submitted product-1"],
      "items.99.currentQuantity": ["unknown product"],
      reason: ["HQ edit reason"],
    },
    ["product-2", "product-1"],
    ["product-1", "product-2"],
  );

  assert.deepEqual(mapped, {
    fieldErrors: {
      "items.0.currentQuantity": ["quantity for submitted product-1"],
      reason: ["HQ edit reason"],
    },
    adjustmentErrors: {
      "product-2": "reason for submitted product-2",
    },
    firstFocusTarget: {
      productId: "product-2",
      currentIndex: 1,
      field: "reason",
    },
  });

  assert.deepEqual(
    mapInventorySaveErrors(
      { "items.0.currentQuantity": ["current quantity error"] },
      ["product-2"],
      ["product-1", "product-2"],
    ).firstFocusTarget,
    {
      productId: "product-2",
      currentIndex: 1,
      field: "quantity",
    },
  );

  assert.deepEqual(
    mapInventorySaveErrors(
      { "items.0.unitPrice": ["manual unit price error"] },
      ["manual-product"],
      ["product-1", "manual-product"],
    ),
    {
      fieldErrors: {
        "items.1.unitPrice": ["manual unit price error"],
      },
      adjustmentErrors: {},
      firstFocusTarget: {
        productId: "manual-product",
        currentIndex: 1,
        field: "unitPrice",
      },
    },
  );

  assert.deepEqual(
    mapInventorySaveErrors(
      { "items.0.plannedUnitPrice": ["planned price error"] },
      ["product-2"],
      ["product-1", "product-2"],
    ),
    {
      fieldErrors: {
        "items.1.plannedUnitPrice": ["planned price error"],
      },
      adjustmentErrors: {},
      firstFocusTarget: {
        productId: "product-2",
        currentIndex: 1,
        field: "plannedUnitPrice",
      },
    },
  );
});

test("inventory client owns planned price drafts, margin output, raw payload, and manual removal", () => {
  const componentSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );

  assert.match(componentSource, /plannedUnitPriceInput/);
  assert.match(componentSource, /plannedUnitPriceRefs/);
  assert.match(componentSource, /validateRequiredPlannedUnitPrices/);
  assert.match(componentSource, /plannedUnitPrice:\s*toRawKrwInputValue/);
  assert.match(componentSource, /calculatePlannedMarginRate/);
  assert.match(
    componentSource,
    /<output[\s\S]*계획 마진율|계획 마진율[\s\S]*<output/,
  );
  assert.match(componentSource, /function handleRemoveManualProduct/);
  assert.match(componentSource, /추가 행 제거/);
  assert.match(componentSource, /\["당일재고", "판매계획가", "바꾼 이유"\]/);
});

test("HQ inventory shows stock and planned unit prices read-only", () => {
  const componentSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );

  assert.match(
    componentSource,
    /hasSensitiveInventoryAmounts\(item\)[\s\S]*재고 기준단가[\s\S]*formatKrw\(item\.unitPrice\)/,
  );
  assert.match(
    componentSource,
    /판매계획가[\s\S]*item\.plannedUnitPrice === null[\s\S]*미입력[\s\S]*formatKrw\(item\.plannedUnitPrice\)/,
  );
  assert.match(
    componentSource,
    /\.\.\.\(isStoreManagerMode[\s\S]*plannedUnitPrice:/,
  );
});

test("inventory bulk-save errors preserve drafts and reveal the mapped row before focus", () => {
  const componentSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );
  const saveStart = componentSource.indexOf(
    "async function saveCurrentDraft()",
  );
  const successStart = componentSource.indexOf(
    "setData(result.data);",
    saveStart,
  );
  const failurePaths = componentSource.slice(saveStart, successStart);

  assert.match(componentSource, /mapInventorySaveErrors/);
  assert.match(componentSource, /const submittedItems = items\.map/);
  assert.match(
    componentSource,
    /const submittedProductIds = submittedItems\.map\(\(item\) => item\.productId\)/,
  );
  assert.match(componentSource, /items: submittedItems/);
  assert.match(
    componentSource,
    /setAdjustmentErrors\(mappedErrors\.adjustmentErrors\)/,
  );
  assert.match(
    componentSource,
    /focusInventoryError\(mappedErrors\.firstFocusTarget\)/,
  );
  assert.match(
    componentSource,
    /function focusInventoryError[\s\S]*setActiveCategory\(category\)[\s\S]*setCategoryPage\([\s\S]*ROW_PAGE_SIZE[\s\S]*window\.setTimeout\([\s\S]*(?:reasonRefs|currentQuantityRefs)\.current/,
  );
  assert.doesNotMatch(failurePaths, /setItems\(|toLineState\(result\.data\)/);
});

test("describeAdjustmentReason explains overstock with normalized basis numbers", async () => {
  const guardPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "adjustment-save-guard.ts",
  );
  const { describeAdjustmentReason } = await import(
    pathToFileURL(guardPath).href
  );

  assert.equal(
    describeAdjustmentReason(3, 4, 1),
    "기준재고 3개인데 당일재고가 4개입니다(손실 1개 반영 후 기준보다 1개 많음). 차이가 생긴 사유를 남겨 주세요.",
  );

  assert.equal(
    describeAdjustmentReason(5, 6, 0),
    "기준재고 5개인데 당일재고가 6개입니다(기준보다 1개 많음). 차이가 생긴 사유를 남겨 주세요.",
  );

  assert.equal(
    describeAdjustmentReason(0.8, 1.4, 0),
    "기준재고 0.8개인데 당일재고가 1.4개입니다(기준보다 0.6개 많음). 차이가 생긴 사유를 남겨 주세요.",
  );
});

test("getInventoryQuantityRelation normalizes every inventory flow before comparing", async () => {
  const policyPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "inventory-persist-policy.ts",
  );
  const { getInventoryQuantityRelation } = await import(
    pathToFileURL(policyPath).href
  );

  const relation = (overrides) =>
    getInventoryQuantityRelation({
      previousQuantity: 2,
      purchasedQuantity: 6,
      lossQuantity: 0,
      currentQuantity: 2,
      ...overrides,
    });

  assert.equal(relation({}), "NORMAL", "purchase sale is normal");
  assert.equal(
    relation({ purchasedQuantity: 0, previousQuantity: 5 }),
    "NORMAL",
    "carryover sale is normal",
  );
  assert.equal(
    relation({ lossQuantity: 1 }),
    "NORMAL",
    "loss-mixed shortage is normal",
  );
  assert.equal(
    relation({ currentQuantity: 8 }),
    "NORMAL",
    "equality is normal",
  );
  assert.equal(relation({ currentQuantity: 8.01 }), "OVERSTOCK");
  assert.equal(
    relation({
      previousQuantity: 0.1,
      purchasedQuantity: 0.2,
      currentQuantity: 0.3,
    }),
    "NORMAL",
    "floating sums must not create false overstock",
  );
  assert.equal(
    relation({
      previousQuantity: 0.1,
      purchasedQuantity: 0.2,
      currentQuantity: 0.304,
    }),
    "NORMAL",
    "current quantity uses the same two-decimal normalization",
  );
  assert.equal(
    relation({
      previousQuantity: 0.1,
      purchasedQuantity: 0.2,
      currentQuantity: 0.306,
    }),
    "OVERSTOCK",
    "normalized current quantity above the boundary is overstock",
  );
  assert.equal(relation({ currentQuantity: null }), "UNAVAILABLE");
  assert.equal(relation({ currentQuantity: Number.NaN }), "UNAVAILABLE");
  assert.equal(relation({ previousQuantity: -1 }), "UNAVAILABLE");
});

test("getRequiredCurrentQuantityErrors blocks blank actual quantity for purchase/loss seed rows", async () => {
  const guardPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "adjustment-save-guard.ts",
  );
  const { getRequiredCurrentQuantityErrors } = await import(
    pathToFileURL(guardPath).href
  );

  // 매입 seed 행(id===productId)인데 당일재고 미입력(null) → 차단.
  assert.deepEqual(
    getRequiredCurrentQuantityErrors([
      {
        id: "p1",
        productId: "p1",
        purchasedQuantity: 6,
        lossQuantity: 0,
        currentQuantity: null,
      },
    ]),
    {
      "items.0.currentQuantity": [
        "당일재고를 입력해 주세요. 매입·손실이 있는 품목은 남은 재고를 직접 확인해야 합니다.",
      ],
    },
    "blank current quantity on a purchase seed row is blocked",
  );

  // 값을 입력하면 통과. 손실 seed 행도 동일.
  assert.deepEqual(
    getRequiredCurrentQuantityErrors([
      {
        id: "p1",
        productId: "p1",
        purchasedQuantity: 6,
        lossQuantity: 0,
        currentQuantity: 2,
      },
      {
        id: "p2",
        productId: "p2",
        purchasedQuantity: 0,
        lossQuantity: 1,
        currentQuantity: null,
      },
    ]),
    {
      "items.1.currentQuantity": [
        "당일재고를 입력해 주세요. 매입·손실이 있는 품목은 남은 재고를 직접 확인해야 합니다.",
      ],
    },
    "entered quantity passes; blank loss seed row is blocked",
  );

  // 이미 저장된 행(id!==productId)이나 매입·손실 없는 행은 빈칸이어도 강제하지 않는다.
  assert.deepEqual(
    getRequiredCurrentQuantityErrors([
      {
        id: "row-cuid",
        productId: "p1",
        purchasedQuantity: 6,
        lossQuantity: 0,
        currentQuantity: null,
      },
      {
        id: "p2",
        productId: "p2",
        purchasedQuantity: 0,
        lossQuantity: 0,
        currentQuantity: null,
      },
    ]),
    {},
    "saved rows and non-purchase/loss rows are not forced to re-enter",
  );
});

test("buildRequiredEntryGuardItems passes blank/missing input as null (no seed fallback bypass)", async () => {
  const guardPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "adjustment-save-guard.ts",
  );
  const { buildRequiredEntryGuardItems, getRequiredCurrentQuantityErrors } =
    await import(pathToFileURL(guardPath).href);

  // seed 행은 매입 6, 기존 저장값 currentQuantity=0(또는 임의 값). 클라이언트/직접 호출이
  // 그 행을 currentQuantity:null로 보내면, ?? 폴백이 있으면 0으로 되살아나 미입력을 못 잡는다.
  const beforeItems = [
    { id: "p1", productId: "p1", purchasedQuantity: 6, lossQuantity: 0 },
    { id: "p2", productId: "p2", purchasedQuantity: 0, lossQuantity: 1 },
    { id: "row-cuid", productId: "p3", purchasedQuantity: 6, lossQuantity: 0 },
  ];

  // p1: 입력에 있으나 currentQuantity=null(blank) → 미입력으로 잡혀야 함.
  // p2: 입력에 아예 없음(미제출 required seed) → null로 보고 잡혀야 함.
  // p3: 저장된 행(id!==productId)이라 필수입력 대상 아님.
  const inputByProductId = new Map([["p1", { currentQuantity: null }]]);

  const guardItems = buildRequiredEntryGuardItems(
    beforeItems,
    inputByProductId,
  );

  assert.equal(
    guardItems[0].currentQuantity,
    null,
    "blank input must stay null, not revive seed value",
  );
  assert.equal(
    guardItems[1].currentQuantity,
    null,
    "missing input row must be treated as null",
  );

  assert.deepEqual(getRequiredCurrentQuantityErrors(guardItems), {
    "items.0.currentQuantity": [
      "당일재고를 입력해 주세요. 매입·손실이 있는 품목은 남은 재고를 직접 확인해야 합니다.",
    ],
    "items.1.currentQuantity": [
      "당일재고를 입력해 주세요. 매입·손실이 있는 품목은 남은 재고를 직접 확인해야 합니다.",
    ],
  });

  // 입력에 실제 값이 있으면 통과한다.
  assert.deepEqual(
    getRequiredCurrentQuantityErrors(
      buildRequiredEntryGuardItems(
        beforeItems,
        new Map([
          ["p1", { currentQuantity: 2 }],
          ["p2", { currentQuantity: 0 }],
        ]),
      ),
    ),
    {},
    "entered current quantities pass the required-entry guard",
  );
});

test("inventory save actions feed the required-entry guard via the no-fallback builder", () => {
  // 두 저장 경로 모두 buildRequiredEntryGuardItems로 가드 입력을 만들어야 한다.
  // (인라인 ?? seed 폴백을 다시 쓰면 위 behavioral 테스트가 잡는 미입력 우회가 생긴다.)
  for (const file of ["actions.ts", "hq-edit-actions.ts"]) {
    const source = readProjectFile("src", "features", "inventory", file);

    assert.match(
      source,
      /getRequiredCurrentQuantityErrors\(\s*buildRequiredEntryGuardItems\(/,
      `${file} should feed the required-entry guard via buildRequiredEntryGuardItems`,
    );
    assert.match(
      source,
      /hasExplicitCurrentQuantityInput:/,
      `${file} should preserve explicit 0/1 entries on required seed rows`,
    );
  }
});

test("HQ inventory save enforces the same required-entry and adjustment guards as the store path", () => {
  const hqSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "hq-edit-actions.ts",
  );

  assert.match(
    hqSource,
    /getRequiredCurrentQuantityErrors\(/,
    "HQ inventory save should enforce required current-quantity entry server-side",
  );
  assert.match(
    hqSource,
    /getInventorySaveAdjustmentErrors\(/,
    "HQ inventory save should enforce the adjustment-reason guard server-side",
  );

  const staleConflictIndex = hqSource.indexOf(
    "before.updatedAt !== expectedUpdatedAt.toISOString()",
  );
  const requiredEntryGuardIndex = hqSource.indexOf(
    "getRequiredCurrentQuantityErrors(",
  );
  assert.ok(staleConflictIndex > 0, "HQ should detect stale inventory drafts");
  assert.ok(
    staleConflictIndex < requiredEntryGuardIndex,
    "HQ stale drafts should return a conflict before row validation",
  );

  // 가드는 버전 증가(markEditableLedgerInTx) 전에 위치해 빈 저장으로 버전만 올라가지
  // 않게 한다. 정의가 아니라 호출부(const updated = await markEditableLedgerInTx) 기준.
  const adjustmentGuardIndex = hqSource.indexOf(
    "getInventorySaveAdjustmentErrors(",
  );
  const markEditableCallIndex = hqSource.indexOf(
    "const updated = await markEditableLedgerInTx(",
  );
  assert.ok(adjustmentGuardIndex > 0, "HQ adjustment guard should be present");
  assert.ok(markEditableCallIndex > 0, "HQ should mark the ledger editable");
  assert.ok(
    adjustmentGuardIndex < markEditableCallIndex,
    "HQ guards should run before the ledger version is incremented",
  );
});

test("store-manager bulk inventory save persists per-row adjustment reasons", () => {
  // P1 회귀 수정(2026-06-29): 단독 조정 버튼이 본사 전용이 된 뒤에도, 지점장은 일반 저장과
  // 함께 행별 사유를 보내 차이 행 조정을 저장할 수 있어야 한다(저장 경로가 닫히면 안 됨).
  const schema = readProjectFile("src", "features", "inventory", "schemas.ts");
  const guard = readProjectFile(
    "src",
    "features",
    "inventory",
    "adjustment-save-guard.ts",
  );
  const reconcile = readProjectFile(
    "src",
    "features",
    "inventory",
    "adjustment-reconciliation.ts",
  );
  const action = readProjectFile("src", "features", "inventory", "actions.ts");
  const client = readProjectFile(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );

  // 1) 스키마: 일반 재고 저장 item에 adjustmentReason이 있다.
  assert.match(schema, /adjustmentReason:/);
  // 2) 가드: 이번 저장에 사유가 들어온 행은 통과시킨다.
  assert.match(guard, /incomingReasonByProductId/);
  assert.match(guard, /incomingReasonByProductId\.get\(item\.productId\)/);
  // 3) 액션: 가드에 사유 맵을 넘기고, 저장 후 사유로 조정을 만든다.
  assert.match(action, /applyInventoryAdjustmentReasonsInTx\(/);
  assert.match(action, /adjustmentReason/);
  // 4) reconcile 모듈: 사유 기반 조정 생성 헬퍼가 있다(create + update 둘 다).
  assert.match(
    reconcile,
    /export async function applyInventoryAdjustmentReasonsInTx/,
  );
  assert.match(reconcile, /ledgerInventoryAdjustment\.create\(/);
  // 5) 클라이언트: 일반 저장 payload에 행별 사유를 포함하고, 사유가 있으면 검증을 통과시킨다.
  assert.match(client, /adjustmentReason:\s*\n?\s*reasonRefs\.current/);
});

test("inventory adjustment reconciliation drops every stale normal shortage record", () => {
  const reconcileSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "adjustment-reconciliation.ts",
  );

  assert.match(
    reconcileSource,
    /getInventoryQuantityRelation\(/,
    "reconciliation should use the shared inventory relation",
  );
  // reconcile 함수 본문 안에서만 확인한다(같은 파일의 reason apply path도 relation을 쓴다).
  const reconcileBody = reconcileSource.slice(
    reconcileSource.indexOf(
      "export async function reconcileLedgerInventoryAdjustments",
    ),
  );
  // 정상 판매로 바뀐 기존 조정 레코드는 삭제해 salesDifference 합산에서 빠지게 한다.
  const purchaseSaleIndex = reconcileBody.indexOf(
    "getInventoryQuantityRelation(",
  );
  const deleteAfter = reconcileBody
    .slice(purchaseSaleIndex)
    .indexOf("ledgerInventoryAdjustment.delete(");
  assert.ok(
    deleteAfter > 0 && deleteAfter < 400,
    "a purchase-driven sale should delete the stale adjustment record",
  );
});

test("inventory adjustment reason apply and reconciliation keep only real overstock records", async () => {
  const reconcilePath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "adjustment-reconciliation.ts",
  );
  const {
    applyInventoryAdjustmentReasonsInTx,
    reconcileLedgerInventoryAdjustments,
  } = await import(pathToFileURL(reconcilePath).href);
  const inventoryItems = [
    {
      id: "row-carryover",
      productId: "carryover",
      productName: "carryover",
      productCategory: "fish",
      productSpec: "1kg",
      unitPrice: 1_000,
      previousQuantity: 5,
      currentQuantity: 2,
      quantity: 2,
    },
    {
      id: "row-loss-mixed",
      productId: "loss-mixed",
      productName: "loss-mixed",
      productCategory: "fish",
      productSpec: "1kg",
      unitPrice: 1_000,
      previousQuantity: 5,
      currentQuantity: 3,
      quantity: 3,
    },
    {
      id: "row-overstock",
      productId: "overstock",
      productName: "overstock",
      productCategory: "fish",
      productSpec: "1kg",
      unitPrice: 1_000,
      previousQuantity: 2,
      currentQuantity: 3,
      quantity: 3,
    },
    {
      id: "row-manual",
      productId: "manual",
      productName: "manual",
      productCategory: "fish",
      productSpec: "1kg",
      unitPrice: 1_000,
      previousQuantity: 0,
      currentQuantity: 3,
      quantity: 3,
      carryoverSource: "MANUAL",
      carryoverStatus: "CARRYOVER_EMPTY",
      carryoverLedgerId: null,
    },
  ];
  const purchases = [{ productId: "loss-mixed", quantity: 2 }];
  const losses = [{ productId: "loss-mixed", quantity: 1 }];
  const created = [];
  const deleted = [];
  const updatedAdjustments = [];
  const tx = {
    ledgerInventoryItem: {
      findMany: async ({ where }) =>
        where.productId?.in
          ? inventoryItems.filter((item) =>
              where.productId.in.includes(item.productId),
            )
          : inventoryItems,
      update: async () => {},
    },
    ledgerPurchaseItem: { findMany: async () => purchases },
    ledgerLossItem: { findMany: async () => losses },
    ledgerInventoryAdjustment: {
      findMany: async ({ where }) =>
        where.productId?.in
          ? []
          : [
              { id: "adjust-carryover", productId: "carryover", reason: "old" },
              {
                id: "adjust-loss-mixed",
                productId: "loss-mixed",
                reason: "old",
              },
              {
                id: "adjust-overstock",
                productId: "overstock",
                reason: "counted",
              },
              { id: "adjust-manual", productId: "manual", reason: "old" },
            ],
      create: async ({ data }) => created.push(data),
      delete: async ({ where }) => deleted.push(where.id),
      update: async ({ where, data }) =>
        updatedAdjustments.push({ where, data }),
    },
  };

  await applyInventoryAdjustmentReasonsInTx(
    tx,
    "ledger-1",
    new Map(inventoryItems.map((item) => [item.productId, "counted"])),
    "actor-1",
  );

  assert.deepEqual(
    created.map((adjustment) => adjustment.productId),
    ["overstock"],
    "a reason must not create shortage adjustments",
  );

  await reconcileLedgerInventoryAdjustments(tx, "ledger-1", "actor-1");

  assert.deepEqual(
    deleted,
    ["adjust-carryover", "adjust-loss-mixed", "adjust-manual"],
    "normal shortages and manual first-entry adjustments should be deleted",
  );
  assert.deepEqual(
    updatedAdjustments.map((adjustment) => adjustment.where.id),
    ["adjust-overstock"],
    "real overstock should retain the existing adjustment flow",
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
  assert.match(typeSource, /export\s+type\s+InventoryManualProductOption/);
  assert.match(
    typeSource,
    /manualProductOptions:\s+InventoryManualProductOption\[\]/,
  );
  assert.match(typeSource, /export\s+type\s+InventoryPurchasePrice/);
  assert.match(
    typeSource,
    /purchasePrice:\s+InventoryPurchasePrice\s+\|\s+null/,
  );

  const querySource = readProjectFile(
    "src",
    "features",
    "inventory",
    "queries.ts",
  );
  assert.match(querySource, /export\s+async\s+function\s+getInventoryStepData/);
  assert.match(querySource, /getInventoryPlanGateForLedgerInTx\(tx, ledger\)/);
  assert.match(querySource, /inventoryComplete:\s*inventoryGate\.complete/);
  assert.doesNotMatch(
    querySource,
    /inventoryItemCount:\s*existingItems\.length/,
  );
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
    /전날 재고를 자동으로 가져오지 못했습니다/,
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
  // 월초 스냅샷에 누락된 활성 품목도 기본 표에 자동으로 펼치지 않는다.
  assert.doesNotMatch(
    querySource,
    /missingSnapshotBases|getActiveProductBases/,
    "snapshot-missing active products should be manual-add options, not auto-listed rows",
  );
  // 전일/월초 근거가 전혀 없을 때는 근거 없는 활성 품목을 자동 행으로 펼치지 않고
  // "품목 추가" 후보(manualProductOptions)로만 내린다.
  assert.match(
    querySource,
    /getManualProductOptions/,
    "ungrounded active products should be offered as manual add options, not auto-listed rows",
  );
  assert.match(
    querySource,
    /manualProductOptions/,
    "step data should carry manual product options",
  );
  assert.match(querySource, /ledgerPurchaseItem\.findMany/);
  assert.match(querySource, /storeId:\s*ledger\.storeId/);
  assert.match(querySource, /closingDate:\s*{\s*lte:\s*ledger\.closingDate/s);
  assert.match(querySource, /dailyLedger:\s*{[\s\S]*closingDate:\s*true/);
  assert.doesNotMatch(
    querySource.slice(querySource.indexOf("ledgerPurchaseItem.findMany")),
    /createdAt:\s*true/,
    "display history must use DailyLedger.closingDate, not row creation time",
  );
  assert.match(querySource, /resolveInventoryPurchasePrices/);
  assert.match(querySource, /purchasePrice:/);
  assert.match(
    querySource,
    /manualProductOptions\.map|attachPurchasePrices/,
    "manual product options should receive the same historical purchase price",
  );
  const emptyCarryoverFallback = querySource.slice(
    querySource.indexOf("전일 장부나 월초 스냅샷이 없습니다. 오늘 매입"),
  );
  assert.match(
    emptyCarryoverFallback.slice(0, 200),
    /bases:\s*\[\]/,
    "empty carryover fallback should not expand active products into zero rows",
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
  assert.match(actionSource, /ledgerStoreManagerInventorySchema\.safeParse/);
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
  assert.match(
    actionSource,
    /revalidateStoreEntryPaths\(\["root",\s*"inventory",\s*"losses"\]\)/,
  );
  assert.match(actionSource, /revalidateLedgerDetailPath\(/);
});

test("inventory purchase price DTO and UI expose only the approved nested field", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "inventory",
    "queries.ts",
  );
  const responseShapeSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "response-shaping.ts",
  );
  const componentSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );
  const safeMapperSource = responseShapeSource;

  assert.match(componentSource, /item\.purchasePrice/);
  assert.match(componentSource, /당일/);
  assert.match(componentSource, /최근/);
  assert.match(componentSource, /매입단가 ·/);
  assert.match(componentSource, /매입 이력 없음/);
  assert.match(componentSource, /formatKrw\(item\.purchasePrice\.unitPrice\)/);
  assert.match(componentSource, /purchasePrice:\s*option\.purchasePrice/);
  assert.match(
    componentSource,
    /text-muted-foreground/,
    "purchase-price copy should use the existing muted semantic text",
  );
  assert.match(safeMapperSource, /plannedUnitPrice:\s*item\.plannedUnitPrice/);
  assert.match(safeMapperSource, /purchasePrice:\s*item\.purchasePrice/);
  assert.doesNotMatch(safeMapperSource, /unitPrice:\s*item\.unitPrice/);
  assert.doesNotMatch(
    safeMapperSource,
    /purchaseAmount:\s*item\.purchaseAmount/,
  );
  assert.doesNotMatch(safeMapperSource, /lossAmount:\s*item\.lossAmount/);
  assert.doesNotMatch(
    safeMapperSource,
    /inventoryAmount:\s*item\.inventoryAmount/,
  );
});

test("manual product add lets ungrounded products be entered without auto-listing them", () => {
  // 저장 경로는 before.items만 재기록하므로, "품목 추가"로 넣은(before.items에 없는)
  // 행은 buildManualInventoryRows로 별도 기록해야 입력값이 사라지지 않는다.
  const helperSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "manual-inventory-rows.ts",
  );
  assert.match(
    helperSource,
    /export\s+async\s+function\s+buildManualInventoryRows/,
  );
  // 추가만 하고 미입력(빈 값)인 행은 0개 재고로 저장되면 안 된다.
  assert.match(
    helperSource,
    /item\.currentQuantity !== null \|\| item\.quantity !== null/,
    "empty manual rows must be excluded so they are not saved as zero inventory",
  );
  // 클라이언트가 보낸 메타데이터를 믿지 않고 활성 품목을 DB로 확인한다.
  assert.match(helperSource, /isActive:\s*true/);

  for (const file of ["actions.ts", "hq-edit-actions.ts"]) {
    const actionSource = readProjectFile("src", "features", "inventory", file);
    assert.match(
      actionSource,
      /buildManualInventoryRows\(/,
      `${file} should persist manually added inventory rows`,
    );
    assert.match(
      actionSource,
      /rowsToPersist\.push\(\.\.\.manualRows\)/,
      `${file} should append manual rows to the persisted set`,
    );
  }

  const componentSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );
  assert.match(componentSource, /품목 추가/);
  assert.match(componentSource, /추가할 품목 선택/);
  assert.match(componentSource, /availableManualOptions/);
  assert.match(componentSource, /toManualLineState/);
  // 추가 행은 0이 아니라 빈 입력으로 시작한다.
  assert.match(componentSource, /currentQuantityInput:\s*""/);
  // 추가 행 배지는 "이월 공백"이 아니라 "직접 입력"으로 0 오해를 막는다.
  assert.match(componentSource, /직접 입력/);
  assert.match(componentSource, /addedManualIds/);
});

test("manual inventory unit price is required only for new rows that will persist", async () => {
  const helperPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "manual-inventory-rows.ts",
  );
  const { getManualInventoryUnitPriceErrors } = await import(
    pathToFileURL(helperPath).href
  );

  assert.deepEqual(
    getManualInventoryUnitPriceErrors(new Set(["existing-product"]), [
      {
        productId: "new-persisted-product",
        currentQuantity: null,
        quantity: 3,
        unitPrice: null,
      },
      {
        productId: "existing-product",
        currentQuantity: 3,
        quantity: 3,
        unitPrice: null,
      },
      {
        productId: "new-empty-product",
        currentQuantity: null,
        quantity: null,
        unitPrice: null,
      },
    ]),
    {
      "items.0.unitPrice": ["직접 추가한 품목의 매입단가를 입력해 주세요."],
    },
  );

  assert.deepEqual(
    getManualInventoryUnitPriceErrors(new Set(), [
      {
        productId: "zero-price-product",
        currentQuantity: 3,
        quantity: 3,
        unitPrice: 0,
      },
    ]),
    {},
  );

  assert.deepEqual(
    getManualInventoryUnitPriceErrors(new Set(), [
      {
        productId: "overflow-product",
        currentQuantity: 3,
        quantity: 3,
        unitPrice: 1_000_000_000,
      },
    ]),
    {
      "items.0.unitPrice": [
        "재고금액을 계산할 수 없습니다. 수량과 매입단가를 확인해 주세요.",
      ],
    },
  );

  assert.deepEqual(
    getManualInventoryUnitPriceErrors(new Set(), [
      {
        productId: "current-quantity-overflow-product",
        currentQuantity: 3,
        quantity: null,
        unitPrice: 1_000_000_000,
      },
    ]),
    {
      "items.0.unitPrice": [
        "재고금액을 계산할 수 없습니다. 수량과 매입단가를 확인해 주세요.",
      ],
    },
  );

  for (const [file, mutation] of [
    ["actions.ts", "dailyLedger.updateMany"],
    ["hq-edit-actions.ts", "markEditableLedgerInTx("],
  ]) {
    const actionSource = readProjectFile("src", "features", "inventory", file);
    const guardIndex = actionSource.indexOf(
      "getManualInventoryUnitPriceErrors(",
      actionSource.indexOf("export async function save"),
    );

    assert.ok(guardIndex >= 0);
    assert.ok(
      guardIndex < actionSource.indexOf(mutation, guardIndex),
      `${file} should validate manual inventory amounts before mutation`,
    );
    assert.ok(
      guardIndex <
        actionSource.indexOf("ledgerInventoryItem.deleteMany", guardIndex),
      `${file} should validate manual inventory amounts before deleteMany`,
    );
    assert.match(
      actionSource.slice(
        guardIndex,
        actionSource.indexOf(mutation, guardIndex),
      ),
      /Object\.values\(\s*manualUnitPriceErrors,?\s*\)\[0\]\?\.\[0\]/,
      `${file} should use the actual manual inventory field error as its top-level message`,
    );
  }
});

test("purchase/loss seed rows persist explicit zero or one current quantity", async () => {
  const policyPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "inventory-persist-policy.ts",
  );
  const { shouldPersistInventoryLine } = await import(
    pathToFileURL(policyPath).href
  );

  assert.equal(
    shouldPersistInventoryLine(
      {
        id: "product-1",
        productId: "product-1",
        currentQuantity: 0,
        quantity: 0,
        purchasedQuantity: 4,
        lossQuantity: 0,
      },
      0,
      0,
      { hasExplicitCurrentQuantityInput: true },
    ),
    true,
    "an explicit 0 on a purchase seed row must be saved even when it equals the default seed value",
  );

  assert.equal(
    shouldPersistInventoryLine(
      {
        id: "product-2",
        productId: "product-2",
        currentQuantity: 1,
        quantity: 1,
        purchasedQuantity: 0,
        lossQuantity: 1,
      },
      1,
      1,
      { hasExplicitCurrentQuantityInput: true },
    ),
    true,
    "an explicit 1 on a loss seed row must be saved even when it equals the default seed value",
  );
});

test("grounded carryover seed rows persist without quantity changes", async () => {
  const policyPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "inventory-persist-policy.ts",
  );
  const { shouldPersistInventoryLine } = await import(
    pathToFileURL(policyPath).href
  );

  for (const carryoverSource of [
    "OPENING_SNAPSHOT",
    "PREVIOUS_CLOSED_LEDGER",
    "PREVIOUS_SAVED_LEDGER",
  ]) {
    assert.equal(
      shouldPersistInventoryLine(
        {
          id: "product-1",
          productId: "product-1",
          currentQuantity: 7,
          quantity: 7,
          carryoverSource,
        },
        7,
        7,
      ),
      true,
      `${carryoverSource} seed rows must survive an unchanged save`,
    );
  }

  assert.equal(
    shouldPersistInventoryLine(
      {
        id: "product-1",
        productId: "product-1",
        currentQuantity: 0,
        quantity: 0,
        carryoverSource: "MANUAL",
      },
      0,
      0,
    ),
    false,
    "manual seed rows remain non-persistent until the user enters a value",
  );
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
  const responseShapeSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "response-shaping.ts",
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
  const safeMapperSource = responseShapeSource;
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
  // 정책 반전(2026-06-28): 시스템 재고 수량을 직접 덮어쓰는 단독 재고조정은 본사 전용이다.
  // 지점장 경로(saveLedgerInventoryAdjustment)는 권한 확인 후 FORBIDDEN으로 거부만 한다.
  assert.match(
    actionSource,
    /export\s+async\s+function\s+saveLedgerInventoryAdjustment/,
  );
  assert.match(actionSource, /requireStoreManagerLedgerEditAccess\(/);
  assert.match(
    actionSource,
    /actionError\(\s*"FORBIDDEN"[\s\S]*재고 수량 조정은 본사에서만/,
    "store manager adjustment action must reject with FORBIDDEN",
  );
  assert.doesNotMatch(
    actionSource,
    /tx\.ledgerInventoryAdjustment\.upsert/,
    "store manager action must not write inventory adjustments anymore",
  );

  // 단독 재고조정 내부 계약(upsert/감사/POLICY_UNCONFIRMED/초과만 허용/충돌)은 본사 액션으로 이관됐다.
  const hqActionSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "hq-edit-actions.ts",
  );
  assert.match(
    hqActionSource,
    /export\s+async\s+function\s+saveHqLedgerInventoryAdjustment/,
  );
  assert.match(hqActionSource, /db\.\$transaction/);
  assert.match(hqActionSource, /editableLedgerStatuses/);
  assert.match(hqActionSource, /tx\.ledgerInventoryAdjustment\.upsert/);
  assert.match(hqActionSource, /tx\.ledgerInventoryItem\.upsert/);
  assert.match(hqActionSource, /amountStatus:\s*"POLICY_UNCONFIRMED"/);
  assert.match(hqActionSource, /재고 기준을 계산할 수 없습니다/);
  assert.match(
    hqActionSource,
    /getInventoryQuantityRelation\(/,
    "HQ adjustment creation should use the shared overstock relation",
  );
  assert.doesNotMatch(
    hqActionSource,
    /quantity:\s*adjustment\.afterQuantity/,
    "adjustment save should not overwrite the separate quantity field",
  );
  assert.match(
    hqActionSource,
    /action:\s*"ledger\.hq\.inventory_adjustment\.saved"/,
  );
  assert.match(hqActionSource, /reason:\s*parsed\.data\.reason/);

  const auditSource = readProjectFile("src", "server", "audit.ts");
  assert.match(auditSource, /reason\?:\s*string\s*\|\s*null/);
  assert.match(auditSource, /reason:\s*input\.reason\s*\?\?\s*undefined/);
});

test("store manager adjustment action rejects before touching the ledger", () => {
  // 정책 반전(2026-06-28): 지점장 단독 재고조정은 본사 전용으로 거부된다. 권한 확인 후
  // 어떤 ledger/트랜잭션 변경도 없이 FORBIDDEN을 반환해야 한다.
  const actionSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "actions.ts",
  );
  const storeAdjustmentSource = actionSource.slice(
    actionSource.indexOf("export async function saveLedgerInventoryAdjustment"),
  );
  const body = storeAdjustmentSource.slice(
    0,
    storeAdjustmentSource.indexOf("\n}"),
  );

  assert.match(
    body,
    /actionError\(\s*"FORBIDDEN"/,
    "store adjustment save should reject with FORBIDDEN",
  );
  assert.doesNotMatch(
    body,
    /tx\.dailyLedger\.updateMany|tx\.ledgerInventoryItem\.upsert|db\.\$transaction/,
    "store adjustment save must not mutate the ledger on rejected requests",
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
  const previousStockButtonStart = componentSource.indexOf(
    "{/* WO-11(2026-06-28): 상단 전날 재고 전체 보기 버튼. */}",
  );
  const previousStockButtonSource = componentSource.slice(
    previousStockButtonStart,
    componentSource.indexOf("</Button>", previousStockButtonStart) +
      "</Button>".length,
  );
  assert.ok(previousStockButtonStart >= 0);
  assert.doesNotMatch(previousStockButtonSource, /variant="outline"/);
  assert.match(previousStockButtonSource, /className="min-h-11 font-semibold"/);
  assert.equal(
    (previousStockButtonSource.match(/전날 재고 보기/g) ?? []).length,
    1,
  );
  assert.match(componentSource, /saveLedgerInventoryItems/);
  assert.match(componentSource, /inventoryTerms/);
  assert.match(componentSource, /냉동/);
  assert.match(componentSource, /생물/);
  assert.match(
    componentSource,
    /전일 이월 재고를 불러왔습니다\. 변경된 품목만 수정하세요\./,
  );
  assert.match(componentSource, /전날 재고 확인/);
  assert.match(componentSource, /검토 필요/);
  assert.match(componentSource, /이월 재확인 필요/);
  assert.match(componentSource, /월초 이월/);
  assert.match(componentSource, /데이터 부족/);
  assert.match(componentSource, /기준 확인 필요/);
  assert.match(componentSource, /ROW_PAGE_SIZE = 50/);
  assert.match(componentSource, /ROW_PAGING_THRESHOLD = 30/);
  assert.match(componentSource, /scrollIntoView/);
  assert.match(componentSource, /inputMode="decimal"/);
  assert.match(componentSource, /parseStockQuantityDraft/);
  assert.match(componentSource, /toStockQuantitySaveInput/);
  assert.match(componentSource, /className="h-11 w-24 tabular-nums"/);
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
  // 카드 레이아웃에는 테이블 가로 스크롤(overflow-x-auto) 컨테이너가 없다.
  assert.match(
    componentSource,
    /setActiveCategory\(normalizeCategory\(item\.productCategory\)\)/,
  );
  assert.match(componentSource, /MAX_INVENTORY_QUANTITY/);
  assert.match(componentSource, /수정됨/);
  assert.match(componentSource, /aria-label=.*수정됨/s);
  assert.match(componentSource, /min-h-11/);
  assert.match(componentSource, /saveLedgerInventoryAdjustment/);
  assert.match(componentSource, /고칠 내용 있음/);
  assert.match(componentSource, /고침 완료/);
  assert.match(componentSource, /바꾼 이유/);
  assert.match(componentSource, /고치기 전/);
  assert.match(componentSource, /고친 후/);
  assert.match(inventoryUiSource, /당일 판매량/);
  assert.doesNotMatch(inventoryUiSource, /처리재고/);
  assert.match(
    componentSource,
    /return systemQuantity - actualQuantity;/,
    "당일 판매량은 기준재고에서 당일재고를 뺀 흐름으로 표시해야 한다",
  );
  assert.match(
    componentSource,
    /바뀐 수량/,
    "강제 실사 보정의 signed 차이는 당일 판매량과 별도 라벨로 보여야 한다",
  );
  assert.doesNotMatch(
    componentSource,
    /format(?:Signed)?Quantity\([^)]*\)}개/,
    "수량 formatter가 이미 '개'를 붙이므로 화면에서 '개'를 다시 붙이면 안 된다",
  );
  assert.match(inventoryUiSource, /실제 POS 판매 수량과 다를 수 있습니다/);
  assert.match(componentSource, /금액 기준 확인 필요/);
  assert.match(componentSource, /amountStatus === "CONFIRMED"/);
  assert.match(inventoryUiSource, /확인\/고치기/);
  assert.match(componentSource, /formatKrw\(item\.lossAmount\)/);
  assert.match(componentSource, /getLedgerEditBlockReason/);
  assert.match(componentSource, /isLedgerReadOnly/);
  assert.match(componentSource, /휴무 장부/);
  assert.match(
    componentSource,
    /재고를 고친 이유 저장이 끝난 뒤 다시 저장해 주세요\./,
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
    /const adjustmentActionLabel = adjusted \? "수정" : "저장"/,
  );
  assert.match(
    componentSource,
    /const isAdjustmentSavePending = savingAdjustmentProductId !== null/,
  );
  assert.match(
    componentSource,
    /disabled={\s*savingAdjustmentProductId !== null \|\| isClosed\s*}/s,
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
