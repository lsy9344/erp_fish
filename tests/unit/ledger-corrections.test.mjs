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

test("CorrectionRecord schema is append-only and addressable by stable target metadata", () => {
  const schema = readProjectFile("prisma", "schema.prisma");

  assert.match(schema, /enum\s+CorrectionTargetType\s*\{/);
  for (const targetType of [
    "LEDGER_FIELD",
    "PAYMENT_FIELD",
    "EXPENSE_ROW",
    "PURCHASE_ROW",
    "INVENTORY_ROW",
    "LOSS_ROW",
    "CALCULATED_METRIC",
  ]) {
    assert.match(schema, new RegExp(`\\b${targetType}\\b`));
  }

  assert.match(schema, /model\s+CorrectionRecord\s*\{/);
  assert.match(schema, /dailyLedgerId\s+String/);
  assert.match(schema, /targetType\s+CorrectionTargetType/);
  assert.match(schema, /targetId\s+String/);
  assert.match(schema, /fieldKey\s+String/);
  assert.match(schema, /originalValue\s+Json/);
  assert.match(schema, /previousAppliedValue\s+Json/);
  assert.match(schema, /correctedValue\s+Json/);
  assert.match(schema, /reason\s+String/);
  assert.match(schema, /createdById\s+String/);
  assert.match(schema, /createdAt\s+DateTime\s+@default\(now\(\)\)/);
  assert.match(schema, /dailyLedger\s+DailyLedger\s+@relation/);
  assert.match(
    schema,
    /createdBy\s+User\s+@relation\("CorrectionRecordCreatedBy"/,
  );
  assert.match(schema, /@@index\(\[dailyLedgerId\]\)/);
  assert.match(schema, /@@index\(\[createdById\]\)/);
  assert.match(schema, /@@index\(\[createdAt\]\)/);
  assert.match(
    schema,
    /@@index\(\[dailyLedgerId,\s*targetType,\s*targetId,\s*fieldKey,\s*createdAt\]\)/,
  );
});

test("correction migration creates CorrectionRecord table and foreign keys", () => {
  const migrationsDir = path.join(root, "prisma", "migrations");
  const migrationDir = readFileSync
    ? path.join(migrationsDir, "20260601143000_add_correction_records")
    : "";
  const migrationPath = path.join(migrationDir, "migration.sql");

  assert.ok(existsSync(migrationPath), "correction migration should exist");

  const migration = readFileSync(migrationPath, "utf8");

  assert.match(migration, /CREATE TYPE "CorrectionTargetType"/);
  assert.match(migration, /CREATE TABLE "CorrectionRecord"/);
  assert.match(migration, /"dailyLedgerId" TEXT NOT NULL/);
  assert.match(migration, /"targetType" "CorrectionTargetType" NOT NULL/);
  assert.match(migration, /"originalValue" JSONB NOT NULL/);
  assert.match(migration, /"previousAppliedValue" JSONB NOT NULL/);
  assert.match(migration, /"correctedValue" JSONB NOT NULL/);
  assert.match(migration, /FOREIGN KEY \("dailyLedgerId"\)/);
  assert.match(migration, /FOREIGN KEY \("createdById"\)/);
});

test("correction feature validates input and writes append-only records with audit", () => {
  const schemas = readProjectFile(
    "src",
    "features",
    "corrections",
    "schemas.ts",
  );
  const actions = readProjectFile(
    "src",
    "features",
    "corrections",
    "actions.ts",
  );
  const queries = readProjectFile(
    "src",
    "features",
    "corrections",
    "queries.ts",
  );
  const types = readProjectFile("src", "features", "corrections", "types.ts");

  assert.match(schemas, /correctionRecordSchema/);
  assert.match(schemas, /정정 사유를 입력해 주세요/);
  assert.match(schemas, /correctedValue/);
  assert.match(schemas, /MAX_CORRECTION_INTEGER\s*=\s*2_147_483_647/);
  assert.match(schemas, /\^\s*\\d\+\$/);
  assert.doesNotMatch(schemas, /\^-\?\\d\+\$/);
  assert.match(types, /CorrectionValue/);
  assert.match(types, /CorrectionTargetOption/);
  assert.match(types, /CorrectionAppliedValue/);

  assert.match(actions, /export\s+async\s+function\s+createCorrectionRecord/);
  assert.match(
    actions,
    /const actor = \{ user: await requireHeadquartersUser\(\) \};\s*const parsed = parseCorrectionRecordInput/s,
  );
  assert.match(actions, /status:\s*"HEADQUARTERS_CLOSED"/);
  assert.match(actions, /db\.\$transaction/);
  assert.match(actions, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(actions, /\$executeRaw`SELECT pg_advisory_xact_lock/);
  assert.doesNotMatch(actions, /\$queryRaw`SELECT pg_advisory_xact_lock/);
  assert.match(actions, /paymentFieldKinds/);
  assert.match(actions, /ledgerFieldKinds/);
  assert.match(actions, /calculatedMetricKinds/);
  assert.match(actions, /normalizeCorrectedValueForTarget/);
  assert.match(actions, /correctedValue\.kind !== originalValue\.kind/);
  assert.match(actions, /withServerLabel/);
  assert.match(actions, /label:\s*originalValue\.label/);
  assert.match(actions, /tx\.correctionRecord\.create/);
  assert.match(actions, /writeAuditLog\(/);
  assert.match(actions, /action:\s*"correction\.created"/);
  assert.match(actions, /targetType:\s*"CorrectionRecord"/);
  assert.match(actions, /reason:\s*parsed\.data\.reason/);
  assert.match(actions, /revalidatePath\(`\/app\/ledgers\/\$\{ledgerId\}`\)/);
  assert.match(actions, /revalidatePath\("\/app\/dashboard"\)/);
  assert.doesNotMatch(actions, /tx\.dailyLedger\.update/);
  assert.doesNotMatch(actions, /tx\.ledgerExpense\.update/);
  assert.doesNotMatch(actions, /tx\.ledgerPurchaseItem\.update/);
  assert.doesNotMatch(actions, /tx\.ledgerInventoryItem\.update/);
  assert.doesNotMatch(actions, /tx\.ledgerLossItem\.update/);

  assert.match(queries, /getCorrectionRecordsForLedger/);
  assert.match(queries, /getLatestCorrectionByTargetInTx/);
  assert.match(queries, /getLatestCorrectionValueMap/);
  assert.match(queries, /getLatestCorrectionValuesForLedger/);
  assert.match(queries, /latestAppliedValue/);
  assert.match(queries, /getCorrectionValueLabel/);
  assert.match(queries, /originalValue/);
  assert.match(queries, /previousAppliedValue/);
  assert.match(queries, /correctedValue/);
  assert.match(
    queries,
    /orderBy:\s*\[\s*\{\s*createdAt:\s*"desc"\s*\},\s*\{\s*id:\s*"desc"\s*\}\s*\]/s,
  );
});

test("correction queries expose batched latest values for dashboard calculations", () => {
  const queries = readProjectFile(
    "src",
    "features",
    "corrections",
    "queries.ts",
  );

  assert.match(queries, /getLatestCorrectionValuesForLedgers/);
  assert.match(queries, /await requireHeadquartersUser\(\)/);
  assert.match(queries, /dailyLedgerId:\s*\{\s*in:\s*ledgerIds\s*\}/);
  assert.match(queries, /getLatestCorrectionValueMap\(records\)/);
  assert.match(queries, /Map<string,\s*ReturnType<typeof getLatestCorrectionValueMap>>/);
});

test("latest correction map preserves database ordering when JS timestamps tie", () => {
  const queries = readProjectFile(
    "src",
    "features",
    "corrections",
    "queries.ts",
  );

  assert.match(queries, /\.map\(\(record,\s*index\) => \(\{ record,\s*index \}\)\)/);
  assert.match(queries, /createdAtOrder\s*\|\|\s*left\.index - right\.index/);
  assert.doesNotMatch(queries, /right\.id\.localeCompare\(left\.id\)/);
});
