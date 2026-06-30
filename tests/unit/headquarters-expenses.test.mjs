import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

async function importSchemas() {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "headquarters-expenses",
    "schemas.ts",
  );

  return import(pathToFileURL(schemaPath).href);
}

test("headquarters expense create schema validates required fields and ranges", async () => {
  const { headquartersExpenseCreateSchema } = await importSchemas();

  const valid = headquartersExpenseCreateSchema.safeParse({
    expenseDate: "2026-06-22",
    storeId: "",
    category: "본사 임차료",
    amount: "1500000",
    memo: "6월 본사 임차료",
  });

  assert.equal(valid.success, true);
  assert.equal(valid.data.storeId, null);
  assert.equal(valid.data.amount, 1500000);
  assert.equal(valid.data.category, "본사 임차료");
  assert.equal(valid.data.memo, "6월 본사 임차료");

  const trimmedStore = headquartersExpenseCreateSchema.safeParse({
    expenseDate: "2026-06-22",
    storeId: "  store-gangnam  ",
    category: "  광고비  ",
    amount: 200000,
    memo: "   ",
  });

  assert.equal(trimmedStore.success, true);
  assert.equal(trimmedStore.data.storeId, "store-gangnam");
  assert.equal(trimmedStore.data.category, "광고비");
  assert.equal(trimmedStore.data.memo, null);

  const adjustmentReason = headquartersExpenseCreateSchema.safeParse({
    expenseDate: "2026-06-22",
    storeId: "",
    category: "본사조정",
    amount: "10000",
    adjustmentReason: "월말 정산 차이",
    memo: "대표 확인 완료",
  });

  assert.equal(adjustmentReason.success, true);
  assert.equal(adjustmentReason.data.adjustmentReason, "월말 정산 차이");
  assert.equal(adjustmentReason.data.memo, "대표 확인 완료");
});

test("headquarters expense create schema rejects invalid date, category, amount, memo", async () => {
  const { headquartersExpenseCreateSchema } = await importSchemas();

  const base = {
    expenseDate: "2026-06-22",
    storeId: "",
    category: "본사 임차료",
    amount: "1000",
    memo: "",
  };

  assert.equal(
    headquartersExpenseCreateSchema.safeParse({
      ...base,
      expenseDate: "2026/06/22",
    }).success,
    false,
  );

  assert.equal(
    headquartersExpenseCreateSchema.safeParse({ ...base, category: "   " })
      .success,
    false,
  );

  assert.equal(
    headquartersExpenseCreateSchema.safeParse({
      ...base,
      category: "가".repeat(81),
    }).success,
    false,
  );

  assert.equal(
    headquartersExpenseCreateSchema.safeParse({ ...base, amount: "-1" })
      .success,
    false,
  );

  assert.equal(
    headquartersExpenseCreateSchema.safeParse({ ...base, amount: "1.5" })
      .success,
    false,
  );

  assert.equal(
    headquartersExpenseCreateSchema.safeParse({
      ...base,
      amount: "2147483648",
    }).success,
    false,
  );

  assert.equal(
    headquartersExpenseCreateSchema.safeParse({
      ...base,
      memo: "메".repeat(501),
    }).success,
    false,
  );

  assert.equal(
    headquartersExpenseCreateSchema.safeParse({
      ...base,
      adjustmentReason: "사".repeat(501),
    }).success,
    false,
  );
});

test("headquarters expense update schema requires an id", async () => {
  const { headquartersExpenseUpdateSchema } = await importSchemas();

  const base = {
    expenseDate: "2026-06-22",
    storeId: "",
    category: "본사 임차료",
    amount: 1000,
    memo: "",
  };

  assert.equal(
    headquartersExpenseUpdateSchema.safeParse({ id: "expense-1", ...base })
      .success,
    true,
  );
  assert.equal(
    headquartersExpenseUpdateSchema.safeParse({ id: "", ...base }).success,
    false,
  );
});

test("summarizeHeadquartersExpenseAmounts splits store-attributed and common totals", async () => {
  const { summarizeHeadquartersExpenseAmounts } = await importSchemas();

  assert.deepEqual(
    summarizeHeadquartersExpenseAmounts([
      { amount: 1000, storeId: "store-gangnam" },
      { amount: 2000, storeId: null },
      { amount: 500, storeId: "" },
      { amount: 4000, storeId: "store-seocho" },
    ]),
    {
      totalAmount: 7500,
      storeAttributedAmount: 5000,
      unattributedAmount: 2500,
      count: 4,
    },
  );

  assert.deepEqual(summarizeHeadquartersExpenseAmounts([]), {
    totalAmount: 0,
    storeAttributedAmount: 0,
    unattributedAmount: 0,
    count: 0,
  });
});

test("headquarters expense month range maps YYYY-MM to UTC month boundaries", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "headquarters-expenses",
    "queries.ts",
  );
  const { getHeadquartersExpenseMonthRange } = await import(
    pathToFileURL(queryPath).href
  );

  const june = getHeadquartersExpenseMonthRange(
    "2026-06",
    new Date("2026-06-22T10:00:00.000Z"),
  );

  assert.equal(june.monthInput, "2026-06");
  assert.equal(june.startDate.toISOString(), "2026-06-01T00:00:00.000Z");
  assert.equal(june.endDate.toISOString(), "2026-06-30T23:59:59.999Z");

  const fallback = getHeadquartersExpenseMonthRange(
    "not-a-month",
    new Date("2026-06-22T10:00:00.000Z"),
  );

  assert.equal(fallback.monthInput, "2026-06");
});

test("headquarters expense actions enforce permission, scope and audit logging", () => {
  const actionSource = readProjectFile(
    "src",
    "features",
    "headquarters-expenses",
    "actions.ts",
  );

  assert.match(actionSource, /"use server"/);
  assert.match(actionSource, /requireSettingsAccess\(\)/);
  assert.match(actionSource, /assertStoreInScope/);
  assert.match(actionSource, /getHeadquartersStoreScope\(\)/);
  assert.match(actionSource, /writeAuditLog\(/);
  assert.match(actionSource, /headquarters-expense\.created/);
  assert.match(actionSource, /headquarters-expense\.updated/);
  assert.match(actionSource, /revalidateDashboardAndReports\(\)/);
});

test("headquarters expense queries require settings access and stay read-only", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "headquarters-expenses",
    "queries.ts",
  );

  assert.match(
    querySource,
    /export\s+async\s+function\s+getHeadquartersExpensesForHeadquarters/,
  );
  assert.match(
    querySource,
    /export\s+async\s+function\s+getHeadquartersExpenseReportSummary/,
  );
  assert.match(querySource, /requireSettingsAccess\(\)/);
  assert.doesNotMatch(querySource, /\.(create|createMany|update|upsert)\(/);
});

test("store manager surfaces never include headquarters expenses", () => {
  const storeManagerNav = readProjectFile(
    "src",
    "components",
    "store-manager-navigation.tsx",
  );
  const sidebarSource = readProjectFile("src", "components", "app-sidebar.tsx");

  assert.doesNotMatch(storeManagerNav, /headquarters-expenses/);
  assert.doesNotMatch(storeManagerNav, /본사 지출/);
  // 사이드바의 본사 지출 메뉴는 본사 설정 권한으로만 노출된다.
  assert.match(
    sidebarSource,
    /label:\s*"본사 지출"[\s\S]*requiredAction:\s*PermissionAction\.SETTINGS_MANAGE/,
  );
  assert.match(sidebarSource, /href:\s*"\/app\/headquarters-expenses"/);
});
