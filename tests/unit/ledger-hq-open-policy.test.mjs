import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function projectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

async function importOpenPolicy() {
  return import(
    pathToFileURL(projectFile("src", "features", "ledger", "hq-open-policy.ts"))
      .href
  );
}

// 본사는 지점이 아예 작성하지 않은 날짜(매입 0건 포함)도 열 수 있어야 한다.
test("getHqLedgerOpenTarget accepts a past business date", async () => {
  const { getHqLedgerOpenTarget } = await importOpenPolicy();

  assert.deepEqual(
    getHqLedgerOpenTarget("store-1", "2026-08-03", "2026-08-08"),
    { storeId: "store-1", closingDate: "2026-08-03" },
  );
  assert.deepEqual(
    getHqLedgerOpenTarget("store-1", "2026-08-08", "2026-08-08"),
    {
      storeId: "store-1",
      closingDate: "2026-08-08",
    },
  );
});

test("getHqLedgerOpenTarget rejects future, malformed, and storeless input", async () => {
  const { getHqLedgerOpenTarget } = await importOpenPolicy();

  assert.equal(
    getHqLedgerOpenTarget("store-1", "2026-08-09", "2026-08-08"),
    null,
  );
  assert.equal(
    getHqLedgerOpenTarget("store-1", "2026-02-30", "2026-08-08"),
    null,
  );
  assert.equal(getHqLedgerOpenTarget("store-1", "", "2026-08-08"), null);
  assert.equal(getHqLedgerOpenTarget("", "2026-08-03", "2026-08-08"), null);
});

// 진입 경로가 실제로 서버 게이트를 통과하는지(권한·지점 범위) 확인한다.
test("openHqLedgerForDate keeps the headquarters permission gates", () => {
  const source = readFileSync(
    projectFile("src", "features", "ledger", "hq-open-actions.ts"),
    "utf8",
  );

  assert.match(source, /getHqLedgerOpenTarget\(/);
  assert.match(source, /requireLedgerHqEditAccess\(\)/);
  assert.match(source, /requireHeadquartersStoreScope\(target\.storeId\)/);
});
