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

test("ledger purchase model and migration preserve purchase snapshots", () => {
  const schema = readProjectFile("prisma", "schema.prisma");

  assert.match(
    schema,
    /model\s+LedgerPurchaseItem\s*{[^}]*id\s+String\s+@id\s+[^}]*dailyLedgerId\s+String[^}]*productId\s+String[^}]*purchaseStandardId\s+String\?[^}]*productName\s+String[^}]*productCategory\s+String[^}]*productSpec\s+String[^}]*unitPrice\s+Int[^}]*quantity\s+Int[^}]*amount\s+Int[^}]*referenceInfo\s+String\?[^}]*createdById\s+String[^}]*updatedById\s+String[^}]*@@index\(\[dailyLedgerId\]\)[^}]*@@index\(\[productId\]\)[^}]*@@index\(\[purchaseStandardId\]\)/s,
  );
  assert.match(
    schema,
    /model\s+DailyLedger\s*{[^}]*ledgerPurchaseItems\s+LedgerPurchaseItem\[\]/s,
  );
  assert.match(
    schema,
    /model\s+User\s*{[^}]*createdLedgerPurchaseItems\s+LedgerPurchaseItem\[\]\s+@relation\("LedgerPurchaseItemCreatedBy"\)[^}]*updatedLedgerPurchaseItems\s+LedgerPurchaseItem\[\]\s+@relation\("LedgerPurchaseItemUpdatedBy"\)/s,
  );

  const migrationName = migrationDirNames().find((name) =>
    name.includes("add_ledger_purchase"),
  );
  assert.ok(migrationName, "purchase migration should exist");

  const migration = readFileSync(
    assertProjectFile("prisma", "migrations", migrationName, "migration.sql"),
    "utf8",
  );
  assert.ok(
    migration.includes('CREATE TABLE "LedgerPurchaseItem" ('),
    "migration should create LedgerPurchaseItem",
  );
  assert.ok(
    migration.includes('"productName" TEXT NOT NULL') &&
      migration.includes('"productSpec" TEXT NOT NULL') &&
      migration.includes('"unitPrice" INTEGER NOT NULL') &&
      migration.includes('"quantity" INTEGER NOT NULL') &&
      migration.includes('"amount" INTEGER NOT NULL'),
    "migration should store purchase snapshot and integer amounts",
  );
});

test("ledger purchase schema validates required options and integer amounts", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "schemas.ts",
  );
  const { ledgerPurchaseSchema, toFieldErrors } = await import(
    pathToFileURL(schemaPath).href
  );

  const basePayload = {
    storeId: "store-gangnam",
    purchases: [
      {
        productId: "product-1",
        purchaseStandardId: "standard-1",
        unitPrice: "12000",
        quantity: "3",
      },
    ],
  };

  assert.equal(ledgerPurchaseSchema.safeParse(basePayload).success, true);

  const zeroValues = ledgerPurchaseSchema.parse({
    ...basePayload,
    purchases: [
      {
        productId: "product-1",
        purchaseStandardId: "standard-1",
        unitPrice: "0",
        quantity: "0",
      },
    ],
  });
  assert.equal(zeroValues.purchases[0].unitPrice, 0);
  assert.equal(zeroValues.purchases[0].quantity, 0);

  const blankProduct = ledgerPurchaseSchema.safeParse({
    ...basePayload,
    purchases: [{ ...basePayload.purchases[0], productId: " " }],
  });
  assert.equal(blankProduct.success, false);
  assert.deepEqual(blankProduct.error.flatten().fieldErrors.purchases, [
    "품목을 선택해 주세요.",
  ]);

  const blankStandard = ledgerPurchaseSchema.safeParse({
    ...basePayload,
    purchases: [{ ...basePayload.purchases[0], purchaseStandardId: "" }],
  });
  assert.equal(blankStandard.success, false);
  assert.deepEqual(blankStandard.error.flatten().fieldErrors.purchases, [
    "매입 기준을 선택해 주세요.",
  ]);

  const negativePrice = ledgerPurchaseSchema.safeParse({
    ...basePayload,
    purchases: [{ ...basePayload.purchases[0], unitPrice: -1 }],
  });
  assert.equal(negativePrice.success, false);
  assert.deepEqual(negativePrice.error.flatten().fieldErrors.purchases, [
    "단가는 0원 이상의 정수여야 합니다.",
  ]);

  const decimalQuantity = ledgerPurchaseSchema.safeParse({
    ...basePayload,
    purchases: [{ ...basePayload.purchases[0], quantity: 1.5 }],
  });
  assert.equal(decimalQuantity.success, false);
  assert.deepEqual(decimalQuantity.error.flatten().fieldErrors.purchases, [
    "수량은 0 이상의 정수여야 합니다.",
  ]);

  const formattedPrice = ledgerPurchaseSchema.safeParse({
    ...basePayload,
    purchases: [{ ...basePayload.purchases[0], unitPrice: "1,000" }],
  });
  assert.equal(formattedPrice.success, false);

  const overflowAmount = ledgerPurchaseSchema.safeParse({
    ...basePayload,
    purchases: [
      {
        ...basePayload.purchases[0],
        unitPrice: "2147483647",
        quantity: "2",
      },
    ],
  });
  assert.equal(overflowAmount.success, false);
  assert.deepEqual(toFieldErrors(overflowAmount.error), {
    "purchases.0.quantity": ["매입금액은 저장 가능한 범위 이하여야 합니다."],
  });
});

test("ledger purchase calculations, queries, and actions expose expected contracts", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculatePurchaseTotal } = await import(pathToFileURL(calcPath).href);

  assert.equal(calculatePurchaseTotal([12000, 3000, 0]), 15000);
  assert.equal(calculatePurchaseTotal([]), 0);

  const typeSource = readProjectFile("src", "features", "ledger", "types.ts");
  assert.match(typeSource, /export\s+type\s+LedgerPurchaseLine\s+=/);
  assert.match(typeSource, /export\s+type\s+LedgerPurchaseStepData\s+=/);

  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "queries.ts",
  );
  assert.match(querySource, /ledgerPurchaseItems:/);
  assert.match(querySource, /function\s+getLedgerPurchaseItems/);
  assert.match(querySource, /purchaseTotal:\s+calculatePurchaseTotal/);
  assert.match(querySource, /export\s+function\s+toLedgerPurchaseStepData/);
  assert.match(querySource, /purchaseTotal/);

  const actionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  assert.match(actionSource, /export\s+async\s+function\s+saveLedgerPurchases/);
  assert.match(actionSource, /ledgerPurchaseSchema\.safeParse/);
  assert.match(actionSource, /requireStoreAccess\(/);
  assert.match(actionSource, /db\.\$transaction/);
  assert.match(actionSource, /beforeLedger\.status\s*!==\s*"IN_PROGRESS"/);
  assert.match(actionSource, /existingPurchaseItemsById/);
  assert.match(actionSource, /isExistingSnapshotPurchase/);
  assert.match(actionSource, /tx\.ledgerPurchaseItem\.deleteMany/);
  assert.match(actionSource, /tx\.ledgerPurchaseItem\.createMany/);
  assert.match(
    actionSource,
    /unitPrice\s*\*\s*quantity|quantity\s*\*\s*unitPrice/,
  );
  assert.match(actionSource, /action:\s*"ledger\.purchases\.saved"/);
  assert.match(actionSource, /writeAuditLog\(/);
  assert.match(actionSource, /revalidateLedgerSalesPaths\(\)/);
});

test("ledger purchase UI and routing are wired for the purchase step", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "page.tsx",
  );
  assert.match(
    pageSource,
    /type\s+StoreEntryStep\s*=\s*"sales"\s*\|\s*"cost"\s*\|\s*"purchase"\s*\|\s*"work"/,
  );
  assert.match(pageSource, /step === "purchase"/);
  assert.match(pageSource, /PurchaseStepClient/);
  assert.match(pageSource, /getActiveProductOptions/);
  assert.match(pageSource, /getActivePurchaseStandardOptions/);

  const componentSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "purchase-step-client.tsx",
  );
  assert.match(componentSource, /saveLedgerPurchases/);
  assert.match(componentSource, /inputMode="numeric"/);
  assert.match(componentSource, /focusFirstError/);
  assert.doesNotMatch(componentSource, /sanitizeAmount/);
  assert.match(componentSource, /getDraftPurchaseTotal/);
  assert.match(componentSource, /clearRowErrors/);
  assert.match(componentSource, /referenceUnitPrice/);
  assert.match(componentSource, /저장됐습니다\./);
  assert.match(componentSource, /매입 합계/);
  assert.match(componentSource, /min-h-11/);
});
