import Link from "next/link";

import { Button } from "~/components/ui/button";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { HqDashboardTable } from "~/features/dashboard/components/hq-dashboard-table";
import {
  getDashboardDatePreset,
  getHqDashboardRows,
} from "~/features/dashboard/queries";
import { requireHeadquartersUser } from "~/server/authz";

type DashboardPageProps = {
  searchParams: Promise<{
    date?: string | string[];
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
  const dashboard = await getHqDashboardRows({ datePreset });
  const dateLabel = dashboard.datePreset === "today" ? "오늘" : "어제";
  const summaryItems = [
    { label: "활성 지점", value: dashboard.summary.totalStores },
    { label: "검토 대기", value: dashboard.summary.reviewCount },
    { label: "본사마감", value: dashboard.summary.closedCount },
    { label: "미입력", value: dashboard.summary.emptyCount },
    { label: "손실 있음", value: dashboard.summary.lossCount },
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
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="조회 날짜 선택"
        >
          <Button
            asChild
            variant={dashboard.datePreset === "today" ? "default" : "outline"}
          >
            <Link
              href="/app/dashboard?date=today"
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
              href="/app/dashboard?date=yesterday"
              aria-current={
                dashboard.datePreset === "yesterday" ? "page" : undefined
              }
            >
              어제
            </Link>
          </Button>
        </div>
      </div>

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        aria-label="관제판 요약"
      >
        {summaryItems.map((item) => (
          <div key={item.label} className="bg-background rounded-lg border p-4">
            <p className="text-muted-foreground text-sm">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-normal">
              {item.value.toLocaleString("ko-KR")}
            </p>
          </div>
        ))}
      </section>

      <HqDashboardTable dashboard={dashboard} />
    </HeadquartersShell>
  );
}
