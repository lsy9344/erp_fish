import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (...segments) =>
  readFileSync(path.join(root, ...segments), "utf8");

test("closed-ledger edit permission is granted only to owner/admin defaults", () => {
  const schema = read("prisma", "schema.prisma");
  const seed = read("prisma", "seed.ts");
  const setup = read("tests", "e2e", "global-setup.ts");
  const authz = read("src", "server", "authz.ts");

  assert.match(schema, /enum\s+PermissionAction\s*{[^}]*LEDGER_CLOSED_EDIT/s);
  assert.match(
    seed,
    /code:\s*"HQ_ADMIN"[\s\S]*?PermissionAction\.LEDGER_EDIT,[\s\S]*?PermissionAction\.LEDGER_CLOSED_EDIT/,
  );
  assert.match(
    seed,
    /const ALL_PERMISSION_ACTIONS = \[[\s\S]*?PermissionAction\.LEDGER_CLOSED_EDIT/,
  );
  assert.doesNotMatch(
    seed.match(/code:\s*"HQ_STAFF"[\s\S]*?\n\s*},/)?.[0] ?? "",
    /LEDGER_CLOSED_EDIT/,
  );
  assert.match(setup, /code:\s*"HQ_ADMIN"[\s\S]*?LEDGER_CLOSED_EDIT/);
  assert.match(
    authz,
    /hasLedgerClosedEditAccess[\s\S]*?PermissionAction\.LEDGER_EDIT[\s\S]*?PermissionAction\.LEDGER_CLOSED_EDIT/,
  );
  assert.match(
    authz,
    /requireLedgerClosedEditAccess[\s\S]*?hasLedgerClosedEditAccess\(currentUser\.id\)/,
  );
});

test("correction supersede schema and migration preserve history metadata", () => {
  const schema = read("prisma", "schema.prisma");
  const migration = read(
    "prisma",
    "migrations",
    "20260731112000_add_closed_ledger_edit_and_correction_supersede",
    "migration.sql",
  );
  const permissionMigration = read(
    "prisma",
    "migrations",
    "20260731120000_add_ledger_closed_edit_permission",
    "migration.sql",
  );

  for (const field of ["supersededAt", "supersededById", "supersedeReason"]) {
    assert.match(schema, new RegExp(`\\b${field}\\b`));
    assert.match(migration, new RegExp(`"${field}"`));
  }
  assert.match(schema, /@relation\("CorrectionRecordSupersededBy"/);
  assert.match(schema, /@@index\(\[dailyLedgerId, supersededAt\]\)/);
  assert.match(migration, /LEDGER_CLOSED_EDIT/);
  assert.match(
    migration,
    /ALTER TYPE "PermissionAction" ADD VALUE IF NOT EXISTS 'LEDGER_CLOSED_EDIT'/,
  );
  assert.match(permissionMigration, /INSERT INTO "PermissionProfileAction"/);
  assert.match(permissionMigration, /WHERE "code" IN \('OWNER', 'HQ_ADMIN'\)/);
  assert.match(
    permissionMigration,
    /ON CONFLICT \("profileId", "action"\) DO NOTHING/,
  );
  assert.match(migration, /ON DELETE SET NULL/);
});

test("closed-edit overlay distinguishes absent corrections from explicit null text", () => {
  const page = read("src", "app", "app", "ledgers", "[ledgerId]", "page.tsx");
  const actions = read("src", "features", "ledger", "hq-edit-actions.ts");
  const overlay = read(
    "src",
    "features",
    "ledger",
    "edit-correction-overlay.ts",
  );

  assert.match(overlay, /value === null[\s\S]*?found:\s*true/);
  assert.match(overlay, /value === null \|\| typeof value === "string"/);
  assert.match(overlay, /"workMemo"[\s\S]*?correctedNullableText/);
  assert.match(page, /fieldKey:\s*"memo"/);
  assert.match(page, /fieldKey:\s*"reason"/);
  assert.match(page, /fieldKey:\s*"workMemo"[\s\S]*?kind:\s*"text"/);
  assert.match(page, /fieldKey:\s*"memo"[\s\S]*?kind:\s*"text"/);
  assert.match(page, /fieldKey:\s*"reason"[\s\S]*?kind:\s*"text"/);
  assert.match(
    actions,
    /correction\.fieldKey === "workMemo"[\s\S]*?value === null[\s\S]*?effectiveLedger\.workMemo = value/,
  );

  assert.match(overlay, /correctedNullableText[\s\S]*?"memo"/);
  assert.match(overlay, /correctedNullableText[\s\S]*?"reason"/);
  assert.match(
    actions,
    /correction\.fieldKey === "memo"[\s\S]*?value === null[\s\S]*?expense\.memo = value/,
  );
});

test("active correction overlays exclude superseded history", () => {
  const queries = read("src", "features", "corrections", "queries.ts");

  assert.match(queries, /getActiveCorrectionsForLedgerInTx/);
  assert.match(queries, /getCorrectionHistoryForLedgerInTx/);
  assert.match(
    queries,
    /getLatestCorrectionByTargetInTx[\s\S]*?supersededAt:\s*null/,
  );
  assert.match(
    queries,
    /getLatestCorrectionValuesForLedgersScoped[\s\S]*?supersededAt:\s*null/,
  );
  assert.match(
    queries,
    /getLatestCorrectionValueMap[\s\S]*?filter\(\(record\) => record\.supersededAt === null\)/,
  );
  assert.match(queries, /supersededBy:\s*record\.supersededBy/);
  assert.match(queries, /supersedeReason:\s*record\.supersedeReason/);
});

test("closed inventory edit has an explicit persisted-row deletion contract", () => {
  const schema = read("src", "features", "inventory", "schemas.ts");
  const action = read("src", "features", "inventory", "hq-edit-actions.ts");
  const storeAction = read("src", "features", "inventory", "actions.ts");
  const client = read(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );

  assert.match(schema, /deletedProductIds:[\s\S]*\.default\(\[\]\)/);
  assert.match(client, /setDeletedProductIds/);
  assert.match(client, /deletedProductIds:\s*Array\.from/);
  assert.match(action, /const persistedProductIds = new Set/);
  assert.match(action, /invalidDeletedProductIds/);
  assert.match(action, /deletedProductIds\.has\(item\.productId\)/);
  assert.match(
    action,
    /ledgerInventoryAdjustment\.deleteMany\([\s\S]*deletedProductIds/,
  );
  assert.match(action, /deletedProductIds:\s*\[\.\.\.deletedProductIds\]/);
  assert.match(
    storeAction,
    /parsed\.data\.deletedProductIds\.length[\s\S]*FORBIDDEN/,
  );
});

test("direct edits can supersede every active correction for each target", () => {
  const actions = read("src", "features", "corrections", "actions.ts");

  assert.match(actions, /supersedeActiveCorrectionsForTargetsInTx/);
  assert.match(actions, /tx\.correctionRecord\.updateMany/);
  assert.match(actions, /supersededAt:\s*null/);
  assert.match(actions, /OR:\s*input\.targets\.map/);
  assert.match(actions, /CLOSED_LEDGER_DIRECT_EDIT/);
  assert.match(actions, /return result\.count/);
});

test("correction creation consumes the expected ledger token and advances version", () => {
  const schemas = read("src", "features", "corrections", "schemas.ts");
  const actions = read("src", "features", "corrections", "actions.ts");
  const panel = read(
    "src",
    "features",
    "corrections",
    "components",
    "correction-panel.tsx",
  );

  assert.match(schemas, /expectedUpdatedAt/);
  assert.match(actions, /updatedAt:\s*parsed\.data\.expectedUpdatedAt/);
  assert.match(actions, /version:\s*\{\s*increment:\s*1\s*\}/);
  assert.match(actions, /updatedById:\s*actor\.user\.id/);
  assert.match(actions, /ledgerUpdate\.count !== 1/);
  assert.match(panel, /expectedUpdatedAt:\s*ledgerUpdatedAt/);
});
