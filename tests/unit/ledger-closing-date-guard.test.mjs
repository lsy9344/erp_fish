import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
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

async function importDateHelpers() {
  const datePath = assertProjectFile("src", "features", "ledger", "date.ts");

  return import(pathToFileURL(datePath).href);
}

// WO-A(2026-06-22): 지점장 저장/제출 액션은 KST 오늘 날짜만 허용한다.
test("assertStoreManagerClosingDateIsToday allows the KST today value", async () => {
  const { assertStoreManagerClosingDateIsToday, getTodayKstInput } =
    await importDateHelpers();

  const today = getTodayKstInput();
  const result = assertStoreManagerClosingDateIsToday(today);

  assert.equal(result.ok, true);
});

test("assertStoreManagerClosingDateIsToday rejects a past date with FORBIDDEN", async () => {
  const { assertStoreManagerClosingDateIsToday } = await importDateHelpers();

  const result = assertStoreManagerClosingDateIsToday("2020-01-01");

  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.code, "FORBIDDEN");
});

test("assertStoreManagerClosingDateIsToday rejects a future date", async () => {
  const { assertStoreManagerClosingDateIsToday } = await importDateHelpers();

  const result = assertStoreManagerClosingDateIsToday("2999-12-31");

  assert.equal(result.ok, false);
});

test("assertStoreManagerClosingDateIsToday respects an injected today value", async () => {
  const { assertStoreManagerClosingDateIsToday } = await importDateHelpers();

  assert.equal(
    assertStoreManagerClosingDateIsToday("2026-06-22", "2026-06-22").ok,
    true,
  );
  assert.equal(
    assertStoreManagerClosingDateIsToday("2026-06-21", "2026-06-22").ok,
    false,
  );
});

// 모든 store-manager 저장/제출 entrypoint가 closingDate 가드를 호출하는지 확인한다.
test("store-manager ledger actions guard the closing date", () => {
  const source = readProjectFile("src", "features", "ledger", "actions.ts");

  assert.match(source, /assertStoreManagerClosingDateIsToday/);

  // 6개 entrypoint(submit, sales, expenses, purchases, work, labor) 모두 가드한다.
  const guardCalls = source.match(/guardStoreManagerClosingDate</g) ?? [];
  assert.ok(
    guardCalls.length >= 6,
    `expected >=6 guard calls, found ${guardCalls.length}`,
  );
});

test("store-manager inventory actions guard the closing date", () => {
  const source = readProjectFile("src", "features", "inventory", "actions.ts");

  const guardCalls =
    source.match(/assertStoreManagerClosingDateIsToday\(/g) ?? [];
  assert.ok(
    guardCalls.length >= 2,
    `expected >=2 guard calls, found ${guardCalls.length}`,
  );
});

test("store-manager losses actions guard the closing date", () => {
  const source = readProjectFile("src", "features", "losses", "actions.ts");

  assert.match(source, /assertStoreManagerClosingDateIsToday\(/);
});
