import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  requireExplicitResetConfirmation,
  requireResettableDatabaseUrl,
} from "../../scripts/destructive-script-guards.mjs";

const root = process.cwd();

test("destructive reset helpers reject production and production-like databases", () => {
  const safeTestUrl = "postgresql://postgres:pw@localhost:5432/erp_fish_e2e";

  assert.throws(
    () =>
      requireResettableDatabaseUrl(safeTestUrl, {
        NODE_ENV: "production",
      }),
    /production.*refusing destructive reset/i,
  );

  assert.throws(
    () =>
      requireResettableDatabaseUrl(
        "postgresql://postgres:pw@localhost:5432/erp_fish",
        {
          NODE_ENV: "development",
        },
      ),
    /database name.*erp_fish/i,
  );

  assert.equal(
    requireResettableDatabaseUrl(safeTestUrl, { NODE_ENV: "development" }),
    safeTestUrl,
  );
});

test("destructive reset helpers reject remote databases unless explicitly allowed", () => {
  const remoteTestUrl =
    "postgresql://user:pw@ep-example-pooler.us-east-1.aws.neon.tech/erp_fish_e2e";

  assert.throws(
    () =>
      requireResettableDatabaseUrl(remoteTestUrl, {
        NODE_ENV: "development",
      }),
    /remote database host/i,
  );

  assert.equal(
    requireResettableDatabaseUrl(remoteTestUrl, {
      NODE_ENV: "development",
      ALLOW_REMOTE_DESTRUCTIVE_RESET: "yes",
    }),
    remoteTestUrl,
  );
});

test("destructive reset helpers require an explicit confirmation flag", () => {
  assert.throws(
    () => requireExplicitResetConfirmation([], {}),
    /confirmation flag/i,
  );

  assert.equal(requireExplicitResetConfirmation(["--yes"], {}), true);
  assert.equal(
    requireExplicitResetConfirmation([], { CONFIRM_RESET: "yes" }),
    true,
  );
});

test("destructive scripts wire the shared safety guards before deleting data", () => {
  const prevday = readFileSync(
    path.join(root, "scripts", "reset-and-seed-prevday.mjs"),
    "utf8",
  );
  const neonReset = readFileSync(
    path.join(root, "scripts", "reset-neon-data.mjs"),
    "utf8",
  );

  for (const source of [prevday, neonReset]) {
    assert.match(source, /destructive-script-guards\.mjs/);
    assert.match(source, /requireResettableDatabaseUrl/);
    assert.match(source, /requireExplicitResetConfirmation/);
  }

  assert.match(prevday, /await wipeTransactional\(\)/);
  assert.match(neonReset, /TRUNCATE TABLE/);
});
