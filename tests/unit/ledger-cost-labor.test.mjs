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
  const schemaPath = assertProjectFile("src", "features", "ledger", "schemas.ts");
  const { ledgerExpenseSchema, ledgerWorkInfoSchema } = await import(
    pathToFileURL(schemaPath).href,
  );

  const expenseBase = {
    storeId: "store-gangnam",
    expenses: [
      {
        ledgerInputCodeId: "code-food",
        amount: "10000",
        memo: "테스트",
      },
    ],
  };

  assert.equal(ledgerExpenseSchema.safeParse(expenseBase).success, true);

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
    workerCount: 4,
    workMemo: "메모",
  };

  assert.equal(ledgerWorkInfoSchema.safeParse(workBase).success, true);

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

  const workMemoOverflow = ledgerWorkInfoSchema.safeParse({
    ...workBase,
    workMemo: "a".repeat(501),
  });
  assert.equal(workMemoOverflow.success, false);
  assert.deepEqual(workMemoOverflow.error.flatten().fieldErrors.workMemo, [
    "메모는 0~500자 사이여야 합니다.",
  ]);
});

test("ledger cost calculation helpers validate edge cases", async () => {
  const calcPath = assertProjectFile("src", "server", "calculations", "ledger.ts");
  const {
    calculateExpenseTotal,
    calculateGrossProfit,
    calculateProductivity,
  } = await import(pathToFileURL(calcPath).href);

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

  const querySource = readProjectFile("src", "features", "ledger", "queries.ts");
  assert.match(
    querySource,
    /const\s+ledgerExpenseSelect\s*=\s*{[\s\S]*ledgerInputCodeId:\s*true[\s\S]*ledgerExpenses:/,
  );
  assert.match(
    querySource,
    /type\s+DailyLedgerPayload\s*=\s*Prisma\.DailyLedgerGetPayload<\{[\s\S]*ledgerExpenses/s,
  );

  const actionSource = readProjectFile("src", "features", "ledger", "actions.ts");
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
