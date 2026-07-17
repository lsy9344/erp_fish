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
    "지출 항목을 선택해 주세요.",
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
    "지출 금액은 0원 이상의 정수여야 합니다.",
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
    "지출 금액은 0원 이상의 정수여야 합니다.",
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
    "지출 금액은 0원 이상의 정수여야 합니다.",
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

test("ledger labor schema validates worker name, amount, and memo edge cases", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "schemas.ts",
  );
  const { ledgerLaborSchema } = await import(pathToFileURL(schemaPath).href);

  const laborBase = {
    storeId: "store-gangnam",
    ledgerId: "ledger-1",
    closingDate: "2026-06-22",
    version: 1,
    labor: [
      {
        workerName: "홍길동",
        amount: "1200000",
        lateMemo: "10분 지각",
        earlyLeaveMemo: "",
        specialMemo: "   ",
      },
    ],
  };

  const normalized = ledgerLaborSchema.parse({
    ...laborBase,
    labor: [
      {
        employeeId: "  employee-1  ",
        workerName: "  김철수  ",
        amount: "1000",
        lateMemo: "  지각  ",
        earlyLeaveMemo: "   ",
        specialMemo: "특이",
      },
    ],
  });
  assert.equal(normalized.labor[0].workerName, "김철수");
  assert.equal(normalized.labor[0].amount, 1000);
  assert.equal(normalized.labor[0].lateMemo, "지각");
  assert.equal(normalized.labor[0].earlyLeaveMemo, null);
  assert.equal(normalized.labor[0].specialMemo, "특이");
  // WO-05(2026-06-22): employeeId는 트림되며, 빈 값/누락 시 null로 정규화된다.
  assert.equal(normalized.labor[0].employeeId, "employee-1");

  const withoutEmployee = ledgerLaborSchema.parse({
    ...laborBase,
    labor: [{ workerName: "홍길동", amount: "1000" }],
  });
  assert.equal(withoutEmployee.labor[0].employeeId, null);
  // 콤마가 포함된 금액은 조용히 보정하지 않고 거부되어야 한다.
  const formattedAmount = ledgerLaborSchema.safeParse({
    ...laborBase,
    labor: [{ workerName: "홍길동", amount: "1,000" }],
  });
  assert.equal(formattedAmount.success, false);
  const amountIssue = formattedAmount.error.issues.find((issue) =>
    issue.path.includes("amount"),
  );
  assert.equal(amountIssue?.message, "급여 금액은 0원 이상의 정수여야 합니다.");
  assert.deepEqual(amountIssue?.path, ["labor", 0, "amount"]);

  const trimmedMemos = ledgerLaborSchema.parse(laborBase);
  assert.equal(trimmedMemos.labor[0].lateMemo, "10분 지각");
  assert.equal(trimmedMemos.labor[0].earlyLeaveMemo, null);
  assert.equal(trimmedMemos.labor[0].specialMemo, null);

  const emptyName = ledgerLaborSchema.safeParse({
    ...laborBase,
    labor: [{ workerName: "  ", amount: 1000 }],
  });
  assert.equal(emptyName.success, false);
  assert.equal(
    emptyName.error.issues.some(
      (issue) => issue.message === "직원명을 1~50자로 입력해 주세요.",
    ),
    true,
  );

  const longName = ledgerLaborSchema.safeParse({
    ...laborBase,
    labor: [{ workerName: "a".repeat(51), amount: 1000 }],
  });
  assert.equal(longName.success, false);

  const negativeAmount = ledgerLaborSchema.safeParse({
    ...laborBase,
    labor: [{ workerName: "홍길동", amount: -1 }],
  });
  assert.equal(negativeAmount.success, false);

  const decimalAmount = ledgerLaborSchema.safeParse({
    ...laborBase,
    labor: [{ workerName: "홍길동", amount: 12.5 }],
  });
  assert.equal(decimalAmount.success, false);

  const memoOverflow = ledgerLaborSchema.safeParse({
    ...laborBase,
    labor: [
      { workerName: "홍길동", amount: 1000, specialMemo: "a".repeat(501) },
    ],
  });
  assert.equal(memoOverflow.success, false);

  // 빈 급여 배열도 유효해야 한다(근무인원 입력이 최소 요건).
  assert.equal(
    ledgerLaborSchema.safeParse({ ...laborBase, labor: [] }).success,
    true,
  );
});

test("ledger labor model, query payload, and save actions follow expected contracts", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  assert.match(
    schema,
    /model\s+LedgerLaborItem\s*{[^}]*dailyLedgerId\s+String\s+[^}]*workerName\s+String\s+[^}]*amount\s+Int\s+[^}]*lateMemo\s+String\?\s+[^}]*earlyLeaveMemo\s+String\?\s+[^}]*specialMemo\s+String\?[^}]*\@index\(\[dailyLedgerId\]\)/s,
  );
  assert.match(schema, /ledgerLaborItems\s+LedgerLaborItem\[\]/);

  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "queries.ts",
  );
  assert.match(querySource, /const\s+ledgerLaborSelect\s*=\s*{/);
  assert.match(querySource, /ledgerLaborItems:\s*{/);
  assert.match(querySource, /payrollTotal:\s*calculatePayrollTotal/);
  // WO-05(2026-06-22): 급여 행에 선택적 employeeId가 노출되어야 직원 롤업에 연결할 수 있다.
  assert.match(querySource, /employeeId:\s*true/);
  assert.match(querySource, /employeeId:\s*item\.employeeId\s*\?\?\s*null/);

  const actionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  assert.match(actionSource, /export\s+async\s+function\s+saveLedgerLaborInfo/);
  assert.match(
    actionSource,
    /action:\s*"ledger\.labor\.saved"|action:\s*'ledger\.labor\.saved'/,
  );
  assert.match(actionSource, /tx\.ledgerLaborItem\.deleteMany/);
  assert.match(actionSource, /tx\.ledgerLaborItem\.createMany/);
  // WO-05(2026-06-22): 저장 시 검증된 employeeId만 연결한다.
  assert.match(actionSource, /resolveValidEmployeeIdsInTx/);
  // WO-10(2026-06-28): 지점장 저장은 검증된 employeeId를 const로 계산해 연결하고,
  // 기존 급여액을 이월(carry-forward)한다. amount는 본사만 입력한다.
  assert.match(
    actionSource,
    /const\s+employeeId\s*=\s*\n?\s*item\.employeeId\s*&&\s*validEmployeeIds\.has/,
  );
  assert.match(actionSource, /buildLaborCarryForwardQueues/);
  assert.match(actionSource, /takeCarriedLaborAmount/);

  const hqActionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-edit-actions.ts",
  );
  assert.match(
    hqActionSource,
    /export\s+async\s+function\s+saveHqLedgerLaborInfo/,
  );
  assert.match(
    hqActionSource,
    /action:\s*"ledger\.hq\.labor\.saved"|action:\s*'ledger\.hq\.labor\.saved'/,
  );
  assert.match(hqActionSource, /resolveValidEmployeeIdsInTx/);
  assert.match(hqActionSource, /employeeId:\s*\n?\s*item\.employeeId/);

  const componentSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "workstep-client.tsx",
  );
  assert.match(componentSource, /급여 저장/);
  assert.match(componentSource, /직원 추가|직원 연결/);
  assert.match(componentSource, /laborSaveAction/);
  // WO-05(2026-06-22): 작업 단계에 직원 선택 드롭다운과 employeeId 전달이 있어야 한다.
  assert.match(componentSource, /employeeOptions/);
  assert.match(componentSource, /employeeId:\s*line\.employeeId/);
});

test("work step keeps store work copy neutral and HQ salary helpers role-specific", () => {
  const componentSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "workstep-client.tsx",
  );

  // 두 저장 경계는 유지하되 하나의 카드 안에서 근무 정보와 근무자 행을 입력한다.
  assert.match(componentSource, /근무 요약/);
  assert.match(
    componentSource,
    /showSensitiveAccountingMetrics\s*\?\s*"급여 행에 없는 근무자도 포함해 실제 근무한 인원을 입력합니다\."\s*:\s*"근무자 명단에 없는 사람도 포함해 실제 근무한 인원을 입력합니다\."/,
  );
  assert.match(
    componentSource,
    /stepLabel=\{\s*showSensitiveAccountingMetrics\s*\?\s*"5단계 근무\/인건비"\s*:\s*"5단계: 근무인원\/이름"\s*\}/,
  );
  assert.equal(
    (componentSource.match(/<section className="bg-card/g) ?? []).length,
    1,
  );
  assert.match(
    componentSource,
    /showSensitiveAccountingMetrics\s*\?\s*"급여 \/ 인건비"\s*:\s*"근무자"/,
  );
  assert.match(
    componentSource,
    /showSensitiveAccountingMetrics\s*\?\s*`급여 항목 \$\{savedCount\}건을 저장했습니다\.`\s*:\s*`근무자 \$\{savedCount\}명을 저장했습니다\.`/,
  );
  assert.match(
    componentSource,
    /showSensitiveAccountingMetrics\s*\?\s*"저장됐습니다\."\s*:\s*"근무자를 저장했습니다\."/,
  );
  assert.match(
    componentSource,
    /showSensitiveAccountingMetrics\s*\?\s*"등록된 급여 항목이 없습니다\. 직원을 추가해 주세요\."\s*:\s*"등록된 근무자가 없습니다\. 직원을 추가해 주세요\."/,
  );
  assert.match(
    componentSource,
    /showSensitiveAccountingMetrics\s*\?\s*"급여 저장"\s*:\s*"근무자 저장"/,
  );

  // Task 3: employeeId 우선 중복 제거 helper와 참고 인원 표시.
  assert.match(componentSource, /function getDraftLaborHeadcount/);
  assert.match(componentSource, /keys\.add\(`employee:\$\{employeeId\}`\)/);
  assert.match(componentSource, /keys\.add\(`name:\$\{workerName\}`\)/);
  assert.match(componentSource, /급여 행 기준 참고 인원/);
  assert.match(componentSource, /\{draftLaborHeadcount\}명/);

  // Task 4: 비차단 불일치 안내(파싱된 근무인원 기준).
  assert.match(componentSource, /const showLaborHeadcountHint =/);
  assert.match(
    componentSource,
    /근무인원과 급여 행 기준 참고 인원이 다릅니다\./,
  );
  // 안내는 오류 색상(text-destructive)을 쓰지 않는다(안내 <p>만 검사).
  const hintBlock = componentSource.slice(
    componentSource.indexOf("showLaborHeadcountHint ? ("),
    componentSource.indexOf("있으면 그대로 저장할 수 있습니다."),
  );
  assert.ok(hintBlock.length > 0);
  assert.doesNotMatch(hintBlock, /text-destructive/);

  const hqSalaryHelperBlock = componentSource.slice(
    componentSource.lastIndexOf(
      "{showSensitiveAccountingMetrics ? (",
      componentSource.indexOf("입력 중 급여 합계"),
    ),
    componentSource.indexOf(
      "{hqEditReasonRequired ? (",
      componentSource.indexOf("입력 중 급여 합계"),
    ),
  );
  assert.match(hqSalaryHelperBlock, /입력 중 급여 합계/);
  assert.match(hqSalaryHelperBlock, /마지막 서버 저장 합계/);
  assert.match(hqSalaryHelperBlock, /급여 행 기준 참고 인원/);
  assert.match(hqSalaryHelperBlock, /showLaborHeadcountHint/);

  // Task 2/3 경계: 근무정보 저장 payload에는 laborItems/payrollTotal을 넣지 않는다.
  const workSavePayload = componentSource.slice(
    componentSource.indexOf("async function saveCurrentDraft"),
    componentSource.indexOf("async function saveCurrentLaborDraft"),
  );
  assert.ok(workSavePayload.length > 0);
  assert.doesNotMatch(workSavePayload, /laborItems/);
  assert.doesNotMatch(workSavePayload, /payrollTotal/);
  assert.match(workSavePayload, /workerCount:/);
  assert.match(workSavePayload, /workMemo:/);

  // 급여 저장 payload에는 workerCount를 넣지 않는다.
  const laborSavePayload = componentSource.slice(
    componentSource.indexOf("async function saveCurrentLaborDraft"),
    componentSource.indexOf("async function handleSubmit"),
  );
  assert.ok(laborSavePayload.length > 0);
  assert.doesNotMatch(laborSavePayload, /workerCount/);
  assert.match(laborSavePayload, /labor:\s*laborItems\.map/);
});

test("ledger labor migration exists and creates the LedgerLaborItem table", () => {
  const migrationName = migrationDirNames().find((name) =>
    name.includes("add_ledger_labor_payroll"),
  );
  assert.ok(migrationName, "Labor payroll migration should exist");

  const migration = readProjectFile(
    "prisma",
    "migrations",
    migrationName,
    "migration.sql",
  );
  assert.ok(
    migration.includes('CREATE TABLE "LedgerLaborItem" ('),
    "Migration should create LedgerLaborItem table",
  );
  assert.ok(
    migration.includes('"workerName" TEXT NOT NULL'),
    "Migration should add workerName column",
  );
  assert.ok(
    migration.includes('"amount" INTEGER NOT NULL'),
    "Migration should add amount column",
  );
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

test("work step client keeps form controls disabled until hydration", () => {
  const componentSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "workstep-client.tsx",
  );

  assert.match(componentSource, /isHydrated/);
  assert.match(componentSource, /setIsHydrated\(true\)/);
  assert.match(
    componentSource,
    /retryDisabled=\{!isHydrated \|\| isSaving \|\| isOriginalEditBlocked\}/,
  );
  assert.match(
    componentSource,
    /disabled=\{!isHydrated \|\| isSaving \|\| isOriginalEditBlocked\}/,
  );
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
  assert.match(actionSource, /requireStoreManagerLedgerEditAccess\(/);
  assert.match(actionSource, /writeAuditLog\(/);
  assert.match(actionSource, /db\.\$transaction/);
  assert.match(actionSource, /revalidateLedgerSalesPaths\(\)/);
  assert.match(actionSource, /revalidateDashboardAndReports\(\)/);
  assert.match(actionSource, /validateActiveExpenseCodesInTx/);
  assert.match(
    actionSource,
    /ledgerInputCode\.findMany\(\{[\s\S]*group:\s*"EXPENSE_ITEM"[\s\S]*isActive:\s*true/s,
  );
  assert.match(
    actionSource,
    /expenses\.findIndex\([\s\S]*activeExpenseCodeIds\.has\(expense\.ledgerInputCodeId\)/s,
  );
  assert.match(actionSource, /"활성 지출 항목만 저장할 수 있습니다\."/);
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
  // WO-10(2026-06-28): 급여액·인건비 합계는 본사 전용. 지점장 DTO에서 payrollTotal과
  // laborItems(amount 포함)도 제거하고, laborItems는 amount만 뺀 라인으로 재정의한다.
  assert.match(
    typeSource,
    /Omit<\s*LedgerCostStepData,\s*"grossProfit"\s*\|\s*"productivity"\s*\|\s*"payrollTotal"\s*\|\s*"laborItems"\s*>/s,
  );
  assert.match(typeSource, /StoreManagerLedgerLaborLine/);
  assert.match(querySource, /shapeStoreManagerLedgerCostStepData/);
  // WO-12(2026-06-28): purchaseItems도 분해해 원본 이카운트 단가/보정 메타를 제거한다.
  assert.match(
    responseShapeSource,
    /const\s*\{\s*grossProfit,\s*productivity,\s*payrollTotal,\s*laborItems,\s*purchaseItems,\s*\.\.\.safeLedger\s*\}/s,
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
    purchaseItems: [
      {
        id: "purchase-1",
        productId: "product-1",
        purchaseStandardId: null,
        sourceType: "ECOUNT",
        productName: "광어",
        productCategory: "냉동",
        productSpec: "1kg",
        unitPrice: 5_000,
        quantity: 2,
        amount: 10_000,
        referenceInfo: null,
        plannedUnitPrice: null,
        kind: "purchase",
        previousQuantity: 0,
        sourceUnitPrice: 4_800,
        unitPriceOverridden: true,
        unitPriceOverrideReason: "본사 보정",
      },
    ],
    purchaseTotal: 10_000,
    laborItems: [
      {
        id: "labor-1",
        workerName: "홍길동",
        amount: 20_000,
        lateMemo: null,
        earlyLeaveMemo: null,
        specialMemo: null,
      },
    ],
    payrollTotal: 20_000,
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
  // WO-12(2026-06-28): 매입 행의 적용 단가(unitPrice)는 지점장이 보는 정상 값이라 유지하되,
  // 원본 이카운트 단가/보정 메타는 본사 전용이라 제거된다.
  assert.equal(safeLedger.purchaseItems.length, 1);
  assert.equal(safeLedger.purchaseItems[0].unitPrice, 5_000);
  assert.equal(
    Object.hasOwn(safeLedger.purchaseItems[0], "sourceUnitPrice"),
    false,
  );
  assert.equal(
    Object.hasOwn(safeLedger.purchaseItems[0], "unitPriceOverridden"),
    false,
  );
  assert.equal(
    Object.hasOwn(safeLedger.purchaseItems[0], "unitPriceOverrideReason"),
    false,
  );
  // WO-10(2026-06-28): 급여액과 인건비 합계는 본사 전용. 지점장 응답에서 제거된다.
  assert.equal(Object.hasOwn(safeLedger, "payrollTotal"), false);
  // 근무자 명단/메모는 지점장이 다루므로 남되, 개인별 급여액(amount)은 제거된다.
  assert.equal(safeLedger.laborItems.length, 1);
  assert.equal(Object.hasOwn(safeLedger.laborItems[0], "amount"), false);
  assert.equal(safeLedger.laborItems[0].workerName, "홍길동");
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
    /getActiveLedgerInputCodeOptions\(\s*"EXPENSE_ITEM"/,
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

test("store-entry expense surfaces use customer-facing expenditure wording", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "expense-step-client.tsx",
  );

  assert.match(source, /const\s+draftExpenseTotal\s*=\s*getDraftExpenseTotal/);
  assert.match(source, /ledgerTerms\.draftExpenseTotal/);
  assert.match(source, /ledgerTerms\.lastSavedExpenseTotal/);
  assert.match(source, /stepLabel="4단계: 지출"/);
  assert.match(source, /formatKrw\(ledger\.expenseTotal\)/);

  const termsSource = readProjectFile("src", "features", "ledger", "terms.ts");
  const navigationSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "store-entry-step-navigation.tsx",
  );
  const conflictSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "save-conflict-dialog.tsx",
  );
  const aliasSource = readProjectFile(
    "src",
    "features",
    "master-data",
    "code-alias-terms.ts",
  );
  const hqPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );
  const hqClosePreflightSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-close-preflight.ts",
  );

  assert.match(termsSource, /expenseItem:\s*"지출 항목"/);
  assert.match(termsSource, /expenseAmount:\s*"지출 금액"/);
  assert.match(termsSource, /draftExpenseTotal:\s*"입력 중 지출 합계"/);
  assert.match(
    termsSource,
    /lastSavedExpenseTotal:\s*"마지막 서버 저장 지출 합계"/,
  );
  assert.match(navigationSource, /4단계: 지출/);
  assert.match(navigationSource, /5단계: 근무인원\/이름/);
  assert.match(conflictSource, /expenses:\s*"지출"/);
  assert.match(aliasSource, /heading:\s*"지출 항목 표시명"/);
  assert.match(
    hqPageSource,
    /<TabsTrigger value="expenses"[^>]*>[\s\S]*지출[\s\S]*<\/TabsTrigger>/,
  );
  assert.match(
    hqPageSource,
    /`지출 \$\{index \+ 1\} · \$\{item\.ledgerInputCodeName\} · 금액`/,
  );
  assert.match(hqClosePreflightSource, /paymentTotal:\s*"현금·카드·기타 합계"/);
  assert.match(hqClosePreflightSource, /expenseTotal:\s*"4단계 지출 합계"/);
  assert.match(hqClosePreflightSource, /paymentDifference:\s*"마감 정산 차액"/);
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
