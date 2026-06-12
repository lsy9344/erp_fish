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

function getExportedAsyncFunctionSource(source, functionName) {
  const start = source.indexOf(`export async function ${functionName}`);
  const next = source.indexOf("\nexport async function ", start + 1);

  assert.ok(start >= 0, `${functionName} should exist`);

  return source.slice(start, next >= 0 ? next : source.length);
}

function migrationDirNames() {
  const migrationDir = assertProjectFile("prisma", "migrations");

  return readdirSync(migrationDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

test("daily ledger submission fields are modeled and migrated as nullable metadata", () => {
  const schema = readProjectFile("prisma", "schema.prisma");

  assert.match(
    schema,
    /model\s+DailyLedger\s*{[^}]*submittedById\s+String\?[^}]*submittedAt\s+DateTime\?/s,
  );
  assert.match(
    schema,
    /submittedBy\s+User\?\s+@relation\("LedgerSubmittedBy",\s*fields:\s*\[submittedById\],\s*references:\s*\[id\],\s*onDelete:\s*SetNull\)/s,
  );
  assert.match(
    schema,
    /model\s+User\s*{[^}]*submittedDailyLedgers\s+DailyLedger\[\]\s+@relation\("LedgerSubmittedBy"\)/s,
  );
  assert.match(schema, /@@index\(\[submittedById\]\)/);

  const migrationName = migrationDirNames().find((name) =>
    name.includes("add_daily_ledger_submission_fields"),
  );
  assert.ok(migrationName, "daily ledger submission migration should exist");

  const migration = readFileSync(
    assertProjectFile("prisma", "migrations", migrationName, "migration.sql"),
    "utf8",
  );
  assert.match(migration, /ADD COLUMN\s+"submittedById"\s+TEXT/);
  assert.match(migration, /ADD COLUMN\s+"submittedAt"\s+TIMESTAMP\(3\)/);
  assert.match(migration, /ON DELETE SET NULL/);
});

test("ledger submit schema accepts the selected ledger boundary", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "schemas.ts",
  );
  const { ledgerSubmitSchema } = await import(pathToFileURL(schemaPath).href);

  assert.deepEqual(
    ledgerSubmitSchema.parse({
      storeId: " store-1 ",
      ledgerId: " ledger-1 ",
      closingDate: "2026-06-11",
      version: "1",
    }),
    {
      storeId: "store-1",
      ledgerId: "ledger-1",
      closingDate: "2026-06-11",
      version: 1,
    },
  );
  assert.equal(ledgerSubmitSchema.safeParse({ storeId: " " }).success, false);
});

test("submitLedgerForReview uses guarded server action, idempotent update, audit, and revalidation", () => {
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
  const reviewTypesSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-types.ts",
  );

  assert.match(actionSource, /ledgerSubmitSchema\.safeParse/);
  assert.match(
    actionSource,
    /export\s+async\s+function\s+submitLedgerForReview/,
  );
  const submitSource = getExportedAsyncFunctionSource(
    actionSource,
    "submitLedgerForReview",
  );
  assert.match(submitSource, /parseLedgerStoreAccessInput\(input\)/);
  assert.match(submitSource, /requireStoreAccess\(access\.data\.storeId\)/);
  assert.ok(
    submitSource.indexOf("requireStoreAccess(access.data.storeId)") <
      submitSource.indexOf("parseLedgerSubmitInput(input)"),
    "submit should authorize store access before detailed submit validation",
  );
  assert.match(actionSource, /db\.\$transaction/);
  assert.match(actionSource, /status:\s*"IN_REVIEW"/);
  assert.match(actionSource, /submittedById:\s*actor\.user\.id/);
  assert.match(actionSource, /submittedAt:\s*submittedAt/);
  assert.match(
    submitSource,
    /updateMany\(\{\s*where:\s*\{\s*id:\s*beforeLedger\.id,\s*version:\s*parsed\.data\.version,\s*status:\s*"IN_PROGRESS",\s*\},\s*data:\s*\{[\s\S]*status:\s*"IN_REVIEW"[\s\S]*version:\s*\{\s*increment:\s*1\s*\}/,
  );
  assert.match(actionSource, /already-in-review/);
  assert.match(actionSource, /validateLedgerSubmitRequirementsInTx/);
  assert.match(actionSource, /getLedgerReviewMissingItems/);
  assert.match(
    actionSource,
    /filter\(\(item\)\s*=>\s*item\.status === "missing"\)/,
  );
  assert.match(actionSource, /필수 입력을 완료한 뒤 제출해 주세요\./);
  assert.match(actionSource, /Object\.fromEntries/);
  assert.match(actionSource, /beforeLedger\.status === "HOLIDAY"/);
  assert.match(actionSource, /ledger\.review\.submitted/);
  assert.match(actionSource, /writeAuditLog\(/);
  assert.match(actionSource, /LEDGER_SUBMIT_FAILED/);
  assert.match(actionSource, /제출에 실패했습니다\. 다시 시도해 주세요\./);
  assert.match(actionSource, /revalidatePath\("\/app\/store-entry"\)/);
  assert.match(
    actionSource,
    /revalidatePath\("\/app\/store-entry\/inventory"\)/,
  );
  assert.match(actionSource, /revalidatePath\("\/app\/store-entry\/losses"\)/);
  assert.match(actionSource, /revalidatePath\("\/app\/dashboard"\)/);
  assert.match(querySource, /submittedById:\s*true/);
  assert.match(querySource, /submittedAt:\s*true/);
  assert.match(reviewTypesSource, /submittedById:\s*string\s*\|\s*null/);
  assert.match(reviewTypesSource, /submittedAt:\s*string\s*\|\s*null/);
});

test("submit action keeps post-commit revalidation outside submit failure handling", () => {
  const actionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  const submitStart = actionSource.indexOf(
    "export async function submitLedgerForReview",
  );
  const submitEnd = actionSource.indexOf(
    "\nexport async function saveLedgerSalesPayment",
    submitStart,
  );
  const submitSource = actionSource.slice(submitStart, submitEnd);
  const submitFailureIndex = submitSource.indexOf("LEDGER_SUBMIT_FAILED");
  const revalidateIndex = submitSource.indexOf(
    "revalidateLedgerSubmitPaths();",
  );

  assert.ok(submitStart >= 0, "submitLedgerForReview should exist");
  assert.ok(submitEnd > submitStart, "submitLedgerForReview body should parse");
  assert.ok(
    submitFailureIndex > 0,
    "submit failure mapping should remain in the action",
  );
  assert.ok(revalidateIndex > 0, "submit revalidation should remain wired");
  assert.ok(
    submitFailureIndex < revalidateIndex,
    "post-commit revalidation should not be inside the submit failure catch",
  );
  assert.match(
    submitSource,
    /try\s*\{\s*revalidateLedgerSubmitPaths\(\);\s*\}\s*catch\s*\{/s,
  );
});

test("review submit UI exposes non-blocking warnings, status feedback, retry, and mobile-safe controls", () => {
  const componentSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "review-summary-client.tsx",
  );

  assert.match(componentSource, /submitLedgerForReview/);
  assert.match(componentSource, /장부를 제출했습니다\./);
  assert.match(componentSource, /이미 검토 대기 상태입니다\./);
  assert.match(componentSource, /role="status"/);
  assert.match(componentSource, /fieldErrors/);
  assert.match(componentSource, /Object\.entries\(feedback\.fieldErrors\)/);
  assert.match(componentSource, /다시 시도/);
  assert.match(componentSource, /제출 중\.\.\./);
  assert.match(componentSource, /검토대기/);
  assert.match(componentSource, /type="button"/);
  assert.match(componentSource, /disabled=\{isSubmitting\}/);
  assert.match(componentSource, /min-w-0/);
  assert.doesNotMatch(componentSource, /disabled=\{[^}]*missingItems/);
  assert.doesNotMatch(componentSource, /disabled=\{[^}]*warnings/);
  assert.doesNotMatch(componentSource, /disabled=\{[^}]*signals/);
});

test("review submit UI refreshes prop-backed state and names item links", () => {
  const componentSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "review-summary-client.tsx",
  );

  assert.match(
    componentSource,
    /import\s+\{\s*useEffect,\s*useRef,\s*useState\s*\}/,
  );
  assert.match(
    componentSource,
    /previousReviewContextKey\s*=\s*useRef\([\s\S]*reviewData\.id[\s\S]*reviewData\.storeId[\s\S]*reviewData\.closingDate[\s\S]*\)/,
  );
  assert.match(
    componentSource,
    /useEffect\(\(\)\s*=>\s*\{[\s\S]*setCurrentReviewData\(reviewData\)[\s\S]*previousReviewContextKey\.current\s*!==\s*nextReviewContextKey[\s\S]*setFeedback\(null\)[\s\S]*previousReviewContextKey\.current\s*=\s*nextReviewContextKey[\s\S]*\},\s*\[reviewData\]\)/,
  );
  assert.match(
    componentSource,
    /aria-label=\{`\$\{item\.label\}\s*단계로 이동`\}/,
  );
});

test("ledger save actions keep in-review ledgers editable without reverting status", () => {
  const ledgerActionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  const inventoryActionSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "actions.ts",
  );
  const salesSource = getExportedAsyncFunctionSource(
    ledgerActionSource,
    "saveLedgerSalesPayment",
  );
  const expenseSource = getExportedAsyncFunctionSource(
    ledgerActionSource,
    "saveLedgerExpenses",
  );
  const purchaseSource = getExportedAsyncFunctionSource(
    ledgerActionSource,
    "saveLedgerPurchases",
  );
  const workSource = getExportedAsyncFunctionSource(
    ledgerActionSource,
    "saveLedgerWorkInfo",
  );

  assert.match(
    ledgerActionSource,
    /editableLedgerStatuses\s*=\s*\["IN_PROGRESS",\s*"IN_REVIEW"\]/,
  );
  assert.match(
    ledgerActionSource,
    /status:\s*\{\s*in:\s*\[\.\.\.editableLedgerStatuses\]\s*\}/,
  );
  assert.doesNotMatch(salesSource, /data:\s*\{[\s\S]*?status:\s*"IN_PROGRESS"/);
  assert.doesNotMatch(workSource, /data:\s*\{[\s\S]*?status:\s*"IN_PROGRESS"/);
  assert.match(
    expenseSource,
    /if\s*\(!isEditableLedgerStatus\(beforeLedger\.status\)\)/,
  );
  assert.match(
    expenseSource,
    /updateEditableDailyLedgerInTx\(\s*tx,\s*beforeLedger\.id,\s*parsed\.data\.version,/,
  );
  assert.match(
    purchaseSource,
    /if\s*\(!isEditableLedgerStatus\(beforeLedger\.status\)\)/,
  );
  assert.match(
    purchaseSource,
    /updateEditableDailyLedgerInTx\(\s*tx,\s*beforeLedger\.id,\s*parsed\.data\.version,/,
  );
  assert.match(
    inventoryActionSource,
    /saveLedgerInventoryItems[\s\S]*status:\s*\{\s*in:\s*\["IN_PROGRESS",\s*"IN_REVIEW"\]\s*\}/,
  );
});
