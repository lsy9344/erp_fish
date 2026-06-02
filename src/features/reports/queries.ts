import type { DailyLedgerStatus } from "../../../generated/prisma";
import {
  applyCorrectionValuesToLedgerReviewInput,
  calculateExpenseTotal,
  calculateLedgerReviewSummary,
  type LedgerReviewCorrectionOverlayResult,
  type LedgerReviewInventoryInput,
  type LedgerReviewMetric,
} from "../../server/calculations/ledger.ts";
import {
  calculateInventoryAdjustment,
  calculateInventoryAmount,
  calculateSystemInventoryQuantity,
} from "../../server/calculations/inventory.ts";
import type {
  AnomalyThresholdSignalSettings,
  evaluateInventoryLossAnomalySignals as evaluateInventoryLossAnomalySignalsFunction,
  evaluateRevenueAnomalySignals as evaluateRevenueAnomalySignalsFunction,
} from "../../server/calculations/anomaly.ts";
import {
  mapDashboardBusinessStatus,
  mapDashboardLedgerStatus,
  summarizeDashboardRows,
} from "../dashboard/queries.ts";
import type {
  DashboardSignalSummary,
  HqDashboardRow,
} from "../dashboard/types.ts";
import type { CorrectionAppliedValue } from "../corrections/types.ts";
import type {
  DailyMeetingReportData,
  DailyMeetingReportDatePreset,
  DailyMeetingReportMetricEvidence,
  DailyMeetingReportMetricEvidenceInput,
  DailyMeetingReportMetricEvidenceMap,
  DailyMeetingReportRow,
  MonthlyAnomalyItem,
  MonthlyCalculationDay,
  MonthlyClosingAnomalyDay,
  MonthlyClosingAnomalyReportData,
  MonthlyClosingAnomalyReportMonthRange,
  MonthlyInventoryFlowSummary,
  MonthlyLossSummary,
  MonthlyTopRevenueItemSummary,
  StoreComparisonReportData,
  StoreComparisonReportDateRange,
  StoreComparisonReportRow,
} from "./types.ts";

const SEOUL_TIME_ZONE = "Asia/Seoul";
const DATE_QUERY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_QUERY_PATTERN = /^\d{4}-\d{2}$/;
type EvaluateRevenueAnomalySignals =
  typeof evaluateRevenueAnomalySignalsFunction;
type EvaluateInventoryLossAnomalySignals =
  typeof evaluateInventoryLossAnomalySignalsFunction;

type ReportStoreRecord = {
  id: string;
  name: string;
};

type ReportLedgerRecord = {
  id: string;
  storeId: string;
  closingDate: Date;
  status: DailyLedgerStatus;
  totalSalesAmount: number;
  cashAmount: number;
  cardAmount: number;
  otherPaymentAmount: number;
  workerCount: number | null;
  updatedAt: Date;
  updatedBy: {
    name: string | null;
    email: string | null;
  };
  ledgerInventoryItems: {
    id: string;
    productId: string;
    productName: string;
    previousQuantity: number;
    purchasedQuantity: number;
    currentQuantity: number | null;
    quantity: number | null;
    unitPrice: number;
    inventoryAmount: number | null;
  }[];
  ledgerExpenses: {
    id: string;
    amount: number;
  }[];
  ledgerInventoryAdjustments: {
    productId: string;
    ledgerInventoryItemId: string | null;
    productName: string;
    beforeQuantity: number;
    beforeAmount: number;
    afterQuantity: number;
    afterAmount: number;
    unitPrice: number;
    differenceQuantity: number;
    differenceAmount: number;
    reason: string;
  }[];
  ledgerLossItems: {
    id: string;
    productId: string;
    productName: string;
    lossTypeName: string;
    quantity: number;
    amount: number;
  }[];
};

type ReportRowWithoutPriority = Omit<DailyMeetingReportRow, "priority">;

export function getDailyMeetingReportDatePreset(
  value: unknown,
): DailyMeetingReportDatePreset {
  if (value === "yesterday") {
    return "yesterday";
  }

  if (isValidDateQuery(value)) {
    return "custom";
  }

  return "today";
}

export function getDailyMeetingReportDateQuery(value: unknown) {
  if (value === "yesterday") {
    return "yesterday";
  }

  if (isValidDateQuery(value)) {
    return value;
  }

  return "today";
}

export function getDailyMeetingReportDate(
  dateQuery: string,
  inputDate = new Date(),
) {
  if (isValidDateQuery(dateQuery)) {
    const [year, month, day] = dateQuery.split("-");

    return new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0),
    );
  }

  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(inputDate)
    .split("-");
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0),
  );

  if (dateQuery === "yesterday") {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return date;
}

export function getDailyMeetingReportDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getDailyMeetingReportPath({
  datePreset,
  dateQuery,
}: {
  datePreset?: DailyMeetingReportDatePreset;
  dateQuery?: string;
}) {
  return `/app/reports/daily?date=${encodeURIComponent(
    dateQuery ?? datePreset ?? "today",
  )}`;
}

export function getStoreComparisonReportDateRange(
  input: {
    startDate?: unknown;
    endDate?: unknown;
  } = {},
  inputDate = new Date(),
): StoreComparisonReportDateRange {
  const defaultEndDate = getDailyMeetingReportDate("today", inputDate);
  const defaultStartDate = new Date(defaultEndDate);

  defaultStartDate.setUTCDate(defaultStartDate.getUTCDate() - 6);

  const startDateInput = input.startDate;
  const endDateInput = input.endDate;
  const hasStartDateInput = startDateInput !== undefined;
  const hasEndDateInput = endDateInput !== undefined;
  const hasAnyDateInput = hasStartDateInput || hasEndDateInput;
  const isStartDateValid = isValidDateQuery(startDateInput);
  const isEndDateValid = isValidDateQuery(endDateInput);
  let startDate = defaultStartDate;
  let endDate = defaultEndDate;
  let errorMessage: string | null = null;

  if (hasAnyDateInput && (!isStartDateValid || !isEndDateValid)) {
    errorMessage = "기간을 확인해 주세요. 기본 7일 기간으로 조회합니다.";
  } else if (isStartDateValid && isEndDateValid) {
    startDate = getDailyMeetingReportDate(startDateInput);
    endDate = getDailyMeetingReportDate(endDateInput);
  }

  if (startDate > endDate) {
    startDate = new Date(endDate);
    errorMessage = "시작일이 종료일보다 늦어 종료일 기준으로 조회합니다.";
  }

  return {
    startDate,
    endDate,
    startDateInput: getDailyMeetingReportDateInput(startDate),
    endDateInput: getDailyMeetingReportDateInput(endDate),
    errorMessage,
  };
}

export function getStoreComparisonReportPath({
  startDateInput,
  endDateInput,
}: Pick<StoreComparisonReportDateRange, "startDateInput" | "endDateInput">) {
  return `/app/reports/comparison?startDate=${encodeURIComponent(
    startDateInput,
  )}&endDate=${encodeURIComponent(endDateInput)}`;
}

export function getMonthlyClosingAnomalyReportMonthRange(
  month: unknown,
  inputDate = new Date(),
): MonthlyClosingAnomalyReportMonthRange {
  const today = getDailyMeetingReportDate("today", inputDate);
  const currentMonthInput = getDailyMeetingReportDateInput(today).slice(0, 7);
  const hasMonthInput = month !== undefined && month !== null && month !== "";
  const monthInput = isValidMonthQuery(month)
    ? month
    : currentMonthInput;
  const year = Number(monthInput.slice(0, 4));
  const monthNumber = Number(monthInput.slice(5, 7));
  const startDate = new Date(Date.UTC(year, monthNumber - 1, 1));
  const monthEndDate = new Date(Date.UTC(year, monthNumber, 0));
  const currentMonthStartDate = new Date(
    Date.UTC(
      Number(currentMonthInput.slice(0, 4)),
      Number(currentMonthInput.slice(5, 7)) - 1,
      1,
    ),
  );
  const isCurrentMonth = monthInput === currentMonthInput;
  const isFutureMonth = startDate > currentMonthStartDate;
  const endDate = isCurrentMonth ? new Date(today) : monthEndDate;

  return {
    monthInput,
    startDate,
    endDate,
    startDateInput: getDailyMeetingReportDateInput(startDate),
    endDateInput: getDailyMeetingReportDateInput(endDate),
    errorMessage:
      hasMonthInput && !isValidMonthQuery(month)
        ? "조회 월을 확인해 주세요. 현재 월로 조회합니다."
        : null,
    isFutureMonth,
  };
}

export function getMonthlyClosingAnomalyReportPath({
  monthInput,
  storeId,
}: {
  monthInput: string;
  storeId?: string | null;
}) {
  const params = new URLSearchParams({ month: monthInput });

  if (storeId) {
    params.set("storeId", storeId);
  }

  return `/app/reports/monthly?${params.toString()}`;
}

export async function getHqDailyMeetingReport({
  datePreset = "today",
  dateQuery,
}: {
  datePreset?: string;
  dateQuery?: string;
} = {}): Promise<DailyMeetingReportData> {
  const { requireHeadquartersUser } = await import("../../server/authz.ts");
  await requireHeadquartersUser();

  const query = getDailyMeetingReportDateQuery(dateQuery ?? datePreset);
  const preset = getDailyMeetingReportDatePreset(query);
  const closingDate = getDailyMeetingReportDate(query);
  const { db } = await import("../../server/db.ts");
  const { getAnomalyThresholdSettingsForSignals } =
    await import("../dashboard/threshold-queries.ts");
  const { getLatestCorrectionValuesForLedgers } =
    await import("../corrections/queries.ts");
  const { evaluateInventoryLossAnomalySignals, evaluateRevenueAnomalySignals } =
    await import("../../server/calculations/anomaly.ts");
  const [stores, thresholdSettings] = await Promise.all([
    db.store.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
      },
    }),
    getAnomalyThresholdSettingsForSignals(),
  ]);
  const storeIds = stores.map((store) => store.id);
  const ledgers =
    storeIds.length === 0
      ? []
      : await db.dailyLedger.findMany({
          where: {
            storeId: { in: storeIds },
            closingDate,
          },
          select: {
            id: true,
            storeId: true,
            closingDate: true,
            status: true,
            totalSalesAmount: true,
            cashAmount: true,
            cardAmount: true,
            otherPaymentAmount: true,
            workerCount: true,
            updatedAt: true,
            updatedBy: {
              select: {
                name: true,
                email: true,
              },
            },
            ledgerInventoryItems: {
              select: {
                id: true,
                productId: true,
                productName: true,
                previousQuantity: true,
                purchasedQuantity: true,
                currentQuantity: true,
                quantity: true,
                unitPrice: true,
                inventoryAmount: true,
              },
            },
            ledgerExpenses: {
              select: {
                id: true,
                amount: true,
              },
            },
            ledgerInventoryAdjustments: {
              select: {
                ledgerInventoryItemId: true,
                productId: true,
                productName: true,
                beforeQuantity: true,
                beforeAmount: true,
                afterQuantity: true,
                afterAmount: true,
                unitPrice: true,
                differenceQuantity: true,
                differenceAmount: true,
                reason: true,
              },
            },
            ledgerLossItems: {
              select: {
                id: true,
                productId: true,
                productName: true,
                lossTypeName: true,
                quantity: true,
                amount: true,
              },
            },
          },
        });
  const correctionValuesByLedgerId = await getLatestCorrectionValuesForLedgers(
    ledgers.map((ledger) => ledger.id),
  );
  const ledgerByStoreId = new Map<string, ReportLedgerRecord>(
    ledgers.map((ledger) => [ledger.storeId, ledger]),
  );
  const rows = stores.map((store) =>
    toDailyMeetingReportRow({
      store,
      ledger: ledgerByStoreId.get(store.id) ?? null,
      closingDate,
      thresholdSettings,
      evaluateRevenueAnomalySignals,
      evaluateInventoryLossAnomalySignals,
      corrections: correctionValuesByLedgerId.get(
        ledgerByStoreId.get(store.id)?.id ?? "",
      ),
    }),
  );

  return {
    datePreset: preset,
    dateQuery: query,
    dateInput: getDailyMeetingReportDateInput(closingDate),
    closingDate: closingDate.toISOString(),
    rows,
    summary: summarizeDashboardRows(rows),
  };
}

export async function getHqStoreComparisonReport({
  startDate,
  endDate,
}: {
  startDate?: unknown;
  endDate?: unknown;
} = {}): Promise<StoreComparisonReportData> {
  const { requireHeadquartersUser } = await import("../../server/authz.ts");
  await requireHeadquartersUser();

  const range = getStoreComparisonReportDateRange({ startDate, endDate });
  const { db } = await import("../../server/db.ts");
  const { getLatestCorrectionValuesForLedgers } =
    await import("../corrections/queries.ts");
  const stores = await db.store.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
    },
  });
  const storeIds = stores.map((store) => store.id);
  const ledgers =
    storeIds.length === 0
      ? []
      : await db.dailyLedger.findMany({
          where: {
            storeId: { in: storeIds },
            closingDate: { gte: range.startDate, lte: range.endDate },
          },
          orderBy: [{ storeId: "asc" }, { closingDate: "asc" }],
          select: {
            id: true,
            storeId: true,
            closingDate: true,
            status: true,
            totalSalesAmount: true,
            cashAmount: true,
            cardAmount: true,
            otherPaymentAmount: true,
            workerCount: true,
            updatedAt: true,
            updatedBy: {
              select: {
                name: true,
                email: true,
              },
            },
            ledgerInventoryItems: {
              select: {
                id: true,
                productId: true,
                productName: true,
                previousQuantity: true,
                purchasedQuantity: true,
                currentQuantity: true,
                quantity: true,
                unitPrice: true,
                inventoryAmount: true,
              },
            },
            ledgerExpenses: {
              select: {
                id: true,
                amount: true,
              },
            },
            ledgerInventoryAdjustments: {
              select: {
                ledgerInventoryItemId: true,
                productId: true,
                productName: true,
                beforeQuantity: true,
                beforeAmount: true,
                afterQuantity: true,
                afterAmount: true,
                unitPrice: true,
                differenceQuantity: true,
                differenceAmount: true,
                reason: true,
              },
            },
            ledgerLossItems: {
              select: {
                id: true,
                productId: true,
                productName: true,
                lossTypeName: true,
                quantity: true,
                amount: true,
              },
            },
          },
        });
  const correctionValuesByLedgerId = await getLatestCorrectionValuesForLedgers(
    ledgers.map((ledger) => ledger.id),
  );
  const summariesByStoreId = new Map<
    string,
    StoreComparisonLedgerSummaryForTest[]
  >();

  for (const ledger of ledgers) {
    const storeSummaries = summariesByStoreId.get(ledger.storeId) ?? [];

    storeSummaries.push(
      toStoreComparisonLedgerSummary(
        ledger,
        correctionValuesByLedgerId.get(ledger.id),
      ),
    );
    summariesByStoreId.set(ledger.storeId, storeSummaries);
  }

  return {
    range,
    rows: stores.map((store) =>
      buildStoreComparisonReportRowForTest({
        store,
        dateCount: getInclusiveDateCount(range.startDate, range.endDate),
        ledgerSummaries: summariesByStoreId.get(store.id) ?? [],
      }),
    ),
  };
}

export async function getHqMonthlyClosingAnomalyReport({
  month,
  storeId,
}: {
  month?: unknown;
  storeId?: unknown;
} = {}): Promise<MonthlyClosingAnomalyReportData> {
  const { requireHeadquartersUser } = await import("../../server/authz.ts");
  await requireHeadquartersUser();

  const monthRange = getMonthlyClosingAnomalyReportMonthRange(month);
  const { db } = await import("../../server/db.ts");
  const { getAnomalyThresholdSettingsForSignals } =
    await import("../dashboard/threshold-queries.ts");
  const { getLatestCorrectionValuesForLedgers } =
    await import("../corrections/queries.ts");
  const { evaluateInventoryLossAnomalySignals, evaluateRevenueAnomalySignals } =
    await import("../../server/calculations/anomaly.ts");
  const [stores, thresholdSettings] = await Promise.all([
    db.store.findMany({
      where: { isActive: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
      },
    }),
    getAnomalyThresholdSettingsForSignals(),
  ]);
  const normalizedStoreId =
    typeof storeId === "string" && storeId.length > 0 ? storeId : null;
  const matchedStore = normalizedStoreId
    ? stores.find((store) => store.id === normalizedStoreId)
    : null;
  const selectedStore = matchedStore ?? stores[0] ?? null;
  const storeErrorMessage =
    normalizedStoreId && !matchedStore && selectedStore
      ? "조회 지점을 확인해 주세요. 첫 번째 활성 지점으로 조회합니다."
      : null;
  const errorMessages = [monthRange.errorMessage, storeErrorMessage].filter(
    (message): message is string => Boolean(message),
  );

  if (!selectedStore) {
    return buildEmptyMonthlyClosingAnomalyReport({
      monthRange,
      stores,
      errorMessages,
    });
  }

  const ledgers = await db.dailyLedger.findMany({
    where: {
      storeId: selectedStore.id,
      closingDate: {
        gte: monthRange.startDate,
        lte: monthRange.endDate,
      },
    },
    orderBy: [{ closingDate: "asc" }, { id: "asc" }],
    select: {
      id: true,
      storeId: true,
      closingDate: true,
      status: true,
      totalSalesAmount: true,
      cashAmount: true,
      cardAmount: true,
      otherPaymentAmount: true,
      workerCount: true,
      updatedAt: true,
      updatedBy: {
        select: {
          name: true,
          email: true,
        },
      },
      ledgerInventoryItems: {
        select: {
          id: true,
          productId: true,
          productName: true,
          previousQuantity: true,
          purchasedQuantity: true,
          currentQuantity: true,
          quantity: true,
          unitPrice: true,
          inventoryAmount: true,
        },
      },
      ledgerExpenses: {
        select: {
          id: true,
          amount: true,
        },
      },
      ledgerInventoryAdjustments: {
        select: {
          ledgerInventoryItemId: true,
          productId: true,
          productName: true,
          beforeQuantity: true,
          beforeAmount: true,
          afterQuantity: true,
          afterAmount: true,
          unitPrice: true,
          differenceQuantity: true,
          differenceAmount: true,
          reason: true,
        },
      },
      ledgerLossItems: {
        select: {
          id: true,
          productId: true,
          productName: true,
          lossTypeName: true,
          quantity: true,
          amount: true,
        },
      },
    },
  });
  const correctionValuesByLedgerId = await getLatestCorrectionValuesForLedgers(
    ledgers.map((ledger) => ledger.id),
  );
  const ledgerSummaries = ledgers.map((ledger) => {
    const corrections = correctionValuesByLedgerId.get(ledger.id);
    const row = toDailyMeetingReportRow({
      store: selectedStore,
      ledger,
      closingDate: ledger.closingDate,
      thresholdSettings,
      evaluateRevenueAnomalySignals,
      evaluateInventoryLossAnomalySignals,
      corrections,
    });
    const calculationSummary = toReportLedgerCalculationSummary(
      ledger,
      corrections,
    );

    return {
      dateInput: getDailyMeetingReportDateInput(ledger.closingDate),
      ledgerId: ledger.id,
      status: ledger.status,
      signals: row.signals,
      metricEvidence: row.metricEvidence,
      hasUnappliedCorrections: row.correctionState.hasUnappliedCorrections,
      original: calculationSummary.original,
      applied: calculationSummary.applied,
      originalWorkerCount: calculationSummary.originalWorkerCount,
      workerCount: calculationSummary.workerCount,
      originalLossItems: calculationSummary.originalLossItems,
      lossItems: calculationSummary.lossItems,
      originalInventoryItems: calculationSummary.originalInventoryItems,
      inventoryItems: calculationSummary.inventoryItems,
      originalInventoryAdjustments:
        calculationSummary.originalInventoryAdjustments,
      inventoryAdjustments: calculationSummary.inventoryAdjustments,
      appliedCorrectionCount: calculationSummary.appliedCorrectionCount,
      appliedCorrectionKeys: calculationSummary.appliedCorrectionKeys,
      unappliedCorrectionKeys: calculationSummary.unappliedCorrectionKeys,
    };
  });

  return buildMonthlyClosingAnomalyReportForTest({
    store: selectedStore,
    stores,
    monthRange,
    monthInput: monthRange.monthInput,
    dateInputs: getMonthlyClosingAnomalyDateInputs(
      monthRange,
      ledgerSummaries.map((summary) => summary.dateInput),
    ),
    ledgerSummaries,
    errorMessages,
  });
}

type MonthlyClosingAnomalyLedgerSummaryForTest = {
  dateInput: string;
  ledgerId: string;
  status: DailyLedgerStatus;
  signals: DashboardSignalSummary[];
  metricEvidence: DailyMeetingReportMetricEvidenceMap;
  hasUnappliedCorrections: boolean;
  original?: ReportAggregateMetrics;
  applied?: ReportAggregateMetrics;
  originalWorkerCount?: number | null;
  workerCount?: number | null;
  originalLossItems?: MonthlyReportLossItem[];
  lossItems?: MonthlyReportLossItem[];
  originalInventoryItems?: MonthlyReportInventoryItem[];
  inventoryItems?: MonthlyReportInventoryItem[];
  originalInventoryAdjustments?: MonthlyReportInventoryAdjustment[];
  inventoryAdjustments?: MonthlyReportInventoryAdjustment[];
  appliedCorrectionCount?: number;
  appliedCorrectionKeys?: Set<string>;
  unappliedCorrectionKeys?: Set<string>;
};

type ReportAggregateMetrics = Pick<
  ReturnType<typeof calculateLedgerReviewSummary>,
  | "totalSales"
  | "grossProfit"
  | "grossMarginRate"
  | "operatingProfit"
  | "productivity"
  | "inventoryAmount"
>;

type ReportAggregateLedgerSummary = {
  ledgerId: string;
  status: DailyLedgerStatus;
  original: ReportAggregateMetrics;
  applied: ReportAggregateMetrics;
  originalWorkerCount?: number | null;
  workerCount: number | null;
  hasUnappliedCorrections: boolean;
  appliedCorrectionCount?: number;
  appliedCorrectionKeys?: Set<string>;
  unappliedCorrectionKeys?: Set<string>;
};

type MonthlyReportLossItem = {
  id?: string;
  productId: string;
  productName: string;
  lossTypeName?: string | null;
  quantity: number;
  amount: number;
};

type MonthlyReportInventoryItem = LedgerReviewInventoryInput;

type MonthlyReportInventoryAdjustment = {
  differenceQuantity: number;
  differenceAmount: number;
};

export function buildMonthlyClosingAnomalyReportForTest({
  store,
  stores = [store],
  monthRange,
  monthInput,
  dateInputs,
  ledgerSummaries,
  errorMessages = [],
}: {
  store: ReportStoreRecord;
  stores?: ReportStoreRecord[];
  monthRange?: MonthlyClosingAnomalyReportMonthRange;
  monthInput: string;
  dateInputs: string[];
  ledgerSummaries: MonthlyClosingAnomalyLedgerSummaryForTest[];
  errorMessages?: string[];
}): MonthlyClosingAnomalyReportData {
  const ledgerSummaryByDateInput = new Map(
    ledgerSummaries.map((summary) => [summary.dateInput, summary]),
  );
  const days = dateInputs.map((dateInput) => {
    const summary = ledgerSummaryByDateInput.get(dateInput);

    if (!summary) {
      return buildMonthlyMissingDay({ store, dateInput });
    }

    return {
      dateInput,
      dateLabel: formatMonthlyDayLabel(dateInput),
      storeId: store.id,
      storeName: store.name,
      ledgerId: summary.ledgerId,
      ledgerDetailHref: `/app/ledgers/${summary.ledgerId}`,
      businessStatus: mapDashboardBusinessStatus(summary.status),
      ledgerStatus: mapDashboardLedgerStatus(summary.status),
      hasUnappliedCorrections: summary.hasUnappliedCorrections,
      signals: summary.signals,
      metricEvidence: summary.metricEvidence,
    };
  });

  return {
    monthRange:
      monthRange ??
      buildMonthlyRangeFromDateInputs({
        monthInput,
        dateInputs,
      }),
    stores,
    selectedStoreId: store.id,
    selectedStoreName: store.name,
    statusCounts: getMonthlyStatusCounts(days),
    monthlyKpis: buildMonthlyKpis(ledgerSummaries),
    monthlyLossSummary: buildMonthlyLossSummary(ledgerSummaries),
    monthlyInventoryFlow: buildMonthlyInventoryFlow(ledgerSummaries),
    topRevenueItem: buildMonthlyTopRevenueItemSummary(),
    calculationDays: buildMonthlyCalculationDays(days, ledgerSummaries),
    days,
    anomalyItems: buildMonthlyAnomalyItems(days),
    errorMessages,
  };
}

function buildEmptyMonthlyClosingAnomalyReport({
  monthRange,
  stores,
  errorMessages,
}: {
  monthRange: MonthlyClosingAnomalyReportMonthRange;
  stores: ReportStoreRecord[];
  errorMessages: string[];
}): MonthlyClosingAnomalyReportData {
  return {
    monthRange,
    stores,
    selectedStoreId: null,
    selectedStoreName: null,
    statusCounts: {
      missingDayCount: 0,
      inProgressCount: 0,
      reviewCount: 0,
      closedCount: 0,
      holidayCount: 0,
    },
    monthlyKpis: buildMonthlyKpis([]),
    monthlyLossSummary: buildMonthlyLossSummary([]),
    monthlyInventoryFlow: buildMonthlyInventoryFlow([]),
    topRevenueItem: buildMonthlyTopRevenueItemSummary(),
    calculationDays: [],
    days: [],
    anomalyItems: [],
    errorMessages,
  };
}

function buildMonthlyMissingDay({
  store,
  dateInput,
}: {
  store: ReportStoreRecord;
  dateInput: string;
}): MonthlyClosingAnomalyDay {
  return {
    dateInput,
    dateLabel: formatMonthlyDayLabel(dateInput),
    storeId: store.id,
    storeName: store.name,
    ledgerId: null,
    ledgerDetailHref: null,
    businessStatus: mapDashboardBusinessStatus(null),
    ledgerStatus: mapDashboardLedgerStatus(null),
    hasUnappliedCorrections: false,
    signals: [],
    metricEvidence: buildEmptyMonthlyMetricEvidence(),
  };
}

function buildMonthlyKpis(
  ledgerSummaries: MonthlyClosingAnomalyLedgerSummaryForTest[],
) {
  const businessSummaries = getMonthlyBusinessAggregateSummaries(ledgerSummaries);
  const originalAggregates = aggregateStoreComparisonMetrics(
    businessSummaries,
    "original",
  );
  const appliedAggregates = aggregateStoreComparisonMetrics(
    businessSummaries,
    "applied",
  );
  const originalLossTotal = sumMonthlyLossAmount(
    businessSummaries.flatMap(
      (summary) => summary.originalLossItems ?? summary.lossItems ?? [],
    ),
  );
  const appliedLossTotal = sumMonthlyLossAmount(
    businessSummaries.flatMap((summary) => summary.lossItems ?? []),
  );
  const evidenceLedgerStatus =
    businessSummaries.length === 0
      ? ("EMPTY" as const)
      : ("HEADQUARTERS_CLOSED" as const);

  return {
    salesAmount: appliedAggregates.salesAmount,
    grossProfit: appliedAggregates.grossProfit,
    grossMarginRate: appliedAggregates.grossMarginRate,
    operatingProfit: appliedAggregates.operatingProfit,
    lossTotal: appliedLossTotal,
    averageInventory: appliedAggregates.averageInventory,
    averageSales: appliedAggregates.averageSales,
    inventoryToSalesRatio: appliedAggregates.inventoryToSalesRatio,
    metricEvidence: {
      salesAmount: buildStoreComparisonMetricEvidence({
        label: "매출",
        kind: "money",
        original: originalAggregates.salesAmount,
        applied: appliedAggregates.salesAmount,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries: businessSummaries,
        matchers: comparisonMetricCorrectionMatchers.salesAmount,
      }),
      grossProfit: buildStoreComparisonMetricEvidence({
        label: "매출이익",
        kind: "money",
        original: originalAggregates.grossProfit,
        applied: appliedAggregates.grossProfit,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries: businessSummaries,
        matchers: comparisonMetricCorrectionMatchers.grossProfit,
      }),
      grossMarginRate: buildStoreComparisonMetricEvidence({
        label: "이익률",
        kind: "percent",
        original: originalAggregates.grossMarginRate,
        applied: appliedAggregates.grossMarginRate,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries: businessSummaries,
        matchers: comparisonMetricCorrectionMatchers.grossMarginRate,
      }),
      operatingProfit: buildStoreComparisonMetricEvidence({
        label: "영업이익",
        kind: "money",
        original: originalAggregates.operatingProfit,
        applied: appliedAggregates.operatingProfit,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries: businessSummaries,
        matchers: comparisonMetricCorrectionMatchers.operatingProfit,
      }),
      averageInventory: buildStoreComparisonMetricEvidence({
        label: "평균재고",
        kind: "money",
        original: originalAggregates.averageInventory,
        applied: appliedAggregates.averageInventory,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries: businessSummaries,
        matchers: comparisonMetricCorrectionMatchers.averageInventory,
      }),
      averageSales: buildStoreComparisonMetricEvidence({
        label: "평균매출",
        kind: "money",
        original: originalAggregates.averageSales,
        applied: appliedAggregates.averageSales,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries: businessSummaries,
        matchers: comparisonMetricCorrectionMatchers.averageSales,
      }),
      inventoryToSalesRatio: buildStoreComparisonMetricEvidence({
        label: "재고비율",
        kind: "percent",
        original: originalAggregates.inventoryToSalesRatio,
        applied: appliedAggregates.inventoryToSalesRatio,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries: businessSummaries,
        matchers: comparisonMetricCorrectionMatchers.inventoryToSalesRatio,
      }),
      lossTotal: buildStoreComparisonMetricEvidence({
        label: "손실 합계",
        kind: "money",
        original: originalLossTotal,
        applied: appliedLossTotal,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries: businessSummaries,
        matchers: comparisonMetricCorrectionMatchers.loss,
      }),
    },
  };
}

function buildMonthlyLossSummary(
  ledgerSummaries: MonthlyClosingAnomalyLedgerSummaryForTest[],
): MonthlyLossSummary {
  const businessSummaries = getMonthlyBusinessAggregateSummaries(ledgerSummaries);
  const byType = new Map<string, MonthlyLossSummary["byType"][number]>();

  for (const item of getMonthlyBusinessLossItems(ledgerSummaries)) {
    const lossTypeName = normalizeMonthlyLossTypeName(item.lossTypeName);
    const current = byType.get(lossTypeName);

    if (current) {
      current.quantity += item.quantity;
      current.amount += item.amount;
      continue;
    }

    byType.set(lossTypeName, {
      lossTypeName,
      quantity: item.quantity,
      amount: item.amount,
    });
  }

  const rows = [...byType.values()].sort(
    (left, right) =>
      right.amount - left.amount ||
      left.lossTypeName.localeCompare(right.lossTypeName, "ko-KR"),
  );

  const totalQuantity = rows.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = rows.reduce((sum, item) => sum + item.amount, 0);
  const originalLossTotal = sumMonthlyLossAmount(
    businessSummaries.flatMap(
      (summary) => summary.originalLossItems ?? summary.lossItems ?? [],
    ),
  );
  const appliedLossTotal = available(totalAmount);

  return {
    totalQuantity,
    totalAmount,
    hasRecordedLoss: totalQuantity > 0 || totalAmount > 0,
    metricEvidence: {
      totalAmount: buildStoreComparisonMetricEvidence({
        label: "손실 합계",
        kind: "money",
        original: originalLossTotal,
        applied: appliedLossTotal,
        ledgerStatus: getMonthlyEvidenceLedgerStatus(businessSummaries),
        ledgerSummaries: businessSummaries,
        matchers: comparisonMetricCorrectionMatchers.loss,
      }),
    },
    byType: rows,
  };
}

function buildMonthlyInventoryFlow(
  ledgerSummaries: MonthlyClosingAnomalyLedgerSummaryForTest[],
): MonthlyInventoryFlowSummary {
  const businessSummaries = getMonthlyBusinessAggregateSummaries(ledgerSummaries);
  const originalFlow = calculateMonthlyInventoryFlowMetrics(
    ledgerSummaries,
    "original",
  );
  const appliedFlow = calculateMonthlyInventoryFlowMetrics(
    ledgerSummaries,
    "applied",
  );

  return {
    ...appliedFlow,
    metricEvidence: {
      previousAmount: buildStoreComparisonMetricEvidence({
        label: "전일재고",
        kind: "money",
        original: originalFlow.previousAmount,
        applied: appliedFlow.previousAmount,
        ledgerStatus: getMonthlyEvidenceLedgerStatus(businessSummaries),
        ledgerSummaries: businessSummaries,
        matchers: [],
      }),
      purchaseAmount: buildStoreComparisonMetricEvidence({
        label: "매입",
        kind: "money",
        original: originalFlow.purchaseAmount,
        applied: appliedFlow.purchaseAmount,
        ledgerStatus: getMonthlyEvidenceLedgerStatus(businessSummaries),
        ledgerSummaries: businessSummaries,
        matchers: [],
      }),
      lossAmount: buildStoreComparisonMetricEvidence({
        label: "손실",
        kind: "money",
        original: originalFlow.lossAmount,
        applied: appliedFlow.lossAmount,
        ledgerStatus: getMonthlyEvidenceLedgerStatus(businessSummaries),
        ledgerSummaries: businessSummaries,
        matchers: comparisonMetricCorrectionMatchers.loss,
      }),
      currentAmount: buildStoreComparisonMetricEvidence({
        label: "당일재고",
        kind: "money",
        original: originalFlow.currentAmount,
        applied: appliedFlow.currentAmount,
        ledgerStatus: getMonthlyEvidenceLedgerStatus(businessSummaries),
        ledgerSummaries: businessSummaries,
        matchers: inventoryCorrectionMatchers,
      }),
      adjustmentDifferenceAmount: buildStoreComparisonMetricEvidence({
        label: "조정 차이",
        kind: "money",
        original: originalFlow.adjustmentDifferenceAmount,
        applied: appliedFlow.adjustmentDifferenceAmount,
        ledgerStatus: getMonthlyEvidenceLedgerStatus(businessSummaries),
        ledgerSummaries: businessSummaries,
        matchers: [
          ...inventoryCorrectionMatchers,
          ...comparisonMetricCorrectionMatchers.loss,
        ],
      }),
    },
  };
}

type MonthlyInventoryFlowMetricFields = Omit<
  MonthlyInventoryFlowSummary,
  "metricEvidence"
>;

function emptyMonthlyInventoryFlowMetrics(): MonthlyInventoryFlowMetricFields {
  return {
    previousQuantity: available(0),
    previousAmount: available(0),
    purchaseQuantity: available(0),
    purchaseAmount: available(0),
    lossQuantity: available(0),
    lossAmount: available(0),
    currentQuantity: available(0),
    currentAmount: available(0),
    adjustmentDifferenceQuantity: available(0),
    adjustmentDifferenceAmount: available(0),
  };
}

function calculateMonthlyInventoryFlowMetrics(
  ledgerSummaries: MonthlyClosingAnomalyLedgerSummaryForTest[],
  source: "original" | "applied",
): MonthlyInventoryFlowMetricFields {
  const flow = emptyMonthlyInventoryFlowMetrics();

  for (const summary of ledgerSummaries.filter(
    (item) => item.status !== "HOLIDAY",
  )) {
    const inventoryItems =
      source === "original"
        ? (summary.originalInventoryItems ?? summary.inventoryItems ?? [])
        : (summary.inventoryItems ?? []);
    const lossItems =
      source === "original"
        ? (summary.originalLossItems ?? summary.lossItems ?? [])
        : (summary.lossItems ?? []);
    const inventoryAdjustments =
      source === "original"
        ? (summary.originalInventoryAdjustments ??
          summary.inventoryAdjustments ??
          [])
        : (summary.inventoryAdjustments ?? []);

    for (const item of inventoryItems) {
      flow.previousQuantity = addMetricValue(
        flow.previousQuantity,
        item.previousQuantity,
      );
      flow.previousAmount = addNullableMetricValue(
        flow.previousAmount,
        calculateInventoryAmount(item.previousQuantity, item.unitPrice),
      );
      flow.purchaseQuantity = addMetricValue(
        flow.purchaseQuantity,
        item.purchasedQuantity,
      );
      flow.purchaseAmount = addNullableMetricValue(
        flow.purchaseAmount,
        calculateInventoryAmount(item.purchasedQuantity, item.unitPrice),
      );

      const currentQuantity = item.currentQuantity ?? item.quantity;
      flow.currentQuantity = addNullableMetricValue(
        flow.currentQuantity,
        currentQuantity,
      );
      flow.currentAmount = addNullableMetricValue(
        flow.currentAmount,
        calculateInventoryAmount(currentQuantity, item.unitPrice),
      );
    }

    for (const item of lossItems) {
      flow.lossQuantity = addMetricValue(flow.lossQuantity, item.quantity);
      flow.lossAmount = addMetricValue(flow.lossAmount, item.amount);
    }

    for (const adjustment of inventoryAdjustments) {
      flow.adjustmentDifferenceQuantity = addMetricValue(
        flow.adjustmentDifferenceQuantity,
        adjustment.differenceQuantity,
      );
      flow.adjustmentDifferenceAmount = addMetricValue(
        flow.adjustmentDifferenceAmount,
        adjustment.differenceAmount,
      );
    }
  }

  return flow;
}

function addMetricValue(metric: LedgerReviewMetric, value: number) {
  if (metric.value === null) {
    return metric;
  }

  return available(metric.value + value);
}

function addNullableMetricValue(
  metric: LedgerReviewMetric,
  value: number | null,
) {
  if (value === null) {
    return unavailable("계산 불가");
  }

  return addMetricValue(metric, value);
}

function hasMonthlyInventoryFlowCalculationIssue(
  summary: MonthlyClosingAnomalyLedgerSummaryForTest,
) {
  if (summary.status === "HOLIDAY") {
    return false;
  }

  for (const item of summary.inventoryItems ?? []) {
    const currentQuantity = item.currentQuantity ?? item.quantity;

    if (
      currentQuantity === null ||
      calculateInventoryAmount(item.previousQuantity, item.unitPrice) === null ||
      calculateInventoryAmount(item.purchasedQuantity, item.unitPrice) ===
        null ||
      calculateInventoryAmount(currentQuantity, item.unitPrice) === null
    ) {
      return true;
    }
  }

  return false;
}

function buildMonthlyTopRevenueItemSummary(): MonthlyTopRevenueItemSummary {
  return {
    status: "needs-review",
    statusLabel: "계산 기준 확인 필요",
    productName: null,
    salesAmount: unavailable("계산 기준 확인 필요"),
    note: "상품별 판매금액 산출 기준이 아직 확정되지 않아 임의로 품목을 선택하지 않습니다.",
  };
}

function buildMonthlyCalculationDays(
  days: MonthlyClosingAnomalyDay[],
  ledgerSummaries: MonthlyClosingAnomalyLedgerSummaryForTest[],
): MonthlyCalculationDay[] {
  const summariesByDateInput = new Map(
    ledgerSummaries.map((summary) => [summary.dateInput, summary]),
  );

  return days.map((day) => {
    if (!day.ledgerId) {
      return {
        dateInput: day.dateInput,
        dateLabel: day.dateLabel,
        inclusion: "excluded",
        reason: "미입력",
        ledgerStatusLabel: day.ledgerStatus.label,
        ledgerDetailHref: day.ledgerDetailHref,
      };
    }

    if (day.ledgerStatus.key === "HOLIDAY") {
      return {
        dateInput: day.dateInput,
        dateLabel: day.dateLabel,
        inclusion: "excluded",
        reason: "휴무일",
        ledgerStatusLabel: day.ledgerStatus.label,
        ledgerDetailHref: day.ledgerDetailHref,
      };
    }

    const summary = summariesByDateInput.get(day.dateInput);

    if (summary && hasMonthlyInventoryFlowCalculationIssue(summary)) {
      return {
        dateInput: day.dateInput,
        dateLabel: day.dateLabel,
        inclusion: "excluded",
        reason: "재고 흐름 계산 불가",
        ledgerStatusLabel: day.ledgerStatus.label,
        ledgerDetailHref: day.ledgerDetailHref,
      };
    }

    return {
      dateInput: day.dateInput,
      dateLabel: day.dateLabel,
      inclusion: "included",
      reason: "장부 집계 포함",
      ledgerStatusLabel: day.ledgerStatus.label,
      ledgerDetailHref: day.ledgerDetailHref,
    };
  });
}

function getMonthlyBusinessAggregateSummaries(
  ledgerSummaries: MonthlyClosingAnomalyLedgerSummaryForTest[],
): (MonthlyClosingAnomalyLedgerSummaryForTest &
  ReportAggregateLedgerSummary)[] {
  return ledgerSummaries.filter(
    (summary): summary is MonthlyClosingAnomalyLedgerSummaryForTest &
      ReportAggregateLedgerSummary =>
      summary.status !== "HOLIDAY" &&
      summary.original !== undefined &&
      summary.applied !== undefined &&
      summary.workerCount !== undefined,
  );
}

function getMonthlyEvidenceLedgerStatus(
  summaries: ReportAggregateLedgerSummary[],
) {
  return summaries.length === 0
    ? ("EMPTY" as const)
    : ("HEADQUARTERS_CLOSED" as const);
}

function getMonthlyBusinessLossItems(
  ledgerSummaries: MonthlyClosingAnomalyLedgerSummaryForTest[],
) {
  return ledgerSummaries
    .filter((summary) => summary.status !== "HOLIDAY")
    .flatMap((summary) => summary.lossItems ?? []);
}

function sumMonthlyLossAmount(items: MonthlyReportLossItem[]) {
  return available(
    items.reduce(
      (sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0),
      0,
    ),
  );
}

function normalizeMonthlyLossTypeName(value: string | null | undefined) {
  const name = value?.trim();

  return name && name.length > 0 ? name : "유형 미지정";
}

function buildEmptyMonthlyMetricEvidence(): DailyMeetingReportMetricEvidenceMap {
  const metric = unavailable("계산 불가");

  return buildDailyMeetingReportMetricEvidenceMap({
    ledgerId: null,
    ledgerStatus: "EMPTY",
    originalSummary: {
      totalSales: metric,
      grossMarginRate: metric,
      salesDifference: metric,
    },
    appliedSummary: {
      totalSales: metric,
      grossMarginRate: metric,
      salesDifference: metric,
    },
    originalHasLoss: null,
    appliedHasLoss: null,
    correctionState: {
      appliedKeys: new Set(),
      unappliedKeys: new Set(),
    },
  });
}

function buildMonthlyRangeFromDateInputs({
  monthInput,
  dateInputs,
}: {
  monthInput: string;
  dateInputs: string[];
}): MonthlyClosingAnomalyReportMonthRange {
  const year = Number(monthInput.slice(0, 4));
  const month = Number(monthInput.slice(5, 7));
  const fallbackStartDate = new Date(Date.UTC(year, month - 1, 1));
  const fallbackEndDate = new Date(Date.UTC(year, month, 0));
  const firstDateInput = dateInputs[0];
  const lastDateInput = dateInputs[dateInputs.length - 1];
  const startDate = firstDateInput
    ? getDailyMeetingReportDate(firstDateInput)
    : fallbackStartDate;
  const endDate = lastDateInput
    ? getDailyMeetingReportDate(lastDateInput)
    : fallbackEndDate;

  return {
    monthInput,
    startDate,
    endDate,
    startDateInput: getDailyMeetingReportDateInput(startDate),
    endDateInput: getDailyMeetingReportDateInput(endDate),
    errorMessage: null,
    isFutureMonth: false,
  };
}

function getMonthlyStatusCounts(days: MonthlyClosingAnomalyDay[]) {
  return {
    missingDayCount: days.filter((day) => day.ledgerStatus.key === "EMPTY")
      .length,
    inProgressCount: days.filter(
      (day) => day.ledgerStatus.key === "IN_PROGRESS",
    ).length,
    reviewCount: days.filter((day) => day.ledgerStatus.key === "IN_REVIEW")
      .length,
    closedCount: days.filter(
      (day) => day.ledgerStatus.key === "HEADQUARTERS_CLOSED",
    ).length,
    holidayCount: days.filter((day) => day.ledgerStatus.key === "HOLIDAY")
      .length,
  };
}

function buildMonthlyAnomalyItems(
  days: MonthlyClosingAnomalyDay[],
): MonthlyAnomalyItem[] {
  return days.flatMap((day) => {
    const ledgerId = day.ledgerId;

    if (!ledgerId) {
      return [];
    }

    const signalItems = day.signals
      .filter(shouldIncludeMonthlyAnomalySignal)
      .map((signal) => {
        const evidence = getMonthlyAnomalyMetricEvidence(
          signal.id,
          day.metricEvidence,
        );

        return {
          id: `${day.dateInput}-${ledgerId}-${signal.id}`,
          dateInput: day.dateInput,
          dateLabel: day.dateLabel,
          storeId: day.storeId,
          storeName: day.storeName,
          ledgerId,
          ledgerDetailHref: `/app/ledgers/${ledgerId}`,
          label: signal.label,
          severity: signal.severity,
          detail: signal.detail ?? null,
          correctionTimelineHref:
            evidence?.correctionTimelineHref ??
            getFirstCorrectionTimelineHref(day.metricEvidence),
          metricEvidence: evidence,
        };
      });

    const correctionItems = buildMonthlyCorrectionAnomalyItems(day).filter(
      (correctionItem) =>
        !signalItems.some(
          (signalItem) =>
            signalItem.metricEvidence !== null &&
            signalItem.metricEvidence === correctionItem.metricEvidence,
        ),
    );

    return [...signalItems, ...correctionItems];
  });
}

function shouldIncludeMonthlyAnomalySignal(signal: DashboardSignalSummary) {
  return ![
    "thresholds-pending",
    "inventory-input-required",
    "loss-input-required",
  ].includes(signal.id);
}

function buildMonthlyCorrectionAnomalyItems(
  day: MonthlyClosingAnomalyDay,
): MonthlyAnomalyItem[] {
  const ledgerId = day.ledgerId;

  if (!ledgerId) {
    return [];
  }

  return Object.values(day.metricEvidence)
    .filter((evidence) => evidence.isCorrected || evidence.status === "needs-review")
    .map((evidence, index) => ({
      id: `${day.dateInput}-${ledgerId}-correction-${index}`,
      dateInput: day.dateInput,
      dateLabel: day.dateLabel,
      storeId: day.storeId,
      storeName: day.storeName,
      ledgerId,
      ledgerDetailHref: `/app/ledgers/${ledgerId}`,
      label: `${evidence.label} ${evidence.statusLabel}`,
      severity: "info",
      detail: evidence.unavailableReason ?? "장부 상세에서 정정 근거를 확인해 주세요.",
      correctionTimelineHref: evidence.correctionTimelineHref,
      metricEvidence: evidence,
    }));
}

function getMonthlyAnomalyMetricEvidence(
  signalId: string,
  metricEvidence: DailyMeetingReportMetricEvidenceMap,
) {
  if (signalId.startsWith("sales-drop")) {
    return metricEvidence.salesAmount;
  }

  if (signalId.startsWith("gross-margin")) {
    return metricEvidence.grossMarginRate;
  }

  if (signalId.startsWith("sales-difference")) {
    return metricEvidence.salesDifference;
  }

  if (signalId.startsWith("loss")) {
    return metricEvidence.loss;
  }

  if (signalId.startsWith("inventory")) {
    return null;
  }

  if (signalId === "correction-review-required") {
    return getFirstCorrectionMetricEvidence(metricEvidence);
  }

  return null;
}

function getFirstCorrectionMetricEvidence(
  metricEvidence: DailyMeetingReportMetricEvidenceMap,
) {
  return (
    Object.values(metricEvidence).find(
      (evidence) =>
        evidence.correctionTimelineHref !== null ||
        evidence.isCorrected ||
        evidence.status === "needs-review",
    ) ?? null
  );
}

function getFirstCorrectionTimelineHref(
  metricEvidence: DailyMeetingReportMetricEvidenceMap,
) {
  return (
    Object.values(metricEvidence).find(
      (evidence) => evidence.correctionTimelineHref !== null,
    )?.correctionTimelineHref ?? null
  );
}

function getMonthlyClosingAnomalyDateInputs(
  monthRange: MonthlyClosingAnomalyReportMonthRange,
  ledgerDateInputs: string[],
) {
  if (monthRange.isFutureMonth) {
    return [...new Set(ledgerDateInputs)].sort();
  }

  const dateInputs: string[] = [];
  const cursor = new Date(monthRange.startDate);

  while (cursor <= monthRange.endDate) {
    dateInputs.push(getDailyMeetingReportDateInput(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dateInputs;
}

function formatMonthlyDayLabel(dateInput: string) {
  return `${Number(dateInput.slice(8, 10)).toLocaleString("ko-KR")}일`;
}

type StoreComparisonLedgerSummaryForTest = ReportAggregateLedgerSummary & {
  hasLoss: boolean;
};

function toStoreComparisonLedgerSummary(
  ledger: ReportLedgerRecord,
  corrections?: Map<string, CorrectionAppliedValue>,
): StoreComparisonLedgerSummaryForTest {
  const summary = toReportLedgerCalculationSummary(ledger, corrections);

  return {
    ...summary,
    hasLoss: summary.lossItems.some(
      (item) => item.quantity > 0 || item.amount > 0,
    ),
  };
}

function toReportLedgerCalculationSummary(
  ledger: ReportLedgerRecord,
  corrections?: Map<string, CorrectionAppliedValue>,
) {
  const originalReviewInput = {
    totalSalesAmount: ledger.totalSalesAmount,
    cashAmount: ledger.cashAmount,
    cardAmount: ledger.cardAmount,
    otherPaymentAmount: ledger.otherPaymentAmount,
    workerCount: ledger.workerCount,
    expenseTotal: calculateExpenseTotal(
      ledger.ledgerExpenses.map((item) => item.amount),
    ),
    inventoryItems: ledger.ledgerInventoryItems,
  };
  const original = calculateLedgerReviewSummary({
    ...originalReviewInput,
    inventoryAdjustments: ledger.ledgerInventoryAdjustments,
    lossItems: ledger.ledgerLossItems,
  });
  const correctionOverlay = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: ledger.id,
    reviewInput: originalReviewInput,
    expenseItems: ledger.ledgerExpenses,
    lossItems: ledger.ledgerLossItems,
    corrections: corrections?.values() ?? [],
  });
  const inventoryAdjustments = toCorrectedInventoryAdjustments(
    ledger.ledgerInventoryAdjustments,
    correctionOverlay,
  );
  const applied = calculateLedgerReviewSummary({
    ...correctionOverlay.reviewInput,
    inventoryAdjustments,
    lossItems: correctionOverlay.lossItems,
  });
  const lossTypeNameById = new Map(
    ledger.ledgerLossItems.map((item) => [item.id, item.lossTypeName]),
  );
  const correctedLossItems = correctionOverlay.lossItems.map((item) => ({
    ...item,
    lossTypeName: lossTypeNameById.get(item.id ?? "") ?? null,
  }));

  return {
    ledgerId: ledger.id,
    status: ledger.status,
    original,
    applied,
    originalWorkerCount: ledger.workerCount,
    workerCount: correctionOverlay.reviewInput.workerCount,
    originalLossItems: ledger.ledgerLossItems,
    lossItems: correctedLossItems,
    originalInventoryItems: ledger.ledgerInventoryItems,
    inventoryItems: correctionOverlay.reviewInput.inventoryItems,
    originalInventoryAdjustments: ledger.ledgerInventoryAdjustments,
    inventoryAdjustments,
    hasUnappliedCorrections:
      correctionOverlay.correctionState.hasUnappliedCorrections,
    appliedCorrectionCount:
      correctionOverlay.correctionState.appliedCorrectionCount,
    appliedCorrectionKeys: correctionOverlay.appliedCorrectionKeys,
    unappliedCorrectionKeys: correctionOverlay.unappliedCorrectionKeys,
  };
}

export function buildStoreComparisonReportRowForTest({
  store,
  dateCount,
  ledgerSummaries,
}: {
  store: ReportStoreRecord;
  dateCount: number;
  ledgerSummaries: StoreComparisonLedgerSummaryForTest[];
}): StoreComparisonReportRow {
  const businessSummaries = ledgerSummaries.filter(
    (summary) => summary.status !== "HOLIDAY",
  );
  const originalAggregates = aggregateStoreComparisonMetrics(
    businessSummaries,
    "original",
  );
  const appliedAggregates = aggregateStoreComparisonMetrics(
    businessSummaries,
    "applied",
  );
  const statusCounts = {
    missingDayCount: Math.max(0, dateCount - ledgerSummaries.length),
    inProgressCount: ledgerSummaries.filter(
      (summary) => summary.status === "IN_PROGRESS",
    ).length,
    reviewCount: ledgerSummaries.filter(
      (summary) => summary.status === "IN_REVIEW",
    ).length,
    closedCount: ledgerSummaries.filter(
      (summary) => summary.status === "HEADQUARTERS_CLOSED",
    ).length,
    holidayCount: ledgerSummaries.filter(
      (summary) => summary.status === "HOLIDAY",
    ).length,
  };
  const evidenceLedgerStatus =
    ledgerSummaries.length === 0
      ? ("EMPTY" as const)
      : ("HEADQUARTERS_CLOSED" as const);
  const hasLoss =
    ledgerSummaries.length === 0
      ? null
      : ledgerSummaries.some((summary) => summary.hasLoss);
  const hasUnappliedCorrections = ledgerSummaries.some(
    (summary) => summary.hasUnappliedCorrections,
  );
  const lossMetric =
    hasLoss === null ? unavailable("계산 불가") : available(hasLoss ? 1 : 0);

  return {
    storeId: store.id,
    storeName: store.name,
    statusCounts,
    salesAmount: appliedAggregates.salesAmount,
    grossProfit: appliedAggregates.grossProfit,
    grossMarginRate: appliedAggregates.grossMarginRate,
    operatingProfit: appliedAggregates.operatingProfit,
    productivity: appliedAggregates.productivity,
    averageInventory: appliedAggregates.averageInventory,
    averageSales: appliedAggregates.averageSales,
    inventoryToSalesRatio: appliedAggregates.inventoryToSalesRatio,
    hasLoss,
    hasUnappliedCorrections,
    metricEvidence: {
      salesAmount: buildStoreComparisonMetricEvidence({
        label: "매출",
        kind: "money",
        original: originalAggregates.salesAmount,
        applied: appliedAggregates.salesAmount,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries,
        matchers: comparisonMetricCorrectionMatchers.salesAmount,
      }),
      grossProfit: buildStoreComparisonMetricEvidence({
        label: "매출이익",
        kind: "money",
        original: originalAggregates.grossProfit,
        applied: appliedAggregates.grossProfit,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries,
        matchers: comparisonMetricCorrectionMatchers.grossProfit,
      }),
      grossMarginRate: buildStoreComparisonMetricEvidence({
        label: "이익률",
        kind: "percent",
        original: originalAggregates.grossMarginRate,
        applied: appliedAggregates.grossMarginRate,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries,
        matchers: comparisonMetricCorrectionMatchers.grossMarginRate,
      }),
      operatingProfit: buildStoreComparisonMetricEvidence({
        label: "영업이익",
        kind: "money",
        original: originalAggregates.operatingProfit,
        applied: appliedAggregates.operatingProfit,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries,
        matchers: comparisonMetricCorrectionMatchers.operatingProfit,
      }),
      productivity: buildStoreComparisonMetricEvidence({
        label: "인당생산성",
        kind: "money",
        original: originalAggregates.productivity,
        applied: appliedAggregates.productivity,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries,
        matchers: comparisonMetricCorrectionMatchers.productivity,
      }),
      averageInventory: buildStoreComparisonMetricEvidence({
        label: "평균재고",
        kind: "money",
        original: originalAggregates.averageInventory,
        applied: appliedAggregates.averageInventory,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries,
        matchers: comparisonMetricCorrectionMatchers.averageInventory,
      }),
      averageSales: buildStoreComparisonMetricEvidence({
        label: "평균매출",
        kind: "money",
        original: originalAggregates.averageSales,
        applied: appliedAggregates.averageSales,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries,
        matchers: comparisonMetricCorrectionMatchers.averageSales,
      }),
      inventoryToSalesRatio: buildStoreComparisonMetricEvidence({
        label: "재고비율",
        kind: "percent",
        original: originalAggregates.inventoryToSalesRatio,
        applied: appliedAggregates.inventoryToSalesRatio,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries,
        matchers: comparisonMetricCorrectionMatchers.inventoryToSalesRatio,
      }),
      loss: buildStoreComparisonMetricEvidence({
        label: "손실",
        kind: "boolean",
        original: lossMetric,
        applied: lossMetric,
        ledgerStatus: evidenceLedgerStatus,
        ledgerSummaries,
        matchers: comparisonMetricCorrectionMatchers.loss,
      }),
    },
  };
}

type ComparisonMetricCorrectionMatcher = {
  targetType: string;
  fieldKey: string;
};

const inventoryCorrectionMatchers = [
  { targetType: "INVENTORY_ROW", fieldKey: "currentQuantity" },
  { targetType: "INVENTORY_ROW", fieldKey: "quantity" },
  { targetType: "INVENTORY_ROW", fieldKey: "inventoryAmount" },
] satisfies ComparisonMetricCorrectionMatcher[];

const totalSalesCorrectionMatchers = [
  { targetType: "PAYMENT_FIELD", fieldKey: "totalSalesAmount" },
] satisfies ComparisonMetricCorrectionMatcher[];

const comparisonMetricCorrectionMatchers = {
  salesAmount: totalSalesCorrectionMatchers,
  grossProfit: [
    ...totalSalesCorrectionMatchers,
    ...inventoryCorrectionMatchers,
  ],
  grossMarginRate: [
    ...totalSalesCorrectionMatchers,
    ...inventoryCorrectionMatchers,
    { targetType: "CALCULATED_METRIC", fieldKey: "grossMarginRate" },
  ],
  operatingProfit: [
    ...totalSalesCorrectionMatchers,
    ...inventoryCorrectionMatchers,
    { targetType: "EXPENSE_ROW", fieldKey: "amount" },
  ],
  productivity: [
    ...totalSalesCorrectionMatchers,
    { targetType: "LEDGER_FIELD", fieldKey: "workerCount" },
  ],
  averageInventory: inventoryCorrectionMatchers,
  averageSales: totalSalesCorrectionMatchers,
  inventoryToSalesRatio: [
    ...totalSalesCorrectionMatchers,
    ...inventoryCorrectionMatchers,
  ],
  loss: [
    { targetType: "LOSS_ROW", fieldKey: "amount" },
    { targetType: "LOSS_ROW", fieldKey: "quantity" },
    { targetType: "CALCULATED_METRIC", fieldKey: "lossAmount" },
  ],
} satisfies Record<string, ComparisonMetricCorrectionMatcher[]>;

function buildStoreComparisonMetricEvidence({
  label,
  kind,
  original,
  applied,
  ledgerStatus,
  ledgerSummaries,
  matchers,
}: {
  label: string;
  kind: DailyMeetingReportMetricEvidenceInput["kind"];
  original: LedgerReviewMetric;
  applied: LedgerReviewMetric;
  ledgerStatus: DailyMeetingReportMetricEvidenceInput["ledgerStatus"];
  ledgerSummaries: ReportAggregateLedgerSummary[];
  matchers: ComparisonMetricCorrectionMatcher[];
}) {
  const correctionState = getStoreComparisonMetricCorrectionState(
    ledgerSummaries,
    matchers,
  );

  return buildDailyMeetingReportMetricEvidence({
    label,
    kind,
    original,
    applied,
    ledgerId:
      correctionState.ledgerIdWithCorrection ??
      getFirstLedgerId(ledgerSummaries),
    ledgerStatus,
    correctionCount: correctionState.appliedCount,
    hasUnappliedCorrections: correctionState.hasUnapplied,
  });
}

function getStoreComparisonMetricCorrectionState(
  ledgerSummaries: ReportAggregateLedgerSummary[],
  matchers: ComparisonMetricCorrectionMatcher[],
) {
  let appliedCount = 0;
  let hasUnapplied = false;
  let ledgerIdWithCorrection: string | null = null;

  for (const summary of ledgerSummaries) {
    const appliedKeys = summary.appliedCorrectionKeys ?? new Set<string>();
    const unappliedKeys = summary.unappliedCorrectionKeys ?? new Set<string>();
    const matchingAppliedKeys = [...appliedKeys].filter((key) =>
      matchesMetricCorrectionKey(key, matchers),
    );
    const hasMatchingUnappliedKey = [...unappliedKeys].some((key) =>
      matchesMetricCorrectionKey(key, matchers),
    );

    appliedCount += matchingAppliedKeys.length;
    hasUnapplied ||= hasMatchingUnappliedKey;

    if (
      ledgerIdWithCorrection === null &&
      (matchingAppliedKeys.length > 0 || hasMatchingUnappliedKey)
    ) {
      ledgerIdWithCorrection = summary.ledgerId;
    }
  }

  return {
    appliedCount,
    hasUnapplied,
    ledgerIdWithCorrection,
  };
}

function aggregateStoreComparisonMetrics(
  ledgerSummaries: ReportAggregateLedgerSummary[],
  source: "original" | "applied",
) {
  const salesMetrics = getMetrics(ledgerSummaries, source, "totalSales");
  const grossProfitMetrics = getMetrics(ledgerSummaries, source, "grossProfit");
  const operatingProfitMetrics = getMetrics(
    ledgerSummaries,
    source,
    "operatingProfit",
  );
  const inventoryMetrics = getMetrics(
    ledgerSummaries,
    source,
    "inventoryAmount",
  );
  const salesAmount = sumMetric(salesMetrics);
  const grossProfit = sumMetric(grossProfitMetrics);
  const operatingProfit = sumMetric(operatingProfitMetrics);
  const workerTotal = ledgerSummaries.reduce(
    (sum, summary) => sum + (getWorkerCount(summary, source) ?? 0),
    0,
  );
  const hasSalesDayWithoutWorkers = ledgerSummaries.some((summary) => {
    const sales = summary[source].totalSales.value;
    const workerCount = getWorkerCount(summary, source);

    return (
      sales !== null && sales > 0 && (workerCount === null || workerCount <= 0)
    );
  });
  const averageInventory = averageMetric(inventoryMetrics);
  const averageSales = averageMetric(salesMetrics);

  return {
    salesAmount,
    grossProfit,
    grossMarginRate:
      salesAmount.value !== null &&
      grossProfit.value !== null &&
      salesAmount.value > 0
        ? available(grossProfit.value / salesAmount.value)
        : unavailable("계산 불가"),
    operatingProfit,
    productivity:
      salesAmount.value !== null &&
      workerTotal > 0 &&
      !hasSalesDayWithoutWorkers
        ? available(salesAmount.value / workerTotal)
        : unavailable("계산 불가"),
    averageInventory,
    averageSales,
    inventoryToSalesRatio:
      averageInventory.value !== null &&
      averageSales.value !== null &&
      averageSales.value > 0
        ? available(averageInventory.value / averageSales.value)
        : unavailable("계산 불가"),
  };
}

function getMetrics(
  ledgerSummaries: ReportAggregateLedgerSummary[],
  source: "original" | "applied",
  key: keyof ReportAggregateLedgerSummary["applied"],
) {
  return ledgerSummaries.map((summary) => summary[source][key]);
}

function sumMetric(metrics: LedgerReviewMetric[]): LedgerReviewMetric {
  if (metrics.some((metric) => metric.value === null)) {
    return unavailable("계산 불가");
  }

  const values = metrics.map((metric) => metric.value ?? 0);

  return metrics.length === 0
    ? unavailable("계산 불가")
    : available(values.reduce((sum, value) => sum + value, 0));
}

function averageMetric(metrics: LedgerReviewMetric[]): LedgerReviewMetric {
  if (metrics.some((metric) => metric.value === null)) {
    return unavailable("계산 불가");
  }

  const values = metrics.map((metric) => metric.value ?? 0);

  return metrics.length === 0
    ? unavailable("계산 불가")
    : available(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function getWorkerCount(
  summary: ReportAggregateLedgerSummary,
  source: "original" | "applied",
) {
  return source === "original"
    ? (summary.originalWorkerCount ?? summary.workerCount)
    : summary.workerCount;
}

function available(value: number): LedgerReviewMetric {
  return { value };
}

function getInclusiveDateCount(startDate: Date, endDate: Date) {
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
}

function getFirstLedgerId(summaries: ReportAggregateLedgerSummary[]) {
  return summaries[0]?.ledgerId ?? null;
}

function isValidDateQuery(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_QUERY_PATTERN.test(value)) {
    return false;
  }

  const match = DATE_QUERY_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.toISOString().slice(0, 10) === value;
}

function isValidMonthQuery(value: unknown): value is string {
  if (typeof value !== "string" || !MONTH_QUERY_PATTERN.test(value)) {
    return false;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1, 1));

  return month >= 1 && month <= 12 && date.toISOString().slice(0, 7) === value;
}

function toDailyMeetingReportRow({
  store,
  ledger,
  closingDate,
  thresholdSettings,
  evaluateRevenueAnomalySignals,
  evaluateInventoryLossAnomalySignals,
  corrections,
}: {
  store: ReportStoreRecord;
  ledger: ReportLedgerRecord | null;
  closingDate: Date;
  thresholdSettings: AnomalyThresholdSignalSettings | null;
  evaluateRevenueAnomalySignals: EvaluateRevenueAnomalySignals;
  evaluateInventoryLossAnomalySignals: EvaluateInventoryLossAnomalySignals;
  corrections?: Map<string, CorrectionAppliedValue>;
}): DailyMeetingReportRow {
  const baseRow =
    ledger === null
      ? toEmptyReportRow({
          store,
          closingDate,
          thresholdSettings,
          evaluateRevenueAnomalySignals,
          evaluateInventoryLossAnomalySignals,
        })
      : toLedgerReportRow({
          store,
          ledger,
          thresholdSettings,
          evaluateRevenueAnomalySignals,
          evaluateInventoryLossAnomalySignals,
          corrections,
        });

  return {
    ...baseRow,
    priority: {
      rank: 90,
      label: "정상",
      reasons: [],
    },
  };
}

function toEmptyReportRow({
  store,
  closingDate,
  thresholdSettings,
  evaluateRevenueAnomalySignals,
  evaluateInventoryLossAnomalySignals,
}: {
  store: ReportStoreRecord;
  closingDate: Date;
  thresholdSettings: AnomalyThresholdSignalSettings | null;
  evaluateRevenueAnomalySignals: EvaluateRevenueAnomalySignals;
  evaluateInventoryLossAnomalySignals: EvaluateInventoryLossAnomalySignals;
}): ReportRowWithoutPriority {
  const metrics = {
    totalSales: unavailable("계산 불가"),
    grossMarginRate: unavailable("계산 불가"),
    salesDifference: unavailable("계산 불가"),
  };

  const rowWithoutEvidence = {
    storeId: store.id,
    storeName: store.name,
    ledgerId: null,
    closingDate: closingDate.toISOString(),
    businessStatus: mapDashboardBusinessStatus(null),
    ledgerStatus: mapDashboardLedgerStatus(null),
    salesAmount: metrics.totalSales,
    grossMarginRate: metrics.grossMarginRate,
    salesDifference: metrics.salesDifference,
    hasLoss: null,
    lastModifiedBy: null,
    lastModifiedAt: null,
    isHeadquartersClosed: false,
    correctionState: emptyCorrectionState(),
    signals: getReportSignals({
      thresholdSettings,
      revenueCurrent: metrics,
      inventoryLossCurrent: {
        inventoryItems: null,
        inventoryAdjustments: null,
        lossItems: null,
      },
      evaluateRevenueAnomalySignals,
      evaluateInventoryLossAnomalySignals,
    }),
  };

  return {
    ...rowWithoutEvidence,
    metricEvidence: buildDailyMeetingReportMetricEvidenceMap({
      ledgerId: null,
      ledgerStatus: rowWithoutEvidence.ledgerStatus.key,
      originalSummary: {
        totalSales: metrics.totalSales,
        grossMarginRate: metrics.grossMarginRate,
        salesDifference: metrics.salesDifference,
      },
      appliedSummary: {
        totalSales: metrics.totalSales,
        grossMarginRate: metrics.grossMarginRate,
        salesDifference: metrics.salesDifference,
      },
      originalHasLoss: null,
      appliedHasLoss: null,
      correctionState: {
        appliedKeys: new Set(),
        unappliedKeys: new Set(),
      },
    }),
  };
}

function toLedgerReportRow({
  store,
  ledger,
  thresholdSettings,
  evaluateRevenueAnomalySignals,
  evaluateInventoryLossAnomalySignals,
  corrections,
}: {
  store: ReportStoreRecord;
  ledger: ReportLedgerRecord;
  thresholdSettings: AnomalyThresholdSignalSettings | null;
  evaluateRevenueAnomalySignals: EvaluateRevenueAnomalySignals;
  evaluateInventoryLossAnomalySignals: EvaluateInventoryLossAnomalySignals;
  corrections?: Map<string, CorrectionAppliedValue>;
}): ReportRowWithoutPriority {
  const originalReviewInput = {
    totalSalesAmount: ledger.totalSalesAmount,
    cashAmount: ledger.cashAmount,
    cardAmount: ledger.cardAmount,
    otherPaymentAmount: ledger.otherPaymentAmount,
    workerCount: ledger.workerCount,
    expenseTotal: calculateExpenseTotal(
      ledger.ledgerExpenses.map((item) => item.amount),
    ),
    inventoryItems: ledger.ledgerInventoryItems,
  };
  const originalSummary = calculateLedgerReviewSummary({
    ...originalReviewInput,
    inventoryAdjustments: ledger.ledgerInventoryAdjustments,
    lossItems: ledger.ledgerLossItems,
  });
  const correctionOverlay = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: ledger.id,
    reviewInput: originalReviewInput,
    expenseItems: ledger.ledgerExpenses,
    lossItems: ledger.ledgerLossItems,
    corrections: corrections?.values() ?? [],
  });
  const inventoryAdjustments = toCorrectedInventoryAdjustments(
    ledger.ledgerInventoryAdjustments,
    correctionOverlay,
  );
  const reviewSummary = calculateLedgerReviewSummary({
    ...correctionOverlay.reviewInput,
    inventoryAdjustments,
    lossItems: correctionOverlay.lossItems,
  });
  const correctionState = correctionOverlay.correctionState;
  const signals =
    ledger.status === "HOLIDAY"
      ? getReportSignals({
          thresholdSettings: null,
          revenueCurrent: {
            totalSales: reviewSummary.totalSales,
            grossMarginRate: reviewSummary.grossMarginRate,
            salesDifference: reviewSummary.salesDifference,
          },
          inventoryLossCurrent: {
            inventoryItems: null,
            inventoryAdjustments: null,
            lossItems: null,
          },
          evaluateRevenueAnomalySignals,
          evaluateInventoryLossAnomalySignals,
          correctionState,
        }).filter((signal) => signal.id === "correction-review-required")
      : getReportSignals({
          thresholdSettings,
          revenueCurrent: {
            totalSales: reviewSummary.totalSales,
            grossMarginRate: reviewSummary.grossMarginRate,
            salesDifference: reviewSummary.salesDifference,
          },
          inventoryLossCurrent: {
            inventoryItems: toInventoryLossInventoryItems(
              correctionOverlay.reviewInput.inventoryItems,
            ),
            inventoryAdjustments,
            lossItems: correctionOverlay.lossItems,
          },
          evaluateRevenueAnomalySignals,
          evaluateInventoryLossAnomalySignals,
          correctionState,
        });

  const originalHasLoss = ledger.ledgerLossItems.some(
    (item) => item.quantity > 0 || item.amount > 0,
  );
  const appliedHasLoss = correctionOverlay.lossItems.some(
    (item) => item.quantity > 0 || item.amount > 0,
  );
  const rowWithoutEvidence = {
    storeId: store.id,
    storeName: store.name,
    ledgerId: ledger.id,
    closingDate: ledger.closingDate.toISOString(),
    businessStatus: mapDashboardBusinessStatus(ledger.status),
    ledgerStatus: mapDashboardLedgerStatus(ledger.status),
    salesAmount: reviewSummary.totalSales,
    grossMarginRate: reviewSummary.grossMarginRate,
    salesDifference: reviewSummary.salesDifference,
    hasLoss: appliedHasLoss,
    lastModifiedBy: ledger.updatedBy,
    lastModifiedAt: ledger.updatedAt.toISOString(),
    isHeadquartersClosed: ledger.status === "HEADQUARTERS_CLOSED",
    correctionState,
    signals,
  };

  return {
    ...rowWithoutEvidence,
    metricEvidence: buildDailyMeetingReportMetricEvidenceMap({
      ledgerId: ledger.id,
      ledgerStatus: rowWithoutEvidence.ledgerStatus.key,
      originalSummary,
      appliedSummary: reviewSummary,
      originalHasLoss,
      appliedHasLoss,
      correctionState: {
        appliedKeys: correctionOverlay.appliedCorrectionKeys,
        unappliedKeys: correctionOverlay.unappliedCorrectionKeys,
      },
    }),
  };
}

export function buildDailyMeetingReportMetricEvidence({
  label,
  kind,
  ledgerId,
  ledgerStatus,
  original,
  applied,
  correctionCount,
  hasUnappliedCorrections,
}: DailyMeetingReportMetricEvidenceInput): DailyMeetingReportMetricEvidence {
  const isCorrected = correctionCount > 0;
  const status = getMetricStatus({
    ledgerStatus,
    applied,
    isCorrected,
    hasUnappliedCorrections,
  });

  return {
    label,
    kind,
    original: { ...original, kind },
    applied: { ...applied, kind },
    isCorrected,
    status,
    statusLabel: getMetricStatusLabel(status, applied),
    unavailableReason:
      applied.value === null ? (applied.unavailableReason ?? null) : null,
    ledgerDetailHref: ledgerId ? `/app/ledgers/${ledgerId}` : null,
    correctionTimelineHref:
      ledgerId && (correctionCount > 0 || hasUnappliedCorrections)
        ? `/app/ledgers/${ledgerId}#correction-timeline`
        : null,
  };
}

function buildDailyMeetingReportMetricEvidenceMap({
  ledgerId,
  ledgerStatus,
  originalSummary,
  appliedSummary,
  originalHasLoss,
  appliedHasLoss,
  correctionState,
}: {
  ledgerId: string | null;
  ledgerStatus: DailyMeetingReportMetricEvidenceInput["ledgerStatus"];
  originalSummary: Pick<
    ReturnType<typeof calculateLedgerReviewSummary>,
    "totalSales" | "grossMarginRate" | "salesDifference"
  >;
  appliedSummary: Pick<
    ReturnType<typeof calculateLedgerReviewSummary>,
    "totalSales" | "grossMarginRate" | "salesDifference"
  >;
  originalHasLoss: boolean | null;
  appliedHasLoss: boolean | null;
  correctionState: {
    appliedKeys: Set<string>;
    unappliedKeys: Set<string>;
  };
}): DailyMeetingReportMetricEvidenceMap {
  const salesAmountCorrections = getMetricCorrectionState(correctionState, [
    { targetType: "PAYMENT_FIELD", fieldKey: "totalSalesAmount" },
  ]);
  const grossMarginRateCorrections = getMetricCorrectionState(correctionState, [
    { targetType: "PAYMENT_FIELD", fieldKey: "totalSalesAmount" },
    { targetType: "INVENTORY_ROW", fieldKey: "currentQuantity" },
    { targetType: "INVENTORY_ROW", fieldKey: "quantity" },
    { targetType: "CALCULATED_METRIC", fieldKey: "grossMarginRate" },
  ]);
  const salesDifferenceCorrections = getMetricCorrectionState(correctionState, [
    { targetType: "PAYMENT_FIELD", fieldKey: "totalSalesAmount" },
    { targetType: "INVENTORY_ROW", fieldKey: "currentQuantity" },
    { targetType: "INVENTORY_ROW", fieldKey: "quantity" },
    { targetType: "LOSS_ROW", fieldKey: "amount" },
    { targetType: "LOSS_ROW", fieldKey: "quantity" },
    { targetType: "CALCULATED_METRIC", fieldKey: "salesDifference" },
  ]);
  const lossCorrections = getMetricCorrectionState(correctionState, [
    { targetType: "LOSS_ROW", fieldKey: "amount" },
    { targetType: "LOSS_ROW", fieldKey: "quantity" },
    { targetType: "CALCULATED_METRIC", fieldKey: "lossAmount" },
  ]);

  return {
    salesAmount: buildDailyMeetingReportMetricEvidence({
      label: "매출",
      kind: "money",
      ledgerId,
      ledgerStatus,
      original: originalSummary.totalSales,
      applied: appliedSummary.totalSales,
      correctionCount: salesAmountCorrections.appliedCount,
      hasUnappliedCorrections: salesAmountCorrections.hasUnapplied,
    }),
    grossMarginRate: buildDailyMeetingReportMetricEvidence({
      label: "이익률",
      kind: "percent",
      ledgerId,
      ledgerStatus,
      original: originalSummary.grossMarginRate,
      applied: appliedSummary.grossMarginRate,
      correctionCount: grossMarginRateCorrections.appliedCount,
      hasUnappliedCorrections: grossMarginRateCorrections.hasUnapplied,
    }),
    salesDifference: buildDailyMeetingReportMetricEvidence({
      label: "매출 차이",
      kind: "money",
      ledgerId,
      ledgerStatus,
      original: originalSummary.salesDifference,
      applied: appliedSummary.salesDifference,
      correctionCount: salesDifferenceCorrections.appliedCount,
      hasUnappliedCorrections: salesDifferenceCorrections.hasUnapplied,
    }),
    loss: buildDailyMeetingReportMetricEvidence({
      label: "손실",
      kind: "boolean",
      ledgerId,
      ledgerStatus,
      original: {
        value: originalHasLoss === null ? null : originalHasLoss ? 1 : 0,
        unavailableReason: originalHasLoss === null ? "계산 불가" : undefined,
      },
      applied: {
        value: appliedHasLoss === null ? null : appliedHasLoss ? 1 : 0,
        unavailableReason: appliedHasLoss === null ? "계산 불가" : undefined,
      },
      correctionCount: lossCorrections.appliedCount,
      hasUnappliedCorrections: lossCorrections.hasUnapplied,
    }),
  };
}

function getMetricCorrectionState(
  correctionState: {
    appliedKeys: Set<string>;
    unappliedKeys: Set<string>;
  },
  matchers: { targetType: string; fieldKey: string }[],
) {
  return {
    appliedCount: [...correctionState.appliedKeys].filter((key) =>
      matchesMetricCorrectionKey(key, matchers),
    ).length,
    hasUnapplied: [...correctionState.unappliedKeys].some((key) =>
      matchesMetricCorrectionKey(key, matchers),
    ),
  };
}

function matchesMetricCorrectionKey(
  key: string,
  matchers: { targetType: string; fieldKey: string }[],
) {
  return matchers.some(
    ({ targetType, fieldKey }) =>
      key.includes(`:${targetType}:`) && key.endsWith(`:${fieldKey}`),
  );
}

function getMetricStatus({
  ledgerStatus,
  applied,
  isCorrected,
  hasUnappliedCorrections,
}: {
  ledgerStatus: DailyMeetingReportMetricEvidenceInput["ledgerStatus"];
  applied: LedgerReviewMetric;
  isCorrected: boolean;
  hasUnappliedCorrections: boolean;
}): DailyMeetingReportMetricEvidence["status"] {
  if (
    hasUnappliedCorrections ||
    applied.unavailableReason === "계산 기준 확인 필요"
  ) {
    return "needs-review";
  }

  if (ledgerStatus === "EMPTY") {
    return "empty";
  }

  if (ledgerStatus === "HOLIDAY") {
    return "holiday";
  }

  if (applied.value === null) {
    return "data-insufficient";
  }

  if (isCorrected) {
    return "corrected";
  }

  if (applied.value === 0) {
    return "zero";
  }

  return "original";
}

function getMetricStatusLabel(
  status: DailyMeetingReportMetricEvidence["status"],
  applied: LedgerReviewMetric,
) {
  switch (status) {
    case "corrected":
      return "정정 반영";
    case "zero":
      return "0";
    case "empty":
      return "미입력";
    case "holiday":
      return "휴무";
    case "data-insufficient":
      return "데이터 부족";
    case "needs-review":
      return applied.unavailableReason ?? "정정 확인 필요";
    default:
      return "원본";
  }
}

function getReportSignals({
  thresholdSettings,
  revenueCurrent,
  inventoryLossCurrent,
  evaluateRevenueAnomalySignals,
  evaluateInventoryLossAnomalySignals,
  correctionState = emptyCorrectionState(),
}: {
  thresholdSettings: AnomalyThresholdSignalSettings | null;
  revenueCurrent: Parameters<EvaluateRevenueAnomalySignals>[0]["current"];
  inventoryLossCurrent: Parameters<EvaluateInventoryLossAnomalySignals>[0]["current"];
  evaluateRevenueAnomalySignals: EvaluateRevenueAnomalySignals;
  evaluateInventoryLossAnomalySignals: EvaluateInventoryLossAnomalySignals;
  correctionState?: HqDashboardRow["correctionState"];
}): DashboardSignalSummary[] {
  const revenueSignals = evaluateRevenueAnomalySignals({
    thresholds: thresholdSettings,
    current: revenueCurrent,
    comparison: { policy: null, baseline: null },
  });
  const inventoryLossSignals = thresholdSettings
    ? evaluateInventoryLossAnomalySignals({
        thresholds: thresholdSettings,
        current: inventoryLossCurrent,
      })
    : [];
  const correctionSignals = correctionState.hasUnappliedCorrections
    ? [
        {
          id: "correction-review-required",
          label: "정정 확인 필요",
          severity: "info" as const,
          detail:
            "계산에 바로 반영할 수 없는 정정 기록이 있어 상세에서 확인이 필요합니다.",
        },
      ]
    : [];

  return [...revenueSignals, ...inventoryLossSignals, ...correctionSignals];
}

function toInventoryLossInventoryItems(items: LedgerReviewInventoryInput[]) {
  return items.map((item) => ({
    productName: item.productName ?? "품목",
    previousQuantity: item.previousQuantity,
    purchasedQuantity: item.purchasedQuantity,
    currentQuantity: item.currentQuantity,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
}

function toCorrectedInventoryAdjustments(
  adjustments: ReportLedgerRecord["ledgerInventoryAdjustments"],
  correctionOverlay: LedgerReviewCorrectionOverlayResult,
) {
  if (
    correctionOverlay.appliedInventoryItemIds.size === 0 &&
    correctionOverlay.appliedLossProductIds.size === 0
  ) {
    return adjustments;
  }

  const correctedItemsById = new Map(
    correctionOverlay.reviewInput.inventoryItems
      .filter((item) => item.id)
      .map((item) => [item.id, item]),
  );

  return adjustments.map((adjustment) => {
    const shouldUseCorrectedInventory =
      adjustment.ledgerInventoryItemId !== null &&
      correctionOverlay.appliedInventoryItemIds.has(
        adjustment.ledgerInventoryItemId,
      );
    const shouldUseCorrectedLoss = correctionOverlay.appliedLossProductIds.has(
      adjustment.productId,
    );

    if (!shouldUseCorrectedInventory && !shouldUseCorrectedLoss) {
      return adjustment;
    }

    const correctedItem = correctedItemsById.get(
      adjustment.ledgerInventoryItemId ?? "",
    );
    const lossBasisItem = shouldUseCorrectedLoss ? correctedItem : null;

    if (shouldUseCorrectedLoss && !lossBasisItem) {
      return adjustment;
    }

    const correctedQuantity = shouldUseCorrectedInventory
      ? (correctedItem?.currentQuantity ?? correctedItem?.quantity ?? null)
      : adjustment.afterQuantity;
    const correctedAmount = calculateInventoryAmount(
      correctedQuantity,
      correctedItem?.unitPrice ?? adjustment.unitPrice,
    );

    if (correctedQuantity === null || correctedAmount === null) {
      return adjustment;
    }

    const correctedLossQuantity = correctionOverlay.lossItems
      .filter((item) => item.productId === adjustment.productId)
      .reduce((sum, item) => sum + item.quantity, 0);
    const beforeQuantity = lossBasisItem
      ? calculateSystemInventoryQuantity({
          previousQuantity: lossBasisItem.previousQuantity,
          purchasedQuantity: lossBasisItem.purchasedQuantity,
          lossQuantity: correctedLossQuantity,
        })
      : adjustment.beforeQuantity;
    const beforeAmount = calculateInventoryAmount(
      beforeQuantity,
      correctedItem?.unitPrice ?? adjustment.unitPrice,
    );

    if (beforeQuantity === null || beforeAmount === null) {
      return adjustment;
    }

    const nextAdjustment = calculateInventoryAdjustment({
      beforeQuantity,
      beforeAmount,
      afterQuantity: correctedQuantity,
      unitPrice: correctedItem?.unitPrice ?? adjustment.unitPrice,
    });

    if (!nextAdjustment) {
      return adjustment;
    }

    return {
      ...adjustment,
      beforeQuantity: nextAdjustment.beforeQuantity,
      beforeAmount: nextAdjustment.beforeAmount,
      afterQuantity: nextAdjustment.afterQuantity,
      afterAmount: nextAdjustment.afterAmount,
      differenceQuantity: nextAdjustment.differenceQuantity,
      differenceAmount: nextAdjustment.differenceAmount,
    };
  });
}

function unavailable(
  unavailableReason: NonNullable<LedgerReviewMetric["unavailableReason"]>,
): LedgerReviewMetric {
  return {
    value: null,
    unavailableReason,
  };
}

function emptyCorrectionState(): HqDashboardRow["correctionState"] {
  return {
    appliedCorrectionCount: 0,
    hasAppliedCorrections: false,
    hasUnappliedCorrections: false,
  };
}
