import { NextResponse } from "next/server";
import { z } from "zod";

import {
  CHAT_TOOL_BY_NAME,
  CHAT_TOOLS,
  type ChatToolResult,
} from "~/features/chat/tools";
import {
  callChatModel,
  isChatModelConfigured,
  type ChatModelMessage,
} from "~/features/chat/llm-client";
import { getChatSystemPrompt } from "~/features/chat/prompt";
import {
  consumeRateLimit,
  type RateLimitWindow,
} from "~/features/chat/rate-limit";
import { requireReportAccess } from "~/server/authz";

const MAX_MESSAGE_LENGTH = 500;
const MAX_HISTORY_TURNS = 12;
// 도구 하나(get_month_overview)에 원인 분석 근거가 모두 들어 있어 대개 1~2라운드에
// 끝난다. 라운드 수가 곧 토큰 비용이자 응답시간이다(설계 §비용 설계).
const MAX_TOOL_ROUNDS = 3;

const noStore = { "Cache-Control": "no-store" } as const;

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(MAX_MESSAGE_LENGTH),
      }),
    )
    .min(1),
});

const rateLimitByUser = new Map<string, RateLimitWindow>();

function isNextRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

function errorResponse(status: number, error: string, message: string) {
  return NextResponse.json({ error, message }, { status, headers: noStore });
}

/**
 * 도구를 하나도 쓰지 못한 응답 = 카탈로그가 못 덮은 질문이다. 도구 추가 근거로
 * 쓰기 위해 구조화 로그만 남긴다. 테이블을 만들지 않는 이유는 이 기능 전체를
 * 마이그레이션 0건으로 유지하기 위해서다(작업지시서 §0).
 */
function replyResponse({
  reply,
  usedTools,
  question,
}: {
  reply: string;
  usedTools: string[];
  question: string;
}) {
  if (usedTools.length === 0) {
    console.info(
      "[chat] unanswered",
      JSON.stringify({ question, usedTools: [] }),
    );
  }

  return NextResponse.json({ reply, usedTools }, { headers: noStore });
}

/** 도구 실행 실패를 500으로 흘리지 않고 대화로 되돌린다. LLM이 사유를 전한다. */
async function runTool(name: string, argumentsJson: string) {
  const tool = CHAT_TOOL_BY_NAME.get(name);

  if (!tool) {
    return { ok: false, error: `알 수 없는 도구입니다: ${name}` };
  }

  let args: unknown;

  try {
    args = JSON.parse(argumentsJson) as unknown;
  } catch {
    return { ok: false, error: "도구 인자가 올바른 JSON이 아닙니다." };
  }

  try {
    return await tool.run(args);
  } catch (error) {
    // 권한 부족(LABOR_VIEW)도 여기로 온다. authz는 redirect를 던진다.
    if (isNextRedirectError(error)) {
      return {
        ok: false,
        error: "이 정보를 조회할 권한이 없습니다.",
      } satisfies ChatToolResult;
    }

    return {
      ok: false,
      error:
        error instanceof Error
          ? `조회 중 오류가 발생했습니다: ${error.message}`
          : "조회 중 오류가 발생했습니다.",
    } satisfies ChatToolResult;
  }
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireReportAccess>>;

  try {
    user = await requireReportAccess();
  } catch (error) {
    if (isNextRedirectError(error)) {
      return errorResponse(403, "forbidden", "조회 권한이 없습니다.");
    }

    throw error;
  }

  if (!isChatModelConfigured()) {
    return errorResponse(
      503,
      "llm_unavailable",
      "챗봇이 아직 설정되지 않았습니다.",
    );
  }

  if (consumeRateLimit(rateLimitByUser, user.id, Date.now()).limited) {
    return errorResponse(
      429,
      "rate_limited",
      "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return errorResponse(
      400,
      "bad_request",
      `질문은 ${MAX_MESSAGE_LENGTH}자 이내여야 합니다.`,
    );
  }

  const system = await getChatSystemPrompt();
  const messages: ChatModelMessage[] = parsed.data.messages
    .slice(-MAX_HISTORY_TURNS)
    .map((message) =>
      message.role === "assistant"
        ? { role: "assistant" as const, content: message.content }
        : { role: "user" as const, content: message.content },
    );
  const tools = CHAT_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
  const usedTools: string[] = [];
  const question = parsed.data.messages.at(-1)?.content ?? "";
  // 토큰은 이 기능의 유일한 반복 비용이다. 라운드를 합산해 한 줄로 남긴다.
  const usage = { input: 0, output: 0, cached: 0, rounds: 0 };

  const logUsage = () => {
    console.info(
      "[chat] usage",
      JSON.stringify({
        model: process.env.OPENAI_CHAT_MODEL ?? "default",
        rounds: usage.rounds,
        inputTokens: usage.input,
        cachedInputTokens: usage.cached,
        outputTokens: usage.output,
        usedTools,
      }),
    );
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const result = await callChatModel({ system, tools, messages });

    if (result.status === "error") {
      console.error("[chat] llm call failed", result.error);

      return errorResponse(
        503,
        "llm_unavailable",
        "답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }

    usage.rounds += 1;
    usage.input += result.usage.inputTokens;
    usage.output += result.usage.outputTokens;
    usage.cached += result.usage.cachedInputTokens;

    if (result.toolCalls.length === 0) {
      logUsage();

      return replyResponse({
        reply: result.content ?? "",
        usedTools,
        question,
      });
    }

    messages.push({
      role: "assistant",
      content: result.content,
      toolCalls: result.toolCalls,
    });

    for (const call of result.toolCalls) {
      const toolResult = await runTool(call.name, call.argumentsJson);

      usedTools.push(call.name);
      messages.push({
        role: "tool",
        toolCallId: call.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  // 상한까지 도구만 부르고 답을 못 냈다. 지금까지의 근거로 마무리하게 한다.
  messages.push({
    role: "user",
    content:
      "더 조회하지 말고 지금까지 확인한 내용만으로 답하세요. 일부만 확인했다는 사실을 밝히세요.",
  });

  const finalResult = await callChatModel({ system, tools: [], messages });

  if (finalResult.status === "error") {
    console.error("[chat] llm final call failed", finalResult.error);

    return errorResponse(
      503,
      "llm_unavailable",
      "답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  }

  usage.rounds += 1;
  usage.input += finalResult.usage.inputTokens;
  usage.output += finalResult.usage.outputTokens;
  usage.cached += finalResult.usage.cachedInputTokens;
  logUsage();

  return replyResponse({
    reply: finalResult.content ?? "",
    usedTools,
    question,
  });
}
