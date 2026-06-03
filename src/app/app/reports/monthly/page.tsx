import Link from "next/link";

import { Button } from "~/components/ui/button";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { Input } from "~/components/ui/input";
import { PageHeader } from "~/components/page-header";
import { MonthlyClosingAnomalyReport } from "~/features/reports/components/monthly-closing-anomaly-report";
import {
  getHqMonthlyClosingAnomalyReport,
  getMonthlyClosingAnomalyReportPath,
} from "~/features/reports/queries";
import { requireHeadquartersUser } from "~/server/authz";

type MonthlyClosingAnomalyReportPageProps = {
  searchParams: Promise<{
    month?: string | string[];
    storeId?: string | string[];
  }>;
};

export default async function MonthlyClosingAnomalyReportPage({
  searchParams,
}: MonthlyClosingAnomalyReportPageProps) {
  const user = await requireHeadquartersUser();
  const params = await searchParams;
  const month = Array.isArray(params.month) ? params.month[0] : params.month;
  const storeId = Array.isArray(params.storeId)
    ? params.storeId[0]
    : params.storeId;
  const report = await getHqMonthlyClosingAnomalyReport({ month, storeId });
  const selectedStoreLabel = report.selectedStoreName ?? "활성 지점 없음";

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="월간 요약 리포트"
          description={`${report.monthRange.monthInput} ${selectedStoreLabel}의 핵심 성과와 손실/재고 흐름, 마감 상태를 봅니다.`}
        />
        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/daily">아침 회의</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/comparison">기간 비교</Link>
            </Button>
            <Button asChild size="sm">
              <Link
                href={getMonthlyClosingAnomalyReportPath({
                  monthInput: report.monthRange.monthInput,
                  storeId: report.selectedStoreId,
                })}
              >
                월간
              </Link>
            </Button>
          </div>
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

      <MonthlyClosingAnomalyReport report={report} />
    </HeadquartersShell>
  );
}
