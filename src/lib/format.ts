const krwFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

export function formatKrw(value: number) {
  return `${krwFormatter.format(value)}원`;
}

export function formatSignedKrw(value: number) {
  const prefix = value > 0 ? "+" : "";

  return `${prefix}${formatKrw(value)}`;
}

export function formatQuantity(value: number) {
  return `${new Intl.NumberFormat("ko-KR").format(value)}개`;
}

export function formatSignedQuantity(value: number) {
  const prefix = value > 0 ? "+" : "";

  return `${prefix}${formatQuantity(value)}`;
}
