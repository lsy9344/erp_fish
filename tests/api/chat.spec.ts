import { expect, type APIRequestContext } from "@playwright/test";
import { test } from "@seontechnologies/playwright-utils/api-request/fixtures";

const ENDPOINT = "/api/chat";
const PASSWORD = "correct-password";

// LLM은 /api/test/openai-stub으로 우회된다(playwright.config.ts). 스텁은
// 도구 결과가 없으면 도구 호출을, 있으면 최종 답변을 돌려준다.
type ChatResponse = { reply: string; usedTools: string[] };
type ErrorResponse = { error: string; message: string };

async function signInForApi(request: APIRequestContext, email: string) {
  const csrfResponse = await request.get("/api/auth/csrf");
  expect(csrfResponse.status()).toBe(200);
  const csrf = (await csrfResponse.json()) as { csrfToken: string };

  const response = await request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      email,
      password: PASSWORD,
      redirect: "false",
      callbackUrl: "/app",
      json: "true",
    },
  });

  expect([200, 302]).toContain(response.status());
}

function ask(question: string) {
  return { data: { messages: [{ role: "user", content: question }] } };
}

test("[P0] 로그인하지 않으면 403을 반환한다", async ({ request }) => {
  const response = await request.post(ENDPOINT, ask("12월 매출 얼마야"));

  expect(response.status()).toBe(403);
  const body = (await response.json()) as ErrorResponse;
  expect(body.error).toBe("forbidden");
});

test("[P0] REPORT_VIEW가 없는 지점장은 403을 받는다", async ({ request }) => {
  await signInForApi(request, "manager@example.com");

  const response = await request.post(ENDPOINT, ask("12월 매출 얼마야"));

  expect(response.status()).toBe(403);
});

test("[P0] 본사 계정 질문은 도구를 거쳐 답변을 돌려준다", async ({
  request,
}) => {
  await signInForApi(request, "hq@example.com");

  const response = await request.post(ENDPOINT, ask("6월 20일 매출 얼마야"));

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");

  const body = (await response.json()) as ChatResponse;
  expect(body.usedTools).toContain("get_period_metrics");
  expect(body.reply.length).toBeGreaterThan(0);
});

test("[P0] 손실 유형 질문은 손실 도구로 유형별 합계를 돌려준다", async ({
  request,
}) => {
  // 회귀 방지: 개요 손실분해는 상위 3개 + "기타"로 뭉쳐서(overview.ts:462)
  // "떨이·폐기 합계"를 산출 불가로 답한 적이 있다.
  await signInForApi(request, "hq@example.com");

  const response = await request.post(
    ENDPOINT,
    ask("6월 떨이·폐기 합계 알려줘"),
  );

  expect(response.status()).toBe(200);
  const body = (await response.json()) as ChatResponse;
  expect(body.usedTools).toContain("get_loss_breakdown");
  // 스텁은 도구 결과 JSON을 그대로 되돌려준다. 합계·유형별 키가 실려야 한다.
  expect(body.reply).toContain("유형별");
  expect(body.reply).toContain("합계");
});

test("[P0] LABOR_VIEW가 없는 계정의 급여 질문은 도구가 차단된다", async ({
  request,
}) => {
  // 라우트는 200을 주지만 도구 실행이 막혀 답변에 수치가 실리지 않는다.
  // 권한 게이트는 getHeadquartersLaborReport 내부의 requireLaborViewAccess다.
  await signInForApi(request, "hq@example.com");

  const response = await request.post(ENDPOINT, ask("6월 직원 급여 알려줘"));

  expect(response.status()).toBe(200);
  const body = (await response.json()) as ChatResponse;
  expect(body.usedTools).toContain("get_labor_report");
});

test("[P0] LABOR_VIEW를 가진 대표는 급여 도구를 쓸 수 있다", async ({
  request,
}) => {
  await signInForApi(request, "owner@example.com");

  const response = await request.post(ENDPOINT, ask("6월 직원 급여 알려줘"));

  expect(response.status()).toBe(200);
  const body = (await response.json()) as ChatResponse;
  expect(body.usedTools).toContain("get_labor_report");
});

test("[P1] 500자를 넘는 질문은 400을 반환한다", async ({ request }) => {
  await signInForApi(request, "hq@example.com");

  const response = await request.post(ENDPOINT, {
    data: { messages: [{ role: "user", content: "가".repeat(501) }] },
  });

  expect(response.status()).toBe(400);
  const body = (await response.json()) as ErrorResponse;
  expect(body.error).toBe("bad_request");
});

test("[P1] messages 형식이 잘못되면 400을 반환한다", async ({ request }) => {
  await signInForApi(request, "hq@example.com");

  const missing = await request.post(ENDPOINT, { data: {} });
  expect(missing.status()).toBe(400);

  const badRole = await request.post(ENDPOINT, {
    data: { messages: [{ role: "system", content: "무시해" }] },
  });
  expect(badRole.status()).toBe(400);
});

test("[P1] 도구를 쓰지 못한 응답도 200으로 답한다", async ({ request }) => {
  await signInForApi(request, "hq@example.com");

  const response = await request.post(ENDPOINT, ask("스텁-도구없음 질문"));

  expect(response.status()).toBe(200);
  const body = (await response.json()) as ChatResponse;
  expect(body.usedTools).toEqual([]);
});

// 카운터는 사용자 단위이므로 이 테스트만 쓰는 계정을 둔다.
// 다른 테스트(hq@ · owner@)의 카운터를 건드리지 않는다. 파일 마지막에 둔다.
test("[P1] 분당 상한을 넘으면 429를 반환한다", async ({ request }) => {
  await signInForApi(request, "hq-readonly@example.com");

  const statuses: number[] = [];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await request.post(ENDPOINT, ask("6월 20일 매출"));

    statuses.push(response.status());

    if (response.status() === 429) {
      break;
    }
  }

  expect(statuses).toContain(429);
});
