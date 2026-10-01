import { NextResponse } from "next/server";

import {
  PermissionAction,
  StoreAccessMode,
} from "../../../../../generated/prisma";
import { buildForbiddenReportExportResponsePayload } from "~/features/reports/export";
import { buildCustomerWorkbookExport } from "~/features/reports/customer-workbook-export";
import { getFullSourceWorkbookExportData } from "~/features/reports/source-workbook-export";
import {
  getHeadquartersStoreScope,
  requireExportCreateAccess,
  requireLaborViewAccess,
  requireReportAccess,
} from "~/server/authz";
import { withAuditActorContext, writeAuditLog } from "~/server/audit";
import { db } from "~/server/db";

const FULL_EXPORT_FILENAME = "erp-fish-full-data.xlsx";

export async function GET() {
  let user: Awaited<ReturnType<typeof requireExportCreateAccess>>;

  try {
    user = await requireReportAccess();
    await requireExportCreateAccess();
    await requireLaborViewAccess();
    const scope = await getHeadquartersStoreScope();
    if (scope.mode !== StoreAccessMode.ALL_STORES) {
      return forbiddenResponse();
    }
  } catch (error) {
    if (isNextRedirectError(error)) {
      return forbiddenResponse();
    }

    throw error;
  }

  const {
    templateBytes,
    sourceSheet,
    additionalPersonnelSheet,
    scopedStoreIds,
  } = await getFullSourceWorkbookExportData();
  const body = await buildCustomerWorkbookExport({
    templateBytes,
    sourceSheet,
    additionalPersonnelSheet,
  });
  const auditAfter = withAuditActorContext(
    {
      export: "full-customer-workbook",
      format: "xlsx",
      filename: FULL_EXPORT_FILENAME,
      scopedStoreIdCount: scopedStoreIds.length,
      scopedStoreIds,
      inputRowCount: sourceSheet.rows.length,
    },
    {
      actorRole: user.role,
      requiredAction: PermissionAction.EXPORT_CREATE,
    },
  );

  await db.$transaction((tx) =>
    writeAuditLog(tx, {
      action: "report.export.created",
      targetType: "ReportExport",
      targetId: "full-customer-workbook",
      actorId: user.id,
      after: auditAfter,
    }),
  );

  return new Response(body, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${FULL_EXPORT_FILENAME}"`,
      "Cache-Control": "no-store",
    },
  });
}

function forbiddenResponse() {
  return NextResponse.json(buildForbiddenReportExportResponsePayload({}), {
    status: 403,
    headers: { "Cache-Control": "no-store" },
  });
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
