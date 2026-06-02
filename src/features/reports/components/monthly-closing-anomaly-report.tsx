import Link from "next/link";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { DashboardSignalSummary } from "~/features/dashboard/components/dashboard-signal-summary";
import { DashboardStatusBadge } from "~/features/dashboard/components/dashboard-status-badge";
import { cn } from "~/lib/utils";
import type {
  DailyMeetingReportMetricEvidence,
  DailyMeetingReportMetricValue,
  MonthlyAnomalyItem,
  MonthlyClosingAnomalyDay,
  MonthlyClosingAnomalyReportData,
} from "../types";

type MonthlyClosingAnomalyReportProps = {
  report: MonthlyClosingAnomalyReportData;
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

export function MonthlyClosingAnomalyReport({
  report,
}: MonthlyClosingAnomalyReportProps) {
  if (!report.selectedStoreId) {
    return (
      <section className="bg-background text-muted-foreground rounded-lg border p-6 text-sm break-words">
        표시할 지점 데이터가 없습니다. 기준정보에서 활성 지점을 먼저 확인해
        주세요.
      </section>
    );
  }

  return (
    <section className="space-y-5" aria-label="월간 요약 리포트">
      <MonthlyKpiSummary report={report} />
      <LossInventoryFlowSummary report={report} />
      <TopRevenueItemSummary report={report} />
      <StatusSummary report={report} />
      <CalculationDaySummary report={report} />
      <DayStatusTable days={report.days} />
      <AnomalyList items={report.anomalyItems} />
    </section>
  );
}

function MonthlyKpiSummary({
  report,
}: {
  report: MonthlyClosingAnomalyReportData;
}) {
  const kpis = report.monthlyKpis;
  const remainingItems = [
    ["매출이익", kpis.metricEvidence.grossProfit],
    ["이익률", kpis.metricEvidence.grossMarginRate],
    ["영업이익", kpis.metricEvidence.operatingProfit],
    ["손실 합계", kpis.metricEvidence.lossTotal],
    ["평균재고", kpis.metricEvidence.averageInventory],
    ["평균매출", kpis.metricEvidence.averageSales],
    ["매출대비 재고비율", kpis.metricEvidence.inventoryToSalesRatio],
  ] as const;

  return (
    <section className="space-y-3" aria-label="월간 핵심 성과">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-normal">
          월간 핵심 성과
        </h2>
        {report.selectedStoreName ? (
          <Badge variant="outline" className="max-w-full break-words">
            {report.selectedStoreName}
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div
          data-testid="hq-report-monthly-kpi-sales"
          className="bg-background min-w-0 rounded-lg border p-4"
        >
          <p className="text-muted-foreground text-sm break-words">월간 매출</p>
          <div className="mt-2 tabular-nums">
            <MetricValueWithEvidence
              evidence={kpis.metricEvidence.salesAmount}
              align="left"
            />
          </div>
        </div>
        {remainingItems.map(([label, evidence]) => (
          <div key={label} className="bg-background min-w-0 rounded-lg border p-4">
            <p className="text-muted-foreground text-sm break-words">{label}</p>
            <div className="mt-2 tabular-nums">
              <MetricValueWithEvidence evidence={evidence} align="left" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LossInventoryFlowSummary({
  report,
}: {
  report: MonthlyClosingAnomalyReportData;
}) {
  const loss = report.monthlyLossSummary;
  const flow = report.monthlyInventoryFlow;
  const lossSignal =
    loss.hasRecordedLoss
      ? {
          id: "monthly-loss-recorded",
          label: "손실 기록 있음",
          severity: "warning" as const,
          detail: `${loss.totalQuantity.toLocaleString("ko-KR")}개 / ${krwFormatter.format(loss.totalAmount)}`,
        }
      : {
          id: "monthly-loss-none",
          label: "손실 기록 없음",
          severity: "info" as const,
          detail: "선택 월의 집계 대상 장부에 손실 금액이 없습니다.",
        };

  return (
    <section className="space-y-3" aria-label="손실/재고 흐름">
      <h2 className="text-lg font-semibold tracking-normal">
        손실/재고 흐름
      </h2>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section
          data-testid="hq-report-monthly-loss-summary"
          className="bg-background min-w-0 space-y-4 rounded-lg border p-4"
          aria-label="손실 유형별 요약"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold tracking-normal">
                손실 유형별 요약
              </h3>
              <p className="text-muted-foreground mt-1 text-sm break-words tabular-nums">
                {loss.totalQuantity.toLocaleString("ko-KR")}개
              </p>
              <div className="mt-1 tabular-nums">
                <MetricValueWithEvidence
                  evidence={loss.metricEvidence.totalAmount}
                  align="left"
                />
              </div>
            </div>
            <DashboardSignalSummary signals={[lossSignal]} showDetails />
          </div>

          {loss.byType.length === 0 ? (
            <p className="text-muted-foreground text-sm break-words">
              집계 대상 손실 항목이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[420px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>유형</TableHead>
                    <TableHead className="text-right">수량</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loss.byType.map((item) => (
                    <TableRow key={item.lossTypeName}>
                      <TableCell className="break-words">
                        {item.lossTypeName}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.quantity.toLocaleString("ko-KR")}개
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {krwFormatter.format(item.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <section
          data-testid="hq-report-monthly-inventory-flow"
          className="bg-background min-w-0 space-y-4 rounded-lg border p-4"
          aria-label="재고 흐름 요약"
        >
          <h3 className="font-semibold tracking-normal">재고 흐름 요약</h3>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FlowMetric
              label="전일재고"
              quantity={flow.previousQuantity}
              evidence={flow.metricEvidence.previousAmount}
            />
            <FlowMetric
              label="매입"
              quantity={flow.purchaseQuantity}
              evidence={flow.metricEvidence.purchaseAmount}
            />
            <FlowMetric
              label="손실"
              quantity={flow.lossQuantity}
              evidence={flow.metricEvidence.lossAmount}
            />
            <FlowMetric
              label="당일재고"
              quantity={flow.currentQuantity}
              evidence={flow.metricEvidence.currentAmount}
            />
            <FlowMetric
              label="조정 차이"
              quantity={flow.adjustmentDifferenceQuantity}
              evidence={flow.metricEvidence.adjustmentDifferenceAmount}
              signed
            />
          </dl>
        </section>
      </div>
    </section>
  );
}

function TopRevenueItemSummary({
  report,
}: {
  report: MonthlyClosingAnomalyReportData;
}) {
  const topItem = report.topRevenueItem;

  return (
    <section
      className="bg-background min-w-0 rounded-lg border p-4"
      aria-label="최고매출품목"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-normal">
            최고매출품목
          </h2>
          <p className="text-muted-foreground mt-1 text-sm break-words">
            {topItem.note}
          </p>
        </div>
        <Badge variant="outline" className="max-w-full break-words">
          {topItem.statusLabel}
        </Badge>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted-foreground text-sm">품목</dt>
          <dd className="font-medium break-words">
            {topItem.productName ?? topItem.statusLabel}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground text-sm">매출액</dt>
          <dd className="font-medium break-words tabular-nums">
            {formatMetricValue(topItem.salesAmount, "money")}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function StatusSummary({ report }: { report: MonthlyClosingAnomalyReportData }) {
  const items = [
    ["본사마감", report.statusCounts.closedCount],
    ["검토대기", report.statusCounts.reviewCount],
    ["입력중", report.statusCounts.inProgressCount],
    ["미입력", report.statusCounts.missingDayCount],
    ["휴무", report.statusCounts.holidayCount],
  ];

  return (
    <section
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      aria-label="월간 마감 상태 요약"
    >
      {items.map(([label, count]) => (
        <div key={label} className="bg-background rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-normal tabular-nums">
            {Number(count).toLocaleString("ko-KR")}일
          </p>
        </div>
      ))}
    </section>
  );
}

function CalculationDaySummary({
  report,
}: {
  report: MonthlyClosingAnomalyReportData;
}) {
  if (report.calculationDays.length === 0) {
    return null;
  }

  const includedCount = report.calculationDays.filter(
    (day) => day.inclusion === "included",
  ).length;
  const excludedCount = report.calculationDays.length - includedCount;

  return (
    <section className="space-y-3" aria-label="계산 포함/제외 일자">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-normal">
          계산 포함/제외 일자
        </h2>
        <Badge variant="outline">
          포함 {includedCount.toLocaleString("ko-KR")}일 · 제외{" "}
          {excludedCount.toLocaleString("ko-KR")}일
        </Badge>
      </div>
      <div className="bg-background overflow-x-auto rounded-lg border">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead>날짜</TableHead>
              <TableHead>포함 여부</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>사유</TableHead>
              <TableHead>상세</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.calculationDays.map((day) => (
              <TableRow key={day.dateInput}>
                <TableCell className="font-medium tabular-nums">
                  {day.dateLabel}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      day.inclusion === "included" ? "outline" : "secondary"
                    }
                  >
                    {day.inclusion === "included" ? "포함" : "제외"}
                  </Badge>
                </TableCell>
                <TableCell className="break-words">
                  {day.ledgerStatusLabel}
                </TableCell>
                <TableCell className="break-words">{day.reason}</TableCell>
                <TableCell>
                  <DetailLink href={day.ledgerDetailHref} compact />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function DayStatusTable({ days }: { days: MonthlyClosingAnomalyDay[] }) {
  if (days.length === 0) {
    return (
      <section
        className="bg-background text-muted-foreground rounded-lg border p-6 text-sm break-words"
        aria-label="월간 일자별 마감 현황"
      >
        선택한 월에 표시할 날짜나 장부가 없습니다.
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-label="월간 일자별 마감 현황">
      <div className="bg-background hidden overflow-x-auto rounded-lg border md:block">
        <Table className="min-w-[1120px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[96px]">날짜</TableHead>
              <TableHead>마감 상태</TableHead>
              <TableHead>이상 신호</TableHead>
              <TableHead className="text-right">매출</TableHead>
              <TableHead className="text-right">이익률</TableHead>
              <TableHead className="text-right">매출 차이</TableHead>
              <TableHead>손실</TableHead>
              <TableHead>상세</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((day) => (
              <TableRow
                key={day.dateInput}
                data-testid={`hq-report-monthly-day-${day.dateInput}`}
              >
                <TableCell className="font-medium tabular-nums">
                  {day.dateLabel}
                </TableCell>
                <TableCell>
                  <DashboardStatusBadge status={day.ledgerStatus} />
                </TableCell>
                <TableCell>
                  <DashboardSignalSummary signals={day.signals} />
                </TableCell>
                <MetricCell evidence={day.metricEvidence.salesAmount} />
                <MetricCell evidence={day.metricEvidence.grossMarginRate} />
                <MetricCell evidence={day.metricEvidence.salesDifference} />
                <TableCell>
                  <MetricValueWithEvidence
                    evidence={day.metricEvidence.loss}
                    align="left"
                  />
                </TableCell>
                <TableCell>
                  <DetailLink href={day.ledgerDetailHref} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 md:hidden">
        {days.map((day) => (
          <article
            key={day.dateInput}
            data-testid={`hq-report-monthly-mobile-day-${day.dateInput}`}
            className="bg-background rounded-lg border p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold tracking-normal tabular-nums">
                  {day.dateLabel}
                </h2>
                <p className="text-muted-foreground text-sm break-words">
                  {day.businessStatus.label}
                </p>
              </div>
              <DashboardStatusBadge
                status={day.ledgerStatus}
                className="shrink-0"
              />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <MobileMetric label="매출" evidence={day.metricEvidence.salesAmount} />
              <MobileMetric
                label="이익률"
                evidence={day.metricEvidence.grossMarginRate}
              />
              <MobileMetric
                label="매출 차이"
                evidence={day.metricEvidence.salesDifference}
              />
              <MobileMetric label="손실" evidence={day.metricEvidence.loss} />
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <DetailLink href={day.ledgerDetailHref} compact />
            </div>
            <DashboardSignalSummary signals={day.signals} className="mt-4" />
          </article>
        ))}
      </div>
    </section>
  );
}

function AnomalyList({ items }: { items: MonthlyAnomalyItem[] }) {
  return (
    <section className="space-y-3" aria-label="주요 이상 항목">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-normal">주요 이상</h2>
        <Badge variant="outline">
          {items.length.toLocaleString("ko-KR")}건
        </Badge>
      </div>

      {items.length === 0 ? (
        <div className="bg-background text-muted-foreground rounded-lg border p-6 text-sm break-words">
          주요 이상 항목이 없습니다.
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item, index) => (
            <article
              key={item.id}
              data-testid={`hq-report-monthly-anomaly-${item.dateInput}-${item.ledgerId}-${index}`}
              className="bg-background rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <DashboardSignalSummary
                    signals={[
                      {
                        id: item.id,
                        label: item.label,
                        severity: item.severity,
                        detail: item.detail ?? undefined,
                      },
                    ]}
                    showDetails
                  />
                  <p className="text-muted-foreground mt-2 text-sm break-words tabular-nums">
                    {item.dateLabel} · {item.storeName}
                  </p>
                  {item.metricEvidence ? (
                    <div className="mt-3 text-sm">
                      <MetricValueWithEvidence
                        evidence={item.metricEvidence}
                        align="left"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={item.ledgerDetailHref}>장부 상세</Link>
                  </Button>
                  {item.correctionTimelineHref ? (
                    <Button asChild variant="outline" size="sm">
                      <Link href={item.correctionTimelineHref}>
                        정정 타임라인
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function MetricCell({ evidence }: { evidence: DailyMeetingReportMetricEvidence }) {
  return (
    <TableCell className="text-right tabular-nums">
      <MetricValueWithEvidence evidence={evidence} />
    </TableCell>
  );
}

function MobileMetric({
  label,
  evidence,
}: {
  label: string;
  evidence: DailyMeetingReportMetricEvidence;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">
        <MetricValueWithEvidence evidence={evidence} align="left" />
      </dd>
    </div>
  );
}

function MetricValueWithEvidence({
  evidence,
  align = "right",
}: {
  evidence: DailyMeetingReportMetricEvidence;
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn("min-w-0", align === "right" ? "text-right" : "text-left")}
    >
      <div className="font-medium break-words">
        {formatEvidenceValue(evidence.applied)}
        {evidence.isCorrected ? (
          <span className="text-primary ml-1 text-xs font-semibold whitespace-nowrap">
            정정 반영
          </span>
        ) : null}
      </div>
      <details className="mt-1 text-xs">
        <summary className="text-primary inline-flex cursor-pointer list-none break-words underline-offset-2 hover:underline">
          근거 보기
        </summary>
        <dl className="bg-muted/40 mt-2 grid gap-1 rounded-md p-2 text-left">
          <div className="min-w-0">
            <dt className="text-muted-foreground">원본</dt>
            <dd className="break-words tabular-nums">
              {formatEvidenceValue(evidence.original)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">정정 반영</dt>
            <dd className="break-words tabular-nums">
              {formatEvidenceValue(evidence.applied)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">계산 상태</dt>
            <dd className="break-words">{evidence.statusLabel}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">계산 불가 사유</dt>
            <dd className="break-words">
              {evidence.unavailableReason ?? "해당 없음"}
            </dd>
          </div>
        </dl>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {evidence.ledgerDetailHref ? (
            <Link
              className="text-primary underline"
              href={evidence.ledgerDetailHref}
            >
              장부 상세
            </Link>
          ) : null}
          {evidence.correctionTimelineHref ? (
            <Link
              className="text-primary underline"
              href={evidence.correctionTimelineHref}
            >
              정정 타임라인
            </Link>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function DetailLink({
  href,
  compact = false,
}: {
  href: string | null;
  compact?: boolean;
}) {
  if (!href) {
    return (
      <span
        className={cn(
          "text-muted-foreground inline-flex min-h-9 items-center text-sm break-words",
          compact && "min-h-0",
        )}
      >
        입력 전
      </span>
    );
  }

  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>장부 상세</Link>
    </Button>
  );
}

function FlowMetric({
  label,
  quantity,
  evidence,
  signed = false,
}: {
  label: string;
  quantity: MonthlyClosingAnomalyReportData["monthlyInventoryFlow"]["currentQuantity"];
  evidence: DailyMeetingReportMetricEvidence;
  signed?: boolean;
}) {
  return (
    <div className="bg-muted/40 min-w-0 rounded-md p-3">
      <dt className="text-muted-foreground text-sm break-words">{label}</dt>
      <dd className="mt-1 font-medium break-words tabular-nums">
        {formatQuantity(quantity, signed)}
      </dd>
      <dd className="text-muted-foreground text-sm break-words tabular-nums">
        <MetricValueWithEvidence evidence={evidence} align="left" />
      </dd>
    </div>
  );
}

function formatQuantity(
  value: MonthlyClosingAnomalyReportData["monthlyInventoryFlow"]["currentQuantity"],
  signed = false,
) {
  if (value.value === null) {
    return value.unavailableReason ?? "계산 불가";
  }

  const prefix = signed && value.value > 0 ? "+" : "";

  return `${prefix}${value.value.toLocaleString("ko-KR")}개`;
}

function formatMetricValue(
  value: MonthlyClosingAnomalyReportData["topRevenueItem"]["salesAmount"],
  kind: DailyMeetingReportMetricValue["kind"],
) {
  if (value.value === null) {
    return value.unavailableReason ?? "계산 불가";
  }

  return formatEvidenceValue({ ...value, kind });
}

function formatEvidenceValue(value: DailyMeetingReportMetricValue) {
  if (value.value === null) {
    return value.unavailableReason ?? "계산 불가";
  }

  if (value.kind === "percent") {
    return percentFormatter.format(value.value);
  }

  if (value.kind === "boolean") {
    return value.value > 0 ? "손실 있음" : "손실 없음";
  }

  return krwFormatter.format(value.value);
}
