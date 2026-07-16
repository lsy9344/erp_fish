import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();

function projectPath(...segments) {
  return path.join(root, ...segments);
}

function readProjectFile(...segments) {
  return readFileSync(projectPath(...segments), "utf8");
}

test("Story 5.4 reuses the existing ledger input code domain without hard delete or API routes", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  const actions = readProjectFile(
    "src",
    "features",
    "master-data",
    "code-actions.ts",
  );
  const queries = readProjectFile(
    "src",
    "features",
    "master-data",
    "code-queries.ts",
  );
  const page = readProjectFile(
    "src",
    "app",
    "app",
    "master-data",
    "codes",
    "page.tsx",
  );

  assert.equal(existsSync(projectPath("src", "features", "codes")), false);
  assert.equal(existsSync(projectPath("src", "app", "api", "codes")), false);
  assert.match(
    schema,
    /enum\s+LedgerInputCodeGroup\s*{[^}]*PAYMENT_METHOD[^}]*EXPENSE_ITEM[^}]*LOSS_TYPE[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+LedgerInputCode\s*{[^}]*@@unique\(\[group,\s*name\]\)[^}]*}/s,
  );
  assert.doesNotMatch(schema, /@@unique\(\[name\]\)/);
  assert.match(actions, /export\s+async\s+function\s+createLedgerInputCode/);
  assert.match(actions, /export\s+async\s+function\s+updateLedgerInputCode/);
  assert.match(
    actions,
    /export\s+async\s+function\s+updateLedgerInputCodeStatus/,
  );
  assert.doesNotMatch(actions, /deleteLedgerInputCode|\.delete\(/);
  assert.match(actions, /requireSettingsAccess\(\)/);
  assert.match(queries, /getLedgerInputCodesForHeadquarters/);
  assert.match(queries, /getActiveLedgerInputCodeOptions/);
  assert.match(queries, /requireSettingsAccess\(\)/);
  assert.match(page, /requireSettingsAccess\(\)/);
});

test("Story 5.4 code mutations keep validation, audit, no-op, and revalidation contracts", () => {
  const actions = readProjectFile(
    "src",
    "features",
    "master-data",
    "code-actions.ts",
  );
  const schemas = readProjectFile(
    "src",
    "features",
    "master-data",
    "code-schemas.ts",
  );

  assert.match(
    schemas,
    /LEDGER_INPUT_CODE_GROUPS\s*=\s*\[[\s\S]*PAYMENT_METHOD[\s\S]*EXPENSE_ITEM[\s\S]*LOSS_TYPE/,
  );
  assert.match(schemas, /value\.trim\(\)/);
  assert.match(schemas, /표시 순서는 0 이상의 정수여야 합니다\./);
  assert.match(
    actions,
    /findDuplicateLedgerInputCode[\s\S]*group:\s*input\.group[\s\S]*name:\s*input\.name/s,
  );
  assert.match(actions, /isSameLedgerInputCode/);
  assert.match(actions, /status:\s*"unchanged"/);
  assert.match(
    actions,
    /if\s*\(result\.status === "updated"\)\s*{[\s\S]*revalidateLedgerInputCodePaths\(\)/,
  );
  assert.match(actions, /ledger_input_code\.created/);
  assert.match(actions, /ledger_input_code\.updated/);
  assert.match(actions, /ledger_input_code\.reordered/);
  assert.match(actions, /ledger_input_code\.activated/);
  assert.match(actions, /ledger_input_code\.deactivated/);
  assert.match(
    actions,
    /function\s+toLedgerInputCodeAuditValue[\s\S]*group:\s*code\.group[\s\S]*name:\s*code\.name[\s\S]*displayOrder:\s*code\.displayOrder[\s\S]*isActive:\s*code\.isActive/s,
  );
  assert.doesNotMatch(
    actions,
    /toLedgerInputCodeAuditValue[\s\S]*(token|session|dialog|screen)/,
  );
  assert.match(actions, /revalidateMasterDataPaths\("codes"\)/);
});

test("Story 5.4 active options use stable active-only sorting for ledger entry choices", () => {
  const queries = readProjectFile(
    "src",
    "features",
    "master-data",
    "code-queries.ts",
  );

  assert.match(
    queries,
    /export\s+async\s+function\s+getActiveLedgerInputCodeOptions/,
  );
  assert.match(queries, /requireAppUser\(\)/);
  assert.match(
    queries,
    /where:\s*{[\s\S]*isActive:\s*true[\s\S]*\.\.\.\(group \? { group } : {}\)/s,
  );
  assert.match(
    queries,
    /orderBy:\s*\[[\s\S]*group:\s*"asc"[\s\S]*displayOrder:\s*"asc"[\s\S]*name:\s*"asc"[\s\S]*id:\s*"asc"/s,
  );
});

test("Story 5.4 expense and loss integrations reject inactive or wrong-group direct posts while preserving snapshots", () => {
  const storePage = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "page.tsx",
  );
  const hqPage = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );
  const ledgerActions = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  const hqLedgerActions = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-edit-actions.ts",
  );
  const expenseClient = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "expense-step-client.tsx",
  );
  const lossQueries = readProjectFile(
    "src",
    "features",
    "losses",
    "queries.ts",
  );
  const lossActions = readProjectFile(
    "src",
    "features",
    "losses",
    "actions.ts",
  );
  const hqLossActions = readProjectFile(
    "src",
    "features",
    "losses",
    "hq-edit-actions.ts",
  );
  const lossClient = readProjectFile(
    "src",
    "features",
    "losses",
    "components",
    "loss-step-client.tsx",
  );

  // WO-09: 지점장 store-entry 화면은 지출 항목 표시명에 지점별 alias를 적용하므로
  // store id 인자를 함께 넘긴다. 본사(hq) 화면은 본사 등록명을 유지하기 위해 인자 없이 호출한다.
  assert.match(storePage, /getActiveLedgerInputCodeOptions\(\s*"EXPENSE_ITEM"/);
  assert.match(hqPage, /getActiveLedgerInputCodeOptions\("EXPENSE_ITEM"\)/);
  assert.match(ledgerActions, /validateActiveExpenseCodesInTx/);
  assert.match(
    ledgerActions,
    /group:\s*"EXPENSE_ITEM"[\s\S]*isActive:\s*true/s,
  );
  assert.match(hqLedgerActions, /validateActiveExpenseCodesInTx/);
  assert.match(
    hqLedgerActions,
    /group:\s*"EXPENSE_ITEM"[\s\S]*isActive:\s*true/s,
  );
  assert.match(
    hqLedgerActions,
    /지출 항목 코드가 등록된 뒤 저장할 수 있습니다\./,
  );
  assert.match(hqLedgerActions, /활성 지출 항목만 저장할 수 있습니다\./);
  assert.match(expenseClient, /!selectedCode\s*&&\s*line\.ledgerInputCodeId/);
  assert.match(
    expenseClient,
    /line\.ledgerInputCodeName \|\| line\.ledgerInputCodeId/,
  );
  assert.match(
    lossQueries,
    /where:\s*{\s*isActive:\s*true,\s*group:\s*"LOSS_TYPE"\s*}/,
  );
  assert.match(lossActions, /group:\s*"LOSS_TYPE"[\s\S]*isActive:\s*true/s);
  assert.match(hqLossActions, /group:\s*"LOSS_TYPE"[\s\S]*isActive:\s*true/s);
  assert.match(lossActions, /existing\.lossTypeName/);
  assert.match(hqLossActions, /existing\.lossTypeName/);
  assert.match(lossClient, /!lossTypeActive\s*&&\s*item\.ledgerInputCodeId/);
});

test("Story 5.4 documents the conservative PAYMENT_METHOD boundary instead of pretending full dynamic payment entry exists", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  const page = readProjectFile(
    "src",
    "app",
    "app",
    "master-data",
    "codes",
    "page.tsx",
  );
  const salesClient = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "sales-payment-step-client.tsx",
  );
  const ledgerActions = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  const hqLedgerActions = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-edit-actions.ts",
  );

  assert.match(page, /현금, 카드, 기타 결제수단 고정 필드로 저장됩니다/);
  assert.match(schema, /cashAmount\s+Int\s+@default\(0\)/);
  assert.match(schema, /cardAmount\s+Int\s+@default\(0\)/);
  assert.match(schema, /otherPaymentAmount\s+Int\s+@default\(0\)/);
  assert.doesNotMatch(schema, /paymentMethodCodeId|LedgerPayment/);
  assert.match(salesClient, /cashAmount/);
  assert.match(salesClient, /cardAmount/);
  assert.match(salesClient, /otherPaymentAmount/);
  assert.doesNotMatch(
    salesClient,
    /getActiveLedgerInputCodeOptions|PAYMENT_METHOD|paymentMethodCodeId/,
  );
  assert.match(ledgerActions, /cashAmount:\s*parsed\.data\.cashAmount/);
  assert.match(hqLedgerActions, /cashAmount:\s*parsed\.data\.cashAmount/);
});
