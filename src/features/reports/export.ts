import { omitSensitiveFields } from "../../server/sensitive-fields.ts";
import type {
  DailyMeetingReportData,
  DailyMeetingReportMetricEvidence,
  MonthlyClosingAnomalyReportData,
  StoreComparisonReportData,
} from "./types";

export type ReportExportType = "daily" | "comparison" | "monthly";
export type ReportExportFormat = "csv";

type ReportExportColumn = {
  key: string;
  label: string;
};

type ReportExportRow = Record<string, string | number | null>;
const CORRECTION_APPLIED_LABEL = "정정 반영";
const POLICY_CHECK_REQUIRED_LABEL = "기준 확인 필요";

export type ReportExportData = {
  report: ReportExportType;
  period: string;
  filters: Record<string, string | null>;
  columns: ReportExportColumn[];
  rows: ReportExportRow[];
  scopedStoreIds: string[];
};

export const REPORT_EXPORT_COLUMN_ALLOWLISTS = {
  daily: [
    { key: "storeName", label: "지점" },
    { key: "ledgerStatus", label: "장부 상태" },
    { key: "businessStatus", label: "영업 상태" },
    { key: "latestReflectedAt", label: "최신 반영" },
    { key: "statusMessage", label: "상태 메시지" },
    { key: "salesAmount", label: "매출" },
    { key: "salesAmountStatus", label: "매출 상태" },
    { key: "grossMarginRate", label: "이익률" },
    { key: "grossMarginRateStatus", label: "이익률 상태" },
    { key: "salesDifference", label: "매출 차이" },
    { key: "salesDifferenceStatus", label: "매출 차이 상태" },
    { key: "lossStatus", label: "손실 상태" },
    { key: "signals", label: "이상 신호" },
  ],
  comparison: [
    { key: "storeName", label: "지점" },
    { key: "closedCount", label: "본사마감 일수" },
    { key: "unfinishedCount", label: "미마감 일수" },
    { key: "missingDayCount", label: "미입력 일수" },
    { key: "salesAmount", label: "매출" },
    { key: "salesAmountStatus", label: "매출 상태" },
    { key: "grossProfit", label: "매출이익" },
    { key: "grossProfitStatus", label: "매출이익 상태" },
    { key: "grossMarginRate", label: "이익률" },
    { key: "grossMarginRateStatus", label: "이익률 상태" },
    { key: "operatingProfit", label: "영업이익" },
    { key: "operatingProfitStatus", label: "영업이익 상태" },
    { key: "productivity", label: "인당생산성" },
    { key: "productivityStatus", label: "인당생산성 상태" },
    { key: "lossStatus", label: "손실 상태" },
  ],
  monthly: [
    { key: "section", label: "구분" },
    { key: "item", label: "항목" },
    { key: "date", label: "일자" },
    { key: "storeName", label: "지점" },
    { key: "value", label: "값" },
    { key: "status", label: "상태" },
    { key: "reason", label: "사유" },
  ],
} as const satisfies Record<ReportExportType, readonly ReportExportColumn[]>;

export function buildDailyMeetingReportExport(
  report: Pick<DailyMeetingReportData, "dateInput" | "rows">,
): ReportExportData {
  return {
    report: "daily",
    period: report.dateInput,
    filters: { date: report.dateInput },
    columns: [...REPORT_EXPORT_COLUMN_ALLOWLISTS.daily],
    scopedStoreIds: report.rows.map((row) => row.storeId),
    rows: report.rows.map((row) => ({
      storeName: row.storeName,
      ledgerStatus: row.ledgerStatus.label,
      businessStatus: row.businessStatus.label,
      latestReflectedAt: formatDateTime(row.latestReflectedAt),
      statusMessage:
        "statusMessage" in row && typeof row.statusMessage === "string"
          ? row.statusMessage
          : row.businessStatus.label,
      salesAmount: formatMetricEvidence(row.metricEvidence.salesAmount),
      salesAmountStatus: formatMetricStatus(row.metricEvidence.salesAmount),
      grossMarginRate: formatMetricEvidence(row.metricEvidence.grossMarginRate),
      grossMarginRateStatus: formatMetricStatus(
        row.metricEvidence.grossMarginRate,
      ),
      salesDifference: formatMetricEvidence(row.metricEvidence.salesDifference),
      salesDifferenceStatus: formatMetricStatus(
        row.metricEvidence.salesDifference,
      ),
      lossStatus: formatMetricStatus(row.metricEvidence.loss),
      signals: row.signals.map((signal) => signal.label).join("; "),
    })),
  };
}

export function buildStoreComparisonReportExport(
  report: Pick<StoreComparisonReportData, "range" | "selectedStoreId" | "rows">,
): ReportExportData {
  return {
    report: "comparison",
    period: `${report.range.startDateInput}-${report.range.endDateInput}`,
    filters: {
      startDate: report.range.startDateInput,
      endDate: report.range.endDateInput,
      storeId: report.selectedStoreId,
    },
    columns: [...REPORT_EXPORT_COLUMN_ALLOWLISTS.comparison],
    scopedStoreIds: report.rows.map((row) => row.storeId),
    rows: report.rows.map((row) => ({
      storeName: row.storeName,
      closedCount: row.statusCounts.closedCount,
      unfinishedCount:
        row.statusCounts.inProgressCount + row.statusCounts.reviewCount,
      missingDayCount: row.statusCounts.missingDayCount,
      salesAmount: formatMetricEvidence(row.metricEvidence.salesAmount),
      salesAmountStatus: formatMetricStatus(row.metricEvidence.salesAmount),
      grossProfit: formatMetricEvidence(row.metricEvidence.grossProfit),
      grossProfitStatus: formatMetricStatus(row.metricEvidence.grossProfit),
      grossMarginRate: formatMetricEvidence(row.metricEvidence.grossMarginRate),
      grossMarginRateStatus: formatMetricStatus(
        row.metricEvidence.grossMarginRate,
      ),
      operatingProfit: formatMetricEvidence(row.metricEvidence.operatingProfit),
      operatingProfitStatus: formatMetricStatus(
        row.metricEvidence.operatingProfit,
      ),
      productivity: formatMetricEvidence(row.metricEvidence.productivity),
      productivityStatus: formatMetricStatus(row.metricEvidence.productivity),
      lossStatus: formatMetricStatus(row.metricEvidence.loss),
    })),
  };
}

export function buildMonthlyClosingAnomalyReportExport(
  report: Pick<
    MonthlyClosingAnomalyReportData,
    | "monthRange"
    | "selectedStoreId"
    | "selectedStoreName"
    | "monthlyKpis"
    | "monthlyLossSummary"
    | "monthlyInventoryFlow"
    | "topRevenueItem"
    | "calculationDays"
    | "days"
  >,
): ReportExportData {
  const rows: ReportExportRow[] = [
    metricRow({
      section: "월간 핵심 성과",
      item: "월간 매출",
      storeName: report.selectedStoreName,
      evidence: report.monthlyKpis.metricEvidence.salesAmount,
    }),
    metricRow({
      section: "월간 핵심 성과",
      item: "매출이익",
      storeName: report.selectedStoreName,
      evidence: report.monthlyKpis.metricEvidence.grossProfit,
    }),
    metricRow({
      section: "월간 핵심 성과",
      item: "이익률",
      storeName: report.selectedStoreName,
      evidence: report.monthlyKpis.metricEvidence.grossMarginRate,
    }),
    metricRow({
      section: "월간 핵심 성과",
      item: "영업이익",
      storeName: report.selectedStoreName,
      evidence: report.monthlyKpis.metricEvidence.operatingProfit,
    }),
    metricRow({
      section: "손실/재고 흐름",
      item: "손실 합계",
      storeName: report.selectedStoreName,
      evidence: report.monthlyLossSummary.metricEvidence.totalAmount,
    }),
    metricRow({
      section: "손실/재고 흐름",
      item: "당일재고",
      storeName: report.selectedStoreName,
      evidence: report.monthlyInventoryFlow.metricEvidence.currentAmount,
    }),
    {
      section: "최고매출품목",
      item: report.topRevenueItem.productName ?? "확인 필요",
      date: "",
      storeName: report.selectedStoreName ?? "",
      value: report.topRevenueItem.note,
      status: report.topRevenueItem.statusLabel,
      reason: report.topRevenueItem.note,
    },
    ...report.calculationDays.map((day) => ({
      section: "계산 포함/제외 일자",
      item: day.ledgerStatusLabel,
      date: day.dateInput,
      storeName: report.selectedStoreName ?? "",
      value: day.inclusion === "included" ? "포함" : "제외",
      status: day.reason,
      reason: day.reason,
    })),
  ];

  return {
    report: "monthly",
    period: report.monthRange.monthInput,
    filters: {
      month: report.monthRange.monthInput,
      storeId: report.selectedStoreId,
    },
    columns: [...REPORT_EXPORT_COLUMN_ALLOWLISTS.monthly],
    scopedStoreIds: [...new Set(report.days.map((day) => day.storeId))],
    rows,
  };
}

export function buildReportCsv(exportData: ReportExportData) {
  const header = exportData.columns.map((column) => column.label);
  const body = exportData.rows.map((row) =>
    exportData.columns.map((column) => row[column.key] ?? ""),
  );
  const lines = [header, ...body].map((row) =>
    row.map(escapeCsvCell).join(","),
  );

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function getReportExportFilename({
  report,
  period,
}: {
  report: ReportExportType;
  period: string;
}) {
  const safePeriod = sanitizeFilenamePart(period);

  return `erp-fish-report-${report}-${safePeriod}.csv`;
}

export function buildReportExportAuditSnapshot({
  exportData,
  format,
}: {
  exportData: ReportExportData;
  format: ReportExportFormat;
}) {
  return {
    report: exportData.report,
    filters: exportData.filters,
    scopedStoreIdCount: exportData.scopedStoreIds.length,
    scopedStoreIds: exportData.scopedStoreIds,
    columnKeys: exportData.columns.map((column) => column.key),
    rowCount: exportData.rows.length,
    format,
  };
}

export function buildForbiddenReportExportResponsePayload(
  _input: Record<string, unknown>,
) {
  return omitSensitiveFields({
    error: "forbidden",
    message: "export 권한이 없습니다.",
  }) as {
    error: "forbidden";
    message: "export 권한이 없습니다.";
  };
}

function metricRow({
  section,
  item,
  storeName,
  evidence,
}: {
  section: string;
  item: string;
  storeName: string | null;
  evidence: DailyMeetingReportMetricEvidence;
}): ReportExportRow {
  return {
    section,
    item,
    date: "",
    storeName: storeName ?? "",
    value: formatMetricEvidence(evidence),
    status: formatMetricStatus(evidence),
    reason: evidence.unavailableReason ?? "",
  };
}

function formatMetricEvidence(evidence: DailyMeetingReportMetricEvidence) {
  if (evidence.applied.value === null) {
    return (
      evidence.unavailableReason ??
      evidence.applied.unavailableReason ??
      evidence.statusLabel ??
      POLICY_CHECK_REQUIRED_LABEL
    );
  }

  if (evidence.kind === "percent") {
    return formatPercentValue(evidence.applied.value);
  }

  if (evidence.kind === "boolean") {
    return evidence.applied.value ? "있음" : "없음";
  }

  return evidence.applied.value;
}

function formatPercentValue(value: number) {
  const percent = value * 100;
  const rounded = Number.isInteger(percent)
    ? String(percent)
    : String(Number(percent.toFixed(2)));

  return `${rounded}%`;
}

function formatMetricStatus(evidence: DailyMeetingReportMetricEvidence) {
  const statusLabel =
    evidence.status === "corrected"
      ? CORRECTION_APPLIED_LABEL
      : evidence.statusLabel;

  return evidence.unavailableReason
    ? `${statusLabel}: ${evidence.unavailableReason}`
    : statusLabel;
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return value.toISOString();
}

function escapeCsvCell(value: string | number | null) {
  const stringValue = value === null ? "" : String(value);
  const safeValue = /^[=+\-@]/.test(stringValue)
    ? `'${stringValue}`
    : stringValue;

  return `"${safeValue.replaceAll('"', '""')}"`;
}

function sanitizeFilenamePart(value: string) {
  const safeParts = value
    .toLowerCase()
    .match(/[a-z0-9]+(?:-[a-z0-9]+)*/g)
    ?.filter(Boolean)
    .slice(0, 2);

  return safeParts && safeParts.length > 0 ? safeParts.join("-") : "export";
}
