export function calculatePaymentDifference(
  totalSalesAmount: number,
  cashAmount: number,
  cardAmount: number,
  otherPaymentAmount: number,
) {
  return totalSalesAmount - (cashAmount + cardAmount + otherPaymentAmount);
}

export function calculateExpenseTotal(expenses: number[]) {
  return expenses.reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0,
  );
}

export function calculatePurchaseTotal(purchases: number[]) {
  return purchases.reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0,
  );
}

export function calculateGrossProfit(
  totalSalesAmount: number,
  expenseTotal: number,
) {
  return totalSalesAmount - expenseTotal;
}

export function calculateProductivity(
  grossProfit: number,
  workerCount: number | null,
) {
  if (
    workerCount == null ||
    !Number.isFinite(workerCount) ||
    !Number.isFinite(grossProfit) ||
    workerCount <= 0
  ) {
    return null;
  }

  return grossProfit / workerCount;
}
