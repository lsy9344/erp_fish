import type { Prisma } from "../../../generated/prisma";
import { requireLaborViewAccess } from "~/server/authz";
import { db } from "~/server/db";

export type EmployeeListItem = {
  id: string;
  name: string;
  hireDate: string;
  isActive: boolean;
  // WO-25(2026-07-25) #6/#8: 등록 상세 — 하루 인건비 · 월 희망 4대보험.
  // WO-0806 #1-5: 희망 현금은 입력값이 아니라 인건비 리포트에서 자동계산한다.
  dailyWage: number | null;
  desiredInsuranceAmount: number | null;
  // WO-0806 #1: 인사관리 카드.
  phone: string | null;
  bankAccount: string | null;
  address: string | null;
  position: string | null;
};

export type EmployeeOption = {
  id: string;
  name: string;
};

// WO-E(2026-06-22): HR 월간 생산성/인력 배치 분석.
export type EmployeeProductivityRow = {
  employeeId: string;
  employeeName: string;
  workedDayCount: number;
  // 직원이 근무한 날(장부)의 평균 매출.
  avgSalesPerWorkday: number | null;
  // 직원이 근무한 날의 평균 마진율. 계산 불가 시 null + 사유.
  avgMarginRate: number | null;
  marginUnavailableReason: string | null;
};

export type EmployeeProductivityAnalysis = {
  month: string;
  employees: EmployeeProductivityRow[];
  // 직원이 연결되지 않은 자유 입력 급여 행 수(분석에서 조용히 사라지지 않도록 노출).
  unlinkedPayrollRowCount: number;
};

// WO-05(2026-06-22): 장부 급여 입력 화면의 직원 선택용 활성 직원 목록.
// 본사·지점장 모두 급여 행을 직원과 연결할 수 있어야 하므로 id/name만 노출하고
// 권한 게이트는 호출하는 장부 편집 페이지(편집 권한 확인 완료)에 위임한다.
export async function getActiveEmployeeOptions(): Promise<EmployeeOption[]> {
  const employees = await db.employee.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return employees;
}

export async function getEmployeeList(): Promise<EmployeeListItem[]> {
  await requireLaborViewAccess();

  const employees = await db.employee.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      hireDate: true,
      isActive: true,
      dailyWage: true,
      desiredInsuranceAmount: true,
      phone: true,
      bankAccount: true,
      address: true,
      position: true,
    },
  });

  return employees.map((emp) => ({
    ...emp,
    hireDate: emp.hireDate.toISOString().slice(0, 10),
  }));
}

// WO-05(2026-06-22): 급여 행 저장 시 선택된 employeeId가 실제 직원 마스터에 존재하는지 검증한다.
// 트랜잭션 내부에서 호출하여 장부 저장과 동일한 일관성 경계를 유지한다.
export async function resolveValidEmployeeIdsInTx(
  tx: Prisma.TransactionClient,
  labor: Array<{ employeeId?: string | null }>,
): Promise<Set<string>> {
  const requestedIds = [
    ...new Set(
      labor
        .map((item) => item.employeeId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (requestedIds.length === 0) {
    return new Set<string>();
  }

  const employees = await tx.employee.findMany({
    where: { id: { in: requestedIds } },
    select: { id: true },
  });

  return new Set(employees.map((employee) => employee.id));
}

// WO-E(2026-06-22): HR 월간 생산성/인력 배치 분석.
// 근무 인원과 매출/마진율의 관계를 본사 리포트와 같은 correction-aware 기준으로 분석한다.
// 단순 totalSalesAmount - expense가 아니라 장부 요약 계산(grossProfit/grossMarginRate)을 재사용한다.
export async function getEmployeeProductivityAnalysis(
  yearMonth: string,
): Promise<EmployeeProductivityAnalysis> {
  await requireLaborViewAccess();

  const empty: EmployeeProductivityAnalysis = {
    month: yearMonth,
    employees: [],
    unlinkedPayrollRowCount: 0,
  };

  const [year, month] = yearMonth.split("-").map(Number);

  if (!year || !month) {
    return empty;
  }

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endExclusive = new Date(Date.UTC(year, month, 1));
  // getLedgerProfitSummariesForRange는 [start, end] 포함 범위이므로 마지막 날 23:59까지 포함.
  const endInclusive = new Date(endExclusive.getTime() - 1);

  const { getLedgerProfitSummariesForRange } =
    await import("../reports/queries");

  const stores = await db.store.findMany({ select: { id: true } });
  const storeIds = stores.map((store) => store.id);

  const [profitByLedgerId, laborItems] = await Promise.all([
    getLedgerProfitSummariesForRange({
      storeIds,
      startDate,
      endDate: endInclusive,
    }),
    db.ledgerLaborItem.findMany({
      where: {
        dailyLedger: {
          closingDate: { gte: startDate, lt: endExclusive },
          status: { in: ["IN_REVIEW", "HEADQUARTERS_CLOSED"] },
        },
      },
      select: {
        employeeId: true,
        employee: { select: { name: true } },
        dailyLedger: { select: { id: true } },
      },
    }),
  ]);

  // 직원별: 근무한 장부(=근무일)의 매출/마진을 합산해 평균을 낸다.
  type EmployeeAccumulator = {
    employeeName: string;
    workedLedgerIds: Set<string>;
    salesSum: number;
    salesDayCount: number;
    marginSum: number;
    marginDayCount: number;
    marginMissingDayCount: number;
  };
  const employeeAcc = new Map<string, EmployeeAccumulator>();
  let unlinkedPayrollRowCount = 0;

  for (const item of laborItems) {
    if (!item.employeeId || !item.employee) {
      // 직원이 연결되지 않은 자유 입력 급여 행은 별도 경고로 노출한다.
      unlinkedPayrollRowCount += 1;
      continue;
    }

    const acc = employeeAcc.get(item.employeeId) ?? {
      employeeName: item.employee.name,
      workedLedgerIds: new Set<string>(),
      salesSum: 0,
      salesDayCount: 0,
      marginSum: 0,
      marginDayCount: 0,
      marginMissingDayCount: 0,
    };

    const ledgerId = item.dailyLedger.id;

    // 같은 직원이 한 장부에 여러 급여 행으로 들어갈 수 있으므로 장부 단위로 중복 제거한다.
    if (!acc.workedLedgerIds.has(ledgerId)) {
      acc.workedLedgerIds.add(ledgerId);
      const profit = profitByLedgerId.get(ledgerId);

      if (profit?.totalSales !== null && profit?.totalSales !== undefined) {
        acc.salesSum += profit.totalSales;
        acc.salesDayCount += 1;
      }

      if (
        profit?.grossMarginRate !== null &&
        profit?.grossMarginRate !== undefined
      ) {
        acc.marginSum += profit.grossMarginRate;
        acc.marginDayCount += 1;
      } else {
        acc.marginMissingDayCount += 1;
      }
    }

    employeeAcc.set(item.employeeId, acc);
  }

  const employees: EmployeeProductivityRow[] = [...employeeAcc.entries()]
    .map(([employeeId, acc]) => ({
      employeeId,
      employeeName: acc.employeeName,
      workedDayCount: acc.workedLedgerIds.size,
      avgSalesPerWorkday:
        acc.salesDayCount > 0 ? acc.salesSum / acc.salesDayCount : null,
      avgMarginRate:
        acc.marginDayCount > 0 ? acc.marginSum / acc.marginDayCount : null,
      marginUnavailableReason:
        acc.marginDayCount > 0
          ? null
          : "근무한 장부의 마진율이 모두 계산 불가입니다(재고/매출원가 입력 부족).",
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, "ko"));

  return {
    month: yearMonth,
    employees,
    unlinkedPayrollRowCount,
  };
}
