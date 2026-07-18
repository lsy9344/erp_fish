import Link from "next/link";
import { DownloadIcon } from "lucide-react";

import { PermissionAction } from "../../../../../generated/prisma";
import { Button } from "~/components/ui/button";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { Input } from "~/components/ui/input";
import { MetricCard } from "~/components/metric-card";
import { PageHeader } from "~/components/page-header";
import { DailyAttendanceReport } from "~/features/reports/components/daily-attendance-report";
import { DailyMeetingReportTable } from "~/features/reports/components/daily-meeting-report-table";
import { DailySalesAnalysis } from "~/features/reports/components/daily-sales-analysis";
import { ProductProfitabilityReport } from "~/features/reports/components/product-profitability-report";
import { StoreDailyPerformanceChart } from "~/features/reports/components/store-daily-performance-chart";
import {
  getDailyMeetingReportDateQuery,
  getDailyMeetingReportPath,
  getHqDailyMeetingReport,
} from "~/features/reports/queries";
import { hasActionPermission, requireReportAccess } from "~/server/authz";

type DailyMeetingReportPageProps = {
  searchParams: Promise<{
    date?: string | string[];
  }>;
};

export default async function DailyMeetingReportPage({
  searchParams,
}: DailyMeetingReportPageProps) {
  const user = await requireReportAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const canExportReports = await hasActionPermission(
    user.id,
    PermissionAction.EXPORT_CREATE,
  );
  const params = await searchParams;
  const dateQuery = getDailyMeetingReportDateQuery(
    Array.isArray(params.date) ? params.date[0] : params.date,
  );
  const report = await getHqDailyMeetingReport({ dateQuery });
  const dateLabel =
    report.datePreset === "today"
      ? "오늘"
      : report.datePreset === "yesterday"
        ? "어제"
        : report.dateInput;
  const summaryItems = [
    {
      label: "활성 지점",
      value: report.summary.totalStores,
      variant: "default" as const,
    },
    {
      label: "본사 마감",
      value: report.summary.closedCount,
      variant: "success" as const,
    },
    {
      label: "검토 대기",
      value: report.summary.reviewCount,
      variant: "warning" as const,
    },
    {
      label: "미입력",
      value: report.summary.emptyCount,
      variant: "muted" as const,
    },
    {
      label: "손실 있음",
      value: report.summary.lossCount,
      variant: "danger" as const,
    },
  ];
  const exportHref = `/api/reports/export?${new URLSearchParams({
    report: "daily",
    date: report.dateInput,
    format: "csv",
  }).toString()}`;
  // WO-15(2026-06-28): xlsx 다운로드. CSV는 보조로 유지.
  const exportXlsxHref = `/api/reports/export?${new URLSearchParams({
    report: "daily",
    date: report.dateInput,
    format: "xlsx",
  }).toString()}`;

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="아침 회의 리포트"
          description={`${dateLabel} 기준 전체 지점의 매출 변화·재고비율, 품목 판매, 직원 근태, 마감·이상 신호를 봅니다.`}
        />
        <div className="flex flex-col gap-2 md:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <Link href={getDailyMeetingReportPath({ dateQuery })}>
                아침 회의
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/comparison">기간 비교</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/inventory">재고 현황</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/ecount-supply">출고/입고</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/monthly">월간</Link>
            </Button>
            {/* WO-16(2026-06-28): 품목/매출 검토 차트 페이지. */}
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/product-review">품목 검토</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/sales-review">매출 검토</Link>
            </Button>
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            aria-label="빠른 날짜 선택"
          >
            <Button
              asChild
              variant={report.dateQuery === "today" ? "default" : "outline"}
            >
              <Link
                href={getDailyMeetingReportPath({ dateQuery: "today" })}
                aria-current={report.dateQuery === "today" ? "page" : undefined}
              >
                오늘
              </Link>
            </Button>
            <Button
              asChild
              variant={report.dateQuery === "yesterday" ? "default" : "outline"}
            >
              <Link
                href={getDailyMeetingReportPath({ dateQuery: "yesterday" })}
                aria-current={
                  report.dateQuery === "yesterday" ? "page" : undefined
                }
              >
                어제
              </Link>
            </Button>
          </div>
          <form
            action="/app/reports/daily"
            className="flex flex-wrap items-end gap-2"
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

      <section className="rounded-lg border p-4">
        <h2 className="text-base font-semibold">지점별 매출·이익률</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          막대는 정정 반영 총매출이며, 실제 이익률은 매출과 매출원가로, 예상
          이익률은 재고 흐름과 계획 판매가로 계산합니다. 버튼은 정렬 기준만
          변경합니다.
        </p>
        <div className="mt-3">
          <StoreDailyPerformanceChart rows={report.rows} />
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="text-base font-semibold">매출 분석</h2>
        <div className="mt-3">
          <DailySalesAnalysis data={report.salesAnalysis} />
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="text-base font-semibold">품목별 판매 현황</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          재고 흐름으로 계산한 판매수량 기준 상위 품목입니다.
        </p>
        <div className="mt-3">
          <ProductProfitabilityReport
            data={report.productProfitability}
            mode="table"
            tableVariant="salesRanking"
          />
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="text-base font-semibold">직원 근태 현황</h2>
        <div className="mt-3">
          <DailyAttendanceReport attendance={report.attendance} />
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="closing-signals-title">
        <h2 id="closing-signals-title" className="text-base font-semibold">
          마감·이상 신호 현황
        </h2>
        <div
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
          aria-label="아침 회의 리포트 요약"
        >
          {summaryItems.map((item) => (
            <MetricCard
              key={item.label}
              label={item.label}
              value={item.value.toLocaleString("ko-KR")}
              variant={item.variant}
            />
          ))}
        </div>
        <DailyMeetingReportTable report={report} />
      </section>
    </HeadquartersShell>
  );
}
