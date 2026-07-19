import { Button } from "~/components/ui/button";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { Input } from "~/components/ui/input";
import { PageHeader } from "~/components/page-header";
import { ProductProfitabilityReport } from "~/features/reports/components/product-profitability-report";
import { ReportsNav } from "~/features/reports/components/reports-nav";
import { ReviewViewToggle } from "~/features/reports/components/review-view-toggle";
import { StoreDailyPerformanceChart } from "~/features/reports/components/store-daily-performance-chart";
import { DailyMeetingReportTable } from "~/features/reports/components/daily-meeting-report-table";
import {
  getDailyMeetingReportDateQuery,
  getHqDailyMeetingReport,
} from "~/features/reports/queries";
import { requireReportAccess } from "~/server/authz";

type SalesReviewPageProps = {
  searchParams: Promise<{ date?: string | string[] }>;
};

// WO-16(2026-06-28): 본사 전용 매출 검토 페이지. 지점별/품목별 추정 매출 흐름을 차트와
// 표로 전환해 본다. 데이터는 일별 리포트와 같은 소스를 쓴다(추정값).
export default async function SalesReviewPage({
  searchParams,
}: SalesReviewPageProps) {
  const user = await requireReportAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const params = await searchParams;
  const dateQuery = getDailyMeetingReportDateQuery(
    Array.isArray(params.date) ? params.date[0] : params.date,
  );
  const report = await getHqDailyMeetingReport({ dateQuery });

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <ReportsNav active="sales-review" />

      <PageHeader
        title="매출 검토 (추정)"
        description="기간/지점/품목별 추정 매출과 이익률 흐름을 차트와 표로 확인합니다. POS 실판매가 아닌 재고 흐름 기반 추정값입니다."
      />

      <div className="flex flex-wrap items-end gap-2">
        <form
          action="/app/reports/sales-review"
          className="flex items-end gap-2"
        >
          <div className="grid gap-1">
            <label className="text-muted-foreground text-xs" htmlFor="date">
              조회 날짜
            </label>
            <Input
              id="date"
              name="date"
              type="date"
              defaultValue={report.dateInput}
              className="h-9 w-36"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">
            조회
          </Button>
        </form>
      </div>

      <section className="rounded-lg border p-4">
        <h2 className="text-base font-semibold">
          지점별 장부 입력 매출·마진율
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          막대는 지점장이 입력한 총매출이며, 실제 마진율은 매출과 매출원가로,
          예상 마진율은 재고 흐름과 계획 판매가로 계산합니다. 버튼은 정렬 기준만
          바꿉니다.
        </p>
        <div className="mt-3">
          <ReviewViewToggle
            chart={<StoreDailyPerformanceChart rows={report.rows} />}
            table={<DailyMeetingReportTable report={report} />}
          />
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="text-base font-semibold">품목별 추정 매출</h2>
        <div className="mt-3">
          <ReviewViewToggle
            chart={
              <ProductProfitabilityReport
                data={report.productProfitability}
                mode="chart"
              />
            }
            table={
              <ProductProfitabilityReport
                data={report.productProfitability}
                mode="table"
              />
            }
          />
        </div>
      </section>
    </HeadquartersShell>
  );
}
