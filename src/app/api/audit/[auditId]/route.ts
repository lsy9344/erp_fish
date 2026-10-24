import { getAuditHistoryDetail } from "~/features/audit/audit-queries";

export async function GET(
  _request: Request,
  context: { params: Promise<{ auditId: string }> },
) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const { auditId } = await context.params;
    const detail = await getAuditHistoryDetail(auditId);
    return detail
      ? Response.json(detail, { headers })
      : Response.json({ error: "not_found" }, { status: 404, headers });
  } catch (error) {
    if (
      error instanceof Error &&
      "digest" in error &&
      typeof error.digest === "string" &&
      error.digest.startsWith("NEXT_REDIRECT")
    ) {
      return Response.json({ error: "forbidden" }, { status: 403, headers });
    }
    throw error;
  }
}
