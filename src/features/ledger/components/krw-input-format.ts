const krwInputFormatter = new Intl.NumberFormat("ko-KR");

export function toRawKrwInputValue(value: string) {
  const digits = value.replace(/[^\d]/g, "");

  return digits.replace(/^0+(?=\d)/, "");
}

export function formatKrwInput(value: string) {
  const rawValue = toRawKrwInputValue(value);

  if (rawValue === "") {
    return "";
  }

  return krwInputFormatter.format(Number(rawValue));
}

export function parseKrwInputValue(value: string) {
  const rawValue = toRawKrwInputValue(value);

  if (rawValue === "") {
    return 0;
  }

  const parsed = Number.parseInt(rawValue, 10);

  return Number.isNaN(parsed) ? 0 : parsed;
}
