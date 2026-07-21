import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
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

test("legacy sales price plan editor and writer are removed", () => {
  for (const segments of [
    ["src", "features", "sales-plan", "actions.ts"],
    ["src", "features", "sales-plan", "schemas.ts"],
    ["src", "features", "sales-plan", "components", "sales-price-plan-client.tsx"],
  ]) {
    assert.equal(existsSync(path.join(root, ...segments)), false);
  }
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
  assert.doesNotMatch(querySource, /getSalesPricePlanStepData/);
  assert.match(
    querySource,
    /export\s+async\s+function\s+getSalesPlanLossContext/,
  );
  // 손실/대시보드 참고 맥락은 항상 추정(estimated) 라벨로 노출되어야 한다.
  assert.match(querySource, /estimated:\s*true/);

  assert.match(querySource, /getPlannedUnitPriceLookup/);
});

test("planned-price sync updates derived losses without owning ledger metadata", () => {
  const syncSource = readProjectFile(
    "src",
    "features",
    "losses",
    "planned-price-sync.ts",
  );
  // 기존 손실 스냅샷 값을 읽어 변경 여부를 비교한다.
  assert.match(syncSource, /unitPrice:\s*true/);
  assert.match(syncSource, /amount:\s*true/);
  assert.match(syncSource, /usedPlannedPrice:\s*true/);
  assert.match(syncSource, /const unchanged =/);
  // 변경된 손실의 장부만 모은다.
  assert.match(syncSource, /affectedLedgerIds/);
  assert.doesNotMatch(syncSource, /dailyLedger\.updateMany/);
  assert.doesNotMatch(syncSource, /lossReviewedAt:\s*null/);
  assert.match(syncSource, /writer가 소유/);
});

test("sales plan loss context renders loss calculation basis; old route redirects to inventory", () => {
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

  // 기존 /app/store-entry/sales-plan route는 삭제하지 않고 재고 단계로
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
  assert.doesNotMatch(redirectPageSource, /step.*purchase|"purchase"/);
  assert.match(redirectPageSource, /\/app\/store-entry\/inventory/);
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
