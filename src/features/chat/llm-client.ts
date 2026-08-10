// OpenAI Chat Completions `fetch` 래퍼. SDK를 추가하지 않는다.
// notifications/line-client.ts와 같은 구조다 — 기본 엔드포인트는 공식 API이고,
// OPENAI_API_BASE_URL로 스텁을 가리키면 실제 키 없이 호출 경로를 검증할 수 있다.

export type ChatModelToolCall = {
  id: string;
  name: string;
  /** 모델이 만든 JSON 문자열. 파싱·검증은 호출자가 한다. */
  argumentsJson: string;
};

export type ChatModelMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      toolCalls?: ChatModelToolCall[];
    }
  | { role: "tool"; toolCallId: string; content: string };

export type ChatModelTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ChatModelUsage = {
  inputTokens: number;
  outputTokens: number;
  /** 자동 프롬프트 캐싱으로 재사용된 입력 토큰. 설계 §비용의 가정을 검증한다. */
  cachedInputTokens: number;
};

export type ChatModelResult =
  | {
      status: "ok";
      content: string | null;
      toolCalls: ChatModelToolCall[];
      usage: ChatModelUsage;
    }
  | { status: "error"; error: string };

// 소형(mini) 등급. 어려운 계산은 리포트 계층이 하므로 상위 모델이 필요 없다.
// 모델명이 바뀌면 코드가 아니라 OPENAI_CHAT_MODEL로 교체한다.
const DEFAULT_MODEL = "gpt-5.4-mini";
const REQUEST_TIMEOUT_MS = 20_000;

function getChatCompletionsUrl() {
  const base = process.env.OPENAI_API_BASE_URL?.replace(/\/$/, "");

  return `${base ?? "https://api.openai.com"}/v1/chat/completions`;
}

export function isChatModelConfigured() {
  return (process.env.OPENAI_API_KEY ?? "").trim().length > 0;
}

function toWireMessage(message: ChatModelMessage) {
  if (message.role === "tool") {
    return {
      role: "tool",
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }

  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: message.content,
      ...(message.toolCalls && message.toolCalls.length > 0
        ? {
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: call.argumentsJson },
            })),
          }
        : {}),
    };
  }

  return { role: message.role, content: message.content };
}

type WireResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
};

/**
 * 프롬프트 순서 규약(설계 §비용 설계): system + tools가 항상 맨 앞의 고정
 * 블록이어야 자동 프롬프트 캐싱이 걸린다. 호출자가 messages 앞에 사용자별로
 * 달라지는 내용을 끼워 넣지 않도록 system을 별도 인자로 받는다.
 */
export async function callChatModel({
  system,
  tools,
  messages,
}: {
  system: string;
  tools: ChatModelTool[];
  messages: ChatModelMessage[];
}): Promise<ChatModelResult> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return { status: "error", error: "OPENAI_API_KEY not configured" };
  }

  let response: Response;

  try {
    response = await fetch(getChatCompletionsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model: process.env.OPENAI_CHAT_MODEL ?? DEFAULT_MODEL,
        messages: [
          { role: "system", content: system },
          ...messages.map(toWireMessage),
        ],
        tools: tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
        tool_choice: "auto",
      }),
    });
  } catch (error) {
    // 타임아웃·네트워크 실패. 자동 재시도는 하지 않는다.
    return {
      status: "error",
      error:
        error instanceof Error ? error.message : "chat model request failed",
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");

    return {
      status: "error",
      error: `OpenAI API ${response.status}: ${text.slice(0, 200)}`,
    };
  }

  const body = (await response.json().catch(() => null)) as WireResponse | null;
  const message = body?.choices?.[0]?.message;

  if (!message) {
    return { status: "error", error: "OpenAI API returned no message" };
  }

  const toolCalls = (message.tool_calls ?? []).flatMap((call) => {
    const name = call.function?.name;

    if (!call.id || !name) {
      return [];
    }

    return [
      {
        id: call.id,
        name,
        argumentsJson: call.function?.arguments ?? "{}",
      },
    ];
  });

  return {
    status: "ok",
    content: message.content ?? null,
    toolCalls,
    usage: {
      inputTokens: body?.usage?.prompt_tokens ?? 0,
      outputTokens: body?.usage?.completion_tokens ?? 0,
      cachedInputTokens: body?.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  };
}
