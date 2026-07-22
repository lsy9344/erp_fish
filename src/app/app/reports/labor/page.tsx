import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { PageHeader } from "~/components/page-header";
import { HeadquartersLaborReportView } from "~/features/labor/components/headquarters-labor-report";
import { getHeadquartersLaborReport } from "~/features/labor/headquarters-labor-queries";
import { ReportsNav } from "~/features/reports/components/reports-nav";
import { requireReportAccess } from "~/server/authz";

type HeadquartersLaborReportPageProps = {
  searchParams: Promise<{
    month?: string | string[];
    storeId?: string | string[];
    status?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HeadquartersLaborReportPage({
  searchParams,
}: HeadquartersLaborReportPageProps) {
  const user = await requireReportAccess();
  const params = await searchParams;
  const [navigationItems, report] = await Promise.all([
    getHeadquartersNavigationItems(user.id),
    getHeadquartersLaborReport({
      month: firstParam(params.month),
      storeId: firstParam(params.storeId),
      status: firstParam(params.status),
    }),
  ]);

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <ReportsNav active="labor" />

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="인건비 현황"
          description="지점장이 입력한 근무자별 인건비와 지점 합계를 읽기 전용으로 확인합니다."
        />
        <form
          action="/app/reports/labor"
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
              defaultValue={report.monthInput}
              className="h-9 w-36"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-muted-foreground text-xs" htmlFor="storeId">
              지점
            </label>
            <select
              id="storeId"
              name="storeId"
              defaultValue={report.selectedStoreId ?? ""}
              className="border-input bg-card ring-offset-background focus-visible:ring-ring h-9 min-w-40 rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <option value="">전체 지점</option>
              {report.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <label className="text-muted-foreground text-xs" htmlFor="status">
              장부 상태
            </label>
            <select
              id="status"
              name="status"
              defaultValue={report.selectedStatus}
              className="border-input bg-card ring-offset-background focus-visible:ring-ring h-9 min-w-32 rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <option value="ALL">전체 상태</option>
              <option value="IN_PROGRESS">작성 중</option>
              <option value="IN_REVIEW">검토 중</option>
              <option value="HEADQUARTERS_CLOSED">본사 마감</option>
            </select>
          </div>
          <Button type="submit" variant="outline" size="sm">
            조회
          </Button>
        </form>
      </div>

      {report.errorMessages.map((message) => (
        <p
          key={message}
          className="bg-muted text-muted-foreground rounded-lg border px-4 py-3 text-sm"
        >
          {message}
        </p>
      ))}

      <HeadquartersLaborReportView report={report} />
    </HeadquartersShell>
  );
}
