import { notFound } from "next/navigation";

import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { PageHeader } from "~/components/page-header";
import { PermissionAction } from "../../../../../generated/prisma";
import { hasActionPermission, requireReportAccess } from "~/server/authz";
import {
  getEmployeeList,
  getEmployeeMonthlyPayroll,
  getEmployeeProductivityAnalysis,
} from "~/features/labor/employees-queries";
import { getKstBusinessDateParam } from "~/features/ledger/date";
import { EmployeeManagementClient } from "~/features/labor/components/employee-management-client";
import { EmployeePayrollRollupClient } from "~/features/labor/components/employee-payroll-rollup-client";
import { EmployeeProductivityClient } from "~/features/labor/components/employee-productivity-client";

function isHrPreviewEnabled() {
  return process.env.ENABLE_HR_PREVIEW === "true";
}

export default async function EmployeesPage() {
  if (!isHrPreviewEnabled()) {
    notFound();
  }

  const user = await requireReportAccess();
  const currentMonth = getKstBusinessDateParam().slice(0, 7);
  const [
    employees,
    payroll,
    productivity,
    navigationItems,
    canManageEmployees,
  ] = await Promise.all([
    getEmployeeList(),
    getEmployeeMonthlyPayroll(currentMonth),
    // WO-E(2026-06-22): 월간 생산성/인력 배치 분석.
    getEmployeeProductivityAnalysis(currentMonth),
    getHeadquartersNavigationItems(user.id),
    // WO-D(2026-06-22): 직원 마스터 쓰기 권한(SETTINGS_MANAGE) 여부.
    hasActionPermission(user.id, PermissionAction.SETTINGS_MANAGE),
  ]);

  return (
    <HeadquartersShell
      userName={user.name ?? "관리자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <div className="flex flex-col gap-6 p-6">
        <PageHeader title="직원 관리" />
        <EmployeeManagementClient
          initialEmployees={employees}
          canManage={canManageEmployees}
        />
        <EmployeePayrollRollupClient
          initialMonth={currentMonth}
          initialData={payroll}
        />
        <EmployeeProductivityClient
          initialMonth={currentMonth}
          initialData={productivity}
        />
      </div>
    </HeadquartersShell>
  );
}
