const wonFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

export function formatWonInput(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits === "") return "";

  return wonFormatter.format(Number(digits));
}

export function parseWonInput(value: string) {
  const digits = value.replace(/\D/g, "");

  return digits === "" ? null : Number(digits);
}
