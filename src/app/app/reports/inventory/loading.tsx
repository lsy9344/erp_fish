import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { Skeleton } from "~/components/ui/skeleton";

const summarySkeletons = ["지점", "품목", "입력", "미입력", "금액"];
const desktopRows = ["desktop-1", "desktop-2", "desktop-3", "desktop-4"];
const desktopColumns = [
  "w-24",
  "w-28",
  "w-16",
  "w-16",
  "w-20",
  "w-16",
  "w-16",
  "w-20",
  "w-20",
  "w-16",
  "w-24",
  "w-16",
];
const mobileRows = ["mobile-1", "mobile-2", "mobile-3"];

export default function InventoryPositionReportLoading() {
  return (
    <HeadquartersShell userName="본사 사용자" userEmail="loading">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="전 지점 재고 현황"
          description="전 지점 남은 재고를 불러오는 중입니다."
        />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        aria-label="전 지점 재고 현황 요약 불러오기"
      >
        {summarySkeletons.map((item) => (
          <div key={item} className="bg-background rounded-lg border p-4">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-3 h-8 w-12" />
          </div>
        ))}
      </section>

      <section
        className="space-y-3"
        aria-label="전 지점 재고 현황 목록 불러오기"
      >
        <div className="bg-background hidden overflow-x-auto rounded-lg border p-3 md:block">
          <div className="min-w-[1180px] space-y-3">
            <div className="grid grid-cols-12 gap-3 border-b pb-3">
              {desktopColumns.map((width, index) => (
                <Skeleton key={`head-${index}`} className={`h-4 ${width}`} />
              ))}
            </div>
            {desktopRows.map((row) => (
              <div key={row} className="grid grid-cols-12 items-center gap-3">
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
                  <Skeleton className="h-5 w-36" />
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
