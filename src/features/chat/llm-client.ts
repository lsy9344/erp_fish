// Anthropic Messages API `fetch` 래퍼. SDK를 추가하지 않는다.
// notifications/line-client.ts와 같은 구조다 — 기본 엔드포인트는 공식 API이고,
// ANTHROPIC_API_BASE_URL로 스텁을 가리키면 실제 키 없이 호출 경로를 검증할 수 있다.

export type ChatModelToolCall = {
  id: string;
  name: string;
  /** 모델이 만든 JSON 문자열. 파싱·검증은 호출자가 한다. */
  argumentsJson: string;
};

/**
 * Anthropic assistant content block. thinking/redacted_thinking 블록은 도구 루프에서
 * 그대로 돌려보내야 하므로 알 수 없는 타입도 보존한다.
 */
export type ChatModelAssistantBlock = {
  type: string;
  [key: string]: unknown;
};

export type ChatModelUserBlock =
  | { type: "text"; text: string }
  | { type: "tool_result"; tool_use_id: string; content: string };

export type ChatModelMessage =
  | { role: "user"; content: string | ChatModelUserBlock[] }
  | { role: "assistant"; content: ChatModelAssistantBlock[] };

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
      content: ChatModelAssistantBlock[];
      text: string | null;
      toolCalls: ChatModelToolCall[];
      usage: ChatModelUsage;
    }
  | { status: "error"; error: string };

// Sonnet 5.5. thinking은 기본(adaptive)이고, effort가 사고 깊이를 조절한다.
// 모델명이 바뀌면 코드가 아니라 ANTHROPIC_CHAT_MODEL로 교체한다.
const DEFAULT_MODEL = "claude-sonnet-5-5";
const EFFORT = "medium";
// thinking 토큰도 max_tokens에 포함된다. 2~4문장 답변과 도구 루프에 여유를 둔다.
const MAX_TOKENS = 8_192;
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 20_000;

function getMessagesUrl() {
  const base = process.env.ANTHROPIC_API_BASE_URL?.replace(/\/$/, "");

  return `${base ?? "https://api.anthropic.com"}/v1/messages`;
}

export function isChatModelConfigured() {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim().length > 0;
}

type WireResponse = {
  content?: unknown;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

function asAssistantBlocks(content: unknown): ChatModelAssistantBlock[] {
  if (!Array.isArray(content)) {
    return [];
  }

  return content.filter(
    (block): block is ChatModelAssistantBlock =>
      typeof block === "object" &&
      block !== null &&
      typeof (block as { type?: unknown }).type === "string",
  );
}

function readText(blocks: ChatModelAssistantBlock[]) {
  const text = blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("")
    .trim();

  return text.length > 0 ? text : null;
}

function readToolCalls(blocks: ChatModelAssistantBlock[]) {
  return blocks.flatMap((block) => {
    if (
      block.type !== "tool_use" ||
      typeof block.id !== "string" ||
      typeof block.name !== "string"
    ) {
      return [];
    }

    return [
      {
        id: block.id,
        name: block.name,
        argumentsJson: JSON.stringify(block.input ?? {}),
      },
    ];
  });
}

/**
 * 프롬프트 순서 규약(설계 §비용 설계): system + tools가 항상 맨 앞의 고정
 * 블록이어야 자동 프롬프트 캐싱이 걸린다. 호출자가 messages 앞에 사용자별로
 * 달라지는 내용을 끼워 넣지 않도록 system을 별도 인자로 받는다.
 */
export async function callChatModel({
  system,
  tools,
  messages,
  toolChoice = "auto",
}: {
  system: string;
  tools: ChatModelTool[];
  messages: ChatModelMessage[];
  toolChoice?: "auto" | "none";
}): Promise<ChatModelResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return { status: "error", error: "ANTHROPIC_API_KEY not configured" };
  }

  let response: Response;

  try {
    response = await fetch(getMessagesUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model: process.env.ANTHROPIC_CHAT_MODEL ?? DEFAULT_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages,
        ...(tools.length > 0
          ? {
              tools: tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.parameters,
              })),
              tool_choice: { type: toolChoice },
            }
          : {}),
        output_config: { effort: EFFORT },
        cache_control: { type: "ephemeral" },
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
      error: `Anthropic API ${response.status}: ${text.slice(0, 200)}`,
    };
  }

  const body = (await response.json().catch(() => null)) as WireResponse | null;
  const content = asAssistantBlocks(body?.content);

  if (content.length === 0) {
    return { status: "error", error: "Anthropic API returned no content" };
  }

  const usage = body?.usage;

  return {
    status: "ok",
    content,
    text: readText(content),
    toolCalls: readToolCalls(content),
    usage: {
      inputTokens:
        (usage?.input_tokens ?? 0) +
        (usage?.cache_creation_input_tokens ?? 0) +
        (usage?.cache_read_input_tokens ?? 0),
      outputTokens: usage?.output_tokens ?? 0,
      cachedInputTokens: usage?.cache_read_input_tokens ?? 0,
    },
  };
}
