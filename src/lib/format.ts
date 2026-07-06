const krwFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});
const quantityFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

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
