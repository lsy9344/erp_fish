const krwFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});
const quantityFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function getKstDateTimeParts(value: string | Date) {
  const input =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(input.getTime())) {
    throw new RangeError("Invalid time value");
  }
  const kst = new Date(input.getTime() + KST_OFFSET_MS);
  const hours = kst.getUTCHours();
  return {
    year: String(kst.getUTCFullYear()),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    dayPeriod: hours < 12 ? "오전" : "오후",
    hour: hours % 12 || 12,
    minute: String(kst.getUTCMinutes()).padStart(2, "0"),
  };
}

function formatKstDateTimeWithYear(
  value: string | Date,
  yearStyle: "numeric" | "2-digit",
) {
  const parts = getKstDateTimeParts(value);
  const year = yearStyle === "2-digit" ? parts.year.slice(-2) : parts.year;
  return `${year}. ${parts.month}. ${parts.day}. ${parts.dayPeriod} ${parts.hour}:${parts.minute}`;
}

export function formatKrw(value: number) {
  return `${krwFormatter.format(value)}원`;
}

export function formatSignedKrw(value: number) {
  const prefix = value > 0 ? "+" : "";

  return `${prefix}${formatKrw(value)}`;
}

export function formatQuantityValue(value: number) {
  return quantityFormatter.format(value);
}

export function formatQuantity(value: number) {
  return `${formatQuantityValue(value)}개`;
}

export function formatSignedQuantity(value: number) {
  const prefix = value > 0 ? "+" : "";

  return `${prefix}${formatQuantity(value)}`;
}

export function formatKstDateTime(value: string | Date) {
  return formatKstDateTimeWithYear(value, "numeric");
}

export function formatShortKstDateTime(value: string | Date) {
  return formatKstDateTimeWithYear(value, "2-digit");
}
