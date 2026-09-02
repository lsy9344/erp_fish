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
