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
    .filter(
      (name) => name > "20260531194000_add_daily_ledger_submission_fields",
    )
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
  assert.match(
    schema,
    /model\s+Store\s*{[^}]*reportMarginGapThresholdBps\s+Int\s+@default\(150\)[^}]*}/s,
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

  const storeReportMarginGapMigration = migrationNames.find((name) => {
    const migrationPath = path.join(migrationsRoot, name, "migration.sql");

    return (
      existsSync(migrationPath) &&
      /ADD COLUMN "reportMarginGapThresholdBps" INTEGER NOT NULL DEFAULT 150/.test(
        readFileSync(migrationPath, "utf8"),
      )
    );
  });

  assert.ok(storeReportMarginGapMigration);
  const storeReportMarginGapMigrationSql = readFileSync(
    path.join(migrationsRoot, storeReportMarginGapMigration, "migration.sql"),
    "utf8",
  );
  assert.match(
    storeReportMarginGapMigrationSql,
    /CHECK\s*\([\s\S]*"reportMarginGapThresholdBps" >= 1[\s\S]*"reportMarginGapThresholdBps" <= 10000[\s\S]*\)/,
  );
});

test("anomaly threshold simplification migration preserves the previous margin threshold", () => {
  const migration = readProjectFile(
    "prisma",
    "migrations",
    "20260616143000_simplify_anomaly_threshold_settings",
    "migration.sql",
  );
  const addColumnIndex = migration.indexOf('ADD COLUMN "marginRateBps"');
  const copyValueIndex = migration.indexOf(
    'SET "marginRateBps" = "grossMarginDropBps"',
  );
  const dropDefaultIndex = migration.indexOf(
    'ALTER COLUMN "marginRateBps" DROP DEFAULT',
  );
  const dropColumnIndex = migration.indexOf('DROP COLUMN "salesDropRateBps"');

  assert.notEqual(addColumnIndex, -1);
  assert.notEqual(copyValueIndex, -1);
  assert.notEqual(dropDefaultIndex, -1);
  assert.notEqual(dropColumnIndex, -1);
  assert.ok(
    addColumnIndex < copyValueIndex &&
      copyValueIndex < dropDefaultIndex &&
      dropDefaultIndex < dropColumnIndex,
    "migration should add marginRateBps, copy grossMarginDropBps, then drop old columns",
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
    storeReportMarginGapThresholdFormSchema,
    toAnomalyThresholdFieldErrors,
    toStoreReportMarginGapThresholdFieldErrors,
  } = await import(pathToFileURL(schemaPath).href);

  assert.equal(ANOMALY_THRESHOLD_SCOPE, "GLOBAL");
  // WO-01(2026-06-22): 재고 오차 허용 범위 제로화. 폼은 더 이상 재고 차이 기준을 받지 않는다.
  assert.deepEqual(
    anomalyThresholdFormSchema.parse({
      marginRate: "12.5",
      isActive: "true",
      reason: "월간 운영 기준 정비",
    }),
    {
      marginRateBps: 1250,
      isActive: true,
      reason: "월간 운영 기준 정비",
    },
  );

  const parsedWithStaleField = anomalyThresholdFormSchema.parse({
    marginRate: "12.5",
    inventoryDifferenceQuantity: "7",
    isActive: "true",
    reason: "잔여 필드 무시",
  });

  assert.equal(parsedWithStaleField.inventoryDifferenceQuantity, undefined);

  const invalid = anomalyThresholdFormSchema.safeParse({
    marginRate: "",
    isActive: "invalid",
    reason: "   ",
  });

  assert.equal(invalid.success, false);
  const errors = toAnomalyThresholdFieldErrors(invalid.error);

  assert.deepEqual(errors.marginRate, [
    "마진률은 0.0% 이상 100.0% 이하로 입력해 주세요.",
  ]);
  assert.equal(errors.inventoryDifferenceQuantity, undefined);
  assert.deepEqual(errors.isActive, [
    "활성 상태는 활성 또는 비활성 중 하나여야 합니다.",
  ]);
  assert.deepEqual(errors.reason, ["변경 사유를 입력해 주세요."]);

  assert.deepEqual(
    storeReportMarginGapThresholdFormSchema.parse({
      stores: [
        { storeId: "store-min", marginGapRate: "0.01" },
        { storeId: "store-default", marginGapRate: "1.5" },
        { storeId: "store-max", marginGapRate: "100.00" },
      ],
      reason: "지점별 경보 기준 정비",
    }),
    {
      stores: [
        { storeId: "store-min", reportMarginGapThresholdBps: 1 },
        { storeId: "store-default", reportMarginGapThresholdBps: 150 },
        { storeId: "store-max", reportMarginGapThresholdBps: 10000 },
      ],
      reason: "지점별 경보 기준 정비",
    },
  );

  const invalidStoreThresholds =
    storeReportMarginGapThresholdFormSchema.safeParse({
      stores: [
        { storeId: "too-small", marginGapRate: "0" },
        { storeId: "too-large", marginGapRate: "100.01" },
      ],
      reason: " ",
    });
  assert.equal(invalidStoreThresholds.success, false);
  const storeErrors = toStoreReportMarginGapThresholdFieldErrors(
    invalidStoreThresholds.error,
  );
  assert.deepEqual(storeErrors["stores.0.marginGapRate"], [
    "마진 차이 기준은 0.01%p 이상 100.00%p 이하로 입력해 주세요.",
  ]);
  assert.deepEqual(storeErrors["stores.1.marginGapRate"], [
    "마진 차이 기준은 0.01%p 이상 100.00%p 이하로 입력해 주세요.",
  ]);
  assert.deepEqual(storeErrors.reason, ["변경 사유를 입력해 주세요."]);

  const duplicateStoreThresholds =
    storeReportMarginGapThresholdFormSchema.safeParse({
      stores: [
        { storeId: "duplicate", marginGapRate: "1.5" },
        { storeId: "duplicate", marginGapRate: "2.5" },
      ],
      reason: "중복 확인",
    });
  assert.equal(duplicateStoreThresholds.success, false);
  assert.deepEqual(
    toStoreReportMarginGapThresholdFieldErrors(duplicateStoreThresholds.error)[
      "stores.1.storeId"
    ],
    ["같은 지점의 기준값을 중복 입력할 수 없습니다."],
  );
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
  // WO-01(2026-06-22): 재고 오차 허용 범위 제로화. 정규화 결과에는 marginRateBps만 남는다.
  assert.deepEqual(
    normalizeAnomalyThresholdSignalSettings({
      marginRateBps: 1250,
      inventoryDifferenceQuantity: 7,
      isActive: true,
      updatedByName: "본사 관리자",
    }),
    {
      marginRateBps: 1250,
    },
  );
  assert.equal(
    normalizeAnomalyThresholdSignalSettings({
      marginRateBps: 1250,
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
  assertProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "store-report-margin-gap-threshold-settings-client.tsx",
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
  const storeThresholdClientSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "components",
    "store-report-margin-gap-threshold-settings-client.tsx",
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
  assert.match(
    actionSource,
    /revalidateMasterDataPaths\("anomaly-thresholds"\)/,
  );
  assert.match(actionSource, /ActionResult/);
  assert.match(
    actionSource,
    /existing\s*&&\s*isSameAnomalyThreshold[\s\S]*status:\s*"unchanged"/,
    "no-op saves should not create audit rows",
  );
  assert.match(actionSource, /updateStoreReportMarginGapThresholdSettings/);
  assert.match(actionSource, /storeReportMarginGapThresholdFormSchema/);
  assert.match(actionSource, /reportMarginGapThresholdBps/);
  assert.match(actionSource, /isActive:\s*true/);
  assert.match(actionSource, /targetType:\s*"Store"/);
  assert.match(actionSource, /action:\s*"threshold\.updated"/);
  assert.match(actionSource, /reason:\s*parsed\.data\.reason/);
  assert.match(actionSource, /STORE_SCOPE_CHANGED/);

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
  assert.match(
    querySource,
    /statusLabel:\s*setting\.isActive\s*\?\s*"활성"\s*:\s*"비활성"/,
  );
  assert.match(querySource, /getStoreReportMarginGapThresholdsForHeadquarters/);
  assert.match(querySource, /store\.findMany/);
  assert.match(querySource, /where:\s*\{ isActive:\s*true \}/);
  assert.match(querySource, /reportMarginGapThresholdBps:\s*true/);
  assert.match(querySource, /marginGapRate:\s*formatBpsAsPercent/);

  assert.match(pageSource, /requireSettingsAccess/);
  assert.match(pageSource, /HeadquartersShell/);
  assert.match(pageSource, /PageHeader/);
  assert.match(pageSource, /getAnomalyThresholdSettingsForHeadquarters/);
  assert.match(pageSource, /getStoreReportMarginGapThresholdsForHeadquarters/);
  assert.match(pageSource, /AnomalyThresholdSettingsClient/);
  assert.match(pageSource, /StoreReportMarginGapThresholdSettingsClient/);

  assert.match(clientSource, /"use client"/);
  assert.match(clientSource, /FieldGroup/);
  assert.match(clientSource, /FieldError/);
  assert.match(clientSource, /aria-invalid/);
  assert.match(clientSource, /pendingFocusErrorsRef/);
  assert.match(clientSource, /useEffect[\s\S]*marginRateRef\.current\?\.focus/);
  assert.match(clientSource, /formVersionRef/);
  assert.match(clientSource, /reasonRef/);
  assert.match(clientSource, /toast/);
  assert.match(clientSource, /inputMode="decimal"/);
  // WO-01(2026-06-22): 재고 차이 기준 입력 필드를 제거했다.
  assert.doesNotMatch(clientSource, /inputMode="numeric"/);
  assert.match(clientSource, /마진률\(%\)/);
  assert.doesNotMatch(clientSource, /재고 차이 기준\(수량\)/);
  assert.match(clientSource, /재고 오차 허용 범위는 제로화/);
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
  assert.match(
    clientSource,
    /function setFieldValue[\s\S]*setFormError\(null\)/,
  );

  assert.match(storeThresholdClientSource, /"use client"/);
  assert.match(storeThresholdClientSource, /FieldGroup/);
  assert.match(storeThresholdClientSource, /FieldContent/);
  assert.match(storeThresholdClientSource, /aria-invalid/);
  assert.match(storeThresholdClientSource, /inputMode="decimal"/);
  assert.match(storeThresholdClientSource, /지점별 리포트 마진 차이 기준/);
  assert.match(storeThresholdClientSource, /신규 지점의 기본값은/);
  assert.match(storeThresholdClientSource, /1\.50%p/);
  assert.match(storeThresholdClientSource, /지점별 기준 변경 사유/);
  assert.match(storeThresholdClientSource, /지점별 기준 저장/);
  assert.match(
    storeThresholdClientSource,
    /updateStoreReportMarginGapThresholdSettings/,
  );

  assert.match(sidebarSource, /label:\s*"이상 신호"/);
  assert.doesNotMatch(sidebarSource, /label:\s*"이상 신호 기준값"/);
  assert.match(sidebarSource, /\/app\/master-data\/anomaly-thresholds/);
  assert.match(auditFormatSource, /"AnomalyThresholdSetting"/);
  assert.match(auditFormatSource, /threshold\.updated/);
  assert.match(auditFormatSource, /reportMarginGapThresholdBps/);
  assert.match(auditQuerySource, /AnomalyThresholdSetting/);
  assert.match(auditQuerySource, /이상 신호 기준값/);
  assert.match(dashboardQuerySource, /getAnomalyThresholdSettingsForSignals/);
  assert.doesNotMatch(dashboardQuerySource, /getTodayStoreLedger(?:InTx)?\(/);
});
