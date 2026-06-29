import { omitSensitiveFields } from "../../server/sensitive-fields.ts";
import type {
  DailyMeetingReportData,
  DailyMeetingReportMetricEvidence,
  MonthlyClosingAnomalyReportData,
  StoreComparisonReportData,
} from "./types";
import type { InventoryPositionReportData } from "./inventory-position-types";

export type ReportExportType = "daily" | "comparison" | "monthly" | "inventory";
// WO-15(2026-06-28): xlsx 다운로드 추가. CSV는 보조로 유지한다.
export type ReportExportFormat = "csv" | "xlsx";

export function isReportExportFormat(
  value: string | null,
): value is ReportExportFormat {
  return value === "csv" || value === "xlsx";
}

const REPORT_SHEET_LABELS: Record<ReportExportType, string> = {
  daily: "일별",
  comparison: "기간조회_RAW",
  // monthly 리포트의 기본 시트는 월간 KPI/이상 항목이다. "월별손익" 시트는 별도 추가된다.
  monthly: "월간요약",
  inventory: "재고현황",
};

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
    { key: "closedCount", label: "본사 마감 일수" },
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
  inventory: [
    { key: "storeName", label: "지점" },
    { key: "productName", label: "품목" },
    { key: "productCategory", label: "분류" },
    { key: "productSpec", label: "규격" },
    { key: "previousQuantity", label: "전일재고" },
    { key: "purchasedQuantity", label: "매입" },
    { key: "lossQuantity", label: "손실" },
    { key: "currentQuantity", label: "남은 재고" },
    { key: "systemQuantity", label: "전산 재고" },
    { key: "differenceQuantity", label: "당일 판매량" },
    { key: "amount", label: "재고 금액" },
    { key: "statusLabel", label: "상태" },
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

export function buildInventoryPositionReportExport(
  report: Pick<InventoryPositionReportData, "filters" | "rows">,
): ReportExportData {
  return {
    report: "inventory",
    period: report.filters.dateInput,
    filters: {
      date: report.filters.dateInput,
      storeId: report.filters.storeId,
      category: report.filters.category,
      product: report.filters.productQuery,
    },
    columns: [...REPORT_EXPORT_COLUMN_ALLOWLISTS.inventory],
    scopedStoreIds: [...new Set(report.rows.map((row) => row.storeId))],
    rows: report.rows.map((row) => ({
      storeName: row.storeName,
      productName: row.productName,
      productCategory: row.productCategory,
      productSpec: row.productSpec,
      previousQuantity:
        row.statusLabel === "미입력" ? "미입력" : row.previousQuantity,
      purchasedQuantity:
        row.statusLabel === "미입력" ? "미입력" : row.purchasedQuantity,
      lossQuantity: row.statusLabel === "미입력" ? "미입력" : row.lossQuantity,
      currentQuantity: formatExportQuantity(row.currentQuantity),
      systemQuantity: formatExportQuantity(row.systemQuantity),
      differenceQuantity: formatExportSignedQuantity(row.differenceQuantity),
      amount: row.inventoryAmount ?? "계산 불가",
      statusLabel: row.statusLabel,
    })),
  };
}

function formatExportQuantity(value: number | null) {
  return value ?? "계산 불가";
}

function formatExportSignedQuantity(value: number | null) {
  if (value === null) {
    return "계산 불가";
  }

  return value > 0 ? `+${value}` : String(value);
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

export type ReportExportSheet = {
  name: string;
  columns: ReportExportColumn[];
  rows: ReportExportRow[];
};

// ReportExportData(리포트별 컬럼/행)를 명명된 xlsx 시트 스펙으로 바꾼다.
export function reportExportToSheet(
  exportData: Pick<ReportExportData, "columns" | "rows">,
  name: string,
): ReportExportSheet {
  return { name, columns: exportData.columns, rows: exportData.rows };
}

// WO-15(2026-06-28): xlsx 워크북 생성. 리포트별 컬럼을 시트 하나로 내보내고,
// 추가 시트(extraSheets)가 있으면 같은 구조로 덧붙인다(예: 월별손익).
export async function buildReportXlsx(
  exportData: ReportExportData,
  extraSheets: ReportExportSheet[] = [],
): Promise<ArrayBuffer> {
  return buildXlsxWorkbook([
    reportExportToSheet(exportData, REPORT_SHEET_LABELS[exportData.report]),
    ...extraSheets,
  ]);
}

// WO-15(2026-06-29): 월별 xlsx는 5개 고정 시트(요약/기간조회_RAW/월별손익/재고현황/품목매출)로
// 번들한다. 시트 목록을 그대로 받아 워크북을 만든다.
export async function buildBundledReportXlsx(
  sheets: ReportExportSheet[],
): Promise<ArrayBuffer> {
  return buildXlsxWorkbook(sheets);
}

async function buildXlsxWorkbook(
  sheets: ReportExportSheet[],
): Promise<ArrayBuffer> {
  // exceljs는 무겁고 export 경로에서만 쓰므로 동적 import로 초기 번들에서 뺀다.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "도원에스디";

  for (const sheetSpec of sheets) {
    const sheet = workbook.addWorksheet(sheetSpec.name);
    sheet.columns = sheetSpec.columns.map((column) => ({
      header: column.label,
      key: column.key,
      width: Math.min(40, Math.max(12, column.label.length + 4)),
    }));
    sheet.getRow(1).font = { bold: true };

    for (const row of sheetSpec.rows) {
      sheet.addRow(
        Object.fromEntries(
          sheetSpec.columns.map((column) => [
            column.key,
            row[column.key] ?? "",
          ]),
        ),
      );
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  // 새 ArrayBuffer로 복사해 SharedArrayBuffer 가능성을 제거하고 BodyInit 타입을 고정한다.
  const source = new Uint8Array(buffer);
  const copy = new ArrayBuffer(source.byteLength);
  new Uint8Array(copy).set(source);

  return copy;
}

// WO-15(2026-06-28) part2: 월별 손익계산서를 xlsx "월별손익" 시트로 만든다.
// 조정 항목(월세/관리비/...)은 본사 지출 category로 들어온 값을 컬럼으로 펼친다.
export function buildMonthlyProfitLossSheet(data: {
  rows: Array<{
    monthInput: string;
    storeName: string;
    salesAmount: number;
    cogsAmount: number;
    grossProfit: number | null;
    grossMarginRate: number | null;
    laborAmount: number;
    fixedCosts: Record<string, number>;
    otherExpenseAmount: number;
    hqAdjustmentAmount: number;
    netAmount: number;
    adjustmentReason: string | null;
    memo: string | null;
  }>;
}): ReportExportSheet {
  const columns: ReportExportColumn[] = [
    { key: "monthInput", label: "기준월" },
    { key: "storeName", label: "지점" },
    { key: "salesAmount", label: "매출" },
    { key: "cogsAmount", label: "매입원가" },
    { key: "grossProfit", label: "매출이익" },
    { key: "grossMarginRate", label: "이익률" },
    { key: "laborAmount", label: "인건비" },
    { key: "월세", label: "월세" },
    { key: "관리비", label: "관리비" },
    { key: "공과금", label: "공과금" },
    { key: "세금/수수료", label: "세금/수수료" },
    { key: "포장/소모품", label: "포장/소모품" },
    { key: "배송/운반", label: "배송/운반" },
    { key: "수선/유지보수", label: "수선/유지보수" },
    { key: "otherExpenseAmount", label: "기타비용" },
    { key: "hqAdjustmentAmount", label: "본사조정" },
    { key: "netAmount", label: "남은금액" },
    { key: "adjustmentReason", label: "조정사유" },
    { key: "memo", label: "메모" },
  ];

  const rows: ReportExportRow[] = data.rows.map((row) => ({
    monthInput: row.monthInput,
    storeName: row.storeName,
    salesAmount: row.salesAmount,
    cogsAmount: row.cogsAmount,
    grossProfit: row.grossProfit ?? "계산 불가",
    grossMarginRate:
      row.grossMarginRate === null
        ? "계산 불가"
        : `${(row.grossMarginRate * 100).toFixed(1)}%`,
    laborAmount: row.laborAmount,
    월세: row.fixedCosts["월세"] ?? 0,
    관리비: row.fixedCosts["관리비"] ?? 0,
    공과금: row.fixedCosts["공과금"] ?? 0,
    "세금/수수료": row.fixedCosts["세금/수수료"] ?? 0,
    "포장/소모품": row.fixedCosts["포장/소모품"] ?? 0,
    "배송/운반": row.fixedCosts["배송/운반"] ?? 0,
    "수선/유지보수": row.fixedCosts["수선/유지보수"] ?? 0,
    otherExpenseAmount: row.otherExpenseAmount,
    hqAdjustmentAmount: row.hqAdjustmentAmount,
    netAmount: row.netAmount,
    adjustmentReason: row.adjustmentReason,
    memo: row.memo,
  }));

  return { name: "월별손익", columns, rows };
}

// WO-15(2026-06-29): 품목별 판매현황(추정) xlsx "품목매출" 시트. 일별 회의 리포트의
// productProfitability(품목별 추정 매출/이익률)를 그대로 시트로 옮긴다. POS 확정 매출이
// 아니므로 statusLabel에 "추정"/"판매가 미반영"이 그대로 들어간다.
export function buildProductSalesSheet(items: {
  items: Array<{
    productName: string;
    productSpec: string;
    productCategory: "냉동" | "생물";
    soldQuantity: number;
    estimatedSalesAmount: number;
    estimatedGrossMarginRate: number | null;
    salesBasis: "planned" | "cost";
    statusLabel: "추정" | "판매가 미반영" | "계산 불가";
  }>;
}): ReportExportSheet {
  const columns: ReportExportColumn[] = [
    { key: "productName", label: "품목" },
    { key: "productSpec", label: "규격" },
    { key: "productCategory", label: "구분" },
    { key: "soldQuantity", label: "추정 판매수량" },
    { key: "estimatedSalesAmount", label: "추정 매출" },
    { key: "estimatedGrossMarginRate", label: "추정 이익률" },
    { key: "salesBasis", label: "기준" },
    { key: "statusLabel", label: "상태" },
  ];

  const rows: ReportExportRow[] = items.items.map((item) => ({
    productName: item.productName,
    productSpec: item.productSpec,
    productCategory: item.productCategory,
    soldQuantity: item.soldQuantity,
    estimatedSalesAmount: item.estimatedSalesAmount,
    estimatedGrossMarginRate:
      item.estimatedGrossMarginRate === null
        ? "계산 불가"
        : `${(item.estimatedGrossMarginRate * 100).toFixed(1)}%`,
    salesBasis:
      item.salesBasis === "planned" ? "판매가 계획" : "매입단가(폴백)",
    statusLabel: item.statusLabel,
  }));

  return { name: "품목매출", columns, rows };
}

export function getReportExportFilename({
  report,
  period,
  format = "csv",
}: {
  report: ReportExportType;
  period: string;
  format?: ReportExportFormat;
}) {
  const safePeriod = sanitizeFilenamePart(period);

  return `erp-fish-report-${report}-${safePeriod}.${format}`;
}

export function buildReportExportAuditSnapshot({
  exportData,
  format,
  sheets,
}: {
  exportData: ReportExportData;
  format: ReportExportFormat;
  // 번들 xlsx일 때 실제로 포함된 시트(이름→row 수). 기본 단일 리포트는 생략한다.
  sheets?: ReportExportSheet[];
}) {
  return {
    report: exportData.report,
    filters: exportData.filters,
    scopedStoreIdCount: exportData.scopedStoreIds.length,
    scopedStoreIds: exportData.scopedStoreIds,
    columnKeys: exportData.columns.map((column) => column.key),
    rowCount: exportData.rows.length,
    format,
    ...(sheets
      ? {
          sheets: sheets.map((sheet) => ({
            name: sheet.name,
            rowCount: sheet.rows.length,
          })),
        }
      : {}),
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
