import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("shared revalidation helper owns dashboard, report, store-entry, detail, and master-data paths", () => {
  const source = readProjectFile("src", "server", "revalidation.ts");

  for (const exportName of [
    "revalidateDashboardAndReports",
    "revalidateStoreEntryPaths",
    "revalidateLedgerDetailPath",
    "revalidateMasterDataPaths",
    "revalidateBestEffort",
  ]) {
    assert.match(source, new RegExp(`export function ${exportName}\\b`));
  }

  for (const route of [
    "/app/dashboard",
    "/app/reports/overview",
    "/app/reports/daily",
    "/app/reports/comparison",
    "/app/reports/monthly",
    "/app/store-entry",
    "/app/store-entry/inventory",
    "/app/store-entry/losses",
    "/app/master-data/stores",
    "/app/master-data/products",
    "/app/master-data/purchase-standards",
    "/app/master-data/codes",
    "/app/master-data/users",
    "/app/master-data/anomaly-thresholds",
  ]) {
    assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
  }

  assert.match(source, /`\/app\/ledgers\/\$\{ledgerId\}`/);
});

test("ledger and store-entry actions call semantic revalidation helpers", () => {
  const files = [
    ["src", "features", "ledger", "actions.ts"],
    ["src", "features", "ledger", "hq-edit-actions.ts"],
    ["src", "features", "ledger", "hq-close-actions.ts"],
    ["src", "features", "inventory", "actions.ts"],
    ["src", "features", "inventory", "hq-edit-actions.ts"],
    ["src", "features", "losses", "actions.ts"],
    ["src", "features", "losses", "hq-edit-actions.ts"],
    ["src", "features", "corrections", "actions.ts"],
  ];

  for (const segments of files) {
    const source = readProjectFile(...segments);

    assert.match(source, /~\/server\/revalidation/);
    assert.doesNotMatch(source, /revalidatePath\("\/app\/reports\/daily"\)/);
    assert.doesNotMatch(
      source,
      /revalidatePath\("\/app\/reports\/comparison"\)/,
    );
    assert.doesNotMatch(source, /revalidatePath\("\/app\/reports\/monthly"\)/);
  }

  assert.equal(
    existsSync(path.join(root, "src", "features", "sales-plan", "actions.ts")),
    false,
    "legacy sales-plan writer should be removed",
  );
});

test("master-data and threshold actions use semantic revalidation helpers", () => {
  const files = [
    ["src", "features", "dashboard", "threshold-actions.ts"],
    ["src", "features", "master-data", "actions.ts"],
    ["src", "features", "master-data", "code-actions.ts"],
    ["src", "features", "master-data", "product-actions.ts"],
    ["src", "features", "master-data", "purchase-standard-actions.ts"],
    ["src", "features", "master-data", "purchase-standard-import-actions.ts"],
    ["src", "features", "master-data", "user-actions.ts"],
  ];

  for (const segments of files) {
    const source = readProjectFile(...segments);

    assert.match(source, /~\/server\/revalidation/);
    assert.match(source, /revalidateMasterDataPaths/);
  }
});
