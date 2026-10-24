import assert from "node:assert/strict";
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

test("chatbot's development-only stub stays out of production-server groups", () => {
  const chatGroup = fullE2EGroups.find(({ specs }) =>
    specs.includes("chat-widget"),
  );
  assert.equal(chatGroup.serverMode, "development");
  assert.deepEqual(
    fullE2EGroups.slice(1).map(({ serverMode }) => serverMode),
    ["production", "production", "production"],
  );
});

test("unknown groups fail closed instead of silently running an incomplete suite", () => {
  for (const id of [undefined, "", "0", "5", "2/4", "2; echo injected"]) {
    assert.throws(() => getFullE2EGroup(id), /Unknown full E2E group/);
  }
});
