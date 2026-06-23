import { NextResponse } from "next/server";

import { db } from "~/server/db";
import {
  buildMorningSummaryPayload,
  formatMorningSummaryMessage,
} from "~/features/notifications/morning-summary";
import { sendLineMessage } from "~/features/notifications/line-client";

const TEMPLATE_KEY = "morning-summary-v1";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const cronSecret = process.env.INTERNAL_CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const recipientIdsRaw = process.env.LINE_MORNING_SUMMARY_RECIPIENT_IDS ?? "";

  if (!channelAccessToken) {
    return NextResponse.json(
      { error: "LINE_CHANNEL_ACCESS_TOKEN not configured" },
      { status: 500 },
    );
  }

  const recipientIds = recipientIdsRaw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (recipientIds.length === 0) {
    return NextResponse.json(
      { error: "LINE_MORNING_SUMMARY_RECIPIENT_IDS not configured" },
      { status: 500 },
    );
  }

  const body: unknown = await request.json().catch(() => ({}));
  const bodyDate =
    body !== null &&
    typeof body === "object" &&
    "reportDate" in body &&
    typeof (body as Record<string, unknown>).reportDate === "string"
      ? (body as Record<string, unknown>).reportDate
      : null;
  const reportDate: string =
    typeof bodyDate === "string"
      ? bodyDate
      : new Date().toISOString().slice(0, 10);

  const payload = await buildMorningSummaryPayload(reportDate);
  const message = formatMorningSummaryMessage(payload);

  const results: Array<{
    recipientId: string;
    status: "sent" | "failed";
    error?: string;
  }> = [];

  for (const recipientId of recipientIds) {
    const result = await sendLineMessage(channelAccessToken, {
      to: recipientId,
      messages: [{ type: "text", text: message }],
    });

    const status = result.status === "sent" ? "sent" : "failed";
    const error = result.status === "error" ? result.error : undefined;

    results.push({ recipientId, status, error });

    await db.notificationDeliveryLog.create({
      data: {
        provider: "line",
        templateKey: TEMPLATE_KEY,
        recipientId,
        status,
        error: error ?? null,
      },
    });
  }

  const sentCount = results.filter((r) => r.status === "sent").length;
  const failedCount = results.filter((r) => r.status === "failed").length;

  return NextResponse.json({
    reportDate,
    sentCount,
    failedCount,
    results,
  });
}
