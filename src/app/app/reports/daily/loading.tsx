import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { Skeleton } from "~/components/ui/skeleton";

const fiveItems = ["1", "2", "3", "4", "5"];
const rows = ["1", "2", "3"];

export default function DailyMeetingReportLoading() {
  return (
    <HeadquartersShell userName="본사 사용자" userEmail="loading">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="아침 회의 리포트"
          description="전체 지점 회의용 요약을 불러오는 중입니다."
        />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-16" />
        </div>
      </div>

      <LoadingSection title="지점별 매출·이익률">
        <Skeleton className="h-56 w-full" />
      </LoadingSection>

      <LoadingSection title="매출 분석">
        <div className="grid gap-3 lg:grid-cols-3">
          {["증감", "포지션", "재고"].map((item) => (
            <div key={item} className="rounded-md border p-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="mt-3 h-32 w-full" />
            </div>
          ))}
        </div>
      </LoadingSection>

      <LoadingSection title="직원 근태 현황">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {fiveItems.slice(0, 4).map((item) => (
            <Skeleton key={`attendance-${item}`} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="mt-3 hidden h-48 w-full md:block" />
        <div className="mt-3 grid gap-3 md:hidden">
          {rows.map((row) => (
            <Skeleton
              key={`attendance-mobile-${row}`}
              className="h-36 w-full"
            />
          ))}
        </div>
      </LoadingSection>

      <LoadingSection title="품목별 판매 현황">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-3 h-48 w-full" />
      </LoadingSection>

      <LoadingSection title="마감·이상 신호 현황" bordered={false}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {fiveItems.map((item) => (
            <Skeleton key={`summary-${item}`} className="h-24 w-full" />
          ))}
        </div>
        <div className="mt-3 hidden overflow-x-auto rounded-lg border p-3 md:block">
          <div className="flex min-w-[900px] flex-col gap-3">
            {rows.map((row) => (
              <Skeleton key={`closing-${row}`} className="h-10 w-full" />
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:hidden">
          {rows.map((row) => (
            <Skeleton key={`closing-mobile-${row}`} className="h-40 w-full" />
          ))}
        </div>
      </LoadingSection>
    </HeadquartersShell>
  );
}

function LoadingSection({
  title,
  children,
  bordered = true,
}: {
  title: string;
  children: React.ReactNode;
  bordered?: boolean;
}) {
  return (
    <section className={bordered ? "rounded-lg border p-4" : "grid gap-3"}>
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
