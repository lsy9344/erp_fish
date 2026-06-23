import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

const summaryCards = ["total", "store", "common"];

export default function HeadquartersExpensesLoading() {
  return (
    <HeadquartersShell userName="본사 사용자" userEmail="loading">
      <PageHeader
        title="본사 지출"
        description="본사 지출 현황을 불러오는 중입니다."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {summaryCards.map((card) => (
          <div key={card} className="bg-card rounded-lg border p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-2 h-6 w-32" />
          </div>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-full max-w-md" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </CardContent>
      </Card>
      <div className="bg-card rounded-lg border p-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="mt-3 h-8 w-full" />
        <Skeleton className="mt-2 h-8 w-full" />
      </div>
    </HeadquartersShell>
  );
}
