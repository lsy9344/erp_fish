import { NextResponse } from "next/server";

import { PermissionAction } from "../../../../../generated/prisma";
import {
  buildBundledReportXlsx,
  buildDailyMeetingReportExport,
  buildForbiddenReportExportResponsePayload,
  buildInventoryPositionReportExport,
  buildMonthlyClosingAnomalyReportExport,
  buildMonthlyProfitLossSheet,
  buildPeriodContrastExport,
  buildPeriodTrendExport,
  buildProductSalesSheet,
  buildReportCsv,
  buildReportExportAuditSnapshot,
  buildReportXlsx,
  buildStoreComparisonReportExport,
  getReportExportFilename,
  isReportExportFormat,
  reportExportToSheet,
  type ReportExportData,
  type ReportExportFormat,
  type ReportExportType,
} from "~/features/reports/export";
import { buildAllMonthsProfitAndLoss } from "~/features/reports/monthly-profit-loss";
import {
  getHqDailyMeetingReport,
  getHqMonthlyClosingAnomalyReport,
  getHqPeriodContrastReport,
  getHqPeriodTrendReport,
  getHqProductSalesReportForRange,
  getHqStoreComparisonReport,
} from "~/features/reports/queries";
import type { ReportExportSheet } from "~/features/reports/export";
import { buildPeriodTrendYearRange } from "~/features/reports/period-analysis";
import { getHqInventoryPositionReport } from "~/features/reports/inventory-position-queries";
import { requireExportCreateAccess } from "~/server/authz";
import { withAuditActorContext, writeAuditLog } from "~/server/audit";
import { db } from "~/server/db";

export async function GET(request: Request) {
  let user: Awaited<ReturnType<typeof requireExportCreateAccess>>;

  try {
    user = await requireExportCreateAccess();
  } catch (error) {
    if (isNextRedirectError(error)) {
      return forbiddenResponse(request);
    }

    throw error;
  }

  const url = new URL(request.url);
  const parsed = parseExportRequest(url.searchParams);

  if (!parsed.ok) {
    return NextResponse.json(
      { error: "bad_request", message: parsed.message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  let exportData: ReportExportData;
  let comparisonSheets: ReportExportSheet[] | undefined;

  try {
    // 기간 대조는 한 번의 조회 결과로 현재 데이터와 3개 시트를 함께 만든다.
    // 두 번 조회하면 그 사이 장부 정정으로 시트끼리 값이 달라질 수 있다.
    if (
      parsed.value.report === "comparison" &&
      parsed.value.mode === "contrast"
    ) {
      const contrast = await getHqPeriodContrastReport({
        startDate: parsed.value.startDate,
        endDate: parsed.value.endDate,
        baseStartDate: parsed.value.baseStartDate ?? undefined,
        baseEndDate: parsed.value.baseEndDate ?? undefined,
        storeId: parsed.value.storeId,
      });
      const built = buildPeriodContrastExport({
        base: contrast.base,
        current: contrast.current,
        contrastRows: contrast.contrastRows,
        // 실제 권한 범위에 적용된 지점만 export 필터·감사 기록에 남긴다.
        // 요청 원문을 넣으면 권한 밖 지점도 범위 검사에서 같다고 오판한다.
        storeId: contrast.current.selectedStoreId,
      });
      exportData = built.exportData;
      comparisonSheets = built.sheets;
    } else {
      exportData = await loadReportExportData(parsed.value);
    }
  } catch (error) {
    if (isNextRedirectError(error)) {
      return forbiddenResponse(request);
    }

    throw error;
  }

  if (isRequestedStoreOutsideResolvedScope(parsed.value, exportData)) {
    return forbiddenResponse(request);
  }

  const format = parsed.format;
  const filename = getReportExportFilename({
    report: exportData.report,
    period: exportData.period,
    format,
  });

  // 먼저 출력물을 만든다. workbook 생성이 실패하면 감사 로그를 남기지 않는다(유령 export 방지).
  // 번들 xlsx는 실제 포함 시트를 audit snapshot에도 기록한다.
  let body: BodyInit;
  let contentType: string;
  let auditSheets: ReportExportSheet[] | undefined;

  if (format === "xlsx") {
    contentType =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    // WO-15(2026-06-29): 월별 xlsx는 5개 고정 시트(요약/기간조회_RAW/월별손익/재고현황/품목매출)로
    // 번들한다. 다른 리포트는 종전대로 단일 시트로 내보낸다.
    if (parsed.value.report === "monthly") {
      auditSheets = await buildMonthlyBundleSheets(parsed.value, exportData);
      body = await buildBundledReportXlsx(auditSheets);
    } else if (
      parsed.value.report === "comparison" &&
      parsed.value.mode === "contrast"
    ) {
      auditSheets = comparisonSheets;
      body = await buildBundledReportXlsx(comparisonSheets ?? []);
    } else {
      body = await buildReportXlsx(exportData);
    }
  } else {
    contentType = "text/csv; charset=utf-8";
    body = buildReportCsv(exportData);
  }

  const auditAfter = withAuditActorContext(
    buildReportExportAuditSnapshot({
      exportData,
      format,
      sheets: auditSheets,
    }),
    {
      actorRole: user.role,
      requiredAction: PermissionAction.EXPORT_CREATE,
    },
  );

  // 출력물이 만들어진 뒤에만 감사 로그를 남긴다(두 포맷 모두 format 필드로 구분).
  await db.$transaction((tx) =>
    writeAuditLog(tx, {
      action: "report.export.created",
      targetType: "ReportExport",
      targetId: `${exportData.report}:${exportData.period}`,
      actorId: user.id,
      after: auditAfter,
    }),
  );

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

type ParsedExportRequest =
  | {
      report: "daily";
      date: string;
    }
  | {
      report: "comparison";
      // WO-0806 [F]: single(기존) / contrast(엑셀 `분석`) / trend(시계열).
      // single은 기존 출력과 바이트 단위로 같아야 한다.
      mode: "single" | "contrast" | "trend";
      startDate: string;
      endDate: string;
      storeId: string | null;
      baseStartDate: string | null;
      baseEndDate: string | null;
      axis: "store" | "metric";
      unit: "month" | "year";
      year: number;
      fromYear: number;
      toYear: number;
      fromMonth: number;
      toMonth: number;
      metricKey: string | null;
    }
  | {
      report: "monthly";
      month: string;
      storeId: string | null;
    }
  | {
      report: "inventory";
      date: string;
      storeId: string | null;
      category: string | null;
      product: string | null;
    };

function parseExportRequest(
  params: URLSearchParams,
):
  | { ok: true; value: ParsedExportRequest; format: ReportExportFormat }
  | { ok: false; message: string } {
  const report = params.get("report");
  // WO-15(2026-06-28): csv와 xlsx를 모두 허용한다. 기본은 csv.
  const format = params.get("format") ?? "csv";

  if (!isReportExportFormat(format)) {
    return { ok: false, message: "지원하지 않는 export 형식입니다." };
  }

  if (!isReportExportType(report)) {
    return { ok: false, message: "지원하지 않는 리포트입니다." };
  }

  if (report === "daily") {
    const date = params.get("date");

    if (!date || !isValidDateInput(date)) {
      return { ok: false, message: "조회 날짜를 확인해 주세요." };
    }

    return { ok: true, value: { report, date }, format };
  }

  if (report === "comparison") {
    const startDate = params.get("startDate");
    const endDate = params.get("endDate");

    if (
      !startDate ||
      !endDate ||
      !isValidDateInput(startDate) ||
      !isValidDateInput(endDate) ||
      startDate > endDate
    ) {
      return { ok: false, message: "조회 기간을 확인해 주세요." };
    }

    const modeParam = params.get("mode");
    const mode =
      modeParam === "contrast" || modeParam === "trend" ? modeParam : "single";
    const baseStartDate = normalizeOptionalParam(params.get("baseStartDate"));
    const baseEndDate = normalizeOptionalParam(params.get("baseEndDate"));

    if (
      (baseStartDate && !isValidDateInput(baseStartDate)) ||
      (baseEndDate && !isValidDateInput(baseEndDate)) ||
      Boolean(baseStartDate) !== Boolean(baseEndDate) ||
      (baseStartDate && baseEndDate && baseStartDate > baseEndDate)
    ) {
      return { ok: false, message: "대조 기간을 확인해 주세요." };
    }

    if (mode === "contrast" && format !== "xlsx") {
      return {
        ok: false,
        message:
          "기간 대조는 3개 시트를 포함하는 Excel 형식으로 내려받아 주세요.",
      };
    }

    const currentYear = getCurrentKstYear();
    const year = toBoundedInt(params.get("year"), currentYear, 2000, 2100);
    const yearRange = buildPeriodTrendYearRange({
      fromYear: normalizeOptionalParam(params.get("fromYear")),
      toYear: normalizeOptionalParam(params.get("toYear")) ?? year,
      fallbackYear: currentYear,
    });

    return {
      ok: true,
      value: {
        report,
        mode,
        startDate,
        endDate,
        storeId: normalizeOptionalParam(params.get("storeId")),
        baseStartDate,
        baseEndDate,
        axis: params.get("axis") === "metric" ? "metric" : "store",
        unit: params.get("unit") === "year" ? "year" : "month",
        year,
        fromYear: yearRange.fromYear,
        toYear: yearRange.toYear,
        fromMonth: toBoundedInt(params.get("fromMonth"), 1, 1, 12),
        toMonth: toBoundedInt(params.get("toMonth"), 12, 1, 12),
        metricKey: normalizeOptionalParam(params.get("metricKey")),
      },
      format,
    };
  }

  if (report === "inventory") {
    const date = params.get("date");

    if (!date || !isValidDateInput(date)) {
      return { ok: false, message: "조회 날짜를 확인해 주세요." };
    }

    return {
      ok: true,
      value: {
        report,
        date,
        storeId: normalizeOptionalParam(params.get("storeId")),
        category: normalizeOptionalParam(params.get("category")),
        product: normalizeOptionalParam(params.get("product")),
      },
      format,
    };
  }

  const month = params.get("month");

  if (!month || !isValidMonthInput(month)) {
    return { ok: false, message: "조회 월을 확인해 주세요." };
  }

  return {
    ok: true,
    value: {
      report,
      month,
      storeId: normalizeOptionalParam(params.get("storeId")),
    },
    format,
  };
}

async function loadReportExportData(
  request: ParsedExportRequest,
): Promise<ReportExportData> {
  switch (request.report) {
    case "daily":
      return buildDailyMeetingReportExport(
        await getHqDailyMeetingReport({ dateQuery: request.date }),
      );
    case "comparison":
      // mode=single은 기존 출력 그대로. contrast/trend는 엑셀 대응 모양으로 내보낸다.
      if (request.mode === "contrast") {
        const contrast = await getHqPeriodContrastReport({
          startDate: request.startDate,
          endDate: request.endDate,
          baseStartDate: request.baseStartDate ?? undefined,
          baseEndDate: request.baseEndDate ?? undefined,
          storeId: request.storeId,
        });

        return buildPeriodContrastExport({
          base: contrast.base,
          current: contrast.current,
          contrastRows: contrast.contrastRows,
          storeId: contrast.current.selectedStoreId,
        }).exportData;
      }

      if (request.mode === "trend") {
        const trend = await getHqPeriodTrendReport({
          axis: request.axis,
          unit: request.unit,
          year: request.year,
          years: Array.from(
            { length: request.toYear - request.fromYear + 1 },
            (_, index) => request.fromYear + index,
          ),
          fromMonth: request.fromMonth,
          toMonth: request.toMonth,
          metricKey: request.metricKey,
          storeId: request.storeId,
        });

        return buildPeriodTrendExport({
          axis: trend.axis,
          columns: trend.columns,
          rows: trend.rows,
          metric: trend.metric,
          storeId: trend.selectedStoreId,
        });
      }

      return buildStoreComparisonReportExport(
        await getHqStoreComparisonReport({
          startDate: request.startDate,
          endDate: request.endDate,
          storeId: request.storeId,
        }),
      );
    case "monthly":
      return buildMonthlyClosingAnomalyReportExport(
        await getHqMonthlyClosingAnomalyReport({
          month: request.month,
          storeId: request.storeId,
        }),
      );
    case "inventory":
      return buildInventoryPositionReportExport(
        await getHqInventoryPositionReport({
          date: request.date,
          storeId: request.storeId,
          category: request.category,
          product: request.product,
        }),
      );
  }
}

// 월(YYYY-MM)을 시작일/종료일(YYYY-MM-DD)로 바꾼다. 종료일은 그 달의 마지막 날.
function monthDateRange(month: string): { startDate: string; endDate: string } {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

// WO-15(2026-06-29, fixed 2026-06-30): 월별 xlsx 5시트 번들. summary는 호출부에서 만든
// 월별 KPI(요약)를 쓰고, 품목매출은 월 마지막 날 대표값이 아니라 월 시작일-종료일 기간 합산을 쓴다.
async function buildMonthlyBundleSheets(
  request: Extract<ParsedExportRequest, { report: "monthly" }>,
  summaryExport: ReportExportData,
) {
  const { startDate, endDate } = monthDateRange(request.month);

  const [comparison, inventory, productSales, pnl] = await Promise.all([
    getHqStoreComparisonReport({
      startDate,
      endDate,
      storeId: request.storeId,
    }),
    getHqInventoryPositionReport({
      date: endDate,
      storeId: request.storeId,
      category: null,
      product: null,
    }),
    getHqProductSalesReportForRange({
      startDate,
      endDate,
      storeId: request.storeId,
    }),
    buildAllMonthsProfitAndLoss({ storeId: request.storeId }),
  ]);

  return [
    reportExportToSheet(summaryExport, "요약"),
    reportExportToSheet(
      buildStoreComparisonReportExport(comparison),
      "기간조회_RAW",
    ),
    buildMonthlyProfitLossSheet(pnl),
    reportExportToSheet(
      buildInventoryPositionReportExport(inventory),
      "재고현황",
    ),
    buildProductSalesSheet(productSales),
  ];
}

function forbiddenResponse(request: Request) {
  return new Response(
    JSON.stringify(
      buildForbiddenReportExportResponsePayload({
        report: new URL(request.url).searchParams.get("report"),
      }),
    ),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

function isReportExportType(value: string | null): value is ReportExportType {
  return (
    value === "daily" ||
    value === "comparison" ||
    value === "monthly" ||
    value === "inventory"
  );
}

function normalizeOptionalParam(value: string | null) {
  return value && value.trim().length > 0 ? value : null;
}

function toBoundedInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? Math.trunc(parsed)
    : fallback;
}

function getCurrentKstYear() {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
    }).format(new Date()),
  );
}

function isValidDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidMonthInput(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);

  if (!match) {
    return false;
  }

  const month = Number(match[2]);

  return month >= 1 && month <= 12;
}

function isRequestedStoreOutsideResolvedScope(
  request: ParsedExportRequest,
  exportData: ReportExportData,
) {
  if (request.report === "daily" || !request.storeId) {
    return false;
  }

  return exportData.filters.storeId !== request.storeId;
}

function isNextRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}
