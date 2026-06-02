import Link from "next/link";

import { Button } from "~/components/ui/button";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { Input } from "~/components/ui/input";
import { PageHeader } from "~/components/page-header";
import { DailyMeetingReportTable } from "~/features/reports/components/daily-meeting-report-table";
import {
  getDailyMeetingReportDateQuery,
  getDailyMeetingReportPath,
  getHqDailyMeetingReport,
} from "~/features/reports/queries";
import { requireHeadquartersUser } from "~/server/authz";

type DailyMeetingReportPageProps = {
  searchParams: Promise<{
    date?: string | string[];
  }>;
};

export default async function DailyMeetingReportPage({
  searchParams,
}: DailyMeetingReportPageProps) {
  const user = await requireHeadquartersUser();
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
    { label: "활성 지점", value: report.summary.totalStores },
    { label: "본사마감", value: report.summary.closedCount },
    { label: "검토 대기", value: report.summary.reviewCount },
    { label: "미입력", value: report.summary.emptyCount },
    { label: "손실 있음", value: report.summary.lossCount },
  ];

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
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
          </form>
        </div>
      </div>

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        aria-label="아침 회의 리포트 요약"
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

      <DailyMeetingReportTable report={report} />
    </HeadquartersShell>
  );
}
