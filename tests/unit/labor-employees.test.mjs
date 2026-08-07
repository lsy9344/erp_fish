import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

function migrationDirNames() {
  const migrationDir = assertProjectFile("prisma", "migrations");

  return readdirSync(migrationDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

// WO-05(2026-06-22): 직원 마스터와 LedgerLaborItem.employeeId는 schema와 migration이 일치해야 한다.
test("Employee model and labor employeeId migration are consistent", () => {
  const schema = readProjectFile("prisma", "schema.prisma");

  assert.match(
    schema,
    /model\s+Employee\s*{[^}]*name\s+String[^}]*hireDate\s+DateTime[^}]*isActive\s+Boolean\s+@default\(true\)[^}]*}/s,
  );
  assert.match(
    schema,
    /model\s+LedgerLaborItem\s*{[^}]*employeeId\s+String\?[^}]*employee\s+Employee\?[^}]*}/s,
  );

  const migration = migrationDirNames()
    .map((name) =>
      path.join(root, "prisma", "migrations", name, "migration.sql"),
    )
    .filter((sqlPath) => existsSync(sqlPath))
    .map((sqlPath) => readFileSync(sqlPath, "utf8"))
    .find(
      (sql) =>
        /CREATE TABLE "Employee"/.test(sql) &&
        /ALTER TABLE "LedgerLaborItem" ADD COLUMN "employeeId"/.test(sql),
    );

  assert.ok(
    migration,
    "a migration must create Employee and add LedgerLaborItem.employeeId",
  );
  assert.match(
    migration,
    /CREATE INDEX "Employee_isActive_idx" ON "Employee"\("isActive"\)/,
  );
  assert.match(
    migration,
    /CREATE INDEX "LedgerLaborItem_employeeId_idx" ON "LedgerLaborItem"\("employeeId"\)/,
  );
  assert.match(
    migration,
    /ADD CONSTRAINT "LedgerLaborItem_employeeId_fkey"[\s\S]*ON DELETE SET NULL/,
  );
});

test("employee form schema validates name and hire date", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "labor",
    "employees-schemas.ts",
  );
  const { employeeFormSchema } = await import(pathToFileURL(schemaPath).href);

  const parsed = employeeFormSchema.parse({
    name: "  홍길동  ",
    hireDate: "2026-01-02",
  });

  assert.equal(parsed.name, "홍길동");
  assert.equal(parsed.hireDate, "2026-01-02");
  assert.equal(parsed.isActive, true);

  assert.equal(
    employeeFormSchema.safeParse({ name: "", hireDate: "2026-01-02" }).success,
    false,
  );
  assert.equal(
    employeeFormSchema.safeParse({ name: "홍길동", hireDate: "bad-date" })
      .success,
    false,
  );
});

test("employee queries expose active options and list", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "labor",
    "employees-queries.ts",
  );

  // 활성 직원 선택 옵션은 id/name만 노출한다.
  assert.match(
    querySource,
    /export\s+async\s+function\s+getActiveEmployeeOptions/,
  );
  assert.match(querySource, /isActive:\s*true/);

  // WO-0806 #1-10: 급여 롤업은 인건비 리포트가 대체하므로 제거됐다.
  assert.doesNotMatch(
    querySource,
    /export\s+async\s+function\s+getEmployeeMonthlyPayroll/,
  );
  // WO-0806 #1: 인사관리 카드 필드를 조회에 싣는다.
  assert.match(querySource, /bankAccount:\s*true/);
  assert.match(querySource, /position:\s*true/);
  // 희망 현금은 자동계산 값이므로 조회 DTO에서 뺀다.
  assert.doesNotMatch(querySource, /desiredCashAmount/);

  // employeeId 검증 헬퍼는 트랜잭션에서 호출된다.
  assert.match(
    querySource,
    /export\s+async\s+function\s+resolveValidEmployeeIdsInTx/,
  );
  assert.match(querySource, /tx\.employee\.findMany/);
});

// WO-0806 #5: 직원 마스터 읽기/쓰기 모두 대표 전용(LABOR_VIEW)이다.
// 읽기만 좁히면 "볼 수 없는데 고칠 수 있는" 상태가 남는다.
test("employee write actions require manage access, reads stay report-view", () => {
  const actionSource = readProjectFile(
    "src",
    "features",
    "labor",
    "employees-actions.ts",
  );

  assert.match(actionSource, /"use server"/);
  assert.match(actionSource, /export\s+async\s+function\s+createEmployee/);
  assert.match(actionSource, /export\s+async\s+function\s+updateEmployee/);
  assert.match(actionSource, /export\s+async\s+function\s+deactivateEmployee/);
  assert.doesNotMatch(actionSource, /getEmployeeMonthlyPayrollAction/);

  // 쓰기 액션은 requireEmployeeManageAccess로 보호한다.
  const manageGuards =
    actionSource.match(/requireEmployeeManageAccess\(\)/g) ?? [];
  assert.ok(
    manageGuards.length >= 3,
    `expected >=3 manage-access guards (create/update/deactivate), found ${manageGuards.length}`,
  );

  // 쓰기 액션은 더 이상 requireReportAccess를 직접 게이트로 쓰지 않는다.
  assert.doesNotMatch(actionSource, /requireReportAccess\(\)/);

  // authz 헬퍼는 LABOR_VIEW 기반으로 정의된다.
  const authzSource = readProjectFile("src", "server", "authz.ts");
  assert.match(
    authzSource,
    /export\s+async\s+function\s+requireEmployeeManageAccess/,
  );
  assert.match(
    authzSource,
    /requireLaborViewAccess[\s\S]*?PermissionAction\.LABOR_VIEW/,
  );
  assert.match(
    authzSource,
    /requireEmployeeManageAccess[\s\S]*?requireLaborViewAccess/,
  );
});

// WO-D(2026-06-22): 직원 관리 화면은 쓰기 권한이 없으면 폼/버튼을 숨긴다.
test("employees page passes write-permission flag to management client", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "labor",
    "employees",
    "page.tsx",
  );

  assert.match(pageSource, /hasActionPermission/);
  assert.match(pageSource, /PermissionAction\.LABOR_VIEW/);
  assert.match(pageSource, /canManage=/);

  const clientSource = readProjectFile(
    "src",
    "features",
    "labor",
    "components",
    "employee-management-client.tsx",
  );

  assert.match(clientSource, /canManage/);
  assert.match(clientSource, /!canManage \?/);
});

// WO-25(2026-07-25) #6: 정책 8.1이 CAP-1 최소 구현 범위로 승인되어(PM 겸 본사 운영자 권한,
// 2026-07-25) 직원 관리가 인건비 메뉴 영역에 노출된다. CAP-9(근무 선택/집계)와 실제 지급
// 확정은 여전히 별도 승인 전까지 차단 상태로 남는다.
test("headquarters sidebar exposes employee management after 2026-07-25 policy approval", () => {
  const sidebarSource = readProjectFile("src", "components", "app-sidebar.tsx");

  assert.match(sidebarSource, /label:\s*"직원 관리"/);
  assert.match(sidebarSource, /href:\s*"\/app\/labor\/employees"/);

  const policySource = readProjectFile(
    "_bmad-output",
    "planning-artifacts",
    "policy-decisions",
    "8-1-직원-근무-급여-참고-범위와-개인정보-기준.md",
  );
  assert.match(policySource, /승인 상태 \| 승인 완료/);
  // CAP-9(신규 근무 선택 모델)과 지급 확정은 이번 승격 범위 밖임을 문서가 계속 명시해야 한다.
  assert.match(
    policySource,
    /CAP-9\(직원별 근무 선택\/집계\)와 실제 지급 확정은 여전히 별도 승인/,
  );
});

test("employees page is available without a preview flag after policy approval", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "labor",
    "employees",
    "page.tsx",
  );

  assert.doesNotMatch(pageSource, /notFound/);
  assert.doesNotMatch(pageSource, /ENABLE_HR_PREVIEW/);
  assert.match(pageSource, /EmployeeManagementClient/);
});

// WO-E(2026-06-22): HR 월간 생산성/인력 배치 분석.
test("employee productivity analysis reuses ledger profit calc and surfaces unlinked rows", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "labor",
    "employees-queries.ts",
  );

  assert.match(
    querySource,
    /export\s+async\s+function\s+getEmployeeProductivityAnalysis/,
  );
  // 단순 totalSalesAmount - expense가 아니라 본사 리포트 기준 계산을 재사용한다.
  assert.match(querySource, /getLedgerProfitSummariesForRange/);
  assert.match(querySource, /requireLaborViewAccess\(\)/);
  // 최소 지표: 근무일 평균 매출/마진, 미연결 급여 행 수.
  assert.match(querySource, /avgSalesPerWorkday/);
  assert.match(querySource, /avgMarginRate/);
  // WO-0806 #1-13: `근무 인원 수별 평균`은 삭제됐다.
  assert.doesNotMatch(querySource, /byHeadcount/);
  assert.match(querySource, /unlinkedPayrollRowCount/);
  // 계산 불가 사유를 함께 노출한다.
  assert.match(querySource, /marginUnavailableReason/);

  // 본사 리포트의 장부 단위 correction-aware 계산 헬퍼가 존재한다.
  const reportSource = readProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  assert.match(
    reportSource,
    /export\s+async\s+function\s+getLedgerProfitSummariesForRange/,
  );
  assert.match(reportSource, /toReportLedgerCalculationSummary/);
});

test("employees page renders productivity analysis section", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "labor",
    "employees",
    "page.tsx",
  );

  assert.match(pageSource, /getEmployeeProductivityAnalysis/);
  assert.match(pageSource, /EmployeeProductivityClient/);

  const clientSource = readProjectFile(
    "src",
    "features",
    "labor",
    "components",
    "employee-productivity-client.tsx",
  );

  assert.match(clientSource, /"use client"/);
  assert.match(clientSource, /월간 생산성/);
  assert.match(clientSource, /근무일 평균 매출/);
  assert.match(clientSource, /근무일 평균 마진율/);
  assert.match(clientSource, /계산 불가/);
  // 미연결 급여 행 경고를 사용자에게 노출한다.
  assert.match(clientSource, /직원이 연결되지 않은/);
});

test("employees page renders the HR card without the payroll rollup", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "labor",
    "employees",
    "page.tsx",
  );

  assert.match(pageSource, /requireLaborViewAccess/);
  assert.match(pageSource, /getEmployeeList/);
  assert.match(pageSource, /EmployeeManagementClient/);
  // WO-0806 #1-10: 급여 롤업 섹션은 제거됐다.
  assert.doesNotMatch(pageSource, /EmployeePayrollRollupClient/);

  const clientSource = readProjectFile(
    "src",
    "features",
    "labor",
    "components",
    "employee-management-client.tsx",
  );

  // WO-0806 #1: 인사관리 카드 필드와 검색/상세.
  assert.match(clientSource, /인사관리 카드/);
  assert.match(clientSource, /직급/);
  assert.match(clientSource, /연락처/);
  assert.match(clientSource, /계좌번호/);
  assert.match(clientSource, /주소/);
  assert.match(clientSource, /직원 검색/);
  assert.match(clientSource, /Dialog/);
  // WO-0806 #1-9: 데이터 포맷 예시는 placeholder로 제공한다.
  assert.match(clientSource, /010-1234-5678/);
  assert.match(clientSource, /국민 123456-01-234567/);
  // WO-0806 #1-5: 희망 현금은 자동계산 값이므로 입력 상태·필드가 없다.
  // (자동계산임을 알리는 안내 문구는 남아 있어도 된다.)
  assert.doesNotMatch(clientSource, /desiredCashAmount/);
  assert.doesNotMatch(clientSource, /희망 현금 금액/);
});
