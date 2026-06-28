import Link from "next/link";
import { DownloadIcon } from "lucide-react";

import { PermissionAction } from "../../../../../generated/prisma";
import { Button } from "~/components/ui/button";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { Input } from "~/components/ui/input";
import { MetricCard } from "~/components/metric-card";
import { PageHeader } from "~/components/page-header";
import { DailyMeetingReportTable } from "~/features/reports/components/daily-meeting-report-table";
import { ProductCategoryMarginChart } from "~/features/reports/components/product-category-margin-chart";
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

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="아침 회의 리포트"
          description={`${dateLabel} 기준 전체 지점의 마감 상태, 이상 신호, 매출, 손실 현황을 봅니다.`}
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
              <Button asChild variant="outline" size="sm">
                <a href={exportHref}>
                  <DownloadIcon data-icon="inline-start" />
                  CSV
                </a>
              </Button>
            ) : null}
          </form>
        </div>
      </div>

      <section
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
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="text-base font-semibold">냉동/생물 매출 (추정)</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          품목별 POS 매출이 없어 재고 흐름 기반 추정값입니다.
        </p>
        <div className="mt-3">
          <ProductCategoryMarginChart data={report.categoryPerformance} />
        </div>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="text-base font-semibold">
          지점별 {dateLabel} 매출·이익률 (추정)
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          버튼으로 이익률과 매출액을 전환해 모든 지점을 한눈에 봅니다.
        </p>
        <div className="mt-3">
          <StoreDailyPerformanceChart rows={report.rows} />
        </div>
      </section>

      <section className="rounded-lg border p-4">
        {/* WO-04(2026-06-28): 제목을 "품목별 판매 현황 (추정)"으로 통일하고 표를 추가한다. */}
        <h2 className="text-base font-semibold">품목별 판매 현황 (추정)</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          냉동/생물 카테고리 합계를 품목 단위로 펼친 추정값입니다.
        </p>
        <div className="mt-3">
          <ProductProfitabilityReport data={report.productProfitability} />
        </div>
      </section>

      <DailyMeetingReportTable report={report} />
    </HeadquartersShell>
  );
}
