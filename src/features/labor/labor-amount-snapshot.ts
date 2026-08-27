type EmployeeWageSnapshot = {
  employeeId: string | null;
  dailyWage: number | null | undefined;
};

export function getStoreManagerLaborSnapshotAmount({
  carriedAmount,
  employeeId,
  dailyWage,
}: EmployeeWageSnapshot & { carriedAmount: number | undefined }) {
  if (carriedAmount !== undefined) return carriedAmount;
  return employeeId ? (dailyWage ?? 0) : 0;
}

export function getHqLaborSnapshotAmount({
  hasExistingRow,
  enteredAmount,
  employeeId,
  dailyWage,
}: EmployeeWageSnapshot & {
  hasExistingRow: boolean;
  enteredAmount: number;
}) {
  if (hasExistingRow || enteredAmount !== 0 || !employeeId) {
    return enteredAmount;
  }

  return dailyWage ?? 0;
}
