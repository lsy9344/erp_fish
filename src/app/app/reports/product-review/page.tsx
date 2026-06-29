import Link from "next/link";

import { Button } from "~/components/ui/button";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { Input } from "~/components/ui/input";
import { PageHeader } from "~/components/page-header";
import { ProductCategoryMarginChart } from "~/features/reports/components/product-category-margin-chart";
import { ProductProfitabilityReport } from "~/features/reports/components/product-profitability-report";
import { ReviewViewToggle } from "~/features/reports/components/review-view-toggle";
import {
  getDailyMeetingReportDateQuery,
  getHqDailyMeetingReport,
} from "~/features/reports/queries";
import { requireReportAccess } from "~/server/authz";

type ProductReviewPageProps = {
  searchParams: Promise<{ date?: string | string[] }>;
};

// WO-16(2026-06-28): 본사 전용 품목 검토 페이지. 차트만 쉽게 보는 화면과 근거 표를
// 전환할 수 있게 한다. 데이터는 일별 리포트와 같은 소스를 쓴다(추정값).
export default async function ProductReviewPage({
  searchParams,
}: ProductReviewPageProps) {
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
      <PageHeader
        title="품목 검토 (추정)"
        description="품목군 분포와 품목별 판매 현황을 차트와 표로 확인합니다. POS 실판매가 아닌 재고 흐름 기반 추정값입니다."
      />

      <div className="flex flex-wrap items-end gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/app/reports/daily">일별 리포트</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/app/reports/sales-review">매출 검토</Link>
        </Button>
        <form
          action="/app/reports/product-review"
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
        <h2 className="text-base font-semibold">냉동/생물 매출 (추정)</h2>
        <div className="mt-3">
          <ProductCategoryMarginChart data={report.categoryPerformance} />
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="text-base font-semibold">품목별 판매 현황 (추정)</h2>
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
