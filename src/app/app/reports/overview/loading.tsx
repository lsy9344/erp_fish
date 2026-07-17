import { Skeleton } from "~/components/ui/skeleton";

export default function HqReportOverviewLoading() {
  return (
    <div
      className="grid gap-4"
      aria-label="통합 리포트 불러오는 중"
      aria-busy="true"
    >
      <Skeleton className="h-16 w-full" />
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
  );
}
