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
  // 상세 카드에서 바로 확인하는 현재 월 근무 요약.
  currentMonthWorkdayCount: number;
  currentMonthLaborAmount: number;
  store: { id: string; name: string } | null;
};

export type EmployeeOption = {
  id: string;
  name: string;
  label: string;
  isActive: boolean;
  store: { id: string; name: string } | null;
  position: string | null;
  hireDate: string;
};

export type EmployeeStoreOption = { id: string; name: string };

export async function getEmployeeStoreOptions(): Promise<
  EmployeeStoreOption[]
> {
  await requireLaborViewAccess();
  return db.store.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export type HistoricalEmployeeListItem = {
  id: string;
  originalName: string;
  reviewStatus: string;
  firstSeenWorkDate: string;
  lastSeenWorkDate: string;
  leadRoleCount: number;
  memberRoleCount: number;
  storeNames: string[];
};

export type HistoricalEmployeeRoleHistoryItem = {
  id: string;
  businessDate: string;
  storeName: string;
  role: "팀장" | "팀원";
  slotNumber: number;
};

export type HistoricalEmployeeDetail = HistoricalEmployeeListItem & {
  roleHistory: HistoricalEmployeeRoleHistoryItem[];
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
// 본사·지점장 모두 동명이인을 구분해 급여 행을 직원과 연결할 수 있도록
// 매장·직급·입사일을 합친 표시명도 제공하고,
// 권한 게이트는 호출하는 장부 편집 페이지(편집 권한 확인 완료)에 위임한다.
export async function getActiveEmployeeOptions(
  includeInactiveIds: Iterable<string> = [],
): Promise<EmployeeOption[]> {
  const preservedIds = [...new Set(includeInactiveIds)];
  const employees = await db.employee.findMany({
    where: {
      OR: [
        { isActive: true },
        ...(preservedIds.length > 0 ? [{ id: { in: preservedIds } }] : []),
      ],
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      position: true,
      hireDate: true,
      store: { select: { id: true, name: true } },
    },
  });

  return employees.map((employee) => {
    const hireDate = employee.hireDate.toISOString().slice(0, 10);
    const details = [
      employee.store?.name,
      employee.position,
      hireDate,
      employee.isActive ? null : "퇴사·사용중지",
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      ...employee,
      hireDate,
      label: `${employee.name}${details ? ` (${details})` : ""}`,
    };
  });
}

export async function getEmployeeList(
  monthInput = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date()),
): Promise<EmployeeListItem[]> {
  await requireLaborViewAccess();

  const validMonth = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(monthInput)
    ? monthInput
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
      }).format(new Date());
  const year = Number(validMonth.slice(0, 4));
  const month = Number(validMonth.slice(5, 7));
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endExclusive = new Date(Date.UTC(year, month, 1));

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
      store: { select: { id: true, name: true } },
      laborItems: {
        where: {
          dailyLedger: {
            closingDate: { gte: startDate, lt: endExclusive },
            status: { in: ["IN_REVIEW", "HEADQUARTERS_CLOSED"] },
          },
        },
        select: {
          amount: true,
          dailyLedger: { select: { closingDate: true } },
        },
      },
    },
  });

  return employees.map(({ laborItems, ...emp }) => ({
    ...emp,
    hireDate: emp.hireDate.toISOString().slice(0, 10),
    currentMonthWorkdayCount: new Set(
      laborItems.map((item) =>
        item.dailyLedger.closingDate.toISOString().slice(0, 10),
      ),
    ).size,
    currentMonthLaborAmount: laborItems.reduce(
      (sum, item) => sum + item.amount,
      0,
    ),
  }));
}

// 승인된 과거 batch의 identity는 현재 Employee와 별도 목록으로 조회한다.
// 이름이 같아도 join/merge하지 않으며 `최초 확인 근무일`만 제공한다.
export async function getHistoricalEmployeeList(): Promise<
  HistoricalEmployeeListItem[]
> {
  await requireLaborViewAccess();

  const activeBatch = await db.historicalExcelImportBatch.findFirst({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  if (!activeBatch) return [];

  const employees = await db.historicalEmployee.findMany({
    where: { batchId: activeBatch.id },
    orderBy: { originalName: "asc" },
    select: {
      id: true,
      originalName: true,
      reviewStatus: true,
      firstSeenWorkDate: true,
      lastSeenWorkDate: true,
      leadRoleCount: true,
      memberRoleCount: true,
      storeNames: true,
    },
  });

  return employees.map((employee) => ({
    ...employee,
    firstSeenWorkDate: employee.firstSeenWorkDate.toISOString().slice(0, 10),
    lastSeenWorkDate: employee.lastSeenWorkDate.toISOString().slice(0, 10),
    storeNames: Array.isArray(employee.storeNames)
      ? employee.storeNames.filter(
          (name): name is string => typeof name === "string",
        )
      : [],
  }));
}

export async function getHistoricalEmployeeDetail(
  id: string,
): Promise<HistoricalEmployeeDetail | null> {
  await requireLaborViewAccess();

  const activeBatch = await db.historicalExcelImportBatch.findFirst({
    where: { status: "ACTIVE" },
    select: { id: true },
  });
  if (!activeBatch) return null;

  const employee = await db.historicalEmployee.findFirst({
    where: { id, batchId: activeBatch.id },
    select: {
      id: true,
      originalName: true,
      reviewStatus: true,
      firstSeenWorkDate: true,
      lastSeenWorkDate: true,
      leadRoleCount: true,
      memberRoleCount: true,
      storeNames: true,
      dailyRoles: {
        orderBy: [{ businessDate: "desc" }, { slotNumber: "asc" }],
        select: {
          id: true,
          businessDate: true,
          role: true,
          slotNumber: true,
          dailyFact: { select: { sourceStoreName: true } },
        },
      },
    },
  });
  if (!employee) return null;

  return {
    id: employee.id,
    originalName: employee.originalName,
    reviewStatus: employee.reviewStatus,
    firstSeenWorkDate: employee.firstSeenWorkDate.toISOString().slice(0, 10),
    lastSeenWorkDate: employee.lastSeenWorkDate.toISOString().slice(0, 10),
    leadRoleCount: employee.leadRoleCount,
    memberRoleCount: employee.memberRoleCount,
    storeNames: Array.isArray(employee.storeNames)
      ? employee.storeNames.filter(
          (name): name is string => typeof name === "string",
        )
      : [],
    roleHistory: employee.dailyRoles.map((role) => ({
      id: role.id,
      businessDate: role.businessDate.toISOString().slice(0, 10),
      storeName: role.dailyFact.sourceStoreName,
      role: role.role === "LEAD" ? "팀장" : "팀원",
      slotNumber: role.slotNumber,
    })),
  };
}

// WO-05(2026-06-22): 신규 연결은 재직 직원만 허용한다. 이미 장부에 연결된 직원은
// 나중에 퇴사 처리되어도 과거 연결이 끊기지 않도록 보존 목록에 있을 때만 허용한다.
// 트랜잭션 내부에서 호출하여 장부 저장과 동일한 일관성 경계를 유지한다.
export async function resolveValidEmployeeIdsInTx(
  tx: Prisma.TransactionClient,
  labor: Array<{ employeeId?: string | null }>,
  preserveEmployeeIds: Iterable<string> = [],
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

  const preservedIds = [...new Set(preserveEmployeeIds)];
  const employees = await tx.employee.findMany({
    where: {
      id: { in: requestedIds },
      OR: [
        { isActive: true },
        ...(preservedIds.length > 0 ? [{ id: { in: preservedIds } }] : []),
      ],
    },
    select: { id: true },
  });

  return new Set(employees.map((employee) => employee.id));
}

export async function resolveEmployeeDailyWagesInTx(
  tx: Prisma.TransactionClient,
  employeeIds: Iterable<string>,
): Promise<Map<string, number | null>> {
  const ids = [...new Set(employeeIds)];
  if (ids.length === 0) return new Map();
  const employees = await tx.employee.findMany({
    where: { id: { in: ids } },
    select: { id: true, dailyWage: true },
  });
  return new Map(
    employees.map((employee) => [employee.id, employee.dailyWage]),
  );
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
