import Link from "next/link";
import { notFound } from "next/navigation";

import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { DashboardSignalSummary } from "~/features/dashboard/components/dashboard-signal-summary";
import { DashboardStatusBadge } from "~/features/dashboard/components/dashboard-status-badge";
import {
  getDashboardDatePreset,
  getDashboardFilterMode,
  getDashboardPath,
  getDashboardSortMode,
  getHqLedgerDetail,
} from "~/features/dashboard/queries";
import {
  saveHqLedgerExpenses,
  saveHqLedgerPurchases,
  saveHqLedgerSalesPayment,
  saveHqLedgerWorkInfo,
} from "~/features/ledger/hq-edit-actions";
import { ExpenseStepClient } from "~/features/ledger/components/expense-step-client";
import { PurchaseStepClient } from "~/features/ledger/components/purchase-step-client";
import { SalesPaymentStepClient } from "~/features/ledger/components/sales-payment-step-client";
import { WorkStepClient } from "~/features/ledger/components/workstep-client";
import { getLedgerCostStepDataById } from "~/features/ledger/queries";
import {
  saveHqLedgerInventoryAdjustment,
  saveHqLedgerInventoryItems,
} from "~/features/inventory/hq-edit-actions";
import { InventoryStepClient } from "~/features/inventory/components/inventory-step-client";
import { getInventoryStepDataByLedgerId } from "~/features/inventory/queries";
import { saveHqLedgerLosses } from "~/features/losses/hq-edit-actions";
import { LossStepClient } from "~/features/losses/components/loss-step-client";
import { getLossStepDataByLedgerId } from "~/features/losses/queries";
import { getActiveLedgerInputCodeOptions } from "~/features/master-data/code-queries";
import { getActiveProductOptions } from "~/features/master-data/product-queries";
import { getActivePurchaseStandardOptions } from "~/features/master-data/purchase-standard-queries";
import { requireHeadquartersUser } from "~/server/authz";

type LedgerDetailPageProps = {
  params: Promise<{
    ledgerId: string;
  }>;
  searchParams: Promise<{
    date?: string | string[];
    sort?: string | string[];
    filter?: string | string[];
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
const dateTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  dateStyle: "medium",
  timeStyle: "short",
});

const hqLedgerLabel = "본사 검토 장부";

export default async function LedgerDetailPage({
  params,
  searchParams,
}: LedgerDetailPageProps) {
  const user = await requireHeadquartersUser();
  const { ledgerId } = await params;
  const query = await searchParams;
  const dashboardPath = getDashboardPath({
    datePreset: getDashboardDatePreset(
      Array.isArray(query.date) ? query.date[0] : query.date,
    ),
    sortMode: getDashboardSortMode(
      Array.isArray(query.sort) ? query.sort[0] : query.sort,
    ),
    filterMode: getDashboardFilterMode(
      Array.isArray(query.filter) ? query.filter[0] : query.filter,
    ),
  });
  const [
    detail,
    ledger,
    inventoryData,
    lossData,
    expenseCodeOptions,
    productOptions,
    purchaseStandardOptions,
  ] = await Promise.all([
    getHqLedgerDetail(ledgerId),
    getLedgerCostStepDataById(ledgerId),
    getInventoryStepDataByLedgerId(ledgerId),
    getLossStepDataByLedgerId(ledgerId),
    getActiveLedgerInputCodeOptions("EXPENSE_ITEM"),
    getActiveProductOptions(),
    getActivePurchaseStandardOptions(),
  ]);

  if (!detail || !ledger || !inventoryData || !lossData) {
    notFound();
  }

  const isOriginalEditBlocked =
    ledger.status === "HEADQUARTERS_CLOSED" || ledger.status === "HOLIDAY";
  const lastModifiedBy =
    detail.lastModifiedBy?.name ?? detail.lastModifiedBy?.email ?? "수정자 없음";
  const lastModifiedAt = detail.lastModifiedAt
    ? dateTimeFormatter.format(new Date(detail.lastModifiedAt))
    : "수정 이력 없음";

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
          <Link href={dashboardPath}>관제판으로 돌아가기</Link>
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
        <p className="text-muted-foreground mt-3 text-sm">
          마지막 수정: {lastModifiedAt} · {lastModifiedBy}
        </p>
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

      {isOriginalEditBlocked ? (
        <Alert variant="destructive">
          <AlertTitle>본사 마감된 장부</AlertTitle>
          <AlertDescription>
            본사 마감된 장부와 휴무 장부는 원본 항목을 수정할 수 없습니다.
            정정 기록을 사용해 주세요.
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="sales" className="w-full">
        <TabsList className="min-h-11 w-full flex-wrap justify-start">
          <TabsTrigger value="sales" className="min-h-9 px-3">
            매출/결제
          </TabsTrigger>
          <TabsTrigger value="expenses" className="min-h-9 px-3">
            비용
          </TabsTrigger>
          <TabsTrigger value="purchases" className="min-h-9 px-3">
            매입
          </TabsTrigger>
          <TabsTrigger value="inventory" className="min-h-9 px-3">
            재고
          </TabsTrigger>
          <TabsTrigger value="losses" className="min-h-9 px-3">
            손실
          </TabsTrigger>
          <TabsTrigger value="work" className="min-h-9 px-3">
            근무
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-3">
          <SalesPaymentStepClient
            storeName={detail.storeName}
            initialLedger={ledger}
            currentStep="sales"
            saveAction={saveHqLedgerSalesPayment}
            showStepNavigation={false}
            ledgerLabel={hqLedgerLabel}
          />
        </TabsContent>
        <TabsContent value="expenses" className="mt-3">
          <ExpenseStepClient
            storeName={detail.storeName}
            initialLedger={ledger}
            expenseCodeOptions={expenseCodeOptions}
            currentStep="cost"
            saveAction={saveHqLedgerExpenses}
            showStepNavigation={false}
            ledgerLabel={hqLedgerLabel}
          />
        </TabsContent>
        <TabsContent value="purchases" className="mt-3">
          <PurchaseStepClient
            storeName={detail.storeName}
            initialLedger={ledger}
            productOptions={productOptions}
            purchaseStandardOptions={purchaseStandardOptions}
            currentStep="purchase"
            saveAction={saveHqLedgerPurchases}
            showStepNavigation={false}
            ledgerLabel={hqLedgerLabel}
          />
        </TabsContent>
        <TabsContent value="inventory" className="mt-3">
          <InventoryStepClient
            storeName={detail.storeName}
            initialData={inventoryData}
            saveItemsAction={saveHqLedgerInventoryItems}
            saveAdjustmentAction={saveHqLedgerInventoryAdjustment}
            ledgerLabel={hqLedgerLabel}
          />
        </TabsContent>
        <TabsContent value="losses" className="mt-3">
          <LossStepClient
            storeName={detail.storeName}
            initialData={lossData}
            saveAction={saveHqLedgerLosses}
            ledgerLabel={hqLedgerLabel}
          />
        </TabsContent>
        <TabsContent value="work" className="mt-3">
          <WorkStepClient
            storeName={detail.storeName}
            initialLedger={ledger}
            currentStep="work"
            saveAction={saveHqLedgerWorkInfo}
            showStepNavigation={false}
            ledgerLabel={hqLedgerLabel}
          />
        </TabsContent>
      </Tabs>
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
