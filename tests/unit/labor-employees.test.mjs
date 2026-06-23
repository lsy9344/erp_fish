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

test("employee queries expose active options, list, and monthly payroll rollup", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "labor",
    "employees-queries.ts",
  );

  // 활성 직원 선택 옵션은 id/name만 노출한다.
  assert.match(querySource, /export\s+async\s+function\s+getActiveEmployeeOptions/);
  assert.match(querySource, /isActive:\s*true/);

  // 직원별 월간 롤업: 근무 매장 수, 근무 일수, 급여 합계, 메모 수.
  assert.match(
    querySource,
    /export\s+async\s+function\s+getEmployeeMonthlyPayroll/,
  );
  assert.match(querySource, /employeeId:\s*{\s*not:\s*null\s*}/);
  assert.match(querySource, /workedStoreCount/);
  assert.match(querySource, /workedDayCount/);
  assert.match(querySource, /payrollTotal/);
  assert.match(querySource, /memoCount/);

  // employeeId 검증 헬퍼는 트랜잭션에서 호출된다.
  assert.match(
    querySource,
    /export\s+async\s+function\s+resolveValidEmployeeIdsInTx/,
  );
  assert.match(querySource, /tx\.employee\.findMany/);
});

// WO-D(2026-06-22): 직원 마스터 쓰기(create/update/deactivate)는 SETTINGS_MANAGE,
// 조회/롤업은 REPORT_VIEW로 분리한다.
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
  assert.match(
    actionSource,
    /export\s+async\s+function\s+getEmployeeMonthlyPayrollAction/,
  );

  // 쓰기 액션은 requireEmployeeManageAccess(SETTINGS_MANAGE)로 보호한다.
  const manageGuards =
    actionSource.match(/requireEmployeeManageAccess\(\)/g) ?? [];
  assert.ok(
    manageGuards.length >= 3,
    `expected >=3 manage-access guards (create/update/deactivate), found ${manageGuards.length}`,
  );

  // 쓰기 액션은 더 이상 requireReportAccess를 직접 게이트로 쓰지 않는다.
  assert.doesNotMatch(actionSource, /requireReportAccess\(\)/);

  // authz 헬퍼는 SETTINGS_MANAGE 기반으로 정의된다.
  const authzSource = readProjectFile("src", "server", "authz.ts");
  assert.match(
    authzSource,
    /export\s+async\s+function\s+requireEmployeeManageAccess/,
  );
  assert.match(
    authzSource,
    /requireEmployeeManageAccess[\s\S]*?PermissionAction\.SETTINGS_MANAGE/,
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
  assert.match(pageSource, /PermissionAction\.SETTINGS_MANAGE/);
  assert.match(pageSource, /canManage=/);

  const clientSource = readProjectFile(
    "src",
    "features",
    "labor",
    "components",
    "employee-management-client.tsx",
  );

  assert.match(clientSource, /canManage/);
  assert.match(clientSource, /if\s*\(!canManage\)/);
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
  assert.match(querySource, /requireReportAccess\(\)/);
  // 최소 지표: 근무일 평균 매출/마진, 근무 인원 수별 평균, 미연결 급여 행 수.
  assert.match(querySource, /avgSalesPerWorkday/);
  assert.match(querySource, /avgMarginRate/);
  assert.match(querySource, /byHeadcount/);
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
  assert.match(clientSource, /근무 인원 수별 평균/);
  assert.match(clientSource, /계산 불가/);
  // 미연결 급여 행 경고를 사용자에게 노출한다.
  assert.match(clientSource, /직원이 연결되지 않은/);
});

test("employees page renders management and monthly payroll rollup", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "labor",
    "employees",
    "page.tsx",
  );

  assert.match(pageSource, /requireReportAccess/);
  assert.match(pageSource, /getEmployeeList/);
  assert.match(pageSource, /getEmployeeMonthlyPayroll/);
  assert.match(pageSource, /EmployeeManagementClient/);
  assert.match(pageSource, /EmployeePayrollRollupClient/);

  const rollupSource = readProjectFile(
    "src",
    "features",
    "labor",
    "components",
    "employee-payroll-rollup-client.tsx",
  );

  assert.match(rollupSource, /"use client"/);
  assert.match(rollupSource, /직원별 월간 급여 롤업/);
  assert.match(rollupSource, /근무 매장 수/);
  assert.match(rollupSource, /근무 일수/);
  assert.match(rollupSource, /급여 합계/);
  // 자유 입력(직원 미연결) 급여가 롤업에서 제외됨을 사용자에게 안내한다.
  assert.match(rollupSource, /자유 입력/);
});
