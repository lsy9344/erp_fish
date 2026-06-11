import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

test("ledger cost and work schemas validate expense/work input edge cases", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "schemas.ts",
  );
  const { ledgerExpenseSchema, ledgerWorkInfoSchema } = await import(
    pathToFileURL(schemaPath).href
  );

  const expenseBase = {
    storeId: "store-gangnam",
    ledgerId: "ledger-1",
    closingDate: "2026-06-11",
    version: 1,
    expenses: [
      {
        ledgerInputCodeId: "code-food",
        amount: "10000",
        memo: "테스트",
      },
    ],
  };

  assert.equal(ledgerExpenseSchema.safeParse(expenseBase).success, true);
  const normalizedExpense = ledgerExpenseSchema.parse({
    ...expenseBase,
    expenses: [
      {
        ledgerInputCodeId: " code-food ",
        amount: "10000",
        memo: "  trim memo  ",
      },
      {
        ledgerInputCodeId: "code-utility",
        amount: 0,
        memo: "   ",
      },
    ],
  });
  assert.equal(normalizedExpense.expenses[0].ledgerInputCodeId, "code-food");
  assert.equal(normalizedExpense.expenses[0].memo, "trim memo");
  assert.equal(normalizedExpense.expenses[1].memo, null);

  const expenseBlankCode = ledgerExpenseSchema.safeParse({
    ...expenseBase,
    expenses: [
      {
        ledgerInputCodeId: " ",
        amount: "100",
      },
    ],
  });
  assert.equal(expenseBlankCode.success, false);
  assert.deepEqual(expenseBlankCode.error.flatten().fieldErrors.expenses, [
    "비용 항목을 선택해 주세요.",
  ]);

  const expenseNegative = ledgerExpenseSchema.safeParse({
    ...expenseBase,
    expenses: [
      {
        ledgerInputCodeId: "code-food",
        amount: -1,
      },
    ],
  });
  assert.equal(expenseNegative.success, false);
  assert.deepEqual(expenseNegative.error.flatten().fieldErrors.expenses, [
    "비용 금액은 0원 이상의 정수여야 합니다.",
  ]);

  const expenseDecimal = ledgerExpenseSchema.safeParse({
    ...expenseBase,
    expenses: [
      {
        ledgerInputCodeId: "code-food",
        amount: 12.34,
      },
    ],
  });
  assert.equal(expenseDecimal.success, false);
  assert.deepEqual(expenseDecimal.error.flatten().fieldErrors.expenses, [
    "비용 금액은 0원 이상의 정수여야 합니다.",
  ]);

  const expenseFormatted = ledgerExpenseSchema.safeParse({
    ...expenseBase,
    expenses: [
      {
        ledgerInputCodeId: "code-food",
        amount: "1,000",
      },
    ],
  });
  assert.equal(expenseFormatted.success, false);
  assert.deepEqual(expenseFormatted.error.flatten().fieldErrors.expenses, [
    "비용 금액은 0원 이상의 정수여야 합니다.",
  ]);

  const workBase = {
    storeId: "store-gangnam",
    ledgerId: "ledger-1",
    closingDate: "2026-06-11",
    version: 1,
    workerCount: 4,
    workMemo: "메모",
  };

  assert.equal(ledgerWorkInfoSchema.safeParse(workBase).success, true);

  const normalizedWork = ledgerWorkInfoSchema.parse({
    ...workBase,
    workerCount: " 4 ",
    workMemo: "  오전 피크타임 확인  ",
  });
  assert.equal(normalizedWork.workerCount, 4);
  assert.equal(normalizedWork.workMemo, "오전 피크타임 확인");

  const emptyWork = ledgerWorkInfoSchema.parse({
    ...workBase,
    workerCount: "",
    workMemo: "   ",
  });
  assert.equal(emptyWork.workerCount, null);
  assert.equal(emptyWork.workMemo, null);

  const workNegative = ledgerWorkInfoSchema.safeParse({
    ...workBase,
    workerCount: -3,
  });
  assert.equal(workNegative.success, false);
  assert.deepEqual(workNegative.error.flatten().fieldErrors.workerCount, [
    "근무인원은 0 이상의 정수여야 합니다.",
  ]);

  const workDecimal = ledgerWorkInfoSchema.safeParse({
    ...workBase,
    workerCount: 3.2,
  });
  assert.equal(workDecimal.success, false);
  assert.deepEqual(workDecimal.error.flatten().fieldErrors.workerCount, [
    "근무인원은 0 이상의 정수여야 합니다.",
  ]);

  const workFormatted = ledgerWorkInfoSchema.safeParse({
    ...workBase,
    workerCount: "1,000",
  });
  assert.equal(workFormatted.success, false);
  assert.deepEqual(workFormatted.error.flatten().fieldErrors.workerCount, [
    "근무인원은 0 이상의 정수여야 합니다.",
  ]);

  const workMemoOverflow = ledgerWorkInfoSchema.safeParse({
    ...workBase,
    workMemo: "a".repeat(501),
  });
  assert.equal(workMemoOverflow.success, false);
  assert.deepEqual(workMemoOverflow.error.flatten().fieldErrors.workMemo, [
    "메모는 0~500자 사이여야 합니다.",
  ]);
});

test("work step client preserves invalid worker count text for server validation", () => {
  const componentSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "workstep-client.tsx",
  );

  assert.match(
    componentSource,
    /onChange=\{\(event\)\s*=>\s*setWorkerCount\(event\.currentTarget\.value\)\}/,
  );
  assert.doesNotMatch(componentSource, /replace\(\s*\/\[\^\\d\]\//);
  assert.doesNotMatch(componentSource, /sanitizeAmount/);
});

test("ledger cost calculation helpers validate edge cases", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateExpenseTotal, calculateGrossProfit, calculateProductivity } =
    await import(pathToFileURL(calcPath).href);

  assert.equal(calculateExpenseTotal([1_000, 2_000, 300]), 3_300);
  assert.equal(calculateExpenseTotal([]), 0);
  assert.equal(calculateGrossProfit(10_000, 4_500), 5_500);
  assert.equal(calculateGrossProfit(5_000, 7_000), -2_000);
  assert.equal(calculateProductivity(10_000, 2), 5_000);
  assert.equal(calculateProductivity(10_000, 0), null);
  assert.equal(calculateProductivity(10_000, null), null);
  assert.equal(calculateProductivity(10_000, -1), null);
});

test("ledger cost/work data model, actions, and queries follow expected contracts", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  assert.match(
    schema,
    /model\s+LedgerExpense\s*{[^}]*id\s+String\s+@id\s+[^}]*dailyLedgerId\s+String\s+[^}]*ledgerInputCodeId\s+String\s+[^}]*amount\s+Int\s+[^}]*memo\s+String\?[^}]*createdById\s+String\s+[^}]*updatedById\s+String\s+[^}]*\n[^}]*\@index\(\[dailyLedgerId\]\)/s,
  );
  assert.match(
    schema,
    /model\s+DailyLedger\s*{[^}]*workerCount\s+Int\?\s+[^}]*workMemo\s+String\?/s,
  );

  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "queries.ts",
  );
  assert.match(
    querySource,
    /const\s+ledgerExpenseSelect\s*=\s*{[\s\S]*ledgerInputCodeId:\s*true[\s\S]*ledgerExpenses:/,
  );
  assert.match(
    querySource,
    /type\s+DailyLedgerPayload\s*=\s*Prisma\.DailyLedgerGetPayload<\{[\s\S]*ledgerExpenses/s,
  );

  const actionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  assert.match(actionSource, /export\s+async\s+function\s+saveLedgerExpenses/);
  assert.match(actionSource, /export\s+async\s+function\s+saveLedgerWorkInfo/);
  assert.match(
    actionSource,
    /action:\s*"ledger\.expenses\.saved"|action:\s*'ledger\.expenses\.saved'/,
  );
  assert.match(
    actionSource,
    /action:\s*"ledger\.work_info\.saved"|action:\s*'ledger\.work_info\.saved'/,
  );
  assert.match(actionSource, /requireStoreAccess\(/);
  assert.match(actionSource, /writeAuditLog\(/);
  assert.match(actionSource, /db\.\$transaction/);
  assert.match(actionSource, /revalidateLedgerSalesPaths\(\)/);
  assert.match(actionSource, /dashboardPath = "\/app\/dashboard"/);
  assert.match(actionSource, /validateActiveExpenseCodesInTx/);
  assert.match(
    actionSource,
    /ledgerInputCode\.findMany\(\{[\s\S]*group:\s*"EXPENSE_ITEM"[\s\S]*isActive:\s*true/s,
  );
  assert.match(
    actionSource,
    /expenses\.findIndex\([\s\S]*activeExpenseCodeIds\.has\(expense\.ledgerInputCodeId\)/s,
  );
  assert.match(actionSource, /"활성 비용 항목만 저장할 수 있습니다\."/);
});

test("store manager ledger responses omit sensitive accounting metrics", async () => {
  const typeSource = readProjectFile("src", "features", "ledger", "types.ts");
  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "queries.ts",
  );
  const responseShapeSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "response-shaping.ts",
  );
  const actionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  const expenseClientSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "expense-step-client.tsx",
  );
  const workClientSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "workstep-client.tsx",
  );

  assert.match(typeSource, /StoreManagerLedgerCostStepData/);
  assert.match(
    typeSource,
    /Omit<\s*LedgerCostStepData,\s*"grossProfit"\s*\|\s*"productivity"\s*>/s,
  );
  assert.match(querySource, /shapeStoreManagerLedgerCostStepData/);
  assert.match(
    responseShapeSource,
    /const\s*\{\s*grossProfit,\s*productivity,\s*\.\.\.safeLedger\s*\}/s,
  );
  assert.match(actionSource, /toStoreManagerLedgerCostStepData\(afterLedger\)/);
  assert.match(expenseClientSource, /showSensitiveAccountingMetrics/);
  assert.match(expenseClientSource, /showSensitiveAccountingMetrics\s*\?\s*\(/);
  assert.match(workClientSource, /showSensitiveAccountingMetrics/);

  const queryPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "response-shaping.ts",
  );
  const { toStoreManagerLedgerCostStepData } = await import(
    pathToFileURL(queryPath).href
  );
  const safeLedger = toStoreManagerLedgerCostStepData({
    id: "ledger-1",
    storeId: "store-1",
    closingDate: new Date("2026-06-10T00:00:00.000Z"),
    updatedAt: new Date("2026-06-10T01:00:00.000Z"),
    status: "IN_PROGRESS",
    submittedById: null,
    submittedAt: null,
    closedById: null,
    closedAt: null,
    totalSalesAmount: 100_000,
    cashAmount: 40_000,
    cardAmount: 50_000,
    otherPaymentAmount: 10_000,
    paymentDifferenceAmount: 0,
    workerCount: 2,
    workMemo: null,
    expenseItems: [
      {
        id: "expense-1",
        ledgerInputCodeId: "code-1",
        ledgerInputCodeName: "재료비",
        amount: 30_000,
        memo: null,
      },
    ],
    expenseTotal: 30_000,
    purchaseItems: [],
    purchaseTotal: 0,
    grossProfit: 70_000,
    productivity: 35_000,
    stepCompletion: {
      sales: true,
      cost: true,
      purchase: false,
      inventory: false,
      losses: false,
      work: true,
    },
  });

  assert.equal(Object.hasOwn(safeLedger, "grossProfit"), false);
  assert.equal(Object.hasOwn(safeLedger, "productivity"), false);
  assert.equal(safeLedger.expenseTotal, 30_000);
});

test("expense step provides 기타 fallback and disables amount when no HQ expense codes exist", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "expense-step-client.tsx",
  );

  assert.match(source, /DEFAULT_EXPENSE_CODE_OPTION/);
  assert.match(source, /name:\s*"기타"/);
  assert.match(source, /expenseCodeOptions\.length > 0/);
  assert.match(source, /disabled=\{[^}]*!hasRegisteredExpenseCodeOptions/s);
  assert.match(source, /createFallbackExpenseLines/);
  assert.match(source, /if\s*\(\s*!hasRegisteredExpenseCodeOptions\s*\)/);
  assert.doesNotMatch(
    source,
    /saveAction\(\{[\s\S]*DEFAULT_EXPENSE_CODE_OPTION/s,
    "Fallback 기타 must not be treated as a saveable expense code",
  );
});

test("expense step preserves inactive historical code display without adding it to new options", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "page.tsx",
  );
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "expense-step-client.tsx",
  );

  assert.match(
    pageSource,
    /getActiveLedgerInputCodeOptions\("EXPENSE_ITEM"\)/,
    "new expense options should come from active EXPENSE_ITEM codes only",
  );
  assert.match(
    source,
    /!selectedCode\s*&&\s*line\.ledgerInputCodeId/,
    "stored inactive code should remain visible on its existing row",
  );
  assert.match(
    source,
    /<option value=\{line\.ledgerInputCodeId\}>[\s\S]*line\.ledgerInputCodeName/s,
  );
  assert.match(
    source,
    /expenseOptions\.map\(\(option\) =>/,
    "new row options should be based on active options passed from the server",
  );
});

test("expense UI distinguishes draft total from authoritative server total", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "expense-step-client.tsx",
  );

  assert.match(source, /const\s+draftExpenseTotal\s*=\s*getDraftExpenseTotal/);
  assert.match(source, /입력 중 비용 합계/);
  assert.match(source, /마지막 서버 저장 합계/);
  assert.match(source, /formatKrw\(ledger\.expenseTotal\)/);
});

test("cost and work migration exists and defines required schema objects", () => {
  const migrationName = migrationDirNames().find((name) =>
    name.includes("add_ledger_expense_and_worker_fields"),
  );
  assert.ok(migrationName, "Cost and labor migration should exist");

  const migrationPath = assertProjectFile(
    "prisma",
    "migrations",
    migrationName,
    "migration.sql",
  );
  const migration = readFileSync(migrationPath, "utf8");

  assert.ok(
    migration.includes('CREATE TABLE "LedgerExpense" ('),
    "Migration should create LedgerExpense table",
  );
  assert.ok(
    migration.includes('ADD COLUMN "workerCount" INTEGER'),
    "Migration should add workerCount column",
  );
  assert.ok(
    migration.includes('ADD COLUMN "workMemo" TEXT'),
    "Migration should add workMemo column",
  );
});
