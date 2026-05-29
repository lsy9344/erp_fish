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
    /enum\s+InventoryCarryoverSource\s*{[^}]*OPENING_SNAPSHOT[^}]*PREVIOUS_CLOSED_LEDGER[^}]*MANUAL[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+LedgerInventoryItem\s*{[^}]*dailyLedgerId\s+String[^}]*productId\s+String[^}]*productName\s+String[^}]*productCategory\s+String[^}]*productSpec\s+String[^}]*unitPrice\s+Int[^}]*previousQuantity\s+Int[^}]*purchasedQuantity\s+Int[^}]*currentQuantity\s+Int\?[^}]*inventoryAmount\s+Int\?[^}]*carryoverSource\s+InventoryCarryoverSource[^}]*carryoverLedgerId\s+String\?[^}]*@@index\(\[dailyLedgerId\]\)[^}]*@@index\(\[productId\]\)/s,
  );
  assert.match(
    schema,
    /model\s+LedgerInventoryItem\s*{[^}]*currentQuantity\s+Int\?[^}]*quantity\s+Int\?[^}]*inventoryAmount\s+Int\?/s,
    "inventory rows should persist current inventory and quantity separately",
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
      items: [{ productId: "product-1", currentQuantity: value, quantity: "1" }],
    });

    assert.equal(parsed.success, false);
  }

  const invalidQuantity = ledgerInventorySchema.safeParse({
    ...payload,
    items: [{ productId: "product-1", currentQuantity: "1", quantity: "1,000" }],
  });
  assert.equal(invalidQuantity.success, false);

  const blankProduct = ledgerInventorySchema.safeParse({
    ...payload,
    items: [{ productId: " ", currentQuantity: "1", quantity: "1" }],
  });
  assert.equal(blankProduct.success, false);
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

test("inventory queries and actions implement carryover, purchase aggregation, and audit contracts", () => {
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
    /status:\s*"HEADQUARTERS_CLOSED"[\s\S]*ledgerInventoryItems:/,
    "carryover should search for the previous closed ledger directly",
  );
  assert.match(querySource, /PREVIOUS_CLOSED_LEDGER/);
  assert.match(querySource, /OPENING_SNAPSHOT/);
  assert.match(querySource, /ledgerPurchaseItems/);
  assert.match(querySource, /purchasedQuantity/);
  assert.match(querySource, /purchaseAmount/);
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
  assert.match(actionSource, /requireStoreAccess\(/);
  assert.match(actionSource, /db\.\$transaction/);
  assert.match(actionSource, /before\.status\s*!==\s*"IN_PROGRESS"/);
  assert.match(actionSource, /tx\.ledgerInventoryItem\.deleteMany/);
  assert.match(actionSource, /tx\.ledgerInventoryItem\.createMany/);
  assert.match(actionSource, /action:\s*"ledger\.inventory\.saved"/);
  assert.match(actionSource, /writeAuditLog\(/);
  assert.match(
    actionSource,
    /revalidatePath\("\/app\/store-entry\/inventory"\)/,
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
  assert.match(pageSource, /requireStoreAccess/);
  assert.doesNotMatch(pageSource, /재고 입력 준비/);

  const componentSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );
  assert.match(componentSource, /saveLedgerInventoryItems/);
  assert.match(componentSource, /냉동/);
  assert.match(componentSource, /생물/);
  assert.match(
    componentSource,
    /전일 재고를 불러왔습니다\. 변경된 품목만 수정하세요\./,
  );
  assert.match(componentSource, /직접 입력하거나 본사에 문의/);
  assert.match(componentSource, /inputMode="numeric"/);
  assert.match(componentSource, /tabular-nums/);
  assert.match(componentSource, /overflow-x-auto/);
  assert.match(componentSource, /setActiveCategory\(normalizeCategory\(item\.productCategory\)\)/);
  assert.match(componentSource, /MAX_INVENTORY_INTEGER/);
  assert.match(componentSource, /수정됨/);
  assert.match(componentSource, /aria-label=.*수정됨/s);
  assert.match(componentSource, /min-h-11/);
});
