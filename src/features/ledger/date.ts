export const LEGAL_SEOUL_TZ = "Asia/Seoul";

export function getKstBusinessDate(input: string | Date = new Date()) {
  if (typeof input === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      throw new Error("Invalid business date.");
    }

    const [year, month, day] = input.split("-");
    const date = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0),
    );

    if (date.toISOString().slice(0, 10) !== input) {
      throw new Error("Invalid business date.");
    }

    return date;
  }

  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: LEGAL_SEOUL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(input)
    .split("-");

  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0),
  );
}

export function getKstBusinessDateParam(input: string | Date = new Date()) {
  const date = getKstBusinessDate(input);

  return date.toISOString().slice(0, 10);
}

export function getKstLedgerDateParam(input: string | Date = new Date()) {
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return getKstBusinessDateParam(input);
  }

  const date = typeof input === "string" ? new Date(input) : input;

  return getKstBusinessDateParam(date);
}

export function getTodayKstInput() {
  return getKstBusinessDateParam(new Date());
}

export function isTodayKstDateParam(
  dateParam: string,
  today = getTodayKstInput(),
) {
  return dateParam === today;
}

// WO-A(2026-06-22): 지점장 전용 저장/제출 액션은 KST 오늘 날짜만 허용한다.
// 화면은 과거 날짜를 막지만 서버 액션은 클라이언트가 보낸 closingDate를 그대로
// 사용하므로, 요청 조작으로 과거 장부를 생성/수정하는 것을 서버에서 차단한다.
// 본사 장부 수정/리포트/과거 조회 경로는 이 가드를 적용하지 않는다.
export function assertStoreManagerClosingDateIsToday(
  closingDate: string,
  today = getTodayKstInput(),
): { ok: true } | { ok: false; code: string; message: string } {
  if (isTodayKstDateParam(closingDate, today)) {
    return { ok: true };
  }

  return {
    ok: false,
    code: "FORBIDDEN",
    message: "지점장은 오늘 날짜의 장부만 저장할 수 있습니다.",
  };
}
