import Link from "next/link";
import { notFound } from "next/navigation";

import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { MetricCard } from "~/components/metric-card";
import { PageHeader } from "~/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { DashboardSignalSummary } from "~/features/dashboard/components/dashboard-signal-summary";
import { DashboardStatusBadge } from "~/features/dashboard/components/dashboard-status-badge";
import { createCorrectionRecord } from "~/features/corrections/actions";
import { CorrectionPanel } from "~/features/corrections/components/correction-panel";
import {
  buildCorrectionTargetKey,
  getCorrectionRecordsForLedger,
  getLatestCorrectionValueMap,
} from "~/features/corrections/queries";
import type {
  CorrectionAppliedValue,
  CorrectionTargetOption,
} from "~/features/corrections/types";
import {
  getDashboardDatePreset,
  getDashboardFilterMode,
  getDashboardPath,
  getDashboardSortMode,
  getHqLedgerDetail,
} from "~/features/dashboard/queries";
import { HqLedgerCloseDialog } from "~/features/ledger/components/hq-ledger-close-dialog";
import {
  saveHqLedgerExpenses,
  saveHqLedgerLaborInfo,
  saveHqLedgerPurchases,
  saveHqLedgerSalesPayment,
  saveHqLedgerWorkInfo,
} from "~/features/ledger/hq-edit-actions";
import { ExpenseStepClient } from "~/features/ledger/components/expense-step-client";
import { PurchaseStepClient } from "~/features/ledger/components/purchase-step-client";
import { SalesPaymentStepClient } from "~/features/ledger/components/sales-payment-step-client";
import { WorkStepClient } from "~/features/ledger/components/workstep-client";
import { getLedgerCostStepDataById } from "~/features/ledger/queries";
import { isLedgerReadOnly } from "~/features/ledger/status-policy";
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
import { getActiveEmployeeOptions } from "~/features/labor/employees-queries";
import { PermissionAction } from "../../../../../generated/prisma";
import { hasActionPermission, requireReportAccess } from "~/server/authz";

type LedgerDetailPageProps = {
  params: Promise<{
    ledgerId: string;
  }>;
  searchParams: Promise<{
    date?: string | string[];
    sort?: string | string[];
    filter?: string | string[];
    tab?: string | string[];
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
const ledgerDetailTabs = [
  "sales",
  "expenses",
  "purchases",
  "inventory",
  "losses",
  "work",
] as const;
type LedgerDetailTab = (typeof ledgerDetailTabs)[number];

function getLedgerDetailTab(
  value: string | string[] | undefined,
): LedgerDetailTab {
  const tab = Array.isArray(value) ? value[0] : value;

  return ledgerDetailTabs.includes(tab as LedgerDetailTab)
    ? (tab as LedgerDetailTab)
    : "sales";
}

export default async function LedgerDetailPage({
  params,
  searchParams,
}: LedgerDetailPageProps) {
  const user = await requireReportAccess();
  const [navigationItems, canEditLedger, canCloseLedger, canCreateCorrection] =
    await Promise.all([
      getHeadquartersNavigationItems(user.id),
      hasActionPermission(user.id, PermissionAction.LEDGER_EDIT),
      hasActionPermission(user.id, PermissionAction.LEDGER_HQ_CLOSE),
      hasActionPermission(user.id, PermissionAction.CORRECTION_CREATE),
    ]);
  const { ledgerId } = await params;
  const query = await searchParams;
  const selectedTab = getLedgerDetailTab(query.tab);
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
  const [detail, ledger, inventoryData, lossData, correctionRecords] =
    await Promise.all([
      getHqLedgerDetail(ledgerId),
      getLedgerCostStepDataById(ledgerId),
      getInventoryStepDataByLedgerId(ledgerId),
      getLossStepDataByLedgerId(ledgerId),
      getCorrectionRecordsForLedger(ledgerId),
    ]);

  if (!detail || !ledger || !inventoryData || !lossData) {
    notFound();
  }

  const [
    expenseCodeOptions,
    productOptions,
    purchaseStandardOptions,
    employeeOptions,
  ] = canEditLedger
    ? await Promise.all([
        getActiveLedgerInputCodeOptions("EXPENSE_ITEM"),
        getActiveProductOptions(),
        getActivePurchaseStandardOptions(),
        getActiveEmployeeOptions(),
      ])
    : [[], [], [], []];
  const isOriginalEditBlocked = isLedgerReadOnly(ledger.status);
  const lastModifiedBy =
    detail.lastModifiedBy?.name ??
    detail.lastModifiedBy?.email ??
    "수정자 없음";
  const lastModifiedAt = detail.lastModifiedAt
    ? dateTimeFormatter.format(new Date(detail.lastModifiedAt))
    : "수정 이력 없음";
  const closedBy =
    detail.closedBy?.name ?? detail.closedBy?.email ?? "마감자 없음";
  const closedAt = detail.closedAt
    ? dateTimeFormatter.format(new Date(detail.closedAt))
    : "마감 전";
  const canShowCorrectionPanel =
    ledger.status === "HEADQUARTERS_CLOSED" && canCreateCorrection;
  const correctionTargetOptions = canShowCorrectionPanel
    ? getCorrectionTargetOptions({
        ledger,
        inventoryData,
        lossData,
      })
    : [];
  const latestCorrectionValues = getLatestCorrectionValueMap(correctionRecords);
  const appliedCorrections = Array.from(latestCorrectionValues.values());
  const totalSalesCorrection = getAppliedCorrection(latestCorrectionValues, {
    dailyLedgerId: ledger.id,
    targetType: "PAYMENT_FIELD",
    targetId: ledger.id,
    fieldKey: "totalSalesAmount",
  });
  const totalSalesDisplay = totalSalesCorrection
    ? formatCorrectionValue(totalSalesCorrection.latestAppliedValue)
    : formatKrw(detail.salesAmount.value);

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
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

      <section className="bg-card rounded-lg border p-4 shadow-sm">
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
        className="bg-card rounded-lg border p-4 shadow-sm"
        aria-labelledby="hq-review-summary-heading"
      >
        <div className="flex flex-col gap-1">
          <h2 id="hq-review-summary-heading" className="text-lg font-semibold">
            검토 상태 요약
          </h2>
          <p className="text-muted-foreground text-sm">
            본사 조회 권한으로 확인 가능한 검증 상태와 action 권한입니다.
          </p>
        </div>
        <dl className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border p-3">
            <dt className="text-muted-foreground text-sm">검증 상태</dt>
            <dd className="mt-1 font-medium">
              {detail.signals.length > 0
                ? `확인 항목 ${detail.signals.length}건`
                : "표시할 이상 후보 없음"}
            </dd>
          </div>
          <div className="rounded-md border p-3">
            <dt className="text-muted-foreground text-sm">정정 상태</dt>
            <dd className="mt-1 font-medium">
              {formatHqCorrectionReviewStatus(detail.correctionState)}
            </dd>
          </div>
          <div className="rounded-md border p-3">
            <dt className="text-muted-foreground text-sm">수정 action</dt>
            <dd className="mt-1 font-medium">
              {canEditLedger && !isOriginalEditBlocked ? "허용" : "조회 전용"}
            </dd>
          </div>
          <div className="rounded-md border p-3">
            <dt className="text-muted-foreground text-sm">마감/정정 action</dt>
            <dd className="mt-1 font-medium">
              {formatHqCloseCorrectionActionStatus({
                canCloseLedger,
                canCreateCorrection,
                isOriginalEditBlocked,
                isHeadquartersClosed: ledger.status === "HEADQUARTERS_CLOSED",
              })}
            </dd>
          </div>
          {ledger.status === "HEADQUARTERS_CLOSED" ? (
            <div className="rounded-md border p-3">
              <dt className="text-muted-foreground text-sm">본사 마감 정보</dt>
              <dd className="mt-1 font-medium">
                {closedAt} · {closedBy}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="장부 주요 숫자"
      >
        <MetricCard label="매출" value={totalSalesDisplay}>
          {totalSalesCorrection ? (
            <div className="grid gap-1 text-xs">
              <span className="text-muted-foreground">
                원본:{" "}
                <span className="tabular-nums">
                  {formatCorrectionValue(totalSalesCorrection.originalValue)}
                </span>
              </span>
              <span className="font-medium">정정 반영</span>
            </div>
          ) : null}
        </MetricCard>
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

      {appliedCorrections.length > 0 ? (
        <section
          className="bg-card rounded-lg border p-4 shadow-sm"
          aria-labelledby="applied-corrections-title"
        >
          <div className="flex flex-col gap-1">
            <h2
              id="applied-corrections-title"
              className="text-lg font-semibold"
            >
              현재 정정 반영값
            </h2>
            <p className="text-muted-foreground text-sm">
              최신 정정 기록을 기준으로 원본값과 정정 반영값을 구분해
              표시합니다.
            </p>
          </div>
          <dl className="mt-4 grid gap-3 md:grid-cols-2">
            {appliedCorrections.map((correction) => (
              <div
                key={correction.key}
                className="bg-card rounded-md border p-3"
                aria-label={`${correction.targetLabel} 정정 반영값`}
              >
                <dt className="font-medium">{correction.targetLabel}</dt>
                <dd className="mt-2 grid gap-1 text-sm">
                  <span className="text-muted-foreground">
                    원본:{" "}
                    <span className="tabular-nums">
                      {formatCorrectionValue(correction.originalValue)}
                    </span>
                  </span>
                  <span>
                    정정 반영:{" "}
                    <span className="font-semibold tabular-nums">
                      {formatCorrectionValue(correction.latestAppliedValue)}
                    </span>
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {isOriginalEditBlocked ? (
        <Alert variant="destructive">
          <AlertTitle>본사 마감된 장부</AlertTitle>
          <AlertDescription>
            {
              "본사 마감된 장부와 휴무 장부는 원본 항목을 수정할 수 없습니다. 정정 기록을 사용해 주세요."
            }
          </AlertDescription>
        </Alert>
      ) : null}
      {!isOriginalEditBlocked && canCloseLedger ? (
        <section className="bg-card rounded-lg border p-4 shadow-sm">
          <HqLedgerCloseDialog
            ledgerId={ledger.id}
            ledgerUpdatedAt={ledger.updatedAt}
            status={ledger.status}
          />
        </section>
      ) : null}
      {canShowCorrectionPanel ? (
        <CorrectionPanel
          ledgerId={ledger.id}
          targetOptions={correctionTargetOptions}
          records={correctionRecords}
          createAction={createCorrectionRecord}
        />
      ) : null}

      {canEditLedger ? (
        <Tabs defaultValue={selectedTab} className="w-full">
          <TabsList
            variant="line"
            className="min-h-11 w-full flex-wrap justify-start border-b bg-transparent"
          >
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

          <TabsContent value="sales" className="mt-3" forceMount>
            <SalesPaymentStepClient
              key={`sales-${ledger.id}-${ledger.status}`}
              storeName={detail.storeName}
              initialLedger={ledger}
              currentStep="sales"
              saveAction={saveHqLedgerSalesPayment}
              showStepNavigation={false}
              ledgerLabel={hqLedgerLabel}
              hqEditReasonRequired
            />
          </TabsContent>
          <TabsContent value="expenses" className="mt-3" forceMount>
            <ExpenseStepClient
              key={`expenses-${ledger.id}-${ledger.status}`}
              storeName={detail.storeName}
              initialLedger={ledger}
              expenseCodeOptions={expenseCodeOptions}
              currentStep="cost"
              saveAction={saveHqLedgerExpenses}
              showStepNavigation={false}
              showSensitiveAccountingMetrics
              ledgerLabel={hqLedgerLabel}
              hqEditReasonRequired
            />
          </TabsContent>
          <TabsContent value="purchases" className="mt-3" forceMount>
            <PurchaseStepClient
              key={`purchases-${ledger.id}-${ledger.status}`}
              storeName={detail.storeName}
              initialLedger={ledger}
              productOptions={productOptions}
              purchaseStandardOptions={purchaseStandardOptions}
              currentStep="purchase"
              saveAction={saveHqLedgerPurchases}
              showStepNavigation={false}
              ledgerLabel={hqLedgerLabel}
              hqEditReasonRequired
            />
          </TabsContent>
          <TabsContent value="inventory" className="mt-3" forceMount>
            <InventoryStepClient
              key={`inventory-${inventoryData.id}-${inventoryData.status}`}
              storeName={detail.storeName}
              initialData={inventoryData}
              saveItemsAction={saveHqLedgerInventoryItems}
              saveAdjustmentAction={saveHqLedgerInventoryAdjustment}
              showStepNavigation={false}
              ledgerLabel={hqLedgerLabel}
              hqEditReasonRequired
            />
          </TabsContent>
          <TabsContent value="losses" className="mt-3" forceMount>
            <LossStepClient
              key={`losses-${lossData.id}-${lossData.status}`}
              storeName={detail.storeName}
              initialData={lossData}
              saveAction={saveHqLedgerLosses}
              showStepNavigation={false}
              ledgerLabel={hqLedgerLabel}
              hqEditReasonRequired
            />
          </TabsContent>
          <TabsContent value="work" className="mt-3" forceMount>
            <WorkStepClient
              key={`work-${ledger.id}-${ledger.status}`}
              storeName={detail.storeName}
              initialLedger={ledger}
              currentStep="work"
              saveAction={saveHqLedgerWorkInfo}
              laborSaveAction={saveHqLedgerLaborInfo}
              employeeOptions={employeeOptions}
              showStepNavigation={false}
              showSensitiveAccountingMetrics
              ledgerLabel={hqLedgerLabel}
              hqEditReasonRequired
            />
          </TabsContent>
        </Tabs>
      ) : null}
    </HeadquartersShell>
  );
}

function getCorrectionTargetOptions({
  ledger,
  inventoryData,
  lossData,
}: {
  ledger: NonNullable<Awaited<ReturnType<typeof getLedgerCostStepDataById>>>;
  inventoryData: NonNullable<
    Awaited<ReturnType<typeof getInventoryStepDataByLedgerId>>
  >;
  lossData: NonNullable<Awaited<ReturnType<typeof getLossStepDataByLedgerId>>>;
}): CorrectionTargetOption[] {
  return [
    {
      targetType: "PAYMENT_FIELD",
      targetId: ledger.id,
      fieldKey: "totalSalesAmount",
      label: "총매출",
      originalValue: {
        kind: "money",
        value: ledger.totalSalesAmount,
        label: "총매출",
      },
    },
    {
      targetType: "PAYMENT_FIELD",
      targetId: ledger.id,
      fieldKey: "cashAmount",
      label: "현금",
      originalValue: { kind: "money", value: ledger.cashAmount, label: "현금" },
    },
    {
      targetType: "PAYMENT_FIELD",
      targetId: ledger.id,
      fieldKey: "cardAmount",
      label: "카드",
      originalValue: { kind: "money", value: ledger.cardAmount, label: "카드" },
    },
    {
      targetType: "PAYMENT_FIELD",
      targetId: ledger.id,
      fieldKey: "otherPaymentAmount",
      label: "기타 결제수단",
      originalValue: {
        kind: "money",
        value: ledger.otherPaymentAmount,
        label: "기타 결제수단",
      },
    },
    {
      targetType: "LEDGER_FIELD",
      targetId: ledger.id,
      fieldKey: "workerCount",
      label: "근무인원",
      originalValue: {
        kind: "quantity",
        value: ledger.workerCount,
        label: "근무인원",
      },
    },
    ...ledger.expenseItems.map<CorrectionTargetOption>((item, index) => ({
      targetType: "EXPENSE_ROW",
      targetId: item.id,
      fieldKey: "amount",
      label: `비용 ${index + 1} · ${item.ledgerInputCodeName} · 금액`,
      originalValue: {
        kind: "money",
        value: item.amount,
        label: `비용 ${index + 1} · ${item.ledgerInputCodeName} · 금액`,
      },
    })),
    ...inventoryData.items
      .filter((item) => item.id !== item.productId)
      .flatMap<CorrectionTargetOption>((item, index) => {
        const prefix = `재고 ${index + 1} · ${item.productName}`;

        return [
          {
            targetType: "INVENTORY_ROW",
            targetId: item.id,
            fieldKey: "currentQuantity",
            label: `${prefix} · 현재고`,
            originalValue: {
              kind: "quantity",
              value: item.currentQuantity,
              label: `${prefix} · 현재고`,
            },
          },
        ];
      }),
    ...lossData.lossItems.flatMap<CorrectionTargetOption>((item, index) => {
      const prefix = `손실 ${index + 1} · ${item.productName}`;

      return [
        {
          targetType: "LOSS_ROW",
          targetId: item.id,
          fieldKey: "quantity",
          label: `${prefix} · 수량`,
          originalValue: {
            kind: "quantity",
            value: item.quantity,
            label: `${prefix} · 수량`,
          },
        },
        {
          targetType: "LOSS_ROW",
          targetId: item.id,
          fieldKey: "amount",
          label: `${prefix} · 금액`,
          originalValue: {
            kind: "money",
            value: item.amount,
            label: `${prefix} · 금액`,
          },
        },
      ];
    }),
    {
      targetType: "CALCULATED_METRIC",
      targetId: ledger.id,
      fieldKey: "grossMarginRate",
      label: "계산 표시값 · 마진율",
      originalValue: {
        kind: "metric",
        value: null,
        label: "계산 표시값 · 마진율",
      },
    },
    {
      targetType: "CALCULATED_METRIC",
      targetId: ledger.id,
      fieldKey: "salesDifference",
      label: "계산 표시값 · 매출 차이",
      originalValue: {
        kind: "metric",
        value: null,
        label: "계산 표시값 · 매출 차이",
      },
    },
    {
      targetType: "CALCULATED_METRIC",
      targetId: ledger.id,
      fieldKey: "lossAmount",
      label: "계산 표시값 · 손실",
      originalValue: {
        kind: "metric",
        value: null,
        label: "계산 표시값 · 손실",
      },
    },
  ];
}

function getAppliedCorrection(
  values: Map<string, CorrectionAppliedValue>,
  input: Parameters<typeof buildCorrectionTargetKey>[0],
) {
  return values.get(buildCorrectionTargetKey(input)) ?? null;
}

function formatKrw(value: number | null) {
  return value === null ? "-" : krwFormatter.format(value);
}

function formatKrwMetric(metric: {
  value: number | null;
  status?: string;
  label?: string;
  unavailableReason?: string;
}) {
  if (metric.value === null) {
    return formatUnavailableMetric(metric);
  }

  return krwFormatter.format(metric.value);
}

function formatPercentMetric(metric: {
  value: number | null;
  status?: string;
  label?: string;
  unavailableReason?: string;
}) {
  if (metric.value === null) {
    return formatUnavailableMetric(metric);
  }

  return percentFormatter.format(metric.value);
}

function formatUnavailableMetric(metric: {
  status?: string;
  label?: string;
  unavailableReason?: string;
}) {
  if (metric.status === "data-insufficient") {
    return metric.label ?? metric.unavailableReason ?? "-";
  }

  return metric.label ?? metric.unavailableReason ?? "-";
}

function formatHqCorrectionReviewStatus(
  correctionState: NonNullable<
    Awaited<ReturnType<typeof getHqLedgerDetail>>
  >["correctionState"],
) {
  if (correctionState.hasUnappliedCorrections) {
    return "정정 확인 필요";
  }

  if (correctionState.hasAppliedCorrections) {
    return `정정 반영 ${correctionState.appliedCorrectionCount}건`;
  }

  return "정정 없음";
}

function formatHqCloseCorrectionActionStatus({
  canCloseLedger,
  canCreateCorrection,
  isOriginalEditBlocked,
  isHeadquartersClosed,
}: {
  canCloseLedger: boolean;
  canCreateCorrection: boolean;
  isOriginalEditBlocked: boolean;
  isHeadquartersClosed: boolean;
}) {
  if (isHeadquartersClosed) {
    return canCreateCorrection ? "정정 가능" : "정정 조회 전용";
  }

  if (!isOriginalEditBlocked && canCloseLedger) {
    return "마감 가능";
  }

  return "조회 전용";
}

function formatCorrectionValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "-";
  }

  const correctionValue = value as { kind?: unknown; value?: unknown };

  if (typeof correctionValue.value === "number") {
    if (correctionValue.kind === "money") {
      return krwFormatter.format(correctionValue.value);
    }

    return String(correctionValue.value);
  }

  if (typeof correctionValue.value === "string") {
    return correctionValue.value;
  }

  return "-";
}
