import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { PageHeader } from "~/components/page-header";
import { PermissionAction } from "../../../../../generated/prisma";
import { hasActionPermission, requireLaborViewAccess } from "~/server/authz";
import {
  getEmployeeList,
  getEmployeeProductivityAnalysis,
  getHistoricalEmployeeList,
} from "~/features/labor/employees-queries";
import { getKstBusinessDateParam } from "~/features/ledger/date";
import { EmployeeManagementClient } from "~/features/labor/components/employee-management-client";
import { EmployeeProductivityClient } from "~/features/labor/components/employee-productivity-client";

export default async function EmployeesPage() {
  // WO-0806 #5: 직원 관리는 대표(LABOR_VIEW) 전용이다.
  const user = await requireLaborViewAccess();
  const currentMonth = getKstBusinessDateParam().slice(0, 7);
  const [
    employees,
    historicalEmployees,
    productivity,
    navigationItems,
    canManageEmployees,
  ] = await Promise.all([
    getEmployeeList(currentMonth),
    getHistoricalEmployeeList(),
    // WO-E(2026-06-22): 월간 생산성/인력 배치 분석.
    getEmployeeProductivityAnalysis(currentMonth),
    getHeadquartersNavigationItems(user.id),
    hasActionPermission(user.id, PermissionAction.LABOR_VIEW),
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
          initialHistoricalEmployees={historicalEmployees}
          canManage={canManageEmployees}
          summaryMonth={currentMonth}
        />
        <EmployeeProductivityClient
          initialMonth={currentMonth}
          initialData={productivity}
        />
      </div>
    </HeadquartersShell>
  );
}
