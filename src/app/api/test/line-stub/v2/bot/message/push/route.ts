import { NextResponse } from "next/server";

// WO-10(2026-06-22): LINE Messaging API 스텁. LINE_API_BASE_URL이 이 라우트를 가리키도록 설정하면
// 실제 LINE 채널 없이 아침 요약 전송 경로(NotificationDeliveryLog 기록 포함)를 테스트할 수 있다.
// 운영 환경에서는 404를 반환하여 노출되지 않도록 한다.
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({});
}
