import Link from "next/link";
import { DownloadIcon } from "lucide-react";

import { PermissionAction } from "../../../../../generated/prisma";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { HqReportOverview } from "~/features/reports/components/hq-report-overview";
import { getHqReportOverview } from "~/features/reports/overview";
import { hasActionPermission, requireReportAccess } from "~/server/authz";

type PageProps = {
  searchParams: Promise<{
    month?: string | string[];
    storeId?: string | string[];
  }>;
};

export default async function HqReportOverviewPage({
  searchParams,
}: PageProps) {
  const user = await requireReportAccess();
  const params = await searchParams;
  const month = Array.isArray(params.month) ? params.month[0] : params.month;
  const storeId = Array.isArray(params.storeId)
    ? params.storeId[0]
    : params.storeId;
  const [navigationItems, canExportReports, report] = await Promise.all([
    getHeadquartersNavigationItems(user.id),
    hasActionPermission(user.id, PermissionAction.EXPORT_CREATE),
    getHqReportOverview({ month, storeId }),
  ]);
  const canExportOverview =
    canExportReports &&
    report.errorMessages.length === 0 &&
    !report.monthRange.isFutureMonth;
  const exportParams = new URLSearchParams("report=comparison");
  exportParams.set("startDate", report.monthRange.startDateInput);
  exportParams.set("endDate", report.monthRange.endDateInput);
  exportParams.set("format", "xlsx");

  if (report.selectedStoreId) {
    exportParams.set("storeId", report.selectedStoreId);
  }

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <PageHeader
          title="통합 리포트"
          description="매출 흐름부터 손실 원인과 오늘의 조치 대상까지 한 화면에서 확인합니다."
        />
        <div className="flex flex-col gap-2 lg:items-end">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/daily">일별</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/comparison">기간 비교</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/monthly">월간 상세</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/inventory">재고</Link>
            </Button>
          </div>
          <form
            action="/app/reports/overview"
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
                className="border-input bg-card ring-offset-background focus-visible:ring-ring h-9 min-w-40 rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">전체 지점</option>
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
            {canExportOverview ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/reports/export?${exportParams.toString()}`}>
                  <DownloadIcon data-icon="inline-start" />
                  Excel
                </a>
              </Button>
            ) : null}
          </form>
        </div>
      </div>

      <HqReportOverview report={report} />
    </HeadquartersShell>
  );
}
