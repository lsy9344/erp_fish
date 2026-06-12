import { NextResponse } from "next/server";

import { PermissionAction } from "../../../../../generated/prisma";
import {
  buildDailyMeetingReportExport,
  buildForbiddenReportExportResponsePayload,
  buildMonthlyClosingAnomalyReportExport,
  buildReportCsv,
  buildReportExportAuditSnapshot,
  buildStoreComparisonReportExport,
  getReportExportFilename,
  type ReportExportData,
  type ReportExportType,
} from "~/features/reports/export";
import {
  getHqDailyMeetingReport,
  getHqMonthlyClosingAnomalyReport,
  getHqStoreComparisonReport,
} from "~/features/reports/queries";
import { requireExportCreateAccess } from "~/server/authz";
import { withAuditActorContext, writeAuditLog } from "~/server/audit";
import { db } from "~/server/db";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

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
      { status: 400 },
    );
  }

  let exportData: ReportExportData;

  try {
    exportData = await loadReportExportData(parsed.value);
  } catch (error) {
    if (isNextRedirectError(error)) {
      return forbiddenResponse(request);
    }

    throw error;
  }

  if (isRequestedStoreOutsideResolvedScope(parsed.value, exportData)) {
    return forbiddenResponse(request);
  }

  const csv = buildReportCsv(exportData);
  const filename = getReportExportFilename({
    report: exportData.report,
    period: exportData.period,
  });
  const auditAfter = withAuditActorContext(
    buildReportExportAuditSnapshot({
      exportData,
      format: "csv",
    }),
    {
      actorRole: user.role,
      requiredAction: PermissionAction.EXPORT_CREATE,
    },
  );

  await db.$transaction((tx) =>
    writeAuditLog(tx, {
      action: "report.export.created",
      targetType: "ReportExport",
      targetId: `${exportData.report}:${exportData.period}`,
      actorId: user.id,
      after: auditAfter,
    }),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
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
      startDate: string;
      endDate: string;
      storeId: string | null;
    }
  | {
      report: "monthly";
      month: string;
      storeId: string | null;
    };

function parseExportRequest(
  params: URLSearchParams,
): { ok: true; value: ParsedExportRequest } | { ok: false; message: string } {
  const report = params.get("report");
  const format = params.get("format");

  if (format !== "csv") {
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

    return { ok: true, value: { report, date } };
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

    return {
      ok: true,
      value: {
        report,
        startDate,
        endDate,
        storeId: normalizeOptionalParam(params.get("storeId")),
      },
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
  }
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
  return value === "daily" || value === "comparison" || value === "monthly";
}

function normalizeOptionalParam(value: string | null) {
  return value && value.trim().length > 0 ? value : null;
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
