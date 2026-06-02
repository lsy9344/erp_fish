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
  StoreComparisonReportData,
  StoreComparisonReportDateRange,
  StoreComparisonReportRow,
} from "./types.ts";

const SEOUL_TIME_ZONE = "Asia/Seoul";
const DATE_QUERY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
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

  let startDate = isValidDateQuery(input.startDate)
    ? getDailyMeetingReportDate(input.startDate)
    : defaultStartDate;
  const endDate = isValidDateQuery(input.endDate)
    ? getDailyMeetingReportDate(input.endDate)
    : defaultEndDate;
  let errorMessage: string | null = null;

  if (!isValidDateQuery(input.startDate) || !isValidDateQuery(input.endDate)) {
    errorMessage = "기간을 확인해 주세요. 기본 7일 기간으로 조회합니다.";
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
}: Pick<
  StoreComparisonReportDateRange,
  "startDateInput" | "endDateInput"
>) {
  return `/app/reports/comparison?startDate=${encodeURIComponent(
    startDateInput,
  )}&endDate=${encodeURIComponent(endDateInput)}`;
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

type StoreComparisonLedgerSummaryForTest = {
  ledgerId: string;
  status: DailyLedgerStatus;
  original: Pick<
    ReturnType<typeof calculateLedgerReviewSummary>,
    | "totalSales"
    | "grossProfit"
    | "grossMarginRate"
    | "operatingProfit"
    | "productivity"
    | "inventoryAmount"
  >;
  applied: Pick<
    ReturnType<typeof calculateLedgerReviewSummary>,
    | "totalSales"
    | "grossProfit"
    | "grossMarginRate"
    | "operatingProfit"
    | "productivity"
    | "inventoryAmount"
  >;
  workerCount: number | null;
  hasLoss: boolean;
  hasUnappliedCorrections: boolean;
  appliedCorrectionCount: number;
};

function toStoreComparisonLedgerSummary(
  ledger: ReportLedgerRecord,
  corrections?: Map<string, CorrectionAppliedValue>,
): StoreComparisonLedgerSummaryForTest {
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

  return {
    ledgerId: ledger.id,
    status: ledger.status,
    original,
    applied,
    workerCount: correctionOverlay.reviewInput.workerCount,
    hasLoss: correctionOverlay.lossItems.some(
      (item) => item.quantity > 0 || item.amount > 0,
    ),
    hasUnappliedCorrections:
      correctionOverlay.correctionState.hasUnappliedCorrections,
    appliedCorrectionCount:
      correctionOverlay.correctionState.appliedCorrectionCount,
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
  const appliedCorrectionCount = ledgerSummaries.reduce(
    (sum, summary) => sum + summary.appliedCorrectionCount,
    0,
  );
  const hasUnappliedCorrections = ledgerSummaries.some(
    (summary) => summary.hasUnappliedCorrections,
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
  const evidenceInput = {
    ledgerId: getFirstLedgerId(ledgerSummaries),
    ledgerStatus: "HEADQUARTERS_CLOSED" as const,
    correctionCount: appliedCorrectionCount,
  };

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
    hasLoss:
      ledgerSummaries.length === 0
        ? null
        : ledgerSummaries.some((summary) => summary.hasLoss),
    metricEvidence: {
      salesAmount: buildDailyMeetingReportMetricEvidence({
        label: "매출",
        kind: "money",
        original: originalAggregates.salesAmount,
        applied: appliedAggregates.salesAmount,
        hasUnappliedCorrections: false,
        ...evidenceInput,
      }),
      grossProfit: buildDailyMeetingReportMetricEvidence({
        label: "매출이익",
        kind: "money",
        original: originalAggregates.grossProfit,
        applied: appliedAggregates.grossProfit,
        hasUnappliedCorrections,
        ...evidenceInput,
      }),
      grossMarginRate: buildDailyMeetingReportMetricEvidence({
        label: "이익률",
        kind: "percent",
        original: originalAggregates.grossMarginRate,
        applied: appliedAggregates.grossMarginRate,
        hasUnappliedCorrections,
        ...evidenceInput,
      }),
      operatingProfit: buildDailyMeetingReportMetricEvidence({
        label: "영업이익",
        kind: "money",
        original: originalAggregates.operatingProfit,
        applied: appliedAggregates.operatingProfit,
        hasUnappliedCorrections,
        ...evidenceInput,
      }),
      productivity: buildDailyMeetingReportMetricEvidence({
        label: "인당생산성",
        kind: "money",
        original: originalAggregates.productivity,
        applied: appliedAggregates.productivity,
        hasUnappliedCorrections,
        ...evidenceInput,
      }),
      averageInventory: buildDailyMeetingReportMetricEvidence({
        label: "평균재고",
        kind: "money",
        original: originalAggregates.averageInventory,
        applied: appliedAggregates.averageInventory,
        hasUnappliedCorrections,
        ...evidenceInput,
      }),
      averageSales: buildDailyMeetingReportMetricEvidence({
        label: "평균매출",
        kind: "money",
        original: originalAggregates.averageSales,
        applied: appliedAggregates.averageSales,
        hasUnappliedCorrections,
        ...evidenceInput,
      }),
      inventoryToSalesRatio: buildDailyMeetingReportMetricEvidence({
        label: "재고비율",
        kind: "percent",
        original: originalAggregates.inventoryToSalesRatio,
        applied: appliedAggregates.inventoryToSalesRatio,
        hasUnappliedCorrections,
        ...evidenceInput,
      }),
      loss: buildDailyMeetingReportMetricEvidence({
        label: "손실",
        kind: "boolean",
        original: {
          value: ledgerSummaries.some((summary) => summary.hasLoss) ? 1 : 0,
        },
        applied: {
          value: ledgerSummaries.some((summary) => summary.hasLoss) ? 1 : 0,
        },
        hasUnappliedCorrections,
        ...evidenceInput,
      }),
    },
  };
}

function aggregateStoreComparisonMetrics(
  ledgerSummaries: StoreComparisonLedgerSummaryForTest[],
  source: "original" | "applied",
) {
  const salesValues = getMetricValues(ledgerSummaries, source, "totalSales");
  const grossProfitValues = getMetricValues(
    ledgerSummaries,
    source,
    "grossProfit",
  );
  const operatingProfitValues = getMetricValues(
    ledgerSummaries,
    source,
    "operatingProfit",
  );
  const inventoryValues = getMetricValues(
    ledgerSummaries,
    source,
    "inventoryAmount",
  );
  const salesAmount = sumMetric(salesValues);
  const grossProfit = sumMetric(grossProfitValues);
  const operatingProfit = sumMetric(operatingProfitValues);
  const workerTotal = ledgerSummaries.reduce(
    (sum, summary) => sum + (summary.workerCount ?? 0),
    0,
  );
  const averageInventory = averageMetric(inventoryValues);
  const averageSales = averageMetric(salesValues);

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
      salesAmount.value !== null && workerTotal > 0
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

function getMetricValues(
  ledgerSummaries: StoreComparisonLedgerSummaryForTest[],
  source: "original" | "applied",
  key: keyof StoreComparisonLedgerSummaryForTest["applied"],
) {
  return ledgerSummaries
    .map((summary) => summary[source][key].value)
    .filter((value): value is number => value !== null);
}

function sumMetric(values: number[]): LedgerReviewMetric {
  return values.length === 0
    ? unavailable("계산 불가")
    : available(values.reduce((sum, value) => sum + value, 0));
}

function averageMetric(values: number[]): LedgerReviewMetric {
  return values.length === 0
    ? unavailable("계산 불가")
    : available(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function available(value: number): LedgerReviewMetric {
  return { value };
}

function getInclusiveDateCount(startDate: Date, endDate: Date) {
  return (
    Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1
  );
}

function getFirstLedgerId(summaries: StoreComparisonLedgerSummaryForTest[]) {
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
  const matches = (key: string) =>
    matchers.some(({ targetType, fieldKey }) =>
      key.includes(`:${targetType}:`) && key.endsWith(`:${fieldKey}`),
    );

  return {
    appliedCount: [...correctionState.appliedKeys].filter(matches).length,
    hasUnapplied: [...correctionState.unappliedKeys].some(matches),
  };
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

    const correctedQuantity =
      shouldUseCorrectedInventory
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
