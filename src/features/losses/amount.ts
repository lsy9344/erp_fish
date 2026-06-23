const MAX_KRW_INTEGER = 2_147_483_647;

export const recoveredAmountError =
  "실제 판매/회수액은 0원 이상의 정수여야 합니다.";

export function isValidKrwInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_KRW_INTEGER;
}

export function calculatePlannedPriceLossAmount({
  plannedUnitPrice,
  quantity,
  recoveredAmount,
}: {
  plannedUnitPrice: number;
  quantity: number;
  recoveredAmount: number;
}) {
  const plannedSalesAmount = plannedUnitPrice * quantity;

  if (!Number.isSafeInteger(plannedSalesAmount)) {
    return MAX_KRW_INTEGER;
  }

  const lossAmount = plannedSalesAmount - recoveredAmount;

  if (lossAmount <= 0) {
    return 0;
  }

  return Math.min(lossAmount, MAX_KRW_INTEGER);
}
