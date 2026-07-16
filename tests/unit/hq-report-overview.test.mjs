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

test("ledger profit summaries retain the saved loss price basis", () => {
  const source = readProjectFile("src", "features", "reports", "queries.ts");

  assert.match(source, /usedPlannedPrice\?:\s*boolean/);
  assert.match(
    source,
    /getLedgerProfitSummariesForRange[\s\S]*usedPlannedPrice:\s*true/,
  );
  assert.match(source, /lossItems:\s*summary\.lossItems/);
  assert.match(source, /hasUnappliedCorrections:/);
});
