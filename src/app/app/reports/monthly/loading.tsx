import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { Skeleton } from "~/components/ui/skeleton";

const summarySkeletons = ["closed", "review", "progress", "missing", "holiday"];
const desktopRows = ["desktop-1", "desktop-2", "desktop-3", "desktop-4"];
const mobileRows = ["mobile-1", "mobile-2", "mobile-3"];
const desktopColumns = [
  "w-16",
  "w-20",
  "w-32",
  "w-24",
  "w-20",
  "w-24",
  "w-16",
  "w-24",
];

export default function MonthlyClosingAnomalyReportLoading() {
  return (
    <HeadquartersShell userName="본사 사용자" userEmail="loading">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="월간 요약 리포트"
          description="선택 월의 핵심 성과와 손실/재고 흐름을 불러오는 중입니다."
        />
        <div className="flex flex-wrap items-end gap-2">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-8 w-14" />
        </div>
      </div>

      <section className="space-y-3" aria-label="월간 핵심 성과 불러오기">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div
              key={`kpi-${index}`}
              className="bg-background rounded-lg border p-4"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-3 h-8 w-32" />
              <Skeleton className="mt-2 h-3 w-20" />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3" aria-label="손실/재고 흐름 불러오기">
        <Skeleton className="h-6 w-32" />
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="bg-background rounded-lg border p-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-3 h-5 w-40" />
            <div className="mt-4 grid gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
          <div className="bg-background rounded-lg border p-4">
            <Skeleton className="h-5 w-28" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={`flow-${index}`} className="h-16 w-full" />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        aria-label="월간 마감 상태 요약 불러오기"
      >
        {summarySkeletons.map((item) => (
          <div key={item} className="bg-background rounded-lg border p-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-3 h-8 w-14" />
          </div>
        ))}
      </section>

      <section
        className="space-y-3"
        aria-label="월간 일자별 마감 현황 불러오기"
      >
        <div className="bg-background hidden overflow-x-auto rounded-lg border p-3 md:block">
          <div className="min-w-[1120px] space-y-3">
            <div className="grid grid-cols-8 gap-3 border-b pb-3">
              {desktopColumns.map((width, index) => (
                <Skeleton key={`head-${index}`} className={`h-4 ${width}`} />
              ))}
            </div>
            {desktopRows.map((row) => (
              <div key={row} className="grid grid-cols-8 items-center gap-3">
                {desktopColumns.map((width, index) => (
                  <Skeleton
                    key={`${row}-${index}`}
                    className={`h-7 ${width}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:hidden">
          {mobileRows.map((row) => (
            <article key={row} className="bg-background rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-4 w-full" />
                </div>
                <Skeleton className="h-6 w-16" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
              <Skeleton className="mt-4 h-6 w-28" />
            </article>
          ))}
        </div>
      </section>
    </HeadquartersShell>
  );
}
