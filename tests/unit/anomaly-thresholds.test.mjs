import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function projectPath(...segments) {
  return path.join(root, ...segments);
}

function readProjectFile(...segments) {
  return readFileSync(projectPath(...segments), "utf8");
}

function assertProjectFile(...segments) {
  const filePath = projectPath(...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

test("Prisma schema adds Story 5.5 global anomaly threshold settings", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  const migrationsRoot = projectPath("prisma", "migrations");
  const migrationNames = existsSync(migrationsRoot)
    ? readdirSync(migrationsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  const storyMigration = migrationNames
    .filter((name) => name > "20260531194000_add_daily_ledger_submission_fields")
    .find((name) => {
      const migrationPath = path.join(migrationsRoot, name, "migration.sql");

      return (
        existsSync(migrationPath) &&
        /CREATE TABLE "AnomalyThresholdSetting"/.test(
          readFileSync(migrationPath, "utf8"),
        )
      );
    });

  assert.match(
    schema,
    /model\s+AnomalyThresholdSetting\s*{[^}]*scope\s+String\s+@unique\s+@default\("GLOBAL"\)[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+AnomalyThresholdSetting\s*{[^}]*marginRateBps\s+Int[^}]*inventoryDifferenceQuantity\s+Int[^}]*}/s,
  );
  assert.doesNotMatch(
    schema,
    /model\s+AnomalyThresholdSetting\s*{[^}]*salesDropRateBps[^}]*}/s,
  );
  assert.doesNotMatch(
    schema,
    /model\s+AnomalyThresholdSetting\s*{[^}]*grossMarginDropBps[^}]*}/s,
  );
  assert.doesNotMatch(
    schema,
    /model\s+AnomalyThresholdSetting\s*{[^}]*salesDifferenceAmount[^}]*}/s,
  );
  assert.doesNotMatch(
    schema,
    /model\s+AnomalyThresholdSetting\s*{[^}]*lossAmount[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+AnomalyThresholdSetting\s*{[^}]*isActive\s+Boolean\s+@default\(true\)[^}]*updatedById\s+String\?[^}]*updatedBy\s+User\?[^}]*@relation\("AnomalyThresholdSettingUpdatedBy"/s,
  );
  assert.match(
    schema,
    /model\s+User\s*{[^}]*updatedAnomalyThresholdSettings\s+AnomalyThresholdSetting\[\]\s+@relation\("AnomalyThresholdSettingUpdatedBy"\)[^}]*}/s,
  );
  assert.ok(
    storyMigration,
    "Story 5.5 reuses the existing AnomalyThresholdSetting creation migration",
  );
  const migrationSql = readFileSync(
    path.join(migrationsRoot, storyMigration, "migration.sql"),
    "utf8",
  );
  assert.match(
    migrationSql,
    /CREATE UNIQUE INDEX "AnomalyThresholdSetting_scope_key" ON "AnomalyThresholdSetting"\("scope"\)/,
  );
  assert.match(
    migrationSql,
    /CHECK\s*\("scope"\s*=\s*'GLOBAL'\)/,
    "global threshold scope should be constrained at the database layer",
  );

  const activeMigration = migrationNames.find((name) => {
    const migrationPath = path.join(migrationsRoot, name, "migration.sql");

    return (
      name > "20260531225000_add_anomaly_threshold_settings" &&
      existsSync(migrationPath) &&
      /ALTER TABLE "AnomalyThresholdSetting"[\s\S]*ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true/.test(
        readFileSync(migrationPath, "utf8"),
      )
    );
  });

  assert.ok(
    activeMigration,
    "Story 5.5 must add isActive in a new migration without editing the existing creation migration",
  );
});

test("anomaly threshold schema parses display input, active state, and required reason", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "dashboard",
    "threshold-schemas.ts",
  );
  const {
    ANOMALY_THRESHOLD_SCOPE,
    anomalyThresholdFormSchema,
    toAnomalyThresholdFieldErrors,
  } = await import(pathToFileURL(schemaPath).href);

  assert.equal(ANOMALY_THRESHOLD_SCOPE, "GLOBAL");
  assert.deepEqual(
    anomalyThresholdFormSchema.parse({
      marginRate: "12.5",
      inventoryDifferenceQuantity: "7",
      isActive: "true",
      reason: "월간 운영 기준 정비",
    }),
    {
      marginRateBps: 1250,
      inventoryDifferenceQuantity: 7,
      isActive: true,
      reason: "월간 운영 기준 정비",
    },
  );

  const invalid = anomalyThresholdFormSchema.safeParse({
    marginRate: "",
    inventoryDifferenceQuantity: "1.5",
    isActive: "invalid",
    reason: "   ",
  });

  assert.equal(invalid.success, false);
  const errors = toAnomalyThresholdFieldErrors(invalid.error);

  assert.deepEqual(errors.marginRate, [
    "마진률은 0.0% 이상 100.0% 이하로 입력해 주세요.",
  ]);
  assert.deepEqual(errors.inventoryDifferenceQuantity, [
    "재고 차이 기준은 0 이상의 정수여야 합니다.",
  ]);
  assert.deepEqual(errors.isActive, [
    "활성 상태는 활성 또는 비활성 중 하나여야 합니다.",
  ]);
  assert.deepEqual(errors.reason, ["변경 사유를 입력해 주세요."]);

  const malformedComma = anomalyThresholdFormSchema.safeParse({
    marginRate: "12.5",
    inventoryDifferenceQuantity: "1,00",
    isActive: "true",
    reason: "콤마 검증",
  });

  assert.equal(malformedComma.success, false);
  const commaErrors = toAnomalyThresholdFieldErrors(malformedComma.error);

  assert.deepEqual(commaErrors.inventoryDifferenceQuantity, [
    "재고 차이 기준은 0 이상의 정수여야 합니다.",
  ]);
});

test("anomaly calculation helper normalizes only active saved threshold settings for signal consumers", async () => {
  const anomalyPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "anomaly.ts",
  );
  const { normalizeAnomalyThresholdSignalSettings } = await import(
    pathToFileURL(anomalyPath).href
  );

  assert.equal(normalizeAnomalyThresholdSignalSettings(null), null);
  assert.deepEqual(
    normalizeAnomalyThresholdSignalSettings({
      marginRateBps: 1250,
      inventoryDifferenceQuantity: 7,
      isActive: true,
      updatedByName: "본사 관리자",
    }),
    {
      marginRateBps: 1250,
      inventoryDifferenceQuantity: 7,
    },
  );
  assert.equal(
    normalizeAnomalyThresholdSignalSettings({
      marginRateBps: 1250,
      inventoryDifferenceQuantity: 7,
      isActive: false,
    }),
    null,
  );
});

test("anomaly threshold actions, queries, page, sidebar, and audit wiring follow contracts", () => {
  assertProjectFile(
    "src",
    "app",
    "app",
    "master-data",
    "anomaly-thresholds",
    "page.tsx",
  );
  assertProjectFile(
    "src",
    "app",
    "app",
    "master-data",
    "anomaly-thresholds",
    "loading.tsx",
  );
  assertProjectFile("src", "server", "calculations", "anomaly.ts");
  assertProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "anomaly-threshold-settings-client.tsx",
  );

  const actionSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "threshold-actions.ts",
  );
  const querySource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "threshold-queries.ts",
  );
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "master-data",
    "anomaly-thresholds",
    "page.tsx",
  );
  const clientSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "anomaly-threshold-settings-client.tsx",
  );
  const sidebarSource = readProjectFile("src", "components", "app-sidebar.tsx");
  const auditFormatSource = readProjectFile(
    "src",
    "features",
    "audit",
    "audit-format.ts",
  );
  const auditQuerySource = readProjectFile(
    "src",
    "features",
    "audit",
    "audit-queries.ts",
  );
  const dashboardQuerySource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );

  assert.match(actionSource, /"use server"/);
  assert.match(actionSource, /updateAnomalyThresholdSettings/);
  assert.match(actionSource, /requireSettingsAccess\(\)/);
  assert.match(actionSource, /db\.\$transaction/);
  assert.match(actionSource, /pg_advisory_xact_lock/);
  assert.match(actionSource, /upsert/);
  assert.match(actionSource, /writeAuditLog/);
  assert.match(actionSource, /threshold\.updated/);
  assert.match(actionSource, /targetType:\s*"AnomalyThresholdSetting"/);
  assert.match(actionSource, /reason:\s*parsed\.data\.reason/);
  assert.match(actionSource, /isActive:\s*parsed\.data\.isActive/);
  assert.match(actionSource, /targetName:\s*"이상 신호 기준값"/);
  assert.match(actionSource, /scope:\s*ANOMALY_THRESHOLD_SCOPE/);
  assert.match(actionSource, /marginRateBps:\s*parsed\.data\.marginRateBps/);
  assert.doesNotMatch(actionSource, /salesDropRateBps/);
  assert.doesNotMatch(actionSource, /grossMarginDropBps/);
  assert.doesNotMatch(actionSource, /salesDifferenceAmount/);
  assert.doesNotMatch(actionSource, /lossAmount/);
  assert.match(actionSource, /revalidatePath\("\/app\/master-data\/anomaly-thresholds"\)/);
  assert.match(actionSource, /revalidatePath\("\/app\/dashboard"\)/);
  assert.match(actionSource, /revalidatePath\("\/app\/reports\/daily"\)/);
  assert.match(actionSource, /revalidatePath\("\/app\/reports\/monthly"\)/);
  assert.match(actionSource, /ActionResult/);
  assert.match(
    actionSource,
    /existing\s*&&\s*isSameAnomalyThreshold[\s\S]*status:\s*"unchanged"/,
    "no-op saves should not create audit rows",
  );

  assert.match(querySource, /getAnomalyThresholdSettingsForHeadquarters/);
  assert.match(querySource, /getAnomalyThresholdSettingsForSignals/);
  assert.match(querySource, /requireSettingsAccess\(\)/);
  assert.match(
    querySource,
    /getAnomalyThresholdSettingsForSignals[\s\S]*requireReportAccess\(\)/,
  );
  assert.match(querySource, /anomalyThresholdSetting\.findUnique/);
  assert.match(querySource, /scope:\s*ANOMALY_THRESHOLD_SCOPE/);
  assert.match(querySource, /marginRateBps:\s*true/);
  assert.match(querySource, /scopeLabel:\s*"전체 지점"/);
  assert.match(querySource, /statusLabel:\s*setting\.isActive\s*\?\s*"활성"\s*:\s*"비활성"/);

  assert.match(pageSource, /requireSettingsAccess/);
  assert.match(pageSource, /HeadquartersShell/);
  assert.match(pageSource, /PageHeader/);
  assert.match(pageSource, /getAnomalyThresholdSettingsForHeadquarters/);
  assert.match(pageSource, /AnomalyThresholdSettingsClient/);

  assert.match(clientSource, /"use client"/);
  assert.match(clientSource, /FieldGroup/);
  assert.match(clientSource, /FieldError/);
  assert.match(clientSource, /aria-invalid/);
  assert.match(clientSource, /focusFirstError/);
  assert.match(clientSource, /reasonRef/);
  assert.match(clientSource, /toast/);
  assert.match(clientSource, /inputMode="decimal"/);
  assert.match(clientSource, /inputMode="numeric"/);
  assert.match(clientSource, /마진률\(%\)/);
  assert.match(clientSource, /재고 차이 기준\(수량\)/);
  assert.doesNotMatch(clientSource, /매출 하락률/);
  assert.doesNotMatch(clientSource, /이익률 하락폭/);
  assert.doesNotMatch(clientSource, /매출차액 금액/);
  assert.doesNotMatch(clientSource, /손실액\(원\)/);
  assert.match(clientSource, /변경 사유/);
  assert.match(clientSource, /활성 상태/);
  assert.match(clientSource, /적용 범위/);
  assert.match(clientSource, /마지막 변경/);
  assert.match(clientSource, /기준 유형/);
  assert.match(clientSource, /현재 장부 마진률이 기준보다 낮으면/);
  assert.doesNotMatch(clientSource, /전일 또는 기준일 대비/);
  assert.match(clientSource, /function setFieldValue[\s\S]*setFormError\(null\)/);

  assert.match(sidebarSource, /이상 신호 기준값/);
  assert.match(sidebarSource, /\/app\/master-data\/anomaly-thresholds/);
  assert.match(auditFormatSource, /"AnomalyThresholdSetting"/);
  assert.match(auditFormatSource, /threshold\.updated/);
  assert.match(auditQuerySource, /AnomalyThresholdSetting/);
  assert.match(auditQuerySource, /이상 신호 기준값/);
  assert.match(dashboardQuerySource, /getAnomalyThresholdSettingsForSignals/);
  assert.doesNotMatch(dashboardQuerySource, /getTodayStoreLedger(?:InTx)?\(/);
});
