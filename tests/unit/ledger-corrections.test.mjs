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
  const ledgerDetailPage = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );

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
    /const actor = \{ user: await requireCorrectionCreateAccess\(\) \};\s*const parsed = parseCorrectionRecordInput/s,
  );
  assert.match(actions, /requireHeadquartersLedgerScope\(ledgerId\)/);
  assert.match(actions, /status:\s*"HEADQUARTERS_CLOSED"/);
  assert.match(actions, /db\.\$transaction/);
  assert.match(actions, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(actions, /\$executeRaw`SELECT pg_advisory_xact_lock/);
  assert.doesNotMatch(actions, /\$queryRaw`SELECT pg_advisory_xact_lock/);
  assert.match(actions, /paymentFieldKinds/);
  assert.match(
    ledgerDetailPage,
    /fieldKey:\s*"carryoverSalesAmount"[\s\S]*label:\s*"이월 매출"/,
  );
  assert.match(actions, /ledgerFieldKinds/);
  assert.match(actions, /calculatedMetricKinds/);
  assert.match(
    actions,
    /if\s*\(input\.targetType\s*===\s*"PURCHASE_ROW"\)\s*\{\s*return unsupportedTargetError\(\);\s*\}/s,
  );
  assert.doesNotMatch(actions, /tx\.ledgerPurchaseItem\.findFirst/);
  assert.match(actions, /normalizeCorrectedValueForTarget/);
  assert.match(actions, /PAYMENT_FIELD:OPERATING_SALES/);
  assert.match(actions, /validateOperatingSalesCorrectionInTx/);
  assert.match(actions, /latestTotalSales[\s\S]*latestCarryoverSales/);
  const operatingSalesLockIndex = actions.indexOf(
    "await lockOperatingSalesCorrectionsInTx(tx, ledgerId)",
  );
  const ledgerReadAfterLockIndex = actions.indexOf(
    "const ledger = await tx.dailyLedger.findUnique",
    operatingSalesLockIndex,
  );
  assert.ok(operatingSalesLockIndex >= 0);
  assert.ok(
    ledgerReadAfterLockIndex > operatingSalesLockIndex,
    "the shared operating-sales lock must be acquired before the first transaction read",
  );
  assert.match(actions, /correctedValue\.kind !== originalValue\.kind/);
  assert.match(actions, /withServerLabel/);
  assert.match(actions, /label:\s*originalValue\.label/);
  assert.match(actions, /tx\.correctionRecord\.create/);
  assert.match(actions, /writeAuditLog\(/);
  assert.match(actions, /action:\s*"correction\.created"/);
  assert.match(actions, /targetType:\s*"CorrectionRecord"/);
  assert.match(actions, /reason:\s*parsed\.data\.reason/);
  assert.match(actions, /revalidateLedgerDetailPath\(ledgerId\)/);
  assert.match(actions, /revalidateDashboardAndReports\(\)/);
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

test("operating-sales correction cap rejects serial counterpart overflow", async () => {
  const actionPath = assertProjectFile(
    "src",
    "features",
    "corrections",
    "operating-sales-validation.ts",
  );
  const { isOperatingSalesTotalInRange } = await import(
    pathToFileURL(actionPath).href
  );

  assert.equal(isOperatingSalesTotalInRange(2_147_483_646, 1), true);
  assert.equal(isOperatingSalesTotalInRange(2_147_483_647, 0), true);
  assert.equal(
    isOperatingSalesTotalInRange(2_147_483_647, 1),
    false,
    "a later correction must be rejected after the counterpart reaches the cap",
  );
});

test("correction schema rejects new purchase row corrections until report application is supported", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "corrections",
    "schemas.ts",
  );
  const { correctionRecordSchema, toFieldErrors } = await import(
    pathToFileURL(schemaPath).href
  );

  const result = correctionRecordSchema.safeParse({
    ledgerId: "ledger-1",
    targetType: "PURCHASE_ROW",
    targetId: "purchase-1",
    fieldKey: "quantity",
    correctedValue: { kind: "quantity", value: 9 },
    reason: "매입 수량 확인",
  });

  assert.equal(result.success, false);
  assert.deepEqual(toFieldErrors(result.error), {
    targetType: [
      "매입 행 정정은 아직 지원하지 않습니다. 리포트 반영 경로가 준비된 뒤 사용해 주세요.",
    ],
  });
});

test("correction schema rejects inventory amount corrections until all calculations can apply them", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "corrections",
    "schemas.ts",
  );
  const { correctionRecordSchema, toFieldErrors } = await import(
    pathToFileURL(schemaPath).href
  );

  const result = correctionRecordSchema.safeParse({
    ledgerId: "ledger-1",
    targetType: "INVENTORY_ROW",
    targetId: "inventory-1",
    fieldKey: "inventoryAmount",
    correctedValue: { kind: "money", value: 12000 },
    reason: "재고 금액 확인",
  });

  assert.equal(result.success, false);
  assert.deepEqual(toFieldErrors(result.error), {
    fieldKey: [
      "재고 금액 정정은 아직 지원하지 않습니다. 수량 정정으로 반영해 주세요.",
    ],
  });
});

test("correction schema accepts one-decimal inventory quantities and rejects finer precision", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "corrections",
    "schemas.ts",
  );
  const { correctionRecordSchema, toFieldErrors } = await import(
    pathToFileURL(schemaPath).href
  );
  const input = {
    ledgerId: "ledger-1",
    targetType: "INVENTORY_ROW",
    targetId: "inventory-1",
    fieldKey: "currentQuantity",
    correctedValue: { kind: "quantity", value: "1.5" },
    reason: "재고 실사 반영",
  };

  const accepted = correctionRecordSchema.safeParse(input);

  assert.equal(accepted.success, true);
  assert.equal(accepted.data.correctedValue.value, 1.5);

  const rejected = correctionRecordSchema.safeParse({
    ...input,
    correctedValue: { kind: "quantity", value: "1.25" },
  });

  assert.equal(rejected.success, false);
  assert.deepEqual(toFieldErrors(rejected.error), {
    "correctedValue.value": [
      "정정 수량은 0 이상이고 소수점 첫째 자리까지 입력해 주세요.",
    ],
  });
});

test("correction schema accepts two-decimal loss quantities and rejects finer precision", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "corrections",
    "schemas.ts",
  );
  const { correctionRecordSchema, toFieldErrors } = await import(
    pathToFileURL(schemaPath).href
  );

  const input = {
    ledgerId: "ledger-1",
    targetType: "LOSS_ROW",
    targetId: "loss-1",
    fieldKey: "quantity",
    correctedValue: { kind: "quantity", value: "1.25" },
    reason: "손실 수량 확인",
  };
  const accepted = correctionRecordSchema.safeParse(input);

  assert.equal(accepted.success, true);
  assert.equal(accepted.data.correctedValue.value, 1.25);

  const rejected = correctionRecordSchema.safeParse({
    ...input,
    correctedValue: { kind: "quantity", value: "1.255" },
  });

  assert.equal(rejected.success, false);
  assert.deepEqual(toFieldErrors(rejected.error), {
    "correctedValue.value": [
      "정정 수량은 0 이상이고 소수점 둘째 자리까지 입력해 주세요.",
    ],
  });
});

test("correction schema keeps worker count and money integer-only", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "corrections",
    "schemas.ts",
  );
  const { correctionRecordSchema, toFieldErrors } = await import(
    pathToFileURL(schemaPath).href
  );
  const workerInput = {
    ledgerId: "ledger-1",
    targetType: "LEDGER_FIELD",
    targetId: "ledger-1",
    fieldKey: "workerCount",
    correctedValue: { kind: "quantity", value: "1.5" },
    reason: "근무인원 확인",
  };

  const fractionalWorkerCount = correctionRecordSchema.safeParse(workerInput);

  assert.equal(fractionalWorkerCount.success, false);
  assert.deepEqual(toFieldErrors(fractionalWorkerCount.error), {
    "correctedValue.value": ["근무인원은 0 이상의 정수로 입력해 주세요."],
  });

  const integerWorkerCount = correctionRecordSchema.safeParse({
    ...workerInput,
    correctedValue: { kind: "quantity", value: "2" },
  });

  assert.equal(integerWorkerCount.success, true);
  assert.equal(integerWorkerCount.data.correctedValue.value, 2);

  const outOfRangeWorkerCount = correctionRecordSchema.safeParse({
    ...workerInput,
    correctedValue: {
      kind: "quantity",
      value: String(2_147_483_647 + 1),
    },
  });

  assert.equal(outOfRangeWorkerCount.success, false);
  assert.deepEqual(toFieldErrors(outOfRangeWorkerCount.error), {
    "correctedValue.value": ["근무인원은 0 이상의 정수로 입력해 주세요."],
  });

  const fractionalMoney = correctionRecordSchema.safeParse({
    ledgerId: "ledger-1",
    targetType: "PAYMENT_FIELD",
    targetId: "ledger-1",
    fieldKey: "cashAmount",
    correctedValue: { kind: "money", value: "10.5" },
    reason: "현금 확인",
  });

  assert.equal(fractionalMoney.success, false);
  assert.deepEqual(toFieldErrors(fractionalMoney.error), {
    "correctedValue.value": [
      "정정값은 0 이상의 저장 가능한 정수로 입력해 주세요.",
    ],
  });
});

test("correction action and panel keep decimal quantities target-aware", () => {
  const actions = readProjectFile(
    "src",
    "features",
    "corrections",
    "actions.ts",
  );
  const panel = readProjectFile(
    "src",
    "features",
    "corrections",
    "components",
    "correction-panel.tsx",
  );

  assert.match(actions, /isNonNegativeDecimalInRange/);
  assert.match(actions, /isNonNegativeTwoDecimalInRange/);
  assert.match(
    actions,
    /normalizeCorrectedValueForTarget\(\s*target: Pick<CorrectionRecordInput, "targetType" \| "fieldKey">/,
  );
  assert.match(actions, /target\.targetType === "INVENTORY_ROW"/);
  assert.match(actions, /target\.targetType === "LOSS_ROW"/);
  assert.match(actions, /target\.fieldKey === "currentQuantity"/);
  assert.match(actions, /target\.fieldKey === "quantity"/);

  assert.match(panel, /function getCorrectionInputMode/);
  assert.match(panel, /target\.originalValue\.kind === "text"/);
  assert.match(panel, /target\.targetType === "INVENTORY_ROW"/);
  assert.match(panel, /target\.targetType === "LOSS_ROW"/);
  assert.match(panel, /return "decimal"/);
  assert.match(panel, /return "numeric"/);
  assert.match(panel, /inputMode=\{getCorrectionInputMode\(selectedTarget\)\}/);
});

test("correction queries expose batched latest values for dashboard calculations", () => {
  const queries = readProjectFile(
    "src",
    "features",
    "corrections",
    "queries.ts",
  );

  assert.match(queries, /getLatestCorrectionValuesForLedgers/);
  assert.match(queries, /await requireReportAccess\(\)/);
  assert.match(queries, /getHeadquartersStoreScope\(\)/);
  assert.match(queries, /dailyLedgerId:\s*\{\s*in:\s*ledgerIds\s*\}/);
  assert.match(queries, /getLatestCorrectionValueMap\(records\)/);
  assert.match(
    queries,
    /Map<string,\s*ReturnType<typeof getLatestCorrectionValueMap>>/,
  );
});

test("latest correction map preserves database ordering when JS timestamps tie", () => {
  const queries = readProjectFile(
    "src",
    "features",
    "corrections",
    "queries.ts",
  );

  assert.match(
    queries,
    /\.map\(\(record,\s*index\) => \(\{ record,\s*index \}\)\)/,
  );
  assert.match(queries, /createdAtOrder\s*\|\|\s*left\.index - right\.index/);
  assert.doesNotMatch(queries, /right\.id\.localeCompare\(left\.id\)/);
});
