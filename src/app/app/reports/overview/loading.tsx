import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { Skeleton } from "~/components/ui/skeleton";

export default function HqReportOverviewLoading() {
  return (
    <HeadquartersShell userName="본사 사용자" userEmail="loading">
      <div
        className="grid gap-4"
        aria-label="통합 리포트 불러오는 중"
        aria-busy="true"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <PageHeader
            title="통합 리포트"
            description="매출 흐름과 조치 대상을 불러오는 중입니다."
          />
          <div className="flex flex-wrap items-end gap-2">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-8 w-14" />
          </div>
        </div>
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 xl:grid-cols-12">
          <Skeleton className="h-96 xl:col-span-8" />
          <Skeleton className="h-96 xl:col-span-4" />
          <Skeleton className="h-80 xl:col-span-6" />
          <Skeleton className="h-80 xl:col-span-6" />
          <Skeleton className="h-48 xl:col-span-12" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </HeadquartersShell>
  );
}
