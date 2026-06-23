export type LineMessagePayload = {
  to: string;
  messages: Array<{
    type: "text";
    text: string;
  }>;
};

export type LineSendResult =
  | { status: "sent" }
  | { status: "error"; error: string };

// WO-10(2026-06-22): 기본 엔드포인트는 LINE 공식 API다. 테스트/스테이징에서는
// LINE_API_BASE_URL로 스텁 서버를 가리켜 실제 LINE 채널 없이 전송 경로를 검증할 수 있다.
function getLineMessagePushUrl() {
  const base = process.env.LINE_API_BASE_URL?.replace(/\/$/, "");

  return `${base ?? "https://api.line.me"}/v2/bot/message/push`;
}

export async function sendLineMessage(
  channelAccessToken: string,
  payload: LineMessagePayload,
): Promise<LineSendResult> {
  const response = await fetch(getLineMessagePushUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      status: "error",
      error: `LINE API ${response.status}: ${text.slice(0, 200)}`,
    };
  }

  return { status: "sent" };
}
