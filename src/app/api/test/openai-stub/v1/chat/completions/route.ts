import { NextResponse } from "next/server";

// OpenAI Chat Completions 스텁. OPENAI_API_BASE_URL이 이 라우트를 가리키도록 설정하면
// 실제 API 키 없이 /api/chat의 도구 루프(도구 호출 → 실행 → 답변)를 검증할 수 있다.
// line-stub과 동일하게 운영 환경에서는 404를 반환한다.

type StubRequestBody = {
  messages?: Array<{ role?: string; content?: unknown }>;
};

// 로컬 확인용: 도구가 실제 DB에서 가져온 값을 그대로 보여준다. LLM 키 없이도
// 리포트 화면과 숫자를 대조할 수 있게 하려는 것이고, 자연어 문장으로 옥기는 일은
// 실제 모델이 한다. 말풍선이 넘치지 않게 잘라서 보낸다.
const MAX_ECHO_LENGTH = 1_200;

function echoToolResults(messages: StubRequestBody["messages"]) {
  const payloads = (messages ?? [])
    .filter((message) => message.role === "tool")
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content),
    )
    .join("\n");

  if (payloads.length <= MAX_ECHO_LENGTH) {
    return payloads;
  }

  return `${payloads.slice(0, MAX_ECHO_LENGTH)}\n…(이하 생략)`;
}

function completion(message: Record<string, unknown>, finishReason: string) {
  return NextResponse.json({
    id: "chatcmpl-stub",
    object: "chat.completion",
    choices: [{ index: 0, message, finish_reason: finishReason }],
  });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as StubRequestBody;
  const messages = body.messages ?? [];
  const hasToolResult = messages.some((message) => message.role === "tool");

  // 2회차 — 도구 결과가 돌아왔으므로 최종 답변을 낸다.
  if (hasToolResult) {
    return completion(
      {
        role: "assistant",
        content: `스텁 답변: 도구 결과를 받았습니다.\n\n${echoToolResults(messages)}`,
      },
      "stop",
    );
  }

  const lastUserContent = [...messages]
    .reverse()
    .find((message) => message.role === "user")?.content;
  const question = typeof lastUserContent === "string" ? lastUserContent : "";

  // 도구를 쓸 수 없는 질문 경로(거절 로그)를 테스트할 수 있게 한 갈래를 둔다.
  if (question.includes("스텁-도구없음")) {
    return completion(
      { role: "assistant", content: "그 질문은 아직 지원하지 않습니다." },
      "stop",
    );
  }

  const wantsLoss = question.includes("떨이") || question.includes("손실");
  const toolName = question.includes("급여")
    ? "get_labor_report"
    : wantsLoss
      ? "get_loss_breakdown"
      : "get_period_metrics";
  const toolArguments = question.includes("급여")
    ? { month: "2026-06" }
    : wantsLoss
      ? {
          startDate: "2026-06-01",
          endDate: "2026-06-30",
          lossTypeNames: ["떨이", "폐기"],
        }
      : { startDate: "2026-06-20", endDate: "2026-06-20" };

  return completion(
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call-stub-1",
          type: "function",
          function: {
            name: toolName,
            arguments: JSON.stringify(toolArguments),
          },
        },
      ],
    },
    "tool_calls",
  );
}
