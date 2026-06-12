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
    storeId?: string | string[];
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
  const storeId = Array.isArray(params.storeId)
    ? params.storeId[0]
    : params.storeId;
  const report = await getHqStoreComparisonReport({
    startDate,
    endDate,
    storeId,
  });
  const selectedStoreLabel = report.selectedStoreName ?? "전체 활성 지점";

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="기간 비교 리포트"
          description={`${report.range.startDateInput}부터 ${report.range.endDateInput}까지 ${selectedStoreLabel}의 단일 기간 지점별 실적을 비교합니다.`}
        />
        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/daily">아침 회의</Link>
            </Button>
            <Button asChild size="sm">
              <Link
                href={getStoreComparisonReportPath({
                  ...report.range,
                  storeId: report.selectedStoreId,
                })}
              >
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
                <option value="">전체 활성 지점</option>
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

      <StoreComparisonReportTable report={report} />
    </HeadquartersShell>
  );
}
