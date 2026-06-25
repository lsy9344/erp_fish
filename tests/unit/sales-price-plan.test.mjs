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

test("sales price plan schema validates store/date and per-product price input", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "sales-plan",
    "schemas.ts",
  );
  const { salesPricePlanSchema, salesPricePlanStoreAccessSchema } =
    await import(pathToFileURL(schemaPath).href);

  const base = {
    storeId: "store-gangnam",
    businessDate: "2026-06-22",
    plans: [
      {
        productId: "product-1",
        plannedUnitPrice: "15000",
        memo: "개점 전 시세",
      },
    ],
  };

  assert.equal(salesPricePlanSchema.safeParse(base).success, true);

  const normalized = salesPricePlanSchema.parse({
    ...base,
    plans: [
      {
        productId: "  product-1  ",
        plannedUnitPrice: "15000",
        memo: "   다듬을 메모   ",
      },
      {
        productId: "product-2",
        plannedUnitPrice: 0,
        memo: "   ",
      },
    ],
  });
  assert.equal(normalized.plans[0].productId, "product-1");
  assert.equal(normalized.plans[0].plannedUnitPrice, 15000);
  assert.equal(normalized.plans[0].memo, "다듬을 메모");
  // 0원 계획은 유효(예: 무료 시식/사은품)하고, 공백 메모는 null로 정규화된다.
  assert.equal(normalized.plans[1].plannedUnitPrice, 0);
  assert.equal(normalized.plans[1].memo, null);

  // 빈 계획 배열도 유효해야 한다(계획 미입력 = 빈 저장).
  assert.equal(
    salesPricePlanSchema.safeParse({ ...base, plans: [] }).success,
    true,
  );

  const missingProduct = salesPricePlanSchema.safeParse({
    ...base,
    plans: [{ productId: " ", plannedUnitPrice: "1000" }],
  });
  assert.equal(missingProduct.success, false);
  assert.equal(
    missingProduct.error.issues.some(
      (issue) => issue.message === "품목을 선택해 주세요.",
    ),
    true,
  );

  const negativePrice = salesPricePlanSchema.safeParse({
    ...base,
    plans: [{ productId: "product-1", plannedUnitPrice: -1 }],
  });
  assert.equal(negativePrice.success, false);
  assert.equal(
    negativePrice.error.issues.some(
      (issue) => issue.message === "예상 판매가는 0원 이상의 정수여야 합니다.",
    ),
    true,
  );

  const decimalPrice = salesPricePlanSchema.safeParse({
    ...base,
    plans: [{ productId: "product-1", plannedUnitPrice: 12.5 }],
  });
  assert.equal(decimalPrice.success, false);

  // 콤마가 포함된 금액은 조용히 보정하지 않고 거부되어야 한다.
  const formattedPrice = salesPricePlanSchema.safeParse({
    ...base,
    plans: [{ productId: "product-1", plannedUnitPrice: "1,000" }],
  });
  assert.equal(formattedPrice.success, false);

  const memoOverflow = salesPricePlanSchema.safeParse({
    ...base,
    plans: [
      {
        productId: "product-1",
        plannedUnitPrice: 1000,
        memo: "a".repeat(501),
      },
    ],
  });
  assert.equal(memoOverflow.success, false);

  const invalidDate = salesPricePlanSchema.safeParse({
    ...base,
    businessDate: "2026/06/22",
  });
  assert.equal(invalidDate.success, false);

  const blankStore = salesPricePlanStoreAccessSchema.safeParse({
    storeId: " ",
  });
  assert.equal(blankStore.success, false);
  assert.equal(
    salesPricePlanStoreAccessSchema.safeParse({ storeId: "store-gangnam" })
      .success,
    true,
  );
});

test("sales price plan model, queries, and actions follow expected contracts", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  assert.match(
    schema,
    /model\s+StoreSalesPricePlan\s*{[^}]*storeId\s+String\s+[^}]*businessDate\s+DateTime\s+[^}]*productId\s+String\s+[^}]*plannedUnitPrice\s+Int\s+[^}]*memo\s+String\?[^}]*createdById\s+String\s+[^}]*updatedById\s+String[^}]*@@unique\(\[storeId,\s*businessDate,\s*productId\]/s,
  );
  assert.match(schema, /salesPricePlans\s+StoreSalesPricePlan\[\]/);

  const querySource = readProjectFile(
    "src",
    "features",
    "sales-plan",
    "queries.ts",
  );
  assert.match(
    querySource,
    /export\s+async\s+function\s+getSalesPricePlanStepData/,
  );
  assert.match(
    querySource,
    /export\s+async\s+function\s+getSalesPlanLossContext/,
  );
  // 손실/대시보드 참고 맥락은 항상 추정(estimated) 라벨로 노출되어야 한다.
  assert.match(querySource, /estimated:\s*true/);

  const actionSource = readProjectFile(
    "src",
    "features",
    "sales-plan",
    "actions.ts",
  );
  assert.match(actionSource, /export\s+async\s+function\s+saveSalesPricePlan/);
  assert.match(actionSource, /requireStoreManagerLedgerEditAccess\(/);
  assert.match(actionSource, /tx\.storeSalesPricePlan\.upsert/);
  assert.match(actionSource, /tx\.storeSalesPricePlan\.deleteMany/);
  assert.match(actionSource, /writeAuditLog\(/);
  assert.match(
    actionSource,
    /action:\s*"sales_plan\.saved"|action:\s*'sales_plan\.saved'/,
  );
  assert.match(actionSource, /revalidateStoreEntryPaths\(/);
  assert.match(actionSource, /"활성 품목만 저장할 수 있습니다\."/);
});

test("sales plan loss context renders loss calculation basis; nav drops the plan menu and the old route redirects to the purchase step", () => {
  const lossContextSource = readProjectFile(
    "src",
    "features",
    "sales-plan",
    "components",
    "sales-plan-loss-context.tsx",
  );
  assert.match(lossContextSource, /추정/);
  assert.match(lossContextSource, /손실액 산정 기준/);
  assert.doesNotMatch(
    lossContextSource,
    /손실 입력\/저장에는 영향을 주지 않습니다/,
  );

  const lossPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "losses",
    "page.tsx",
  );
  assert.match(lossPageSource, /getSalesPlanLossContext/);
  assert.match(lossPageSource, /SalesPlanLossContext/);

  // WO(2026-06-25): 판매 예정가 입력이 3단계 매입으로 통합돼 별도 "판매가 계획" 메뉴가
  // 기본 네비게이션에서 사라졌다. 메뉴는 장부/재고/손실 3개로 줄고 하단 그리드는 3열이다.
  const navSource = readProjectFile(
    "src",
    "components",
    "store-manager-navigation.tsx",
  );
  assert.doesNotMatch(navSource, /label:\s*"판매가 계획"/);
  assert.match(navSource, /grid-cols-3/);

  // 기존 /app/store-entry/sales-plan route는 삭제하지 않고 매입 단계(step=purchase)로
  // redirect하며 storeId/date query를 보존한다(북마크/외부 링크 보호).
  const redirectPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "sales-plan",
    "page.tsx",
  );
  assert.match(redirectPageSource, /redirect\(/);
  assert.match(redirectPageSource, /step.*purchase|"purchase"/);
  assert.match(redirectPageSource, /\/app\/store-entry/);
});

test("sales price plan migration exists and creates the StoreSalesPricePlan table", () => {
  const migrationName = migrationDirNames().find((name) =>
    name.includes("add_sales_price_plan"),
  );
  assert.ok(migrationName, "Sales price plan migration should exist");

  const migration = readProjectFile(
    "prisma",
    "migrations",
    migrationName,
    "migration.sql",
  );
  assert.ok(
    migration.includes('CREATE TABLE "StoreSalesPricePlan" ('),
    "Migration should create StoreSalesPricePlan table",
  );
  assert.ok(
    migration.includes('"plannedUnitPrice" INTEGER NOT NULL'),
    "Migration should add plannedUnitPrice column",
  );
  assert.ok(
    migration.includes(
      'CREATE UNIQUE INDEX "storeSalesPricePlan_storeId_businessDate_productId_key"',
    ),
    "Migration should add the store/date/product unique index",
  );
});
