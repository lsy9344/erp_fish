import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "~/components/ui/button";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { DashboardSignalSummary } from "~/features/dashboard/components/dashboard-signal-summary";
import { DashboardStatusBadge } from "~/features/dashboard/components/dashboard-status-badge";
import { getHqLedgerDetail } from "~/features/dashboard/queries";
import { requireHeadquartersUser } from "~/server/authz";

type LedgerDetailPageProps = {
  params: Promise<{
    ledgerId: string;
  }>;
};

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0,
});
const percentFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default async function LedgerDetailPage({
  params,
}: LedgerDetailPageProps) {
  const user = await requireHeadquartersUser();
  const { ledgerId } = await params;
  const detail = await getHqLedgerDetail(ledgerId);

  if (!detail) {
    notFound();
  }

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title={`${detail.storeName} 장부 상세`}
          description={`${dateFormatter.format(
            new Date(detail.closingDate),
          )} 장부의 주요 숫자와 이상 신호 요약입니다.`}
        />
        <Button asChild variant="outline">
          <Link href="/app/dashboard">관제판으로 돌아가기</Link>
        </Button>
      </div>

      <section className="bg-background rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <DashboardStatusBadge status={detail.ledgerStatus} />
          <span className="text-muted-foreground text-sm">
            {detail.businessStatus.label}
          </span>
        </div>
        <DashboardSignalSummary
          signals={detail.signals}
          showDetails
          className="mt-4"
        />
      </section>

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="장부 주요 숫자"
      >
        <MetricCard label="매출" value={formatKrw(detail.salesAmount.value)} />
        <MetricCard
          label="마진율"
          value={formatPercentMetric(detail.grossMarginRate)}
        />
        <MetricCard
          label="매출 차이"
          value={formatKrwMetric(detail.salesDifference)}
        />
        <MetricCard
          label="손실"
          value={detail.hasLoss ? "손실 있음" : "없음"}
        />
      </section>
    </HeadquartersShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background rounded-lg border p-4">
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="mt-2 text-xl font-semibold tracking-normal break-words tabular-nums">
        {value}
      </p>
    </div>
  );
}

function formatKrw(value: number | null) {
  return value === null ? "-" : krwFormatter.format(value);
}

function formatKrwMetric(metric: {
  value: number | null;
  unavailableReason?: string;
}) {
  if (metric.value === null) {
    return metric.unavailableReason ?? "-";
  }

  return krwFormatter.format(metric.value);
}

function formatPercentMetric(metric: {
  value: number | null;
  unavailableReason?: string;
}) {
  if (metric.value === null) {
    return metric.unavailableReason ?? "-";
  }

  return percentFormatter.format(metric.value);
}
