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
  const normalizedWorkflow = workflow.replace(/\r\n/g, "\n");
  const pattern = new RegExp(
    `\\n  ${jobName}:\\n[\\s\\S]*?(?=\\n  [a-zA-Z0-9_-]+:\\n|\\n$)`,
  );
  const match = normalizedWorkflow.match(pattern);

  assert.ok(match, `${jobName} job should exist`);

  return match[0];
}

test("PR CI keeps release gates while running representative e2e smoke", () => {
  const packageJson = JSON.parse(readProjectFile("package.json"));
  const workflow = readProjectFile(".github", "workflows", "ci.yml");
  const fastChecksJob = readWorkflowJob(workflow, "fast-checks");
  const buildJob = readWorkflowJob(workflow, "build");
  const apiTestsJob = readWorkflowJob(workflow, "api-tests");
  const smokeJob = readWorkflowJob(workflow, "playwright-smoke");
  const coreJob = readWorkflowJob(workflow, "playwright-core");
  const fullJob = readWorkflowJob(workflow, "playwright-full");
  const burnInJob = readWorkflowJob(workflow, "playwright-burn-in");
  const scripts = packageJson.scripts;

  assert.match(
    workflow,
    /group:\s*ci-\$\{\{\s*github\.workflow\s*\}\}-\$\{\{\s*github\.head_ref \|\| github\.ref_name\s*\}\}/,
  );
  assert.match(scripts["release:preflight"], /pnpm test:api/);
  assert.match(scripts["release:preflight"], /pnpm test:e2e:core/);

  // Fast gate runs on every push (incl. feature branches): lint + typecheck + unit,
  // no DB, no build, no browser. This is the cheap common-case feedback loop.
  assert.match(fastChecksJob, /if: github\.event_name != 'schedule'/);
  assert.match(fastChecksJob, /run:\s*pnpm lint/);
  assert.match(fastChecksJob, /run:\s*pnpm typecheck/);
  assert.match(fastChecksJob, /run:\s*pnpm test:unit/);
  assert.doesNotMatch(fastChecksJob, /services:[\s\S]*postgres:/);
  assert.doesNotMatch(fastChecksJob, /run:\s*pnpm test:api/);
  assert.doesNotMatch(fastChecksJob, /run:\s*pnpm build/);

  // Heavy build is gated to PRs and integration-branch (staging/main) pushes,
  // so plain feature-branch pushes do not pay the build cost.
  assert.match(buildJob, /run:\s*pnpm build/);
  assert.match(buildJob, /Restore Next\.js cache/);
  assert.match(buildJob, /github\.event_name == 'pull_request'/);
  assert.match(buildJob, /refs\/heads\/staging/);
  assert.match(buildJob, /refs\/heads\/main/);

  // API tests are likewise gated off feature-branch pushes.
  assert.match(apiTestsJob, /run:\s*pnpm test:api/);
  assert.match(apiTestsJob, /services:[\s\S]*postgres:/);
  assert.match(apiTestsJob, /github\.event_name == 'pull_request'/);
  assert.match(apiTestsJob, /refs\/heads\/staging/);

  // Smoke runs on PRs (and non-full manual dispatch), NOT on plain feature pushes
  // and NOT on staging/main pushes (core/full cover those).
  assert.match(smokeJob, /github\.event_name == 'pull_request'/);
  assert.match(
    smokeJob,
    /github\.event_name == 'workflow_dispatch' && !inputs\.run_full_e2e/,
  );
  assert.doesNotMatch(smokeJob, /github\.event_name == 'push'/);
  assert.match(coreJob, /github\.event_name == 'push'/);
  assert.match(coreJob, /github\.ref == 'refs\/heads\/staging'/);
  assert.match(coreJob, /run:\s*pnpm test:e2e:core/);
  assert.match(
    fullJob,
    /github\.event_name == 'schedule' \|\|[\s\S]*github\.event_name == 'workflow_dispatch' && inputs\.run_full_e2e/,
  );
  assert.match(fullJob, /github\.event_name == 'push'/);
  assert.match(fullJob, /refs\/heads\/main/);
  assert.match(fullJob, /refs\/heads\/master/);
  assert.match(smokeJob, /group:\s*\[ledger, hq, admin\]/);
  assert.match(
    smokeJob,
    /run:\s*pnpm test:e2e:smoke:\$\{\{\s*matrix\.group\s*\}\}/,
  );
  assert.doesNotMatch(smokeJob, /run:\s*pnpm test:e2e:core/);
  assert.doesNotMatch(buildJob, /Restore Playwright browser cache/);
  assert.doesNotMatch(buildJob, /Install Chromium/);
  assert.doesNotMatch(buildJob, /ms-playwright/);
  assert.doesNotMatch(
    workflow,
    /Run smoke e2e[\s\S]*tests\/e2e\/auth\.spec\.ts:16/,
  );

  for (const browserJob of [smokeJob, coreJob, fullJob, burnInJob]) {
    assert.match(
      browserJob,
      /container:\s*\n\s+image:\s*mcr\.microsoft\.com\/playwright:v1\.60\.0-noble/,
    );
    assert.doesNotMatch(browserJob, /playwright-cache/);
    assert.doesNotMatch(browserJob, /ms-playwright/);
    assert.doesNotMatch(browserJob, /install-deps chromium/);
    assert.doesNotMatch(browserJob, /install chromium/);
  }

  assert.match(
    fullJob,
    /pnpm test:playwright -- tests\/e2e --grep "\$E2E_GREP" --shard=\$\{\{\s*matrix\.shard\s*\}\}\/4 --reporter=line/,
  );
  assert.match(
    fullJob,
    /pnpm test:playwright -- tests\/e2e --shard=\$\{\{\s*matrix\.shard\s*\}\}\/4 --reporter=line/,
  );
  assert.doesNotMatch(fullJob, /pnpm test:playwright -- --shard/);

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
  assert.match(ciDocs, /Pushes to feature branches/);
  assert.match(ciDocs, /same branch cancel older in-progress runs/);
  assert.match(ciDocs, /three parallel groups/);
  assert.match(ciDocs, /full Playwright shards run only `tests\/e2e`/);
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

test("vercel preview deploy applies Prisma migrations before building", () => {
  const vercelConfig = JSON.parse(readProjectFile("vercel.json"));

  assert.match(vercelConfig.buildCommand, /pnpm db:migrate/);
  assert.match(vercelConfig.buildCommand, /pnpm run build/);
  assert.ok(
    vercelConfig.buildCommand.indexOf("pnpm db:migrate") <
      vercelConfig.buildCommand.indexOf("pnpm run build"),
    "Prisma migrations must run before Next.js build",
  );
});
