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

test("ledger schema includes DailyLedger model, enum, and relations", () => {
  const schema = readProjectFile("prisma", "schema.prisma");

  assert.match(
    schema,
    /enum\s+DailyLedgerStatus\s*{[^}]*IN_PROGRESS[^}]*IN_REVIEW[^}]*HEADQUARTERS_CLOSED[^}]*HOLIDAY[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+DailyLedger\s*{[^}]*id\s+String\s+@id[^}]*storeId\s+String[^}]*closingDate\s+DateTime[^}]*status\s+DailyLedgerStatus\s+@default\(IN_PROGRESS\)[^}]*totalSalesAmount\s+Int[^}]*cashAmount\s+Int[^}]*cardAmount\s+Int[^}]*otherPaymentAmount\s+Int[^}]*createdById\s+String[^}]*updatedById\s+String[^}]*createdAt\s+DateTime[^}]*updatedAt\s+DateTime[^}]*\n[^}]*@@unique\(\[storeId,\s*closingDate\],\s*map:\s*"dailyLedger_storeId_closingDate_key"\)[^}]*\n[^}]*@@index\(\[status\]\)/s,
  );
  assert.match(
    schema,
    /store\s+Store\s*@relation\(fields:\s*\[storeId\], references:\s*\[id\], onDelete:\s*Restrict\)/,
  );
  assert.match(
    schema,
    /createdBy\s+User\s*@relation\("LedgerCreatedBy", fields:\s*\[createdById\], references:\s*\[id\], onDelete:\s*Restrict\)/,
  );
  assert.match(
    schema,
    /updatedBy\s+User\s*@relation\("LedgerUpdatedBy", fields:\s*\[updatedById\], references:\s*\[id\], onDelete:\s*Restrict\)/,
  );
});

test("ledger migration creates DailyLedger and unique constraint", () => {
  const migrationRoot = path.join(root, "prisma", "migrations");
  const migrationNames = readdirSync(migrationRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const migrationSql = migrationNames
    .map((name) => path.join(migrationRoot, name, "migration.sql"))
    .filter((migrationPath) => existsSync(migrationPath))
    .map((migrationPath) => readFileSync(migrationPath, "utf8"))
    .find((migration) => migration.includes('CREATE TABLE "DailyLedger" ('));

  assert.ok(
    migrationSql,
    "Story 2.1 migration should create DailyLedger table",
  );
  assert.ok(
    migrationSql.includes('CREATE TABLE "DailyLedger" ('),
    "Story 2.1 migration should define DailyLedger",
  );
  assert.ok(
    migrationSql.includes(
      'CREATE UNIQUE INDEX "dailyLedger_storeId_closingDate_key" ON "DailyLedger"("storeId", "closingDate")',
    ),
    "Story 2.1 migration should enforce store + date uniqueness",
  );
  assert.ok(
    migrationSql.includes(
      'ADD CONSTRAINT "DailyLedger_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT',
    ),
    "Story 2.1 migration should define Store relation",
  );
});

test("ledger amount calculation helper validates payment difference", async () => {
  const calculatorPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculatePaymentDifference } = await import(pathToFileURL(calculatorPath).href);

  assert.equal(
    calculatePaymentDifference(120000, 50000, 30000, 20000),
    20000,
  );
  assert.equal(
    calculatePaymentDifference(50000, 60000, 20000, 10000),
    -40000,
  );
  assert.equal(calculatePaymentDifference(0, 0, 0, 0), 0);
});

test("ledger sales schema rejects blank, negative, decimal, and formatted values", async () => {
  const schemaPath = assertProjectFile("src", "features", "ledger", "schemas.ts");
  const { ledgerSalesPaymentSchema } = await import(pathToFileURL(schemaPath).href);

  const basePayload = {
    storeId: "store-gangnam",
    totalSalesAmount: 0,
    cashAmount: 0,
    cardAmount: 0,
    otherPaymentAmount: 0,
  };

  const blankTotal = ledgerSalesPaymentSchema.safeParse({
    ...basePayload,
    totalSalesAmount: "",
  });
  assert.equal(blankTotal.success, false);
  assert.deepEqual(blankTotal.error.flatten().fieldErrors.totalSalesAmount, [
    "총매출은 0원 이상의 정수여야 합니다.",
  ]);

  const negativeAmount = ledgerSalesPaymentSchema.safeParse({
    ...basePayload,
    cashAmount: -1,
  });
  assert.equal(negativeAmount.success, false);
  assert.deepEqual(negativeAmount.error.flatten().fieldErrors.cashAmount, [
    "현금은 0원 이상의 정수여야 합니다.",
  ]);

  const decimalAmount = ledgerSalesPaymentSchema.safeParse({
    ...basePayload,
    cardAmount: 12.5,
  });
  assert.equal(decimalAmount.success, false);
  assert.deepEqual(decimalAmount.error.flatten().fieldErrors.cardAmount, [
    "카드는 0원 이상의 정수여야 합니다.",
  ]);

  const formattedAmount = ledgerSalesPaymentSchema.safeParse({
    ...basePayload,
    otherPaymentAmount: "1,000",
  });
  assert.equal(formattedAmount.success, false);
  assert.deepEqual(formattedAmount.error.flatten().fieldErrors.otherPaymentAmount, [
    "기타 결제수단은 0원 이상의 정수여야 합니다.",
  ]);

  const overflow = ledgerSalesPaymentSchema.safeParse({
    ...basePayload,
    totalSalesAmount: 2_147_483_648,
  });
  assert.equal(overflow.success, false);
  assert.deepEqual(overflow.error.flatten().fieldErrors.totalSalesAmount, [
    "총매출은 0원 이상의 정수여야 합니다.",
  ]);
});

test("ledger save action enforces transaction, authorization, and ActionResult contracts", () => {
  const actionSource = readProjectFile("src", "features", "ledger", "actions.ts");
  const querySource = readProjectFile("src", "features", "ledger", "queries.ts");

  assert.match(actionSource, /"use server"/);
  assert.match(actionSource, /export\s+async\s+function\s+saveLedgerSalesPayment/);
  assert.match(actionSource, /requireStoreAccess\(/);
  assert.match(actionSource, /db\.\$transaction/);
  assert.match(actionSource, /writeAuditLog/);
  assert.match(actionSource, /actionOk\(/);
  assert.match(actionSource, /actionError\(/);
  assert.match(actionSource, /revalidateLedgerSalesPaths\(\)/);
  assert.match(actionSource, /dashboardPath = "\/app\/dashboard"/);
  assert.ok(
    actionSource.includes('action: "ledger.sales_payment.updated",'),
  );
  assert.doesNotMatch(actionSource, /\.delete\(/);

  assert.match(querySource, /function\s+getTodayKstMidnight/);
  assert.ok(
    querySource.includes('const LEGAL_SEOUL_TZ = "Asia/Seoul";'),
    "Story 2.1 should use Korea timezone when calculating closing date",
  );
  assert.match(querySource, /Date\.UTC\(/);
  assert.match(querySource, /tx\.dailyLedger\.create/);
  assert.match(querySource, /writeAuditLog\(/);
});
