import type { Prisma } from "../../../generated/prisma/index.js";

import {
  HEADQUARTERS_LABOR_STATUSES,
  type HeadquartersLaborDateRange,
  type HeadquartersLaborDetail,
  type HeadquartersLaborLedgerStatus,
  type HeadquartersLaborReport,
  type HeadquartersLaborStatusFilter,
  type HeadquartersLaborStoreOption,
  type HeadquartersLaborWorkerSettlement,
} from "./headquarters-labor-types.ts";

const MONTH_QUERY_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const DATE_QUERY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
// WO-0806 #2-2: 기간 조회 상한. 더 넘어가면 장부 수가 응답을 무너뜨린다.
const MAX_RANGE_DAYS = 366;

const headquartersLaborLedgerSelect = {
  id: true,
  closingDate: true,
  status: true,
  workerCount: true,
  store: {
    select: {
      id: true,
      name: true,
    },
  },
  ledgerLaborItems: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      employeeId: true,
      workerName: true,
      amount: true,
      lateMemo: true,
      earlyLeaveMemo: true,
      specialMemo: true,
      // WO-0806 #2: 근무자별 월 정산(직급·계좌·희망 4대보험)에 쓴다.
      // 희망 현금은 저장값을 읽지 않고 인건비 합계에서 계산한다.
      employee: {
        select: {
          position: true,
          bankAccount: true,
          desiredInsuranceAmount: true,
        },
      },
    },
  },
} satisfies Prisma.DailyLedgerSelect;

type HeadquartersLaborLedgerRecord = Prisma.DailyLedgerGetPayload<{
  select: typeof headquartersLaborLedgerSelect;
}>;

function getCurrentMonthInput(inputDate: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(inputDate);
}

export function getHeadquartersLaborMonthRange(
  month: unknown,
  inputDate = new Date(),
) {
  const currentMonthInput = getCurrentMonthInput(inputDate);
  const monthInput =
    typeof month === "string" && MONTH_QUERY_PATTERN.test(month)
      ? month
      : currentMonthInput;
  const year = Number(monthInput.slice(0, 4));
  const monthNumber = Number(monthInput.slice(5, 7));

  return {
    monthInput,
    startDate: new Date(Date.UTC(year, monthNumber - 1, 1)),
    endDate: new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59, 999)),
  };
}

function parseDateInput(value: unknown) {
  if (typeof value !== "string" || !DATE_QUERY_PATTERN.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  // JavaScript는 2026-02-31을 3월로 자동 보정한다. 급여 기간에서는 이를
  // 허용하지 않고, 입력한 달력 날짜와 생성된 날짜가 정확히 같아야 한다.
  return Number.isNaN(parsed.getTime()) || toDateInput(parsed) !== value
    ? null
    : parsed;
}

// WO-0806 #2-2: `월 선택`(기존 `?month=`)과 `기간 지정`(`?from=&to=`)을 모두 받는다.
// 잘못된 기간은 값을 교환하지 않고 사유를 남긴 뒤 현재 월로 폴백한다.
export function getHeadquartersLaborDateRange(
  { month, from, to }: { month?: unknown; from?: unknown; to?: unknown } = {},
  inputDate = new Date(),
): HeadquartersLaborDateRange & {
  startDate: Date;
  endDate: Date;
  errorMessages: string[];
} {
  const fallback = () => {
    const monthRange = getHeadquartersLaborMonthRange(month, inputDate);

    return {
      ...monthRange,
      startDateInput: toDateInput(monthRange.startDate),
      endDateInput: toDateInput(monthRange.endDate),
      rangeLabel: monthRange.monthInput,
      isSingleMonth: true,
      errorMessages: [] as string[],
    };
  };

  const start = parseDateInput(from);
  const end = parseDateInput(to);

  if (start === null && end === null) {
    return fallback();
  }

  if (start === null || end === null) {
    return {
      ...fallback(),
      errorMessages: [
        "기간 조회는 시작일과 종료일을 모두 입력해야 합니다. 현재 월로 조회했습니다.",
      ],
    };
  }

  if (start.getTime() > end.getTime()) {
    return {
      ...fallback(),
      errorMessages: ["시작일이 종료일보다 늦습니다. 현재 월로 조회했습니다."],
    };
  }

  const dayCount =
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

  if (dayCount > MAX_RANGE_DAYS) {
    return {
      ...fallback(),
      errorMessages: [
        `조회 기간은 최대 ${MAX_RANGE_DAYS}일까지입니다. 현재 월로 조회했습니다.`,
      ],
    };
  }

  const startDateInput = toDateInput(start);
  const endDateInput = toDateInput(end);
  const endOfDay = new Date(end.getTime() + 86_399_999);
  // 시작일이 1일이고 종료일이 같은 달의 말일이면 사실상 월 조회다.
  const monthInput = startDateInput.slice(0, 7);
  const lastDayOfStartMonth = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  );
  const isSingleMonth =
    start.getUTCDate() === 1 &&
    endDateInput === toDateInput(lastDayOfStartMonth);

  return {
    monthInput,
    startDate: start,
    endDate: endOfDay,
    startDateInput,
    endDateInput,
    rangeLabel: `${startDateInput} ~ ${endDateInput}`,
    isSingleMonth,
    errorMessages: [],
  };
}

export function normalizeHeadquartersLaborStatus(
  status: unknown,
): HeadquartersLaborStatusFilter {
  return typeof status === "string" &&
    HEADQUARTERS_LABOR_STATUSES.some((candidate) => candidate === status)
    ? (status as HeadquartersLaborLedgerStatus)
    : "ALL";
}

export function resolveHeadquartersLaborStoreFilter({
  storeId,
  allowedStoreIds,
}: {
  storeId: unknown;
  allowedStoreIds: readonly string[];
}) {
  const requestedStoreId =
    typeof storeId === "string" && storeId.length > 0 ? storeId : null;
  const selectedStoreId =
    requestedStoreId && allowedStoreIds.includes(requestedStoreId)
      ? requestedStoreId
      : null;
  const unauthorizedStoreRequested = Boolean(
    requestedStoreId && !selectedStoreId,
  );

  return {
    requestedStoreId,
    // 권한 밖 요청값은 선택 지점으로 보존하지 않는다 (DTO는 실제 적용된 필터만).
    selectedStoreId,
    targetStoreIds: unauthorizedStoreRequested
      ? ([] as string[])
      : selectedStoreId
        ? [selectedStoreId]
        : [...allowedStoreIds],
    errorMessages: unauthorizedStoreRequested
      ? [
          "조회 지점이 권한 범위에 없거나 비활성입니다. 권한 있는 지점을 선택해 주세요.",
        ]
      : ([] as string[]),
  };
}

function toDateInput(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function buildHeadquartersLaborReport({
  monthInput,
  startDateInput = monthInput,
  endDateInput = monthInput,
  rangeLabel = monthInput,
  isSingleMonth = true,
  selectedStoreId,
  selectedStatus,
  selectedWorkerName = null,
  stores,
  targetStoreIds,
  ledgers,
  errorMessages = [],
}: {
  monthInput: string;
  startDateInput?: string;
  endDateInput?: string;
  rangeLabel?: string;
  isSingleMonth?: boolean;
  selectedStoreId: string | null;
  selectedStatus: HeadquartersLaborStatusFilter;
  selectedWorkerName?: string | null;
  stores: HeadquartersLaborStoreOption[];
  targetStoreIds: readonly string[];
  ledgers: HeadquartersLaborLedgerRecord[];
  errorMessages?: string[];
}): HeadquartersLaborReport {
  const targetStoreIdSet = new Set(targetStoreIds);
  // WO-25(2026-07-25) #9: 직원명 필터. 부분 일치(대소문자 무시)로 근무자별 상세·지점 요약을 함께 좁힌다.
  const trimmedWorkerName = selectedWorkerName?.trim();
  const workerNameFilter =
    trimmedWorkerName && trimmedWorkerName.length > 0
      ? trimmedWorkerName.toLowerCase()
      : null;
  const targetLedgers = ledgers
    .filter((ledger) => targetStoreIdSet.has(ledger.store.id))
    .map((ledger) =>
      workerNameFilter
        ? {
            ...ledger,
            ledgerLaborItems: ledger.ledgerLaborItems.filter((item) =>
              item.workerName.toLowerCase().includes(workerNameFilter),
            ),
          }
        : ledger,
    );
  const details: HeadquartersLaborDetail[] = targetLedgers.flatMap((ledger) =>
    ledger.ledgerLaborItems.map((item) => ({
      id: item.id,
      ledgerId: ledger.id,
      businessDate: toDateInput(ledger.closingDate),
      storeId: ledger.store.id,
      storeName: ledger.store.name,
      status: ledger.status as HeadquartersLaborLedgerStatus,
      workerName: item.workerName,
      amount: item.amount,
      lateMemo: item.lateMemo,
      earlyLeaveMemo: item.earlyLeaveMemo,
      specialMemo: item.specialMemo,
    })),
  );
  // 희망 현금은 월 전체 원장을 볼 때만 지급 근거로 안전하다. 지점·상태·이름
  // 필터가 하나라도 적용되면 월 급여 일부에서 보험료 전액을 빼는 오류가 생긴다.
  const hasSettlementFilter =
    selectedStoreId !== null ||
    selectedStatus !== "ALL" ||
    selectedWorkerName !== null;
  const workerSettlements = buildWorkerSettlements(
    targetLedgers,
    isSingleMonth,
    hasSettlementFilter,
  );
  const summaryByStore = new Map<
    string,
    {
      storeId: string;
      storeName: string;
      workdays: Set<string>;
      workerCount: number;
      laborAmount: number;
    }
  >();

  for (const store of stores) {
    if (targetStoreIdSet.has(store.id)) {
      summaryByStore.set(store.id, {
        storeId: store.id,
        storeName: store.name,
        workdays: new Set<string>(),
        workerCount: 0,
        laborAmount: 0,
      });
    }
  }

  for (const ledger of targetLedgers) {
    const hasNoRecordableData =
      ledger.ledgerLaborItems.length === 0 &&
      (workerNameFilter !== null || ledger.workerCount === null);
    if (hasNoRecordableData) {
      continue;
    }

    const summary = summaryByStore.get(ledger.store.id) ?? {
      storeId: ledger.store.id,
      storeName: ledger.store.name,
      workdays: new Set<string>(),
      workerCount: 0,
      laborAmount: 0,
    };
    summary.workdays.add(toDateInput(ledger.closingDate));
    summary.workerCount += workerNameFilter
      ? ledger.ledgerLaborItems.length
      : (ledger.workerCount ?? ledger.ledgerLaborItems.length);
    summary.laborAmount += ledger.ledgerLaborItems.reduce(
      (sum, item) => sum + item.amount,
      0,
    );
    summaryByStore.set(ledger.store.id, summary);
  }

  const storeSummaries = [...summaryByStore.values()]
    .map((summary) => ({
      storeId: summary.storeId,
      storeName: summary.storeName,
      workdayCount: summary.workdays.size,
      workerCount: summary.workerCount,
      laborAmount: summary.laborAmount,
    }))
    .sort(
      (left, right) =>
        left.storeName.localeCompare(right.storeName, "ko") ||
        left.storeId.localeCompare(right.storeId),
    );

  return {
    monthInput,
    startDateInput,
    endDateInput,
    rangeLabel,
    isSingleMonth,
    selectedStoreId,
    selectedStatus,
    selectedWorkerName,
    stores,
    totalLaborAmount: details.reduce((sum, item) => sum + item.amount, 0),
    storeCount: storeSummaries.length,
    laborRecordCount: details.length,
    storeSummaries,
    workerSettlements,
    details,
    errorMessages,
  };
}

// WO-0806 #2: 희망 현금 = 월 인건비 합계 − 희망 4대보험.
// 음수는 0으로 자르지 않고 그대로 내보낸다(화면에서 경고 배지로 드러낸다).
// 희망 4대보험은 월 고정값이므로 다월 조회에서는 차감하지 않는다.
function buildWorkerSettlements(
  ledgers: HeadquartersLaborLedgerRecord[],
  isSingleMonth: boolean,
  hasSettlementFilter: boolean,
): HeadquartersLaborWorkerSettlement[] {
  const byWorker = new Map<
    string,
    Omit<HeadquartersLaborWorkerSettlement, "storeNames"> & {
      storeNames: Set<string>;
      workdays: Set<string>;
    }
  >();

  for (const ledger of ledgers) {
    const businessDate = toDateInput(ledger.closingDate);

    for (const item of ledger.ledgerLaborItems) {
      // 연결 직원은 사번으로 전 지점을 합산한다. 미연결 자유 입력은 같은 이름이
      // 다른 지점에 있을 수 있으므로 지점+정규화 이름으로만 묶는다.
      const normalizedName = item.workerName.trim().toLocaleLowerCase("ko-KR");
      const key =
        item.employeeId ?? `name:${ledger.store.id}:${normalizedName}`;
      const existing = byWorker.get(key) ?? {
        key,
        workerName: item.workerName,
        storeNames: new Set<string>(),
        position: item.employee?.position ?? null,
        bankAccount: item.employee?.bankAccount ?? null,
        workdays: new Set<string>(),
        workdayCount: 0,
        laborAmount: 0,
        desiredInsuranceAmount: item.employee?.desiredInsuranceAmount ?? null,
        desiredCashAmount: null,
        cashUnavailableReason: null,
      };

      existing.storeNames.add(ledger.store.name);
      existing.workdays.add(businessDate);
      existing.laborAmount += item.amount;
      byWorker.set(key, existing);
    }
  }

  return [...byWorker.values()]
    .map(({ workdays, storeNames, ...settlement }) => {
      const cash = resolveDesiredCash({
        laborAmount: settlement.laborAmount,
        desiredInsuranceAmount: settlement.desiredInsuranceAmount,
        isLinkedEmployee: !settlement.key.startsWith("name:"),
        isSingleMonth,
        hasSettlementFilter,
      });

      return {
        ...settlement,
        storeNames: [...storeNames].sort((left, right) =>
          left.localeCompare(right, "ko"),
        ),
        workdayCount: workdays.size,
        ...cash,
      };
    })
    .sort(
      (left, right) =>
        left.workerName.localeCompare(right.workerName, "ko") ||
        left.key.localeCompare(right.key),
    );
}

export function resolveDesiredCash({
  laborAmount,
  desiredInsuranceAmount,
  isLinkedEmployee,
  isSingleMonth,
  hasSettlementFilter = false,
}: {
  laborAmount: number;
  desiredInsuranceAmount: number | null;
  isLinkedEmployee: boolean;
  isSingleMonth: boolean;
  hasSettlementFilter?: boolean;
}): { desiredCashAmount: number | null; cashUnavailableReason: string | null } {
  if (!isLinkedEmployee) {
    return {
      desiredCashAmount: null,
      cashUnavailableReason: "계산 불가 (직원 미연결)",
    };
  }

  if (!isSingleMonth) {
    return {
      desiredCashAmount: null,
      cashUnavailableReason: "기간 조회에서는 자동계산 미적용",
    };
  }

  if (hasSettlementFilter) {
    return {
      desiredCashAmount: null,
      cashUnavailableReason: "필터 조회에서는 자동계산 미적용",
    };
  }

  if (desiredInsuranceAmount === null) {
    return {
      desiredCashAmount: null,
      cashUnavailableReason: "계산 불가 (희망 4대보험 미입력)",
    };
  }

  return {
    desiredCashAmount: laborAmount - desiredInsuranceAmount,
    cashUnavailableReason: null,
  };
}

export async function getHeadquartersLaborReport({
  month,
  from,
  to,
  storeId,
  status,
  workerName,
}: {
  month?: unknown;
  from?: unknown;
  to?: unknown;
  storeId?: unknown;
  status?: unknown;
  workerName?: unknown;
} = {}): Promise<HeadquartersLaborReport> {
  const { getHeadquartersStoreScope, requireLaborViewAccess } =
    await import("../../server/authz.ts");
  const { db } = await import("../../server/db.ts");
  await requireLaborViewAccess();
  const scope = await getHeadquartersStoreScope();
  const monthRange = getHeadquartersLaborDateRange({ month, from, to });
  const selectedStatus = normalizeHeadquartersLaborStatus(status);
  const selectedWorkerName =
    typeof workerName === "string" && workerName.trim().length > 0
      ? workerName.trim()
      : null;
  const storeFilter = resolveHeadquartersLaborStoreFilter({
    storeId,
    allowedStoreIds: scope.storeIds,
  });

  const ledgers =
    storeFilter.targetStoreIds.length === 0
      ? []
      : await db.dailyLedger.findMany({
          where: {
            storeId: { in: storeFilter.targetStoreIds },
            closingDate: {
              gte: monthRange.startDate,
              lte: monthRange.endDate,
            },
            status:
              selectedStatus === "ALL"
                ? { in: [...HEADQUARTERS_LABOR_STATUSES] }
                : selectedStatus,
          },
          orderBy: [
            { closingDate: "desc" },
            { store: { name: "asc" } },
            { id: "asc" },
          ],
          select: headquartersLaborLedgerSelect,
        });

  return buildHeadquartersLaborReport({
    monthInput: monthRange.monthInput,
    startDateInput: monthRange.startDateInput,
    endDateInput: monthRange.endDateInput,
    rangeLabel: monthRange.rangeLabel,
    isSingleMonth: monthRange.isSingleMonth,
    selectedStoreId: storeFilter.selectedStoreId,
    selectedStatus,
    selectedWorkerName,
    stores: scope.stores.map((store) => ({ id: store.id, name: store.name })),
    targetStoreIds: storeFilter.targetStoreIds,
    ledgers,
    errorMessages: [...monthRange.errorMessages, ...storeFilter.errorMessages],
  });
}
