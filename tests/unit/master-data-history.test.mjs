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
    formatAuditChangeSummary,
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
      "ReportExport",
      // WO(2026-06-24): 이카운트 출고/입고 원장 도입으로 추가된 감사 대상 타입
      "EcountImportBatch",
      "StoreExternalAlias",
      "ProductExternalAlias",
    ],
  );
  assert.equal(getAuditTargetTypeLabel("Store"), "지점");
  assert.equal(getAuditTargetTypeLabel("User"), "사용자/권한");
  assert.equal(getAuditTargetTypeLabel("Product"), "품목");
  assert.equal(getAuditTargetTypeLabel("PurchaseStandard"), "품목 참고 단가");
  assert.equal(getAuditTargetTypeLabel("LedgerInputCode"), "코드");
  assert.equal(getAuditTargetTypeLabel("DailyLedger"), "장부");
  assert.equal(getAuditTargetTypeLabel("CorrectionRecord"), "정정 기록");
  assert.equal(
    getAuditTargetTypeLabel("AnomalyThresholdSetting"),
    "이상 신호 기준값",
  );
  assert.equal(getAuditTargetTypeLabel("ReportExport"), "리포트 Export");
  assert.equal(
    getAuditTargetTypeLabel("EcountImportBatch"),
    "이카운트 출고/입고",
  );
  assert.equal(getAuditTargetTypeLabel("StoreExternalAlias"), "지점 매핑");
  assert.equal(getAuditTargetTypeLabel("ProductExternalAlias"), "품목 매핑");
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
  assert.equal(
    getAuditActionLabel("report.export.created"),
    "리포트 Export 생성",
  );
  assert.equal(getAuditActionLabel("future.action"), "future.action");
  assert.equal(formatAuditJsonValue(null), "-");
  assert.equal(formatAuditChangeSummary(null, undefined), "-");
  assert.match(
    formatAuditChangeSummary(
      { targetName: "이상 신호 기준값", isActive: false, quantity: 5 },
      { targetName: "이상 신호 기준값", isActive: true, quantity: 6 },
    ),
    /활성 상태: false → true[\s\S]*수량: 5 → 6/,
  );
  // WO-05(2026-06-28): 장부 대표 필드도 한글 라벨로 매핑된다(raw key 의존 감소).
  assert.match(
    formatAuditChangeSummary(
      { totalSalesAmount: 100000, unitPrice: 5000, sourceUnitPrice: 4800 },
      { totalSalesAmount: 120000, unitPrice: 5200, sourceUnitPrice: 4800 },
    ),
    /총매출: 100000 → 120000[\s\S]*장부 적용 단가: 5000 → 5200/,
  );
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
  const authz = readProjectFile("src", "server", "authz.ts");

  assert.match(
    query,
    /export\s+async\s+function\s+getAuditHistoryForHeadquarters/,
  );
  assert.match(authz, /export\s+async\s+function\s+requireAuditHistoryAccess/);
  assert.match(
    authz,
    /requireAuditHistoryAccess[\s\S]*requireSettingsAccess\(\)[\s\S]*requireReportAccess\(\)/,
  );
  assert.match(query, /requireAuditHistoryAccess\(\)/);
  assert.match(query, /PermissionAction\.USER_PERMISSION_MANAGE/);
  assert.match(query, /getAllowedAuditHistoryTargetTypes/);
  assert.match(query, /visibleTargetTypeOptions/);
  assert.match(
    query,
    /hasActionPermission\(\s*currentUserId,\s*PermissionAction\.USER_PERMISSION_MANAGE/,
  );
  assert.match(query, /getHeadquartersStoreScope\(\)/);
  assert.match(query, /omitSensitiveFields/);
  assert.match(query, /AUDIT_HISTORY_TARGET_TYPES/);
  assert.match(query, /Store/);
  assert.match(query, /User/);
  assert.match(query, /Product/);
  assert.match(query, /PurchaseStandard/);
  assert.match(query, /LedgerInputCode/);
  assert.match(query, /DailyLedger/);
  assert.match(query, /CorrectionRecord/);
  assert.match(query, /AnomalyThresholdSetting/);
  assert.match(query, /ReportExport/);
  assert.match(query, /targetType:\s*\{\s*in:\s*allowedTargetTypes/);
  assert.match(
    query,
    /normalizedFilters\.targetType !== "all"[\s\S]*!allowedTargetTypes\.includes\(normalizedFilters\.targetType\)/,
  );
  assert.match(query, /normalizeAuditHistoryFilters/);
  assert.match(query, /targetType/);
  assert.match(query, /actorId/);
  assert.match(query, /reason:\s*true/);
  assert.match(query, /reasonText:\s*log\.reason\s*\?\?\s*"-"/);
  assert.match(
    query,
    /changeSummaryText:\s*formatAuditChangeSummary\(safeBefore,\s*safeAfter\)/,
  );
  assert.match(query, /beforeText:\s*formatAuditJsonValue\(safeBefore\)/);
  assert.match(query, /afterText:\s*formatAuditJsonValue\(safeAfter\)/);
  // WO-05(2026-06-28): 장부/정정 이력은 장부 상세 링크를 내려준다.
  assert.match(query, /ledgerDetailHref/);
  assert.match(query, /\/app\/ledgers\//);
  // WO-06(2026-06-28): 변경자 표시는 name → email → actorId 순으로 떨어진다.
  assert.match(
    query,
    /actor\?\.name\s*\?\?\s*actor\?\.email\s*\?\?\s*actorId\s*\?\?\s*"시스템"/,
  );
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
  assert.match(query, /storeId:\s*\{\s*in:\s*storeIds\s*\}/);
  assert.match(
    query,
    /dailyLedger:\s*\{\s*storeId:\s*\{\s*in:\s*storeIds\s*\}/,
  );
  assert.doesNotMatch(query, /\.delete\(/);

  const actorOptionsFunction =
    query.match(
      /async function getAuditActorOptions\([^)]*\) \{[\s\S]*?\n\}/,
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
  assert.match(
    page,
    /visibleTargetTypeOptions={history\.visibleTargetTypeOptions}/,
  );
  assert.match(client, /\/app\/master-data\/history/);
  assert.match(client, /visibleTargetTypeOptions/);
  assert.match(client, /대상 유형 필터/);
  assert.match(client, /변경자 필터/);
  assert.match(client, /from "~\/components\/ui\/select"/);
  assert.doesNotMatch(client, /<select/);
  assert.match(client, /isHydrated/);
  assert.match(client, /setIsHydrated\(true\)/);
  assert.match(client, /disabled=\{!isHydrated\}/);
  assert.match(client, /시작일/);
  assert.match(client, /종료일/);
  assert.match(client, /변경 시각/);
  assert.match(client, /변경자/);
  assert.match(client, /대상 유형/);
  assert.match(client, /대상 이름/);
  assert.match(client, /변경 유형/);
  assert.match(client, /selectedHistory\.reasonText/);
  assert.match(client, /selectedHistory\.changeSummaryText/);
  assert.match(client, /변경 요약/);
  assert.match(client, /기존 값 → 변경된 값/);
  assert.match(client, /사유/);
  // WO-05(2026-06-28): 원문 JSON은 접을 수 있는 영역, 장부 이력은 상세 링크를 제공한다.
  assert.match(client, /<details/);
  assert.match(client, /원문 변경 전\/후 \(JSON\)/);
  assert.match(client, /selectedHistory\.ledgerDetailHref/);
  assert.match(client, /장부 상세 보기/);
  assert.match(client, /조건에 맞는 변경 이력이 없습니다\./);
  assert.match(client, /Dialog/);
  assert.match(client, /whitespace-pre-wrap/);
  assert.match(client, /break-words/);
  assert.match(client, /overflow-auto/);
  assert.match(loading, /Skeleton/);
  assert.match(loading, /변경 이력 로딩/);
  assert.match(sidebar, /\/app\/master-data\/history/);
});
