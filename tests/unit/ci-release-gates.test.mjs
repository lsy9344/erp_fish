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

function readWorkflowJob(workflow, jobName) {
  const pattern = new RegExp(
    `\\n  ${jobName}:\\n[\\s\\S]*?(?=\\n  [a-zA-Z0-9_-]+:\\n|\\n$)`,
  );
  const match = workflow.match(pattern);

  assert.ok(match, `${jobName} job should exist`);

  return match[0];
}

test("PR CI keeps release gates while running representative e2e smoke", () => {
  const packageJson = JSON.parse(readProjectFile("package.json"));
  const workflow = readProjectFile(".github", "workflows", "ci.yml");
  const qualityJob = readWorkflowJob(workflow, "quality");
  const smokeJob = readWorkflowJob(workflow, "playwright-smoke");
  const scripts = packageJson.scripts;

  assert.match(scripts["release:preflight"], /pnpm test:api/);
  assert.match(scripts["release:preflight"], /pnpm test:e2e:core/);
  assert.match(workflow, /run:\s*pnpm test:api/);
  assert.match(
    smokeJob,
    /github\.event_name != 'schedule' &&[\s\S]*refs\/heads\/main[\s\S]*refs\/heads\/master/,
  );
  assert.match(
    smokeJob,
    /!\(github\.event_name == 'workflow_dispatch' && inputs\.run_full_e2e\)/,
  );
  assert.match(smokeJob, /group:\s*\[ledger, hq, admin\]/);
  assert.match(
    smokeJob,
    /run:\s*pnpm test:e2e:smoke:\$\{\{\s*matrix\.group\s*\}\}/,
  );
  assert.doesNotMatch(smokeJob, /run:\s*pnpm test:e2e:core/);
  assert.match(qualityJob, /Restore Next\.js cache/);
  assert.match(qualityJob, /Restore Playwright browser cache/);
  assert.match(qualityJob, /Install Chromium/);
  assert.match(qualityJob, /ms-playwright/);
  assert.doesNotMatch(
    workflow,
    /Run smoke e2e[\s\S]*tests\/e2e\/auth\.spec\.ts:16/,
  );

  for (const scriptName of [
    "test:e2e:smoke:ledger",
    "test:e2e:smoke:hq",
    "test:e2e:smoke:admin",
  ]) {
    assert.match(
      scripts[scriptName],
      /^node scripts\/run-playwright-clean\.mjs tests\/e2e\/.+\.spec\.ts:\d+$/,
    );
  }
});

test("scheduled burn-in repeats the smoke test inside one Playwright run", () => {
  const workflow = readProjectFile(".github", "workflows", "ci.yml");
  const burnInJob = readWorkflowJob(workflow, "playwright-burn-in");

  assert.match(burnInJob, /--repeat-each=10/);
  assert.doesNotMatch(burnInJob, /for i in \$\(seq 1 10\)/);
});

test("core e2e bundle covers store, headquarters, reports, permissions, and master data", () => {
  const packageJson = JSON.parse(readProjectFile("package.json"));
  const scripts = packageJson.scripts;
  const coreScript = [
    scripts["test:e2e:core"],
    scripts["test:e2e:core:ledger"],
    scripts["test:e2e:core:hq"],
    scripts["test:e2e:core:admin"],
  ].join(" ");

  assert.match(
    scripts["test:e2e:core"],
    /^node scripts\/run-playwright-clean\.mjs tests\/e2e\//,
  );
  assert.doesNotMatch(scripts["test:e2e:core"], /pnpm test:e2e:core:/);

  for (const scriptName of [
    "test:e2e:core:ledger",
    "test:e2e:core:hq",
    "test:e2e:core:admin",
  ]) {
    assert.match(
      scripts[scriptName],
      /^node scripts\/run-playwright-clean\.mjs tests\/e2e\//,
    );
  }

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
  assert.match(ciDocs, /Pushes to feature branches run/);
  assert.match(ciDocs, /three parallel groups/);
  assert.match(ciDocs, /representative E2E smoke/);
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
