import Link from "next/link";

import { Button } from "~/components/ui/button";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { MetricCard } from "~/components/metric-card";
import { PageHeader } from "~/components/page-header";
import { HqDashboardTable } from "~/features/dashboard/components/hq-dashboard-table";
import {
  getDashboardFilterMode,
  getDashboardDatePreset,
  getDashboardPath,
  getDashboardSortMode,
  getHqDashboardRows,
} from "~/features/dashboard/queries";
import { requireHeadquartersUser } from "~/server/authz";

type DashboardPageProps = {
  searchParams: Promise<{
    date?: string | string[];
    sort?: string | string[];
    filter?: string | string[];
  }>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await requireHeadquartersUser();
  const params = await searchParams;
  const datePreset = getDashboardDatePreset(
    Array.isArray(params.date) ? params.date[0] : params.date,
  );
  const sortMode = getDashboardSortMode(
    Array.isArray(params.sort) ? params.sort[0] : params.sort,
  );
  const filterMode = getDashboardFilterMode(
    Array.isArray(params.filter) ? params.filter[0] : params.filter,
  );
  const dashboard = await getHqDashboardRows({
    datePreset,
    sortMode,
    filterMode,
  });
  const dateLabel = dashboard.datePreset === "today" ? "오늘" : "어제";
  const summaryItems = [
    {
      label: "활성 지점",
      value: dashboard.summary.totalStores,
      variant: "default" as const,
    },
    {
      label: "검토 대기",
      value: dashboard.summary.reviewCount,
      variant: "warning" as const,
    },
    {
      label: "본사마감",
      value: dashboard.summary.closedCount,
      variant: "success" as const,
    },
    {
      label: "미입력",
      value: dashboard.summary.emptyCount,
      variant: "muted" as const,
    },
    {
      label: "손실 있음",
      value: dashboard.summary.lossCount,
      variant: "danger" as const,
    },
  ];

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="관제판"
          description={`${dateLabel} 장부 기준으로 활성 지점의 입력, 검토, 마감 상태를 봅니다.`}
        />
        <div className="flex flex-col gap-2 md:items-end">
          <div
            className="flex flex-wrap items-center gap-2"
            aria-label="조회 날짜 선택"
          >
            <Button
              asChild
              variant={dashboard.datePreset === "today" ? "default" : "outline"}
            >
              <Link
                href={getDashboardPath({
                  datePreset: "today",
                  sortMode: dashboard.sortMode,
                  filterMode: dashboard.filterMode,
                })}
                aria-current={
                  dashboard.datePreset === "today" ? "page" : undefined
                }
              >
                오늘
              </Link>
            </Button>
            <Button
              asChild
              variant={
                dashboard.datePreset === "yesterday" ? "default" : "outline"
              }
            >
              <Link
                href={getDashboardPath({
                  datePreset: "yesterday",
                  sortMode: dashboard.sortMode,
                  filterMode: dashboard.filterMode,
                })}
                aria-current={
                  dashboard.datePreset === "yesterday" ? "page" : undefined
                }
              >
                어제
              </Link>
            </Button>
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            aria-label="관제판 정렬 선택"
          >
            <Button
              asChild
              variant={
                dashboard.sortMode === "priority" ? "default" : "outline"
              }
            >
              <Link
                href={getDashboardPath({
                  datePreset: dashboard.datePreset,
                  sortMode: "priority",
                  filterMode: dashboard.filterMode,
                })}
                aria-current={
                  dashboard.sortMode === "priority" ? "page" : undefined
                }
              >
                문제 우선순
              </Link>
            </Button>
            <Button
              asChild
              variant={
                dashboard.sortMode === "store-name" ? "default" : "outline"
              }
            >
              <Link
                href={getDashboardPath({
                  datePreset: dashboard.datePreset,
                  sortMode: "store-name",
                  filterMode: dashboard.filterMode,
                })}
                aria-current={
                  dashboard.sortMode === "store-name" ? "page" : undefined
                }
              >
                지점명순
              </Link>
            </Button>
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            aria-label="관제판 필터 선택"
          >
            <Button
              asChild
              variant={dashboard.filterMode === "all" ? "default" : "outline"}
            >
              <Link
                href={getDashboardPath({
                  datePreset: dashboard.datePreset,
                  sortMode: dashboard.sortMode,
                  filterMode: "all",
                })}
                aria-current={
                  dashboard.filterMode === "all" ? "page" : undefined
                }
              >
                전체
              </Link>
            </Button>
            <Button
              asChild
              variant={
                dashboard.filterMode === "needs-attention"
                  ? "default"
                  : "outline"
              }
            >
              <Link
                href={getDashboardPath({
                  datePreset: dashboard.datePreset,
                  sortMode: dashboard.sortMode,
                  filterMode: "needs-attention",
                })}
                aria-current={
                  dashboard.filterMode === "needs-attention"
                    ? "page"
                    : undefined
                }
              >
                확인 필요
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        aria-label="관제판 요약"
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

      <HqDashboardTable dashboard={dashboard} />
    </HeadquartersShell>
  );
}
