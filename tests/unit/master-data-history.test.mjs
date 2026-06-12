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

test("AuditLog keeps append-only JSON fields and adds history query indexes", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  const migrationsRoot = projectPath("prisma", "migrations");
  const migrationNames = existsSync(migrationsRoot)
    ? readdirSync(migrationsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
  const storyMigration = migrationNames.find((name) => {
    const migrationPath = path.join(migrationsRoot, name, "migration.sql");

    return (
      /add_audit_log_history_indexes/.test(name) &&
      existsSync(migrationPath) &&
      /AuditLog_createdAt_idx/.test(readFileSync(migrationPath, "utf8")) &&
      /AuditLog_targetType_createdAt_idx/.test(
        readFileSync(migrationPath, "utf8"),
      ) &&
      /AuditLog_actorId_createdAt_idx/.test(readFileSync(migrationPath, "utf8"))
    );
  });

  assert.match(schema, /model\s+AuditLog\s*{[^}]*action\s+String[^}]*}/s);
  assert.match(schema, /model\s+AuditLog\s*{[^}]*targetType\s+String[^}]*}/s);
  assert.match(schema, /model\s+AuditLog\s*{[^}]*targetId\s+String[^}]*}/s);
  assert.match(schema, /model\s+AuditLog\s*{[^}]*actorId\s+String[^}]*}/s);
  assert.match(schema, /model\s+AuditLog\s*{[^}]*before\s+Json\?[^}]*}/s);
  assert.match(schema, /model\s+AuditLog\s*{[^}]*after\s+Json\?[^}]*}/s);
  assert.match(schema, /model\s+AuditLog\s*{[^}]*createdAt\s+DateTime[^}]*}/s);
  assert.match(
    schema,
    /model\s+AuditLog\s*{[^}]*@@index\(\[createdAt\]\)[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+AuditLog\s*{[^}]*@@index\(\[targetType,\s*createdAt\]\)[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+AuditLog\s*{[^}]*@@index\(\[actorId,\s*createdAt\]\)[^}]*}/s,
  );
  assert.ok(storyMigration, "Story 1.7 must add audit history indexes");
});

test("audit format helpers map target/action labels and safely format JSON details", async () => {
  const formatPath = assertProjectFile(
    "src",
    "features",
    "audit",
    "audit-format.ts",
  );
  const {
    AUDIT_TARGET_TYPE_OPTIONS,
    formatAuditJsonValue,
    getAuditActionLabel,
    getAuditTargetTypeLabel,
    isValidAuditHistoryDateString,
  } = await import(pathToFileURL(formatPath).href);

  assert.deepEqual(
    AUDIT_TARGET_TYPE_OPTIONS.map((option) => option.value),
    [
      "Store",
      "User",
      "Product",
      "PurchaseStandard",
      "LedgerInputCode",
      "DailyLedger",
      "CorrectionRecord",
      "AnomalyThresholdSetting",
    ],
  );
  assert.equal(getAuditTargetTypeLabel("Store"), "지점");
  assert.equal(getAuditTargetTypeLabel("User"), "사용자/권한");
  assert.equal(getAuditTargetTypeLabel("Product"), "품목");
  assert.equal(getAuditTargetTypeLabel("PurchaseStandard"), "매입 기준");
  assert.equal(getAuditTargetTypeLabel("LedgerInputCode"), "코드");
  assert.equal(getAuditTargetTypeLabel("DailyLedger"), "장부");
  assert.equal(getAuditTargetTypeLabel("CorrectionRecord"), "정정 기록");
  assert.equal(
    getAuditTargetTypeLabel("AnomalyThresholdSetting"),
    "이상 신호 기준값",
  );
  assert.equal(getAuditActionLabel("store.created"), "생성");
  assert.equal(getAuditActionLabel("user.role_changed"), "역할 변경");
  assert.equal(
    getAuditActionLabel("user.store_assignments_changed"),
    "지점 배정 변경",
  );
  assert.equal(
    getAuditActionLabel("ledger_input_code.reordered"),
    "표시 순서 변경",
  );
  assert.equal(
    getAuditActionLabel("ledger.review.submitted"),
    "검토 대기 제출",
  );
  assert.equal(getAuditActionLabel("correction.created"), "정정 기록 추가");
  assert.equal(getAuditActionLabel("threshold.updated"), "기준값 변경");
  assert.equal(getAuditActionLabel("future.action"), "future.action");
  assert.equal(formatAuditJsonValue(null), "-");
  assert.match(
    formatAuditJsonValue({
      targetName: "이상 신호 기준값",
      scope: "GLOBAL",
      isActive: false,
    }),
    /"isActive": false/,
  );
  assert.match(
    formatAuditJsonValue({ memo: `긴 값 ${"가".repeat(120)}` }),
    /"memo": "긴 값/,
  );
  assert.equal(isValidAuditHistoryDateString("2028-02-29"), true);
  assert.equal(isValidAuditHistoryDateString("2026-02-29"), false);
  assert.equal(isValidAuditHistoryDateString("2026-02-31"), false);
  assert.equal(isValidAuditHistoryDateString("2026-2-03"), false);
});

test("audit history query enforces headquarters auth, safe filters, stable ordering, cap, and batch lookups", () => {
  const query = readProjectFile("src", "features", "audit", "audit-queries.ts");

  assert.match(
    query,
    /export\s+async\s+function\s+getAuditHistoryForHeadquarters/,
  );
  assert.match(query, /requireSettingsAccess\(\)/);
  assert.match(query, /AUDIT_HISTORY_TARGET_TYPES/);
  assert.match(query, /Store/);
  assert.match(query, /User/);
  assert.match(query, /Product/);
  assert.match(query, /PurchaseStandard/);
  assert.match(query, /LedgerInputCode/);
  assert.match(query, /DailyLedger/);
  assert.match(query, /CorrectionRecord/);
  assert.match(query, /AnomalyThresholdSetting/);
  assert.match(query, /normalizeAuditHistoryFilters/);
  assert.match(query, /targetType/);
  assert.match(query, /actorId/);
  assert.match(query, /reason:\s*true/);
  assert.match(query, /reasonText:\s*log\.reason\s*\?\?\s*"-"/);
  assert.match(query, /from/);
  assert.match(query, /to/);
  assert.match(query, /createdAt:\s*"desc"/);
  assert.match(query, /id:\s*"desc"/);
  assert.match(query, /AUDIT_HISTORY_PAGE_SIZE\s*=\s*50/);
  assert.match(query, /take:\s*AUDIT_HISTORY_PAGE_SIZE/);
  assert.match(query, /db\.store\.findMany/);
  assert.match(query, /db\.user\.findMany/);
  assert.match(query, /db\.product\.findMany/);
  assert.match(query, /db\.purchaseStandard\.findMany/);
  assert.match(query, /db\.ledgerInputCode\.findMany/);
  assert.match(query, /db\.dailyLedger\.findMany/);
  assert.match(query, /db\.correctionRecord\.findMany/);
  assert.match(query, /db\.anomalyThresholdSetting\.findMany/);
  assert.match(query, /"이상 신호 기준값"/);
  assert.match(query, /targetKey\("CorrectionRecord"/);
  assert.match(query, /store:\s*\{\s*select:\s*\{\s*name:\s*true\s*\}/);
  assert.match(query, /closingDate:\s*true/);
  assert.doesNotMatch(query, /\.delete\(/);

  const actorOptionsFunction =
    query.match(
      /async function getAuditActorOptions\(\) \{[\s\S]*?\n\}/,
    )?.[0] ?? "";

  assert.doesNotMatch(
    actorOptionsFunction,
    /take:\s*100/,
    "actor filter options should not be capped before all audit actors are selectable",
  );
});

test("audit history route, client, skeleton, and navigation use the headquarters pattern", () => {
  const page = readProjectFile(
    "src",
    "app",
    "app",
    "master-data",
    "history",
    "page.tsx",
  );
  const loading = readProjectFile(
    "src",
    "app",
    "app",
    "master-data",
    "history",
    "loading.tsx",
  );
  const client = readProjectFile(
    "src",
    "features",
    "audit",
    "components",
    "change-history-client.tsx",
  );
  const sidebar = readProjectFile("src", "components", "app-sidebar.tsx");

  assert.match(page, /requireSettingsAccess/);
  assert.match(page, /HeadquartersShell/);
  assert.match(page, /PageHeader/);
  assert.match(page, /getAuditHistoryForHeadquarters/);
  assert.match(page, /ChangeHistoryClient/);
  assert.match(client, /\/app\/master-data\/history/);
  assert.match(client, /대상 유형 필터/);
  assert.match(client, /변경자 필터/);
  assert.match(client, /from "~\/components\/ui\/select"/);
  assert.doesNotMatch(client, /<select/);
  assert.match(client, /시작일/);
  assert.match(client, /종료일/);
  assert.match(client, /변경 시각/);
  assert.match(client, /변경자/);
  assert.match(client, /대상 유형/);
  assert.match(client, /대상 이름/);
  assert.match(client, /변경 유형/);
  assert.match(client, /selectedHistory\.reasonText/);
  assert.match(client, /사유/);
  assert.match(client, /조건에 맞는 변경 이력이 없습니다\./);
  assert.match(client, /Dialog/);
  assert.match(client, /whitespace-pre-wrap/);
  assert.match(client, /break-words/);
  assert.match(client, /overflow-auto/);
  assert.match(loading, /Skeleton/);
  assert.match(loading, /변경 이력 로딩/);
  assert.match(sidebar, /\/app\/master-data\/history/);
});
