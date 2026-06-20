import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  buildPlaywrightArgs,
  buildPlaywrightEnv,
  getDatabaseName,
  requireTestDatabase,
} from "../../scripts/playwright-clean-env.mjs";

const root = process.cwd();

test("rejects production-like database names before Playwright starts", () => {
  assert.throws(
    () =>
      requireTestDatabase("postgresql://postgres:pw@localhost:5432/erp_fish"),
    /Refusing to run Playwright against non-test database "erp_fish"/,
  );
});

test("allows only test-like database names and extracts the selected database", () => {
  const e2eUrl =
    "postgresql://postgres:pw@localhost:5432/erp_fish_e2e?schema=public";
  const branchUrl =
    "postgresql://postgres:pw@localhost:5432/erp_fish_test_branch";

  assert.equal(requireTestDatabase(e2eUrl), e2eUrl);
  assert.equal(requireTestDatabase(branchUrl), branchUrl);
  assert.equal(getDatabaseName(e2eUrl), "erp_fish_e2e");
});

test("PLAYWRIGHT_DATABASE_URL wins over polluted inherited DATABASE_URL", () => {
  const env = buildPlaywrightEnv({
    DATABASE_URL: "postgresql://postgres:pw@localhost:5432/erp_fish",
    PLAYWRIGHT_DATABASE_URL:
      "postgresql://postgres:pw@localhost:5432/erp_fish_e2e",
    PORT: "3199",
  });

  assert.equal(
    env.DATABASE_URL,
    "postgresql://postgres:pw@localhost:5432/erp_fish_e2e",
  );
  assert.equal(env.PORT, "3199");
  assert.equal(env.AUTH_URL, "http://localhost:3199");
});

test("keeps the default e2e directory when no narrower spec path is provided", () => {
  assert.deepEqual(buildPlaywrightArgs(["tests/e2e"]), ["tests/e2e"]);
  assert.deepEqual(buildPlaywrightArgs(["tests/e2e", "-g", "로그인"]), [
    "tests/e2e",
    "-g",
    "로그인",
  ]);
});

test("drops the default e2e directory when specific e2e specs are provided", () => {
  assert.deepEqual(
    buildPlaywrightArgs(["tests/e2e", "tests/e2e/auth.spec.ts"]),
    ["tests/e2e/auth.spec.ts"],
  );
  assert.deepEqual(
    buildPlaywrightArgs([
      "tests/e2e",
      "tests/e2e/store-ledger-sales.spec.ts",
      "tests/e2e/store-ledger-purchase.spec.ts",
      "-g",
      "저장",
    ]),
    [
      "tests/e2e/store-ledger-sales.spec.ts",
      "tests/e2e/store-ledger-purchase.spec.ts",
      "-g",
      "저장",
    ],
  );
});

test("does not drop the default directory for files outside that test group", () => {
  assert.deepEqual(
    buildPlaywrightArgs(["tests/e2e", "tests/api/health.spec.ts"]),
    ["tests/e2e", "tests/api/health.spec.ts"],
  );
});

test("e2e global setup truncates the guarded test database before seeding", () => {
  const globalSetupPath = path.join(root, "tests", "e2e", "global-setup.ts");

  assert.ok(existsSync(globalSetupPath), "global setup should exist");

  const source = readFileSync(globalSetupPath, "utf8");

  assert.match(source, /function\s+truncateE2eDatabase/);
  assert.match(source, /TRUNCATE TABLE/);
  assert.match(source, /RESTART IDENTITY CASCADE/);
  assert.match(source, /--accept-data-loss/);
  assert.match(
    source,
    /process\.env\.DATABASE_URL = requireTestDatabaseUrl\(databaseUrl\)[\s\S]*prisma db push[\s\S]*truncateE2eDatabase\(prisma\)/,
  );
});
