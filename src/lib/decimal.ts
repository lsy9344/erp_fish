type DecimalLike = {
  toNumber(): number;
};

export type DecimalNumber = number | DecimalLike;

export function decimalToNumber(value: DecimalNumber) {
  return typeof value === "number" ? value : value.toNumber();
}

export function nullableDecimalToNumber(value: DecimalNumber | null) {
  return value === null ? null : decimalToNumber(value);
}
