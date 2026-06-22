import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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

test("ecount-purchase-actions exports previewEcountLedgerPurchases and commitEcountLedgerPurchases", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "ecount-purchase-actions.ts",
  );

  assert.match(
    source,
    /export\s+async\s+function\s+previewEcountLedgerPurchases/,
  );
  assert.match(
    source,
    /export\s+async\s+function\s+commitEcountLedgerPurchases/,
  );
});

test("previewEcountLedgerPurchases stores parsed rows as EcountImportSession and returns importSessionId", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "ecount-purchase-actions.ts",
  );

  assert.match(source, /ecountImportSession\.create/);
  assert.match(source, /purchasesJson/);
  assert.match(source, /expiresAt/);
  assert.match(source, /importSessionId/);
});

test("commitEcountLedgerPurchases accepts importSessionId instead of raw purchases array", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "ecount-purchase-actions.ts",
  );

  assert.match(
    source,
    /commitEcountLedgerPurchases\s*\(\s*\n?\s*ledgerId:\s*string,\s*\n?\s*importSessionId:\s*string/s,
  );
  assert.doesNotMatch(
    source,
    /commitEcountLedgerPurchases\s*\(\s*\n?\s*ledgerId:\s*string,\s*\n?\s*purchases:/s,
  );
});

test("commitEcountLedgerPurchases reads rows from DB session not from client", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "ecount-purchase-actions.ts",
  );

  assert.match(source, /ecountImportSession\.findUnique/);
  assert.match(source, /session\.purchasesJson/);
});

test("commitEcountLedgerPurchases verifies session ledgerId actorId and expiry", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "ecount-purchase-actions.ts",
  );

  assert.match(source, /session\.ledgerId\s*!==\s*ledgerId/);
  assert.match(source, /session\.actorId\s*!==\s*user\.id/);
  assert.match(source, /session\.expiresAt\s*<\s*new Date\(\)/);
  assert.match(source, /IMPORT_SESSION_EXPIRED/);
  assert.match(source, /IMPORT_SESSION_MISMATCH/);
});

test("commitEcountLedgerPurchases deletes session inside transaction after use", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "ecount-purchase-actions.ts",
  );

  assert.match(source, /tx\.ecountImportSession\.delete/);
});

test("commitEcountLedgerPurchases validates server-side rows from session", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "ecount-purchase-actions.ts",
  );

  assert.match(source, /Number\.isFinite\(unitPrice\)/);
  assert.match(source, /Number\.isFinite\(quantity\)/);
  assert.match(source, /unitPrice\s*<\s*0/);
  assert.match(source, /quantity\s*<\s*0/);
  assert.match(source, /productName.*trim\(\)\s*===\s*""|!purchase\.productName/);
});

test("commitEcountLedgerPurchases blocks non-editable ledger status including HOLIDAY", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "ecount-purchase-actions.ts",
  );

  assert.match(source, /isLedgerEditable\(ledger\.status\)/);
  assert.match(source, /LEDGER_NOT_EDITABLE/);
  assert.doesNotMatch(
    source,
    /ledger\.status\s*===\s*"HEADQUARTERS_CLOSED"/,
    "should not check only HEADQUARTERS_CLOSED — must use isLedgerEditable()",
  );
});

test("previewEcountLedgerPurchases also blocks non-editable ledger status", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "ecount-purchase-actions.ts",
  );

  const previewFnIdx = source.indexOf("async function previewEcountLedgerPurchases");
  const commitFnIdx = source.indexOf("async function commitEcountLedgerPurchases");
  const previewSection = source.slice(previewFnIdx, commitFnIdx);

  assert.match(previewSection, /isLedgerEditable\(ledger\.status\)/);
});

test("commitEcountLedgerPurchases guards with requireLedgerHqEditAccess and requireHeadquartersStoreScope", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "ecount-purchase-actions.ts",
  );

  assert.match(source, /requireLedgerHqEditAccess\(\)/);
  assert.match(source, /requireHeadquartersStoreScope\(ledger\.storeId\)/);
});

test("commitEcountLedgerPurchases writes audit log with importSessionId", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "ecount-purchase-actions.ts",
  );

  assert.match(source, /writeAuditLog\(/);
  assert.match(source, /ECOUNT_PURCHASE_IMPORT/);
  assert.match(source, /importSessionId/);
});

test("ecount-purchase-upload-client passes importSessionId to commitEcountLedgerPurchases", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "ecount-purchase-upload-client.tsx",
  );

  assert.match(source, /preview\.importSessionId/);
  assert.doesNotMatch(source, /preview\.purchases\s*\)/);
});

test("ecount-purchase-actions is a server action file", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "ecount-purchase-actions.ts",
  );

  assert.match(source, /"use server"/);
});
