import type { Prisma } from "../../../generated/prisma/index.js";

import {
  HEADQUARTERS_LABOR_STATUSES,
  type HeadquartersLaborDetail,
  type HeadquartersLaborLedgerStatus,
  type HeadquartersLaborReport,
  type HeadquartersLaborStatusFilter,
  type HeadquartersLaborStoreOption,
} from "./headquarters-labor-types.ts";

const MONTH_QUERY_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;

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
  selectedStoreId,
  selectedStatus,
  stores,
  targetStoreIds,
  ledgers,
  errorMessages = [],
}: {
  monthInput: string;
  selectedStoreId: string | null;
  selectedStatus: HeadquartersLaborStatusFilter;
  stores: HeadquartersLaborStoreOption[];
  targetStoreIds: readonly string[];
  ledgers: HeadquartersLaborLedgerRecord[];
  errorMessages?: string[];
}): HeadquartersLaborReport {
  const targetStoreIdSet = new Set(targetStoreIds);
  const targetLedgers = ledgers.filter((ledger) =>
    targetStoreIdSet.has(ledger.store.id),
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
    if (ledger.workerCount === null && ledger.ledgerLaborItems.length === 0) {
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
    summary.workerCount += ledger.workerCount ?? ledger.ledgerLaborItems.length;
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
    selectedStoreId,
    selectedStatus,
    stores,
    totalLaborAmount: details.reduce((sum, item) => sum + item.amount, 0),
    storeCount: storeSummaries.length,
    laborRecordCount: details.length,
    storeSummaries,
    details,
    errorMessages,
  };
}

export async function getHeadquartersLaborReport({
  month,
  storeId,
  status,
}: {
  month?: unknown;
  storeId?: unknown;
  status?: unknown;
} = {}): Promise<HeadquartersLaborReport> {
  const { getHeadquartersStoreScope, requireReportAccess } =
    await import("../../server/authz.ts");
  const { db } = await import("../../server/db.ts");
  await requireReportAccess();
  const scope = await getHeadquartersStoreScope();
  const monthRange = getHeadquartersLaborMonthRange(month);
  const selectedStatus = normalizeHeadquartersLaborStatus(status);
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
    selectedStoreId: storeFilter.selectedStoreId,
    selectedStatus,
    stores: scope.stores.map((store) => ({ id: store.id, name: store.name })),
    targetStoreIds: storeFilter.targetStoreIds,
    ledgers,
    errorMessages: storeFilter.errorMessages,
  });
}
