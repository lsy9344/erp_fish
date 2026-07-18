import { DownloadIcon } from "lucide-react";

import { PermissionAction } from "../../../../../generated/prisma";
import { Button } from "~/components/ui/button";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { Input } from "~/components/ui/input";
import { PageHeader } from "~/components/page-header";
import { MonthlyClosingAnomalyReport } from "~/features/reports/components/monthly-closing-anomaly-report";
import { ReportsNav } from "~/features/reports/components/reports-nav";
import { getHqMonthlyClosingAnomalyReport } from "~/features/reports/queries";
import { getHeadquartersExpenseReportSummary } from "~/features/headquarters-expenses/queries";
import type { MonthlyHeadquartersExpenseSummary } from "~/features/reports/types";
import { hasActionPermission, requireReportAccess } from "~/server/authz";

type MonthlyClosingAnomalyReportPageProps = {
  searchParams: Promise<{
    month?: string | string[];
    storeId?: string | string[];
  }>;
};

export default async function MonthlyClosingAnomalyReportPage({
  searchParams,
}: MonthlyClosingAnomalyReportPageProps) {
  const user = await requireReportAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const canExportReports = await hasActionPermission(
    user.id,
    PermissionAction.EXPORT_CREATE,
  );
  const params = await searchParams;
  const month = Array.isArray(params.month) ? params.month[0] : params.month;
  const storeId = Array.isArray(params.storeId)
    ? params.storeId[0]
    : params.storeId;
  const report = await getHqMonthlyClosingAnomalyReport({ month, storeId });
  const canManageHeadquartersExpenses = await hasActionPermission(
    user.id,
    PermissionAction.SETTINGS_MANAGE,
  );
  let headquartersExpense: MonthlyHeadquartersExpenseSummary | null = null;

  if (canManageHeadquartersExpenses) {
    headquartersExpense = await getHeadquartersExpenseReportSummary({
      month: report.monthRange.monthInput,
    });
  }
  const reportTargetDescription = report.selectedStoreName
    ? `${report.monthRange.monthInput} ${report.selectedStoreName}의`
    : report.stores.length > 0
      ? `${report.monthRange.monthInput} 권한 있는 지점 선택 후`
      : `${report.monthRange.monthInput} 활성 지점 없음 상태에서`;
  const exportParams = new URLSearchParams({
    report: "monthly",
    month: report.monthRange.monthInput,
    format: "csv",
  });

  if (report.selectedStoreId) {
    exportParams.set("storeId", report.selectedStoreId);
  }

  const exportHref = `/api/reports/export?${exportParams.toString()}`;
  // WO-15(2026-06-28): 월별 xlsx에는 월별손익 시트가 함께 들어간다.
  const exportXlsxParams = new URLSearchParams(exportParams);
  exportXlsxParams.set("format", "xlsx");
  const exportXlsxHref = `/api/reports/export?${exportXlsxParams.toString()}`;

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <ReportsNav active="monthly" />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="월간 요약 리포트"
          description={`${reportTargetDescription} 핵심 성과와 손실/재고 흐름, 마감 상태를 봅니다.`}
        />
        <div className="flex flex-col gap-2 md:items-end">
          <form
            action="/app/reports/monthly"
            className="flex flex-wrap items-end gap-2"
          >
            <div className="grid gap-1">
              <label className="text-muted-foreground text-xs" htmlFor="month">
                조회 월
              </label>
              <Input
                id="month"
                name="month"
                type="month"
                defaultValue={report.monthRange.monthInput}
                className="h-9 w-36"
              />
            </div>
            <div className="grid gap-1">
              <label
                className="text-muted-foreground text-xs"
                htmlFor="storeId"
              >
                지점
              </label>
              <select
                id="storeId"
                name="storeId"
                defaultValue={report.selectedStoreId ?? ""}
                className="border-input bg-card ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-9 min-w-40 rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {report.stores.length === 0 ? (
                  <option value="">활성 지점 없음</option>
                ) : null}
                {report.stores.length > 0 && !report.selectedStoreId ? (
                  <option value="">지점을 선택해 주세요</option>
                ) : null}
                {report.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline" size="sm">
              조회
            </Button>
            {canExportReports ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <a href={exportXlsxHref}>
                    <DownloadIcon data-icon="inline-start" />
                    Excel
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={exportHref}>
                    <DownloadIcon data-icon="inline-start" />
                    CSV
                  </a>
                </Button>
              </>
            ) : null}
          </form>
        </div>
      </div>

      {report.errorMessages.length > 0 ? (
        <div className="grid gap-2">
          {report.errorMessages.map((message) => (
            <p
              key={message}
              className="bg-muted text-muted-foreground rounded-lg border px-4 py-3 text-sm break-words"
            >
              {message}
            </p>
          ))}
        </div>
      ) : null}

      <MonthlyClosingAnomalyReport
        report={report}
        headquartersExpense={headquartersExpense}
      />
    </HeadquartersShell>
  );
}
