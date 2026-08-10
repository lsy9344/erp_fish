// 챗봇 남용 방지용 카운터. 인가는 requireReportAccess가 하므로 이건 보안 경계가
// 아니라 비용 방어다(질문 1건이 수천 토큰이다).
//
// ponytail: 인스턴스 메모리에만 산다. 다중 인스턴스 배포에서는 실효 상한이
// 인스턴스 수만큼 늘어난다. 정확한 상한이 필요해지면 DB 카운터로 바꾼다.

export type RateLimitWindow = { count: number; windowStart: number };

export const CHAT_RATE_LIMIT_PER_MINUTE = 10;
export const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * 호출을 한 번 기록하고 상한을 넘었는지 돌려준다.
 * 시각을 인자로 받아 테스트에서 시계를 기다리지 않게 한다.
 */
export function consumeRateLimit(
  store: Map<string, RateLimitWindow>,
  key: string,
  now: number,
  limit = CHAT_RATE_LIMIT_PER_MINUTE,
  windowMs = CHAT_RATE_LIMIT_WINDOW_MS,
) {
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });

    return { limited: false, count: 1 };
  }

  entry.count += 1;

  return { limited: entry.count > limit, count: entry.count };
}
