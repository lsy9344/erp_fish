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

test("ledger purchase model and migration preserve manual purchase snapshots", () => {
  const schema = readProjectFile("prisma", "schema.prisma");

  assert.match(
    schema,
    /model\s+LedgerPurchaseItem\s*{[^}]*id\s+String\s+@id\s+[^}]*dailyLedgerId\s+String[^}]*productId\s+String\?[^}]*purchaseStandardId\s+String\?[^}]*sourceType\s+LedgerPurchaseSource\s+@default\(MANUAL\)[^}]*productName\s+String[^}]*productCategory\s+String[^}]*productSpec\s+String[^}]*unitPrice\s+Int[^}]*quantity\s+Int[^}]*amount\s+Int[^}]*referenceInfo\s+String\?[^}]*createdById\s+String[^}]*updatedById\s+String[^}]*@@index\(\[dailyLedgerId\]\)[^}]*@@index\(\[productId\]\)[^}]*@@index\(\[purchaseStandardId\]\)[^}]*@@index\(\[sourceType\]\)/s,
  );
  assert.match(schema, /enum\s+LedgerPurchaseSource\s*{\s*MANUAL\s*}/s);
  assert.match(
    schema,
    /model\s+DailyLedger\s*{[^}]*ledgerPurchaseItems\s+LedgerPurchaseItem\[\]/s,
  );
  assert.match(
    schema,
    /model\s+User\s*{[^}]*createdLedgerPurchaseItems\s+LedgerPurchaseItem\[\]\s+@relation\("LedgerPurchaseItemCreatedBy"\)[^}]*updatedLedgerPurchaseItems\s+LedgerPurchaseItem\[\]\s+@relation\("LedgerPurchaseItemUpdatedBy"\)/s,
  );

  const migrationName = migrationDirNames().find((name) =>
    name.includes("ledger_purchase_manual_source_or_raw_snapshot"),
  );
  assert.ok(migrationName, "manual purchase source migration should exist");

  const migration = readFileSync(
    assertProjectFile("prisma", "migrations", migrationName, "migration.sql"),
    "utf8",
  );
  assert.ok(
    migration.includes('CREATE TYPE "LedgerPurchaseSource"') &&
      migration.includes("'MANUAL'"),
    "migration should create LedgerPurchaseSource enum",
  );
  assert.ok(
    migration.includes('ADD COLUMN "sourceType"') &&
      migration.includes("DEFAULT 'MANUAL'") &&
      migration.includes('ALTER COLUMN "productId" DROP NOT NULL'),
    "migration should add sourceType and allow raw manual product snapshots",
  );
});

test("ledger purchase schema allows raw manual input and validates integer amounts", async () => {
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
    ledgerId: "ledger-1",
    closingDate: "2026-06-11",
    version: 1,
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

  const rawManual = ledgerPurchaseSchema.parse({
    ...basePayload,
    purchases: [
      {
        productId: "",
        purchaseStandardId: "",
        productName: "수기 광어",
        productCategory: "생물",
        productSpec: "1kg",
        unitPrice: "12000",
        quantity: "3",
      },
    ],
  });
  assert.equal(rawManual.purchases[0].productId, null);
  assert.equal(rawManual.purchases[0].purchaseStandardId, null);
  assert.equal(rawManual.purchases[0].productName, "수기 광어");
  assert.equal(rawManual.purchases[0].productCategory, "생물");
  assert.equal(rawManual.purchases[0].productSpec, "1kg");

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

  const standardOnly = ledgerPurchaseSchema.parse({
    ...basePayload,
    purchases: [
      {
        productId: "",
        purchaseStandardId: "standard-1",
        productName: "",
        productCategory: "",
        productSpec: "",
        unitPrice: "12000",
        quantity: "3",
      },
    ],
  });
  assert.equal(standardOnly.purchases[0].productId, null);
  assert.equal(standardOnly.purchases[0].purchaseStandardId, "standard-1");

  const blankRawProductName = ledgerPurchaseSchema.safeParse({
    ...basePayload,
    purchases: [
      {
        productId: "",
        purchaseStandardId: "",
        productName: " ",
        productCategory: "생물",
        productSpec: "1kg",
        unitPrice: "12000",
        quantity: "3",
      },
    ],
  });
  assert.equal(blankRawProductName.success, false);
  assert.deepEqual(toFieldErrors(blankRawProductName.error), {
    "purchases.0.productName": ["품목명을 입력해 주세요."],
  });

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
  assert.match(actionSource, /LedgerPurchaseValidationError/);
  assert.match(actionSource, /매입 기준과 품목이 일치하지 않습니다\./);
  assert.match(actionSource, /매입 기준을 확인해 주세요\./);
  assert.match(actionSource, /품목을 확인해 주세요\./);
  assert.match(actionSource, /tx\.ledgerPurchaseItem\.deleteMany/);
  assert.match(actionSource, /tx\.ledgerPurchaseItem\.createMany/);
  assert.match(
    actionSource,
    /unitPrice\s*\*\s*quantity|quantity\s*\*\s*unitPrice/,
  );
  assert.match(actionSource, /action:\s*"ledger\.purchases\.saved"/);
  assert.match(actionSource, /sourceType:\s*"MANUAL"/);
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
  assert.match(componentSource, /품목명/);
  assert.match(
    componentSource,
    /선택 가능한 active 품목 또는 매입 기준이 없어도 수동 입력할 수\s+있습니다\./,
  );
  assert.match(componentSource, /저장됐습니다\./);
  assert.match(componentSource, /매입 합계/);
  assert.match(componentSource, /min-h-11/);
});
