export const MAX_OPERATING_SALES_INTEGER = 2_147_483_647;

export function isOperatingSalesTotalInRange(
  totalSalesAmount: number,
  carryoverSalesAmount: number,
) {
  return (
    Number.isSafeInteger(totalSalesAmount) &&
    Number.isSafeInteger(carryoverSalesAmount) &&
    totalSalesAmount >= 0 &&
    carryoverSalesAmount >= 0 &&
    totalSalesAmount + carryoverSalesAmount <= MAX_OPERATING_SALES_INTEGER
  );
}
