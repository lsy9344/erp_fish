import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function readProjectFile(...segments) {
  const filePath = path.join(root, ...segments);
  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);
  return readFileSync(filePath, "utf8");
}

// WO-13(2026-06-28): 품목군별 장기재고 기준일 모델/마이그레이션.
test("WO-13: LongStockThresholdSetting model + migration exist", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  assert.match(
    schema,
    /model\s+LongStockThresholdSetting\s*{[^}]*category\s+String\s+@unique[^}]*thresholdDays\s+Int[^}]*isActive\s+Boolean[^}]*}/s,
  );

  const migrationsRoot = path.join(root, "prisma", "migrations");
  const found = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .some((entry) => {
      const sqlPath = path.join(migrationsRoot, entry.name, "migration.sql");
      return (
        /long_stock_threshold/.test(entry.name) &&
        existsSync(sqlPath) &&
        /CREATE TABLE "LongStockThresholdSetting"/.test(
          readFileSync(sqlPath, "utf8"),
        ) &&
        /LongStockThresholdSetting_category_key/.test(
          readFileSync(sqlPath, "utf8"),
        )
      );
    });
  assert.ok(found, "migration must create LongStockThresholdSetting + unique category");
});

test("WO-13: form schema validates category, thresholdDays, reason", async () => {
  const schemaPath = path.join(
    root,
    "src",
    "features",
    "dashboard",
    "long-stock-threshold-schemas.ts",
  );
  const { longStockThresholdFormSchema } = await import(
    pathToFileURL(schemaPath).href
  );

  const ok = longStockThresholdFormSchema.safeParse({
    category: "냉동",
    thresholdDays: "30",
    isActive: true,
    reason: "초기 기준 등록",
  });
  assert.equal(ok.success, true);
  assert.equal(ok.data.thresholdDays, 30);

  // 기준일이 0 이하/비정수면 거부한다.
  assert.equal(
    longStockThresholdFormSchema.safeParse({
      category: "냉동",
      thresholdDays: "0",
      isActive: true,
      reason: "x",
    }).success,
    false,
  );
  // 사유가 비면 거부한다.
  assert.equal(
    longStockThresholdFormSchema.safeParse({
      category: "냉동",
      thresholdDays: "30",
      isActive: true,
      reason: "",
    }).success,
    false,
  );
});

test("WO-13: action uses settings auth + audit + category upsert", () => {
  const action = readProjectFile(
    "src",
    "features",
    "dashboard",
    "long-stock-threshold-actions.ts",
  );
  assert.match(action, /requireSettingsAccess\(\)/);
  assert.match(action, /longStockThresholdSetting\.upsert/);
  assert.match(action, /where:\s*{\s*category\s*}/);
  assert.match(action, /writeAuditLog/);
  assert.match(action, /long_stock_threshold\.(created|updated)/);
  assert.match(action, /targetType:\s*"LongStockThresholdSetting"/);
});

test("WO-13: morning summary uses per-category thresholds, drops hardcoded 30-day", () => {
  const summary = readProjectFile(
    "src",
    "features",
    "notifications",
    "morning-summary.ts",
  );
  assert.match(summary, /getActiveLongStockThresholdDaysByCategory/);
  assert.match(summary, /thresholdDaysByCategory/);
  // 기준 없는 품목군/기준 미만은 제외(continue).
  assert.match(summary, /if \(thresholdDays === undefined\)/);
  assert.match(summary, /if \(staleDays < thresholdDays\)/);
});

test("WO-13: nav + page route exist for 장기재고 기준일", () => {
  const sidebar = readProjectFile("src", "components", "app-sidebar.tsx");
  assert.match(sidebar, /장기재고 기준일/);
  assert.match(sidebar, /\/app\/master-data\/long-stock-thresholds/);

  const page = readProjectFile(
    "src",
    "app",
    "app",
    "master-data",
    "long-stock-thresholds",
    "page.tsx",
  );
  assert.match(page, /requireSettingsAccess/);
  assert.match(page, /getLongStockThresholdsForHeadquarters/);
  assert.match(page, /LongStockThresholdClient/);
});
