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
  const ledgerProfitSummaryStart = source.indexOf(
    "export type LedgerProfitSummary",
  );
  const rangeQueryStart = source.indexOf(
    "export async function getLedgerProfitSummariesForRange",
  );
  const rangeQueryEnd = source.indexOf(
    "export async function getHqMonthlyClosingAnomalyReport",
    rangeQueryStart,
  );

  assert.notEqual(ledgerProfitSummaryStart, -1);
  assert.notEqual(rangeQueryStart, -1);
  assert.notEqual(rangeQueryEnd, -1);

  const ledgerProfitSummarySource = source.slice(
    ledgerProfitSummaryStart,
    rangeQueryStart,
  );
  const rangeQuerySource = source.slice(rangeQueryStart, rangeQueryEnd);

  assert.match(
    source,
    /type\s+ReportLedgerRecord\s*=\s*\{[\s\S]*?ledgerLossItems:\s*\{[\s\S]*?usedPlannedPrice\?:\s*boolean;[\s\S]*?\}\[\];[\s\S]*?\};/,
  );
  assert.match(ledgerProfitSummarySource, /status:\s*DailyLedgerStatus;/);
  assert.match(
    ledgerProfitSummarySource,
    /lossItems:\s*Array<\{\s*id\?:\s*string;\s*lossTypeName:\s*string;\s*quantity:\s*number;\s*amount:\s*number;\s*usedPlannedPrice:\s*boolean;\s*\}>;/,
  );
  assert.match(
    ledgerProfitSummarySource,
    /hasUnappliedCorrections:\s*boolean;/,
  );
  assert.match(
    rangeQuerySource,
    /ledgerLossItems:\s*\{\s*select:\s*\{[\s\S]*?usedPlannedPrice:\s*true,[\s\S]*?\},\s*\},/,
  );
  assert.match(
    rangeQuerySource,
    /result\.set\(ledger\.id,\s*\{[\s\S]*?status:\s*ledger\.status,/,
  );
  assert.match(
    rangeQuerySource,
    /result\.set\(ledger\.id,\s*\{[\s\S]*?lossItems:\s*summary\.lossItems,/,
  );
  assert.match(
    rangeQuerySource,
    /result\.set\(ledger\.id,\s*\{[\s\S]*?hasUnappliedCorrections:\s*summary\.hasUnappliedCorrections,/,
  );
  assert.match(
    source,
    /const\s+lossMetadataById\s*=\s*new\s+Map\(\s*ledger\.ledgerLossItems\.map\(\(item\)\s*=>\s*\[\s*item\.id,\s*\{\s*lossTypeName:\s*item\.lossTypeName,\s*usedPlannedPrice:\s*item\.usedPlannedPrice\s*\?\?\s*false,\s*\},\s*\]\),\s*\);/,
  );
  assert.match(
    source,
    /const\s+metadata\s*=\s*lossMetadataById\.get\(item\.id\s*\?\?\s*""\);/,
  );
  assert.match(
    source,
    /lossTypeName:\s*metadata\?\.lossTypeName\s*\?\?\s*"유형 미지정"/,
  );
  assert.match(
    source,
    /usedPlannedPrice:\s*metadata\?\.usedPlannedPrice\s*\?\?\s*false/,
  );
});
