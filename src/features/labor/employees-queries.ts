import type { Prisma } from "../../../generated/prisma";
import { requireReportAccess } from "~/server/authz";
import { db } from "~/server/db";

export type EmployeeListItem = {
  id: string;
  name: string;
  hireDate: string;
  isActive: boolean;
};

export type EmployeeMonthlyPayrollRow = {
  employeeId: string;
  employeeName: string;
  hireDate: string;
  month: string;
  workedStoreCount: number;
  workedDayCount: number;
  payrollTotal: number;
  memoCount: number;
};

// point_summary.md:63 — 순환 근무자 급여를 "월말 급여 계산 시 누락이 없도록" 통합 추적한다.
// 직원 미연결(자유 입력) 급여는 직원별 행에는 합산할 수 없으므로, 별도 "미연결" 버킷으로
// 합계·건수를 함께 반환해 월간 롤업 화면에서 누락 없이 드러낸다.
export type EmployeeMonthlyPayroll = {
  rows: EmployeeMonthlyPayrollRow[];
  unlinked: {
    rowCount: number;
    payrollTotal: number;
  };
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

export type HeadcountProductivityRow = {
  workerCount: number;
  ledgerCount: number;
  avgSales: number | null;
  avgMarginRate: number | null;
  marginUnavailableReason: string | null;
};

export type EmployeeProductivityAnalysis = {
  month: string;
  employees: EmployeeProductivityRow[];
  byHeadcount: HeadcountProductivityRow[];
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
  await requireReportAccess();

  const employees = await db.employee.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      hireDate: true,
      isActive: true,
    },
  });

  return employees.map((emp) => ({
    id: emp.id,
    name: emp.name,
    hireDate: emp.hireDate.toISOString().slice(0, 10),
    isActive: emp.isActive,
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

const emptyMonthlyPayroll: EmployeeMonthlyPayroll = {
  rows: [],
  unlinked: { rowCount: 0, payrollTotal: 0 },
};

export async function getEmployeeMonthlyPayroll(
  yearMonth: string,
): Promise<EmployeeMonthlyPayroll> {
  await requireReportAccess();

  const [year, month] = yearMonth.split("-").map(Number);

  if (!year || !month) {
    return emptyMonthlyPayroll;
  }

  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1));

  const laborItems = await db.ledgerLaborItem.findMany({
    where: {
      employeeId: { not: null },
      dailyLedger: {
        closingDate: {
          gte: startDate,
          lt: endDate,
        },
      },
    },
    select: {
      id: true,
      employeeId: true,
      amount: true,
      lateMemo: true,
      earlyLeaveMemo: true,
      specialMemo: true,
      employee: {
        select: {
          name: true,
          hireDate: true,
        },
      },
      dailyLedger: {
        select: {
          storeId: true,
          closingDate: true,
        },
      },
    },
  });

  const byEmployee = new Map<
    string,
    {
      employeeId: string;
      employeeName: string;
      hireDate: string;
      storeIds: Set<string>;
      closingDates: Set<string>;
      payrollTotal: number;
      memoCount: number;
    }
  >();

  for (const item of laborItems) {
    if (!item.employeeId || !item.employee) {
      continue;
    }

    const existing = byEmployee.get(item.employeeId) ?? {
      employeeId: item.employeeId,
      employeeName: item.employee.name,
      hireDate: item.employee.hireDate.toISOString().slice(0, 10),
      storeIds: new Set<string>(),
      closingDates: new Set<string>(),
      payrollTotal: 0,
      memoCount: 0,
    };

    existing.storeIds.add(item.dailyLedger.storeId);
    existing.closingDates.add(
      item.dailyLedger.closingDate.toISOString().slice(0, 10),
    );
    existing.payrollTotal += item.amount;

    if (item.lateMemo || item.earlyLeaveMemo || item.specialMemo) {
      existing.memoCount += 1;
    }

    byEmployee.set(item.employeeId, existing);
  }

  // 직원 미연결(자유 입력) 급여 집계: 직원별 행에는 합산할 수 없으므로 별도 버킷으로
  // 합계·건수를 산출해, 월말 급여 계산에서 누락되지 않도록 화면에 함께 노출한다.
  const unlinkedItems = await db.ledgerLaborItem.findMany({
    where: {
      employeeId: null,
      dailyLedger: {
        closingDate: {
          gte: startDate,
          lt: endDate,
        },
      },
    },
    select: { amount: true },
  });

  const unlinked = {
    rowCount: unlinkedItems.length,
    payrollTotal: unlinkedItems.reduce((sum, item) => sum + item.amount, 0),
  };

  const rows = [...byEmployee.values()].map((emp) => ({
    employeeId: emp.employeeId,
    employeeName: emp.employeeName,
    hireDate: emp.hireDate,
    month: yearMonth,
    workedStoreCount: emp.storeIds.size,
    workedDayCount: emp.closingDates.size,
    payrollTotal: emp.payrollTotal,
    memoCount: emp.memoCount,
  }));

  return { rows, unlinked };
}

// WO-E(2026-06-22): HR 월간 생산성/인력 배치 분석.
// 근무 인원과 매출/마진율의 관계를 본사 리포트와 같은 correction-aware 기준으로 분석한다.
// 단순 totalSalesAmount - expense가 아니라 장부 요약 계산(grossProfit/grossMarginRate)을 재사용한다.
export async function getEmployeeProductivityAnalysis(
  yearMonth: string,
): Promise<EmployeeProductivityAnalysis> {
  await requireReportAccess();

  const empty: EmployeeProductivityAnalysis = {
    month: yearMonth,
    employees: [],
    byHeadcount: [],
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

  const { getLedgerProfitSummariesForRange } = await import(
    "../reports/queries"
  );

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

      if (profit?.grossMarginRate !== null && profit?.grossMarginRate !== undefined) {
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

  // 근무 인원 수(workerCount)별: 평균 매출/마진율.
  type HeadcountAccumulator = {
    ledgerCount: number;
    salesSum: number;
    salesCount: number;
    marginSum: number;
    marginCount: number;
  };
  const headcountAcc = new Map<number, HeadcountAccumulator>();

  for (const profit of profitByLedgerId.values()) {
    if (
      profit.workerCount === null ||
      !Number.isFinite(profit.workerCount) ||
      profit.workerCount <= 0
    ) {
      continue;
    }

    const acc = headcountAcc.get(profit.workerCount) ?? {
      ledgerCount: 0,
      salesSum: 0,
      salesCount: 0,
      marginSum: 0,
      marginCount: 0,
    };

    acc.ledgerCount += 1;

    if (profit.totalSales !== null) {
      acc.salesSum += profit.totalSales;
      acc.salesCount += 1;
    }

    if (profit.grossMarginRate !== null) {
      acc.marginSum += profit.grossMarginRate;
      acc.marginCount += 1;
    }

    headcountAcc.set(profit.workerCount, acc);
  }

  const byHeadcount: HeadcountProductivityRow[] = [...headcountAcc.entries()]
    .map(([workerCount, acc]) => ({
      workerCount,
      ledgerCount: acc.ledgerCount,
      avgSales: acc.salesCount > 0 ? acc.salesSum / acc.salesCount : null,
      avgMarginRate: acc.marginCount > 0 ? acc.marginSum / acc.marginCount : null,
      marginUnavailableReason:
        acc.marginCount > 0
          ? null
          : "해당 근무 인원 장부의 마진율이 모두 계산 불가입니다.",
    }))
    .sort((a, b) => a.workerCount - b.workerCount);

  return {
    month: yearMonth,
    employees,
    byHeadcount,
    unlinkedPayrollRowCount,
  };
}
