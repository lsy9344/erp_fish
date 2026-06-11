import Link from "next/link";

import { Button } from "~/components/ui/button";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { Input } from "~/components/ui/input";
import { PageHeader } from "~/components/page-header";
import { StoreComparisonReportTable } from "~/features/reports/components/store-comparison-report-table";
import {
  getHqStoreComparisonReport,
  getStoreComparisonReportPath,
} from "~/features/reports/queries";
import { requireReportAccess } from "~/server/authz";

type StoreComparisonReportPageProps = {
  searchParams: Promise<{
    startDate?: string | string[];
    endDate?: string | string[];
  }>;
};

export default async function StoreComparisonReportPage({
  searchParams,
}: StoreComparisonReportPageProps) {
  const user = await requireReportAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const params = await searchParams;
  const startDate = Array.isArray(params.startDate)
    ? params.startDate[0]
    : params.startDate;
  const endDate = Array.isArray(params.endDate)
    ? params.endDate[0]
    : params.endDate;
  const report = await getHqStoreComparisonReport({ startDate, endDate });

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="기간 비교 리포트"
          description={`${report.range.startDateInput}부터 ${report.range.endDateInput}까지 지점별 실적을 비교합니다.`}
        />
        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/daily">아침 회의</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={getStoreComparisonReportPath(report.range)}>
                기간 비교
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/monthly">월간</Link>
            </Button>
          </div>
          <form
            action="/app/reports/comparison"
            className="flex flex-wrap items-end gap-2"
          >
            <div className="grid gap-1">
              <label
                className="text-muted-foreground text-xs"
                htmlFor="startDate"
              >
                시작일
              </label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={report.range.startDateInput}
                className="h-9 w-36"
              />
            </div>
            <div className="grid gap-1">
              <label
                className="text-muted-foreground text-xs"
                htmlFor="endDate"
              >
                종료일
              </label>
              <Input
                id="endDate"
                name="endDate"
                type="date"
                defaultValue={report.range.endDateInput}
                className="h-9 w-36"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              조회
            </Button>
          </form>
        </div>
      </div>

      {report.range.errorMessage ? (
        <p className="bg-muted text-muted-foreground rounded-lg border px-4 py-3 text-sm break-words">
          {report.range.errorMessage}
        </p>
      ) : null}

      <StoreComparisonReportTable report={report} />
    </HeadquartersShell>
  );
}
