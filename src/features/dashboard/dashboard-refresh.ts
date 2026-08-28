export const DASHBOARD_REFRESH_TIME_ZONE = "Asia/Seoul";
// 2026-08-27 운영 기준: HQ 관제 자동 갱신은 매장 업무 시간인 05:00~20:00에만 실행한다.
// 이 창 밖에서는 DB가 자동 절전할 수 있도록 router.refresh() 호출을 완전히 멈춘다.
export const DASHBOARD_REFRESH_START_MINUTE = 5 * 60;
export const DASHBOARD_REFRESH_END_MINUTE = 20 * 60;

const localTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getLocalTimeFormatter(timeZone: string) {
  const cachedFormatter = localTimeFormatterCache.get(timeZone);

  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  localTimeFormatterCache.set(timeZone, formatter);

  return formatter;
}

export function getLocalMinuteOfDay(
  now: Date,
  timeZone = DASHBOARD_REFRESH_TIME_ZONE,
) {
  const parts = getLocalTimeFormatter(timeZone).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);

  return hour * 60 + minute;
}

export function isWithinRefreshWindow(
  now: Date,
  {
    startMinute,
    endMinute,
    timeZone = DASHBOARD_REFRESH_TIME_ZONE,
  }: {
    startMinute: number;
    endMinute: number;
    timeZone?: string;
  },
) {
  const localMinute = getLocalMinuteOfDay(now, timeZone);

  if (startMinute < endMinute) {
    return localMinute >= startMinute && localMinute < endMinute;
  }

  return localMinute >= startMinute || localMinute < endMinute;
}

export function isWithinDashboardRefreshWindow(now: Date) {
  return isWithinRefreshWindow(now, {
    startMinute: DASHBOARD_REFRESH_START_MINUTE,
    endMinute: DASHBOARD_REFRESH_END_MINUTE,
  });
}
