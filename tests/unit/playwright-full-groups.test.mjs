import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { test } from "node:test";

import {
  fullE2EGroups,
  getFullE2EGroup,
} from "../../scripts/playwright-full-groups.mjs";

test("full E2E groups cover every spec exactly once", () => {
  const discovered = readdirSync("tests/e2e", { recursive: true })
    .filter((name) => name.endsWith(".spec.ts"))
    .map((name) => `tests/e2e/${name.replaceAll("\\", "/")}`)
    .sort();
  const assigned = fullE2EGroups.flatMap(({ id }) => getFullE2EGroup(id).specs);
  assert.deepEqual([...assigned].sort(), discovered);
  assert.equal(new Set(assigned).size, assigned.length);
  assert.deepEqual(
    fullE2EGroups.map(({ id }) => id),
    [1, 2, 3, 4],
  );
});

test("all full E2E groups use the compiled production server", () => {
  assert.deepEqual(
    fullE2EGroups.map(({ serverMode }) => serverMode),
    ["production", "production", "production", "production"],
  );
});

test("unknown groups fail closed instead of silently running an incomplete suite", () => {
  for (const id of [undefined, "", "0", "5", "2/4", "2; echo injected"]) {
    assert.throws(() => getFullE2EGroup(id), /Unknown full E2E group/);
  }
});

test("manual filters with no match in the complete suite fail", () => {
  const result = listFilteredGroup("2", "no-such-e2e-test-4e3d891a");
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /No tests found/);
});

test("a valid manual filter permits an empty unrelated group", () => {
  const result = listFilteredGroup("1", "지점장 direct URL");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /Total: 0 tests in 0 files/);
});

function listFilteredGroup(group, grep) {
  return spawnSync(
    process.execPath,
    [
      "scripts/run-playwright-full.mjs",
      "--group",
      group,
      "--grep",
      grep,
      "--list",
      "--reporter=line",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, PW_RESOURCE_LOG: "" },
      timeout: 30_000,
    },
  );
}
