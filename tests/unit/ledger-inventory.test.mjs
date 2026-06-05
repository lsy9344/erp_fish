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
    /model\s+LedgerInventoryAdjustment\s*{[^}]*dailyLedgerId\s+String[^}]*productId\s+String[^}]*ledgerInventoryItemId\s+String\?[^}]*productName\s+String[^}]*productCategory\s+String[^}]*productSpec\s+String[^}]*unitPrice\s+Int[^}]*beforeQuantity\s+Int[^}]*beforeAmount\s+Int[^}]*afterQuantity\s+Int[^}]*afterAmount\s+Int[^}]*differenceQuantity\s+Int[^}]*differenceAmount\s+Int[^}]*reason\s+String[^}]*createdById\s+String[^}]*updatedById\s+String[^}]*@@unique\(\[dailyLedgerId,\s*productId\]/s,
    "LedgerInventoryAdjustment should store before/after snapshots and one original adjustment per ledger product",
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
  assert.match(
    actionSource,
    /reconcileLedgerInventoryAdjustments\(/,
    "normal inventory save should keep existing adjustment records in sync",
  );
  assert.match(actionSource, /action:\s*"ledger\.inventory\.saved"/);
  assert.match(actionSource, /writeAuditLog\(/);
  assert.match(
    actionSource,
    /revalidatePath\("\/app\/store-entry\/inventory"\)/,
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
  assert.match(
    querySource,
    /ledgerInventoryAdjustment\.findMany|ledgerInventoryAdjustments/,
  );
  assert.match(querySource, /createdBy:\s*{[\s\S]*select:\s*{[\s\S]*name:/);
  assert.match(querySource, /adjustment:/);

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
  assert.match(actionSource, /requireStoreAccess\(/);
  assert.match(actionSource, /db\.\$transaction/);
  assert.match(actionSource, /IN_PROGRESS/);
  assert.match(actionSource, /IN_REVIEW/);
  assert.match(actionSource, /HEADQUARTERS_CLOSED/);
  assert.match(
    actionSource,
    /본사 마감된 장부는 원본 재고 조정으로 수정할 수 없습니다/,
  );
  assert.match(actionSource, /tx\.ledgerInventoryAdjustment\.upsert/);
  assert.match(actionSource, /tx\.ledgerInventoryItem\.upsert/);
  assert.match(
    actionSource,
    /differenceQuantity\s*===\s*0/,
    "zero-difference adjustments should be blocked",
  );
  assert.match(
    actionSource,
    /status:\s*{\s*in:\s*\[\s*"IN_PROGRESS",\s*"IN_REVIEW"\s*\]\s*}/,
    "adjustment save should lock or conditionally guard editable ledger status",
  );
  assert.doesNotMatch(
    actionSource,
    /quantity:\s*adjustment\.afterQuantity/,
    "adjustment save should not overwrite the separate quantity field",
  );
  assert.match(actionSource, /action:\s*"ledger\.inventory_adjustment\.saved"/);
  assert.match(actionSource, /reason:\s*parsed\.data\.reason/);
  assert.match(
    actionSource,
    /revalidatePath\("\/app\/store-entry\/inventory"\)[\s\S]*revalidatePath\("\/app\/dashboard"\)/,
  );

  const auditSource = readProjectFile("src", "server", "audit.ts");
  assert.match(auditSource, /reason\?:\s*string\s*\|\s*null/);
  assert.match(auditSource, /reason:\s*input\.reason\s*\?\?\s*undefined/);
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
  assert.match(
    componentSource,
    /setActiveCategory\(normalizeCategory\(item\.productCategory\)\)/,
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
  assert.match(componentSource, /차이/);
  assert.match(componentSource, /formatKrw\(item\.lossAmount\)/);
  assert.match(componentSource, /정정\s+기록을 사용해 주세요/);
  assert.match(componentSource, /disabled={isSaving \|\| isClosed/);
  assert.match(componentSource, /disabled={isSaving \|\| isClosed}/);
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
    /disabled={savingAdjustmentProductId !== null}/,
  );
  assert.match(
    componentSource,
    /disabled={isSaving \|\| isClosed \|\| isAdjustmentSavePending}/,
  );
  assert.match(
    componentSource,
    /mergeAdjustedLineState/,
    "saving one adjustment should not discard other unsaved row edits",
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
