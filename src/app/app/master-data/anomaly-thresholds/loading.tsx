import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

const fields = [
  "sales-drop",
  "gross-margin-drop",
  "sales-difference",
  "loss-amount",
  "inventory-difference",
];

export default function AnomalyThresholdSettingsLoading() {
  return (
    <HeadquartersShell userName="본사 사용자" userEmail="loading">
      <PageHeader
        title="이상 신호 기준값"
        description="기준값 설정을 불러오는 중입니다."
      />
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-full max-w-md" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {fields.map((field) => (
              <div key={field} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </HeadquartersShell>
  );
}
