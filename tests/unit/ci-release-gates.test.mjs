import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();

function readProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return readFileSync(filePath, "utf8");
}

test("PR CI runs the same API and core e2e gates as release preflight", () => {
  const packageJson = JSON.parse(readProjectFile("package.json"));
  const workflow = readProjectFile(".github", "workflows", "ci.yml");

  assert.match(packageJson.scripts["release:preflight"], /pnpm test:api/);
  assert.match(packageJson.scripts["release:preflight"], /pnpm test:e2e:core/);
  assert.match(workflow, /run:\s*pnpm test:api/);
  assert.match(workflow, /run:\s*pnpm test:e2e:core/);
  assert.doesNotMatch(
    workflow,
    /Run smoke e2e[\s\S]*tests\/e2e\/auth\.spec\.ts:16/,
  );
});

test("core e2e bundle covers store, headquarters, reports, permissions, and master data", () => {
  const packageJson = JSON.parse(readProjectFile("package.json"));
  const coreScript = packageJson.scripts["test:e2e:core"];

  for (const spec of [
    "tests/e2e/store-ledger-sales.spec.ts",
    "tests/e2e/store-ledger-purchase.spec.ts",
    "tests/e2e/hq-dashboard.spec.ts",
    "tests/e2e/hq-ledger-edit.spec.ts",
    "tests/e2e/hq-ledger-corrections.spec.ts",
    "tests/e2e/hq-reports.spec.ts",
    "tests/e2e/permission-profiles.spec.ts",
    "tests/e2e/master-data-stores.spec.ts",
    "tests/e2e/master-data-purchase-standards.spec.ts",
    "tests/e2e/anomaly-thresholds.spec.ts",
  ]) {
    assert.match(coreScript, new RegExp(spec.replaceAll("/", "[/\\\\]")));
  }
});

test("release documentation has one local DB path and an operations checklist", () => {
  const readme = readProjectFile("README.md");
  const ciDocs = readProjectFile("docs", "ci.md");
  const releaseChecklist = readProjectFile("docs", "release-checklist.md");
  const startDatabase = readProjectFile("start-database.sh");

  assert.match(readme, /docker compose up -d/);
  assert.match(readme, /docs\/release-checklist\.md/);
  assert.match(startDatabase, /deprecated/i);
  assert.match(startDatabase, /docker compose up -d/);
  assert.doesNotMatch(startDatabase, /docker\.io\/postgres/);
  assert.match(ciDocs, /Pushes to any branch run/);
  assert.doesNotMatch(ciDocs, /new_function/);

  for (const phrase of [
    "migration dry run",
    "rollback",
    "AUTH_SECRET",
    "seed password",
    "ALLOW_PRODUCTION_SEED",
    "permission profile",
    "CI",
    "E2E",
  ]) {
    assert.match(releaseChecklist, new RegExp(phrase, "i"));
  }
});
