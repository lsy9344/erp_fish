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
    /model\s+DailyLedger\s*{[^}]*id\s+String\s+@id[^}]*storeId\s+String[^}]*closingDate\s+DateTime[^}]*status\s+DailyLedgerStatus\s+@default\(IN_PROGRESS\)[^}]*version\s+Int\s+@default\(1\)[^}]*totalSalesAmount\s+Int[^}]*cashAmount\s+Int[^}]*cardAmount\s+Int[^}]*otherPaymentAmount\s+Int[^}]*createdById\s+String[^}]*updatedById\s+String[^}]*createdAt\s+DateTime[^}]*updatedAt\s+DateTime[^}]*\n[^}]*@@unique\(\[storeId,\s*closingDate\],\s*map:\s*"dailyLedger_storeId_closingDate_key"\)[^}]*\n[^}]*@@index\(\[status\]\)/s,
  );
  assert.match(
    schema,
    /authorDisplayName\s+String\?/,
    "DailyLedger should store display-only ledger author name",
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

test("ledger migrations create DailyLedger, unique constraint, and version token", () => {
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

  const versionMigrationSql = migrationNames
    .map((name) => path.join(migrationRoot, name, "migration.sql"))
    .filter((migrationPath) => existsSync(migrationPath))
    .map((migrationPath) => readFileSync(migrationPath, "utf8"))
    .find((migration) => migration.includes('"version"'));

  assert.ok(
    versionMigrationSql?.includes(
      'ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1',
    ),
    "Story 2.1 migration should add DailyLedger.version as the edit token",
  );

  const authorDisplayNameMigrationSql = migrationNames
    .map((name) => path.join(migrationRoot, name, "migration.sql"))
    .filter((migrationPath) => existsSync(migrationPath))
    .map((migrationPath) => readFileSync(migrationPath, "utf8"))
    .find((migration) => migration.includes('"authorDisplayName"'));

  assert.ok(
    authorDisplayNameMigrationSql?.includes(
      'ADD COLUMN "authorDisplayName" TEXT',
    ),
    "Story 2.2 migration should add DailyLedger.authorDisplayName",
  );
});

test("ledger amount calculation helper validates payment difference", async () => {
  const calculatorPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculatePaymentDifference } = await import(
    pathToFileURL(calculatorPath).href
  );

  assert.equal(
    calculatePaymentDifference(120000, 50000, 30000, 20000, 15000),
    5000,
  );
  assert.equal(
    calculatePaymentDifference(50000, 60000, 20000, 10000, 5000),
    -45000,
  );
  assert.equal(calculatePaymentDifference(0, 0, 0, 0, 0), 0);
});

test("ledger query settlement difference includes saved expenses", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "queries.ts",
  );
  const salesStepSource = querySource.match(
    /export function toLedgerSalesStepData[\s\S]*?\r?\n}\r?\n\r?\nfunction getLedgerExpenseItems/,
  )?.[0];
  const auditSource = querySource.match(
    /export function toLedgerAuditPayload[\s\S]*?\r?\n}\r?\n\r?\nexport async function getOrCreateStoreLedgerInTx/,
  )?.[0];

  assert.ok(salesStepSource);
  assert.match(
    salesStepSource,
    /calculatePaymentDifference\(\s*ledger\.totalSalesAmount,\s*ledger\.cashAmount,\s*ledger\.cardAmount,\s*ledger\.otherPaymentAmount,\s*calculateExpenseTotal\(/,
  );
  assert.ok(auditSource);
  assert.match(
    auditSource,
    /calculatePaymentDifference\([\s\S]*otherPaymentAmount,\s*expenseTotal,\s*\)/,
  );
});

test("sales payment step explains cash after saved expenses without a difference box", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "sales-payment-step-client.tsx",
  );
  const termsSource = readProjectFile("src", "features", "ledger", "terms.ts");

  assert.match(source, /현금 \(당일 지출 후\)/);
  assert.match(
    source,
    /당일 현금지출을 하고 남은 당일 현금매출을 입력합니다\./,
  );
  assert.match(source, /4단계 지출 합계/);
  assert.match(source, /ledger\.expenseTotal/);
  assert.match(source, /readOnly/);
  assert.doesNotMatch(source, /결제 합계 차액/);
  assert.doesNotMatch(source, /hasPaymentDifference/);
  assert.doesNotMatch(source, /function\s+calculatePaymentDifference\s*\(/);
  assert.doesNotMatch(termsSource, /paymentDifference/);
});

test("ledger sales schema rejects blank, negative, decimal, and formatted values", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "schemas.ts",
  );
  const { ledgerSalesPaymentSchema } = await import(
    pathToFileURL(schemaPath).href
  );

  const basePayload = {
    storeId: "store-gangnam",
    ledgerId: "ledger-1",
    closingDate: "2026-06-11",
    version: 1,
    authorDisplayName: " 김지점장 ",
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
  assert.deepEqual(
    formattedAmount.error.flatten().fieldErrors.otherPaymentAmount,
    ["기타 결제수단은 0원 이상의 정수여야 합니다."],
  );

  const overflow = ledgerSalesPaymentSchema.safeParse({
    ...basePayload,
    totalSalesAmount: 2_147_483_648,
  });
  assert.equal(overflow.success, false);
  assert.deepEqual(overflow.error.flatten().fieldErrors.totalSalesAmount, [
    "총매출은 0원 이상의 정수여야 합니다.",
  ]);

  const normalizedAuthor = ledgerSalesPaymentSchema.parse(basePayload);
  assert.equal(normalizedAuthor.authorDisplayName, "김지점장");

  // 단계 순서 변경(2026-07-02): 작성자 입력은 1단계 매입으로 옮겨져 매출 저장에서는 선택값이다.
  // 빈 값/공백은 오류가 아니라 null(이번 저장에서 작성자 미변경)로 정규화한다.
  const blankAuthor = ledgerSalesPaymentSchema.safeParse({
    ...basePayload,
    authorDisplayName: "   ",
  });
  assert.equal(blankAuthor.success, true);
  assert.equal(blankAuthor.data.authorDisplayName, null);

  const longAuthor = ledgerSalesPaymentSchema.safeParse({
    ...basePayload,
    authorDisplayName: "가".repeat(51),
  });
  assert.equal(longAuthor.success, false);
  assert.deepEqual(longAuthor.error.flatten().fieldErrors.authorDisplayName, [
    "작성자 표시명은 50자 이하여야 합니다.",
  ]);
});

test("ledger date and open schemas normalize KST business dates", async () => {
  const datePath = assertProjectFile("src", "features", "ledger", "date.ts");
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "schemas.ts",
  );
  const { getKstBusinessDate, getKstBusinessDateParam, getKstLedgerDateParam } =
    await import(pathToFileURL(datePath).href);
  const { ledgerOpenSchema } = await import(pathToFileURL(schemaPath).href);

  assert.equal(
    getKstBusinessDate("2026-06-11").toISOString(),
    "2026-06-11T00:00:00.000Z",
  );
  assert.equal(
    getKstBusinessDate(new Date("2026-06-10T16:00:00.000Z")).toISOString(),
    "2026-06-11T00:00:00.000Z",
  );
  assert.equal(
    getKstBusinessDateParam(new Date("2026-06-11T00:00:00.000Z")),
    "2026-06-11",
  );
  assert.equal(getKstLedgerDateParam("2026-06-11T00:00:00.000Z"), "2026-06-11");

  assert.equal(
    ledgerOpenSchema.safeParse({
      storeId: "store-gangnam",
      closingDate: "2026-06-11",
    }).success,
    true,
  );
  assert.equal(
    ledgerOpenSchema.safeParse({
      storeId: "store-gangnam",
      closingDate: "2026/06/11",
    }).success,
    false,
  );
});

test("ledger save action enforces transaction, authorization, version guard, and ActionResult contracts", () => {
  const actionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "queries.ts",
  );

  assert.match(actionSource, /"use server"/);
  assert.match(
    actionSource,
    /export\s+async\s+function\s+saveLedgerSalesPayment/,
  );
  assert.match(actionSource, /requireStoreManagerLedgerEditAccess\(/);
  assert.match(actionSource, /db\.\$transaction/);
  assert.match(actionSource, /writeAuditLog/);
  assert.match(actionSource, /actionOk\(/);
  assert.match(actionSource, /actionError\(/);
  assert.match(actionSource, /LEDGER_CONFLICT/);
  assert.match(actionSource, /version:\s*parsed\.data\.version/);
  assert.match(actionSource, /version:\s*\{\s*increment:\s*1\s*\}/);
  assert.match(actionSource, /parsed\.data\.closingDate/);
  // WO-B(2026-06-22): 최초 작성자 표시명 보존. 기존 값이 있으면 덮어쓰지 않고,
  // 최초 저장에서만 클라이언트 입력값을 기록한다.
  assert.match(
    actionSource,
    /const\s+authorDisplayNameToPersist\s*=/,
    "sales save should compute a preserved author display name",
  );
  assert.match(
    actionSource,
    /beforeLedger\.authorDisplayName/,
    "sales save should read the existing author display name to preserve it",
  );
  assert.match(
    actionSource,
    /authorDisplayName:\s*authorDisplayNameToPersist/,
    "sales save should persist the preserved author display name",
  );
  assert.match(actionSource, /revalidateLedgerSalesPaths\(\)/);
  assert.match(actionSource, /revalidateDashboardAndReports\(\)/);
  assert.ok(actionSource.includes('action: "ledger.sales_payment.updated",'));
  assert.doesNotMatch(actionSource, /\.delete\(/);
  assert.doesNotMatch(
    actionSource,
    /threshold|anomaly|이상\s*신호|임계값/,
    "Story 2.3 must not implement OQ-1 threshold/anomaly classification in sales save",
  );

  assert.match(querySource, /getKstBusinessDate/);
  assert.match(querySource, /function\s+getOrCreateStoreLedgerInTx/);
  assert.match(querySource, /function\s+getTodayKstMidnight/);
  const dateSource = readProjectFile("src", "features", "ledger", "date.ts");
  assert.ok(
    dateSource.includes('const LEGAL_SEOUL_TZ = "Asia/Seoul";'),
    "Story 2.1 should use Korea timezone when calculating closing date",
  );
  assert.match(dateSource, /Date\.UTC\(/);
  assert.match(querySource, /tx\.dailyLedger\.createMany/);
  assert.match(querySource, /skipDuplicates:\s*true/);
  assert.match(querySource, /writeAuditLog\(/);
  assert.match(
    querySource,
    /authorDisplayName:\s*ledger\.authorDisplayName\s*\?\?\s*null/,
  );
});

test("today ledger creation avoids duplicate-key races", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "queries.ts",
  );

  assert.match(
    querySource,
    /tx\.dailyLedger\.createMany\(\{[\s\S]*skipDuplicates:\s*true/s,
    "today ledger creation should use duplicate-safe insert",
  );
  assert.match(
    querySource,
    /createdResult\.count\s*===\s*1[\s\S]*writeAuditLog/s,
    "creation audit should only be written when this request inserted the ledger",
  );
  assert.doesNotMatch(
    querySource,
    /tx\.dailyLedger\.create\(/,
    "today ledger creation should not throw on an already-created store/date row",
  );
});

test("store-entry UI passes selected date and ledger version through save and navigation contracts", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "page.tsx",
  );
  const navigationSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "store-entry-step-navigation.tsx",
  );

  assert.match(pageSource, /date\?: string \| string\[\]/);
  assert.match(pageSource, /normalizeClosingDateParam/);
  assert.match(pageSource, /getStoreLedger\(/);
  assert.match(
    pageSource,
    /getStoreManagerLedgerReviewStepData\([^)]*closingDate/s,
  );
  assert.match(navigationSource, /closingDate/);
  assert.match(
    navigationSource,
    /date:\s*getKstLedgerDateParam\(closingDate\)/,
  );

  for (const component of [
    "sales-payment-step-client.tsx",
    "expense-step-client.tsx",
    "purchase-step-client.tsx",
    "workstep-client.tsx",
  ]) {
    const source = readProjectFile(
      "src",
      "features",
      "ledger",
      "components",
      component,
    );

    assert.match(source, /LedgerContextHeader/);
    assert.match(
      source,
      /closingDate:\s*getKstLedgerDateParam\(ledger\.closingDate\)/,
    );
    assert.match(source, /version:\s*ledger\.version/);
    assert.match(source, /closingDate=\{ledger\.closingDate\}/);
  }

  const headerSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "ledger-context-header.tsx",
  );
  assert.match(headerSource, /LedgerStatusBadge/);
  assert.match(headerSource, /type="date"/);
  assert.match(headerSource, /name="storeId"/);
  assert.match(headerSource, /name="date"/);
});
