import type { DailyLedgerStatus } from "../../../generated/prisma";
import {
  applyCorrectionValuesToLedgerReviewInput,
  calculateExpenseTotal,
  calculateLedgerReviewSummary,
  type LedgerReviewCorrectionOverlayResult,
  type LedgerReviewInventoryInput,
  type LedgerReviewMetric,
  type LedgerReviewPlannedSalesInput,
} from "../../server/calculations/ledger.ts";
// OQ-gated calculation policy is centralized in ../../server/calculations/policy-gates.
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
  buildMarginDisplay,
  mapDashboardBusinessStatus,
  mapDashboardLedgerStatus,
  summarizeDashboardRows,
} from "../dashboard/queries.ts";
import type {
  DashboardSignalSummary,
  HqDashboardRow,
} from "../dashboard/types.ts";
import type { CorrectionAppliedValue } from "../corrections/types.ts";
import {
  decimalToNumber,
  nullableDecimalToNumber,
  type DecimalNumber,
} from "../../lib/decimal.ts";
import type {
  DailyAttendanceReport,
  DailyAttendanceStatus,
  DailySalesAnalysis,
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
  MonthlyProfitAndLossReadiness,
  MonthlyRevenueRankingItem,
  MonthlyRevenueRankingSummary,
  MonthlyTopRevenueItemSummary,
  ProductCategoryPerformance,
  ProductProfitabilityReportItem,
  ProductProfitabilitySummary,
  ProductSalesPeriodItem,
  ProductSalesPeriodReportData,
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
    fifoLots?: {
      sourceType: string;
      consumedAmount: number;
      remainingAmount: number;
    }[];
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
    usedPlannedPrice?: boolean;
  }[];
  ledgerLaborItems?: {
    workerName: string;
    employeeId: string | null;
    lateMemo: string | null;
    earlyLeaveMemo: string | null;
    specialMemo: string | null;
  }[];
};

type ReportRowWithoutPriority = Omit<DailyMeetingReportRow, "priority">;

type InventoryQuantityFields = {
  previousQuantity: DecimalNumber;
  purchasedQuantity: DecimalNumber;
  currentQuantity: DecimalNumber | null;
  quantity: DecimalNumber | null;
};

type LossQuantityFields = {
  quantity: DecimalNumber;
};

type AdjustmentQuantityFields = {
  beforeQuantity: DecimalNumber;
  afterQuantity: DecimalNumber;
  differenceQuantity: DecimalNumber;
};

type NormalizedInventoryQuantityFields<T extends InventoryQuantityFields> =
  Omit<
    T,
    "previousQuantity" | "purchasedQuantity" | "currentQuantity" | "quantity"
  > & {
    previousQuantity: number;
    purchasedQuantity: number;
    currentQuantity: number | null;
    quantity: number | null;
  };

type NormalizedLossQuantityFields<T extends LossQuantityFields> = Omit<
  T,
  "quantity"
> & { quantity: number };

type NormalizedAdjustmentQuantityFields<T extends AdjustmentQuantityFields> =
  Omit<T, "beforeQuantity" | "afterQuantity" | "differenceQuantity"> & {
    beforeQuantity: number;
    afterQuantity: number;
    differenceQuantity: number;
  };

function normalizeInventoryQuantityFields<T extends InventoryQuantityFields>(
  item: T,
): NormalizedInventoryQuantityFields<T> {
  return {
    ...item,
    previousQuantity: decimalToNumber(item.previousQuantity),
    purchasedQuantity: decimalToNumber(item.purchasedQuantity),
    currentQuantity: nullableDecimalToNumber(item.currentQuantity),
    quantity: nullableDecimalToNumber(item.quantity),
  };
}

function normalizeLossQuantityFields<T extends LossQuantityFields>(
  item: T,
): NormalizedLossQuantityFields<T> {
  return {
    ...item,
    quantity: decimalToNumber(item.quantity),
  };
}

function normalizeAdjustmentQuantityFields<T extends AdjustmentQuantityFields>(
  adjustment: T,
): NormalizedAdjustmentQuantityFields<T> {
  return {
    ...adjustment,
    beforeQuantity: decimalToNumber(adjustment.beforeQuantity),
    afterQuantity: decimalToNumber(adjustment.afterQuantity),
    differenceQuantity: decimalToNumber(adjustment.differenceQuantity),
  };
}

function normalizeReportLedgerQuantities<
  T extends {
    ledgerInventoryItems: InventoryQuantityFields[];
    ledgerLossItems: LossQuantityFields[];
    ledgerInventoryAdjustments?: AdjustmentQuantityFields[];
  },
>(
  ledger: T,
): Omit<
  T,
  "ledgerInventoryItems" | "ledgerLossItems" | "ledgerInventoryAdjustments"
> & {
  ledgerInventoryItems: Array<
    NormalizedInventoryQuantityFields<T["ledgerInventoryItems"][number]>
  >;
  ledgerLossItems: Array<
    NormalizedLossQuantityFields<T["ledgerLossItems"][number]>
  >;
  ledgerInventoryAdjustments: T["ledgerInventoryAdjustments"] extends
    | AdjustmentQuantityFields[]
    | undefined
    ? Array<
        NormalizedAdjustmentQuantityFields<
          NonNullable<T["ledgerInventoryAdjustments"]>[number]
        >
      >
    : never;
} {
  return {
    ...ledger,
    ledgerInventoryItems: ledger.ledgerInventoryItems.map(
      normalizeInventoryQuantityFields,
    ),
    ledgerLossItems: ledger.ledgerLossItems.map(normalizeLossQuantityFields),
    ledgerInventoryAdjustments: ledger.ledgerInventoryAdjustments
      ? ledger.ledgerInventoryAdjustments.map(normalizeAdjustmentQuantityFields)
      : [],
  } as unknown as Omit<
    T,
    "ledgerInventoryItems" | "ledgerLossItems" | "ledgerInventoryAdjustments"
  > & {
    ledgerInventoryItems: Array<
      NormalizedInventoryQuantityFields<T["ledgerInventoryItems"][number]>
    >;
    ledgerLossItems: Array<
      NormalizedLossQuantityFields<T["ledgerLossItems"][number]>
    >;
    ledgerInventoryAdjustments: T["ledgerInventoryAdjustments"] extends
      | AdjustmentQuantityFields[]
      | undefined
      ? Array<
          NormalizedAdjustmentQuantityFields<
            NonNullable<T["ledgerInventoryAdjustments"]>[number]
          >
        >
      : never;
  };
}

function buildDailyMeetingPlannedSalesItems(
  ledgers: Array<{
    id: string;
    ledgerInventoryItems: Array<{
      productId?: string | null;
      previousQuantity: number;
      purchasedQuantity: number;
      lossQuantity?: number;
      currentQuantity: number | null;
      quantity: number | null;
      plannedUnitPrice?: number | null;
    }>;
  }>,
): Map<string, LedgerReviewPlannedSalesInput[]> {
  const result = new Map<string, LedgerReviewPlannedSalesInput[]>();

  for (const ledger of ledgers) {
    result.set(
      ledger.id,
      ledger.ledgerInventoryItems.map((item) => ({
        productId: item.productId ?? undefined,
        previousQuantity: item.previousQuantity,
        purchasedQuantity: item.purchasedQuantity,
        lossQuantity: item.lossQuantity ?? 0,
        currentQuantity: item.currentQuantity,
        quantity: item.quantity,
        plannedUnitPrice: item.plannedUnitPrice ?? null,
      })),
    );
  }

  return result;
}

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

export function getPreviousReportDate(date: Date) {
  const previousDate = new Date(date);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  return previousDate;
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

type DailyReportAnalysisLedger = {
  ledgerId: string;
  status: DailyLedgerStatus;
  totalSales: LedgerReviewMetric;
  inventoryItems: { id?: string; inventoryAmount: number | null }[];
  appliedCorrectionKeys: Set<string>;
  workerCount: number | null;
  ledgerLaborItems: NonNullable<ReportLedgerRecord["ledgerLaborItems"]>;
};

type DailyReportAnalysisStore = {
  storeId: string;
  storeName: string;
  current: DailyReportAnalysisLedger | null;
  previous: DailyReportAnalysisLedger | null;
};

const koreanStoreNameCollator = new Intl.Collator("ko-KR");

function dailyUnavailable(reason: string): LedgerReviewMetric {
  return {
    value: null,
    status: "calculation-unavailable",
    label: "계산 불가",
    unavailableReason: "계산 불가",
    reason,
  };
}

function getUsableSales(
  ledger: DailyReportAnalysisLedger | null,
  dateLabel: "선택일" | "전일",
) {
  if (!ledger) return dailyUnavailable(`${dateLabel} 장부 미입력`);
  if (ledger.status === "HOLIDAY") return dailyUnavailable(`${dateLabel} 휴무`);
  if (ledger.totalSales.value === null) {
    return dailyUnavailable(
      ledger.totalSales.reason ?? `${dateLabel} 매출 계산 불가`,
    );
  }
  return ledger.totalSales;
}

export function buildDailySalesAnalysis(
  stores: DailyReportAnalysisStore[],
): DailySalesAnalysis {
  const salesChanges = stores
    .map(({ storeId, storeName, current, previous }) => {
      const currentSales = getUsableSales(current, "선택일");
      const previousSales = getUsableSales(previous, "전일");
      const difference =
        currentSales.value === null || previousSales.value === null
          ? dailyUnavailable(
              currentSales.reason ?? previousSales.reason ?? "매출 계산 불가",
            )
          : available(currentSales.value - previousSales.value);
      const rate =
        difference.value === null
          ? dailyUnavailable(difference.reason ?? "증감률 계산 불가")
          : previousSales.value === null || previousSales.value <= 0
            ? dailyUnavailable("전일 매출 0원")
            : available(difference.value / previousSales.value);

      return {
        storeId,
        storeName,
        currentSales,
        previousSales,
        difference,
        rate,
      };
    })
    .sort((a, b) => {
      if (a.rate.value === null) {
        return b.rate.value === null
          ? koreanStoreNameCollator.compare(a.storeName, b.storeName)
          : 1;
      }
      if (b.rate.value === null) return -1;
      return (
        Math.abs(b.rate.value) - Math.abs(a.rate.value) ||
        koreanStoreNameCollator.compare(a.storeName, b.storeName)
      );
    });

  const inventoryRatios = stores.map(
    ({
      storeId,
      storeName,
      current,
    }): DailySalesAnalysis["inventoryRatios"][number] => {
      const salesAmount = getUsableSales(current, "선택일");
      let inventoryAmount: LedgerReviewMetric;

      if (!current || current.inventoryItems.length === 0) {
        inventoryAmount = dailyUnavailable("재고 항목 없음");
      } else if (
        [...current.appliedCorrectionKeys].some((key) =>
          /:INVENTORY_ROW:[^:]+:(?:currentQuantity|quantity)$/.test(key),
        )
      ) {
        inventoryAmount = dailyUnavailable(
          "재고 수량 정정으로 FIFO 금액을 확정할 수 없음",
        );
      } else if (
        current.inventoryItems.some(
          (item) =>
            item.inventoryAmount === null ||
            !Number.isFinite(item.inventoryAmount),
        )
      ) {
        inventoryAmount = dailyUnavailable("저장 FIFO 재고금액 누락");
      } else {
        inventoryAmount = available(
          current.inventoryItems.reduce(
            (sum, item) => sum + (item.inventoryAmount ?? 0),
            0,
          ),
        );
      }

      return {
        storeId,
        storeName,
        inventoryAmount,
        salesAmount,
        ratio:
          inventoryAmount.value === null
            ? dailyUnavailable(inventoryAmount.reason ?? "재고비율 계산 불가")
            : salesAmount.value === null
              ? dailyUnavailable(salesAmount.reason ?? "매출 계산 불가")
              : salesAmount.value <= 0
                ? dailyUnavailable("선택일 매출 0원")
                : available(inventoryAmount.value / salesAmount.value),
      };
    },
  );

  const positionCandidates = stores
    .map(({ storeId, storeName, current }) => ({
      storeId,
      storeName,
      salesAmount: getUsableSales(current, "선택일"),
    }))
    .filter((row) => row.salesAmount.value !== null)
    .sort(
      (a, b) =>
        (b.salesAmount.value ?? 0) - (a.salesAmount.value ?? 0) ||
        koreanStoreNameCollator.compare(a.storeName, b.storeName),
    );
  const totalSales = positionCandidates.reduce(
    (sum, row) => sum + (row.salesAmount.value ?? 0),
    0,
  );
  const averageSales =
    positionCandidates.length > 0 ? totalSales / positionCandidates.length : 0;
  const positions = positionCandidates.map((row, index) => ({
    rank: index + 1,
    ...row,
    share:
      totalSales > 0
        ? available((row.salesAmount.value ?? 0) / totalSales)
        : dailyUnavailable("순위 대상 매출 합계 0원"),
    averageComparison:
      averageSales > 0
        ? available(
            ((row.salesAmount.value ?? 0) - averageSales) / averageSales,
          )
        : dailyUnavailable("순위 대상 평균 매출 0원"),
  }));
  const includedStoreIds = new Set(positions.map((row) => row.storeId));
  const excludedPositions = stores
    .filter((store) => !includedStoreIds.has(store.storeId))
    .map(({ storeId, storeName, current }) => ({
      storeId,
      storeName,
      reason: getUsableSales(current, "선택일").reason ?? "매출 계산 불가",
    }));

  return { salesChanges, inventoryRatios, positions, excludedPositions };
}

export function buildDailyAttendanceReport(
  stores: DailyReportAnalysisStore[],
): DailyAttendanceReport {
  const summary = {
    totalWorkers: 0,
    late: 0,
    earlyLeave: 0,
    special: 0,
    missingRoster: 0,
  };
  const rows: DailyAttendanceReport["rows"] = [];

  for (const { storeId, storeName, current } of stores) {
    if (!current) {
      rows.push({
        storeId,
        storeName,
        workerName: "근태 미입력",
        statuses: ["근태 미입력"],
        lateMemo: null,
        earlyLeaveMemo: null,
        specialMemo: null,
      });
      continue;
    }
    const laborItems = current.ledgerLaborItems;
    const workerCount = current.workerCount ?? laborItems.length;
    const missingRoster = Math.max(workerCount - laborItems.length, 0);
    summary.totalWorkers += workerCount;
    summary.missingRoster += missingRoster;

    for (const item of laborItems) {
      const statuses: DailyAttendanceStatus[] = [];
      const hasLateMemo = Boolean(item.lateMemo?.trim());
      const hasEarlyLeaveMemo = Boolean(item.earlyLeaveMemo?.trim());
      const hasSpecialMemo = Boolean(item.specialMemo?.trim());
      if (!hasLateMemo && !hasEarlyLeaveMemo && !hasSpecialMemo) {
        statuses.push("정상");
      }
      if (hasLateMemo) {
        statuses.push("지각");
        summary.late += 1;
      }
      if (hasEarlyLeaveMemo) {
        statuses.push("조퇴");
        summary.earlyLeave += 1;
      }
      if (hasSpecialMemo) {
        statuses.push("특이사항");
        summary.special += 1;
      }
      if (!item.employeeId) statuses.push("직원 미연결");
      rows.push({
        storeId,
        storeName,
        workerName: item.workerName,
        statuses,
        lateMemo: item.lateMemo,
        earlyLeaveMemo: item.earlyLeaveMemo,
        specialMemo: item.specialMemo,
      });
    }

    if (missingRoster > 0) {
      rows.push({
        storeId,
        storeName,
        workerName: `명단 미입력 ${missingRoster.toLocaleString("ko-KR")}명`,
        statuses: ["명단 부족"],
        lateMemo: null,
        earlyLeaveMemo: null,
        specialMemo: null,
      });
    } else if (laborItems.length === 0 && current.workerCount === null) {
      rows.push({
        storeId,
        storeName,
        workerName: "근태 미입력",
        statuses: ["근태 미입력"],
        lateMemo: null,
        earlyLeaveMemo: null,
        specialMemo: null,
      });
    }
  }

  return { summary, rows };
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
  storeId,
}: Pick<StoreComparisonReportDateRange, "startDateInput" | "endDateInput"> & {
  storeId?: string | null;
}) {
  const params = new URLSearchParams({
    startDate: startDateInput,
    endDate: endDateInput,
  });

  if (storeId) {
    params.set("storeId", storeId);
  }

  return `/app/reports/comparison?${params.toString()}`;
}

export function getMonthlyClosingAnomalyReportMonthRange(
  month: unknown,
  inputDate = new Date(),
): MonthlyClosingAnomalyReportMonthRange {
  const today = getDailyMeetingReportDate("today", inputDate);
  const currentMonthInput = getDailyMeetingReportDateInput(today).slice(0, 7);
  const hasMonthInput = month !== undefined && month !== null && month !== "";
  const monthInput = isValidMonthQuery(month) ? month : currentMonthInput;
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

// WO-03(2026-06-22): 냉동/생물 카테고리별 추정 매출.
// 품목별 실제 POS 매출이 없으므로 재고 흐름(전일+매입-당일)을 판매 수량으로 보고 추정한다.
//
// 검토 후속(point_summary.md:26): 카테고리별 이익률을 함께 보여준다. 매출원가(COGS)는
// 점포 단위 계산과 동일하게 FIFO 소진금액(fifoLots[].consumedAmount)을 우선 사용하고,
// FIFO lot이 없으면 (판매수량 * 단가)로 추정한다(점포 COGS 폴백과 동일 규칙).
//
// point_summary 재검토(2026-06-24): 추정 "매출"은 매입/적용 단가가 아니라 회의 결정대로
// 지점장 판매가 계획(plannedUnitPrice) 기준으로 계산한다. 판매가 계획이 없는 품목은
// 매입 단가(unitPrice)로 폴백하되 fallbackItemCount로 집계해 "판매가 미반영분"을 알린다.
// COGS는 여전히 원가(FIFO 소진금액 또는 매입단가)로 계산한다(매출-원가 정의 일관성).
type CategoryPerformanceItem = {
  productId?: string | null;
  productName?: string | null;
  productSpec?: string | null;
  productCategory: string;
  previousQuantity: number;
  purchasedQuantity: number;
  currentQuantity: number | null;
  // 당일 손실 합계 수량. 판매량은 기준재고(전일+매입-손실)에서 당일재고를 빼야
  // 하므로 손실을 판매로 잘못 잡지 않도록 차감한다. 없으면 0.
  lossQuantity?: number;
  unitPrice: number;
  // 지점장 판매가 계획. 없으면 null(매입단가로 폴백).
  plannedUnitPrice?: number | null;
  fifoLots?: Array<{ consumedAmount: number }>;
};

// ledgerLossItems(품목별 손실 행)를 productId별 합계 수량으로 집계한다.
// 판매량 추정에서 기준재고(전일+매입-손실)를 쓰기 위해 각 재고 행에 붙인다.
function aggregateLossQuantityByProductId(
  lossItems: Array<{ productId: string | null; quantity: number }> = [],
): Map<string, number> {
  const byProductId = new Map<string, number>();
  for (const lossItem of lossItems) {
    if (!lossItem.productId) continue;
    byProductId.set(
      lossItem.productId,
      (byProductId.get(lossItem.productId) ?? 0) + lossItem.quantity,
    );
  }
  return byProductId;
}

function getItemSoldQuantity(item: CategoryPerformanceItem) {
  if (item.currentQuantity === null) return null;

  const soldQuantity =
    item.previousQuantity +
    item.purchasedQuantity -
    (item.lossQuantity ?? 0) -
    item.currentQuantity;

  return Number.isFinite(soldQuantity) ? soldQuantity : null;
}

function getItemCogs(item: CategoryPerformanceItem, soldQuantity: number) {
  if (item.fifoLots && item.fifoLots.length > 0) {
    return item.fifoLots.reduce((sum, lot) => sum + lot.consumedAmount, 0);
  }

  return Math.round(soldQuantity * item.unitPrice);
}

// 추정 매출 단가: 판매가 계획이 있으면 그 값, 없으면 매입단가로 폴백.
function getItemSalesUnitPrice(item: CategoryPerformanceItem): {
  unitPrice: number;
  usedPlannedPrice: boolean;
} {
  if (
    item.plannedUnitPrice !== null &&
    item.plannedUnitPrice !== undefined &&
    Number.isFinite(item.plannedUnitPrice)
  ) {
    return { unitPrice: item.plannedUnitPrice, usedPlannedPrice: true };
  }

  return { unitPrice: item.unitPrice, usedPlannedPrice: false };
}

export function buildProductCategoryPerformance(
  ledgers: Array<{
    ledgerInventoryItems: CategoryPerformanceItem[];
  }>,
): ProductCategoryPerformance[] {
  const byCategory = new Map<
    "냉동" | "생물" | "기타",
    {
      sales: number;
      cogs: number;
      soldItemCount: number;
      fallbackCount: number;
    }
  >();

  for (const ledger of ledgers) {
    for (const item of ledger.ledgerInventoryItems) {
      const soldQuantity = getItemSoldQuantity(item);

      if (soldQuantity === null || soldQuantity <= 0) continue;

      const category =
        item.productCategory === "냉동" || item.productCategory === "생물"
          ? item.productCategory
          : "기타";

      const stats = byCategory.get(category) ?? {
        sales: 0,
        cogs: 0,
        soldItemCount: 0,
        fallbackCount: 0,
      };
      const { unitPrice: salesUnitPrice, usedPlannedPrice } =
        getItemSalesUnitPrice(item);
      stats.sales += Math.round(soldQuantity * salesUnitPrice);
      stats.cogs += getItemCogs(item, soldQuantity);
      stats.soldItemCount += 1;
      if (!usedPlannedPrice) {
        stats.fallbackCount += 1;
      }
      byCategory.set(category, stats);
    }
  }

  return (["냉동", "생물"] as const).map((category) => {
    const stats = byCategory.get(category);
    const salesAmount = stats?.sales ?? 0;
    const cogs = stats?.cogs ?? 0;
    const fallbackCount = stats?.fallbackCount ?? 0;
    // 매출이 0이면 이익률을 계산할 수 없다(0 나눗셈 방지).
    const grossMarginRate =
      salesAmount > 0 ? (salesAmount - cogs) / salesAmount : null;

    return {
      category,
      salesAmount,
      grossMarginRate,
      statusLabel: "추정",
      salesPriceFallbackItemCount: fallbackCount,
    };
  });
}

// WO(2026-06-25): 당일 품목별 추정 이익률 + 전체 판매분 합산 요약.
// buildProductCategoryPerformance와 동일한 헬퍼(getItemSoldQuantity / getItemSalesUnitPrice /
// getItemCogs)와 동일한 행 제외 규칙(당일재고 null·판매수량 0 이하 제외)을 쓰므로,
// 품목 행 합계와 냉동/생물 카테고리 합계는 같은 기준으로 맞는다(테스트로 보장).
// 기타 카테고리는 카테고리 차트와 동일하게 제외한다.
export function buildProductProfitability(
  ledgers: Array<{
    ledgerInventoryItems: CategoryPerformanceItem[];
  }>,
): ProductProfitabilitySummary {
  const byProduct = new Map<
    string,
    {
      productId: string;
      productName: string;
      productSpec: string;
      productCategory: "냉동" | "생물";
      soldQuantity: number;
      sales: number;
      cogs: number;
      usedCostFallback: boolean;
    }
  >();

  for (const ledger of ledgers) {
    for (const item of ledger.ledgerInventoryItems) {
      if (item.productCategory !== "냉동" && item.productCategory !== "생물") {
        continue;
      }

      const soldQuantity = getItemSoldQuantity(item);
      if (soldQuantity === null || soldQuantity <= 0) continue;

      // 같은 품목이 여러 지점에 있으면 합산한다. productId가 없으면 품목명으로 묶는다.
      const key = item.productId ?? `name:${item.productName ?? ""}`;
      const { unitPrice: salesUnitPrice, usedPlannedPrice } =
        getItemSalesUnitPrice(item);

      const stats = byProduct.get(key) ?? {
        productId: item.productId ?? key,
        productName: item.productName ?? "이름 없음",
        productSpec: item.productSpec ?? "",
        productCategory: item.productCategory,
        soldQuantity: 0,
        sales: 0,
        cogs: 0,
        usedCostFallback: false,
      };
      stats.soldQuantity += soldQuantity;
      stats.sales += Math.round(soldQuantity * salesUnitPrice);
      stats.cogs += getItemCogs(item, soldQuantity);
      if (!usedPlannedPrice) stats.usedCostFallback = true;
      byProduct.set(key, stats);
    }
  }

  const items: ProductProfitabilityReportItem[] = Array.from(byProduct.values())
    .map((stats): ProductProfitabilityReportItem => {
      const grossProfit = stats.sales - stats.cogs;
      // 추정 매출이 0이면 이익률을 낼 수 없다(0 나눗셈 방지).
      const grossMarginRate =
        stats.sales > 0 ? grossProfit / stats.sales : null;
      const statusLabel: ProductProfitabilityReportItem["statusLabel"] =
        stats.sales <= 0
          ? "계산 불가"
          : stats.usedCostFallback
            ? "판매가 미반영"
            : "추정";

      return {
        productId: stats.productId,
        productName: stats.productName,
        productSpec: stats.productSpec,
        productCategory: stats.productCategory,
        soldQuantity: stats.soldQuantity,
        estimatedSalesAmount: stats.sales,
        estimatedCogsAmount: stats.cogs,
        estimatedGrossProfit: grossProfit,
        estimatedGrossMarginRate: grossMarginRate,
        salesBasis: stats.usedCostFallback ? "cost" : "planned",
        statusLabel,
      };
    })
    // 추정 판매액 내림차순(시인성: 큰 매출 품목이 위로).
    .sort((a, b) => b.estimatedSalesAmount - a.estimatedSalesAmount);

  const totalSalesAmount = items.reduce(
    (sum, item) => sum + item.estimatedSalesAmount,
    0,
  );
  const totalCogsAmount = items.reduce(
    (sum, item) => sum + item.estimatedCogsAmount,
    0,
  );
  const totalGrossProfit = totalSalesAmount - totalCogsAmount;

  return {
    items,
    totalSalesAmount,
    totalCogsAmount,
    totalGrossProfit,
    totalGrossMarginRate:
      totalSalesAmount > 0 ? totalGrossProfit / totalSalesAmount : null,
    salesPriceFallbackItemCount: items.filter(
      (item) => item.salesBasis === "cost",
    ).length,
    unavailableItemCount: items.filter(
      (item) => item.estimatedGrossMarginRate === null,
    ).length,
  };
}

export async function getHqDailyMeetingReport({
  datePreset = "today",
  dateQuery,
  storeId,
}: {
  datePreset?: string;
  dateQuery?: string;
  // 특정 지점만 집계할 때 사용한다(예: 지점 범위 xlsx 품목매출 시트). scope 밖이면 무시한다.
  storeId?: string | null;
} = {}): Promise<DailyMeetingReportData> {
  const { getHeadquartersStoreScope, requireReportAccess } =
    await import("../../server/authz.ts");
  await requireReportAccess();
  const storeScope = await getHeadquartersStoreScope();

  const query = getDailyMeetingReportDateQuery(dateQuery ?? datePreset);
  const preset = getDailyMeetingReportDatePreset(query);
  const closingDate = getDailyMeetingReportDate(query);
  const previousClosingDate = getPreviousReportDate(closingDate);
  const { db } = await import("../../server/db.ts");
  const { getAnomalyThresholdSettingsForSignals } =
    await import("../dashboard/threshold-queries.ts");
  const { getLatestCorrectionValuesForLedgers } =
    await import("../corrections/queries.ts");
  const { evaluateInventoryLossAnomalySignals, evaluateRevenueAnomalySignals } =
    await import("../../server/calculations/anomaly.ts");
  const [scopeStores, thresholdSettings] = await Promise.all([
    Promise.resolve(storeScope.stores),
    getAnomalyThresholdSettingsForSignals(),
  ]);
  // 요청 지점이 scope 안이면 그 지점만, 아니면 scope 전체를 본다.
  const stores =
    storeId && scopeStores.some((store) => store.id === storeId)
      ? scopeStores.filter((store) => store.id === storeId)
      : scopeStores;
  const storeIds = stores.map((store) => store.id);
  const rawLedgers =
    storeIds.length === 0
      ? []
      : await db.dailyLedger.findMany({
          where: {
            storeId: { in: storeIds },
            closingDate: { in: [closingDate, previousClosingDate] },
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
                productSpec: true,
                productCategory: true,
                previousQuantity: true,
                purchasedQuantity: true,
                currentQuantity: true,
                quantity: true,
                unitPrice: true,
                inventoryAmount: true,
                fifoLots: {
                  select: {
                    sourceType: true,
                    consumedAmount: true,
                    remainingAmount: true,
                  },
                },
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
            ledgerLaborItems: {
              select: {
                workerName: true,
                employeeId: true,
                lateMemo: true,
                earlyLeaveMemo: true,
                specialMemo: true,
              },
              orderBy: { createdAt: "asc" },
            },
          },
        });
  const ledgers = rawLedgers.map(normalizeReportLedgerQuantities);
  const currentLedgers = ledgers.filter(
    (ledger) => ledger.closingDate.getTime() === closingDate.getTime(),
  );
  const previousLedgers = ledgers.filter(
    (ledger) => ledger.closingDate.getTime() === previousClosingDate.getTime(),
  );
  const correctionValuesByLedgerId = await getLatestCorrectionValuesForLedgers(
    ledgers.map((ledger) => ledger.id),
  );
  // point_summary 검토 후속(2026-06-24): 카테고리별 추정 매출을 판매가 계획 기준으로 내기 위해
  // 각 마감 (storeId, closingDate)의 판매가 계획을 일괄 조회한다.
  const { getPlannedUnitPriceLookup } =
    await import("../sales-plan/queries.ts");
  const plannedUnitPriceLookup = await getPlannedUnitPriceLookup(
    currentLedgers.map((ledger) => ({
      storeId: ledger.storeId,
      businessDate: ledger.closingDate,
    })),
  );
  const ledgersWithPlannedPrice = currentLedgers.map((ledger) => {
    const lossQuantityByProductId = aggregateLossQuantityByProductId(
      ledger.ledgerLossItems,
    );
    return {
      ...ledger,
      ledgerInventoryItems: ledger.ledgerInventoryItems.map((item) => ({
        ...item,
        lossQuantity: item.productId
          ? (lossQuantityByProductId.get(item.productId) ?? 0)
          : 0,
        plannedUnitPrice: item.productId
          ? plannedUnitPriceLookup(
              ledger.storeId,
              ledger.closingDate,
              item.productId,
            )
          : null,
      })),
    };
  });
  const plannedSalesItemsByLedgerId = buildDailyMeetingPlannedSalesItems(
    ledgersWithPlannedPrice,
  );
  const ledgerByStoreId = new Map<string, ReportLedgerRecord>(
    currentLedgers.map((ledger) => [ledger.storeId, ledger]),
  );
  const previousLedgerByStoreId = new Map<string, ReportLedgerRecord>(
    previousLedgers.map((ledger) => [ledger.storeId, ledger]),
  );
  const rows = stores.map((store) => {
    const ledger = ledgerByStoreId.get(store.id) ?? null;

    return toDailyMeetingReportRow({
      store,
      ledger,
      closingDate,
      thresholdSettings,
      evaluateRevenueAnomalySignals,
      evaluateInventoryLossAnomalySignals,
      corrections: correctionValuesByLedgerId.get(ledger?.id ?? ""),
      plannedSalesItems: ledger
        ? plannedSalesItemsByLedgerId.get(ledger.id)
        : undefined,
    });
  });
  const analysisStores = stores.map((store) => ({
    storeId: store.id,
    storeName: store.name,
    current: toDailyReportAnalysisLedger(
      ledgerByStoreId.get(store.id) ?? null,
      correctionValuesByLedgerId,
    ),
    previous: toDailyReportAnalysisLedger(
      previousLedgerByStoreId.get(store.id) ?? null,
      correctionValuesByLedgerId,
    ),
  }));

  return {
    datePreset: preset,
    dateQuery: query,
    dateInput: getDailyMeetingReportDateInput(closingDate),
    closingDate: closingDate.toISOString(),
    rows,
    summary: summarizeDashboardRows(rows),
    categoryPerformance: buildProductCategoryPerformance(
      ledgersWithPlannedPrice,
    ),
    productProfitability: buildProductProfitability(ledgersWithPlannedPrice),
    salesAnalysis: buildDailySalesAnalysis(analysisStores),
    attendance: buildDailyAttendanceReport(analysisStores),
  };
}

// (2026-06-30) 월별 xlsx "품목매출" 시트용 기간 합산. getHqDailyMeetingReport와 동일한
// 판매수량/원가/판매단가 헬퍼를 쓰되, 한 날의 대표값이 아니라 조회 시작일~종료일의 모든
// 마감 장부를 store×product 단위로 합산한다. 손실수량/손실금액도 같이 모으고, 재고수량은
// 기간 내 가장 최근 마감의 당일재고를 쓴다.
export async function getHqProductSalesReportForRange({
  startDate,
  endDate,
  storeId,
}: {
  startDate?: unknown;
  endDate?: unknown;
  storeId?: unknown;
} = {}): Promise<ProductSalesPeriodReportData> {
  const { getHeadquartersStoreScope, requireReportAccess } =
    await import("../../server/authz.ts");
  await requireReportAccess();
  const storeScope = await getHeadquartersStoreScope();
  const range = getStoreComparisonReportDateRange({ startDate, endDate });
  const stores = storeScope.stores;
  const normalizedStoreId =
    typeof storeId === "string" && storeId.length > 0 ? storeId : null;
  const matchedStore = normalizedStoreId
    ? stores.find((store) => store.id === normalizedStoreId)
    : null;
  const selectedStores = normalizedStoreId
    ? matchedStore
      ? [matchedStore]
      : []
    : stores;
  const storeNameById = new Map(
    selectedStores.map((store) => [store.id, store.name]),
  );
  const storeIds = selectedStores.map((store) => store.id);

  if (storeIds.length === 0) {
    return {
      startDateInput: range.startDateInput,
      endDateInput: range.endDateInput,
      selectedStoreId: matchedStore?.id ?? null,
      selectedStoreName: matchedStore?.name ?? null,
      scopedStoreIds: [],
      items: [],
    };
  }

  const { db } = await import("../../server/db.ts");
  const rawLedgers = await db.dailyLedger.findMany({
    where: {
      storeId: { in: storeIds },
      closingDate: { gte: range.startDate, lte: range.endDate },
      // 월별손익(getStoreProfitSummariesForRange)과 같은 status 필터를 써서
      // 검토중/본사마감 장부만 집계한다. 작성 중(IN_PROGRESS)·휴무 장부는 제외.
      // (기간조회_RAW는 status 무필터라 모집단이 다르다.)
      status: { in: ["IN_REVIEW", "HEADQUARTERS_CLOSED"] },
    },
    orderBy: [{ storeId: "asc" }, { closingDate: "asc" }, { id: "asc" }],
    select: {
      id: true,
      storeId: true,
      closingDate: true,
      ledgerInventoryItems: {
        select: {
          productId: true,
          productName: true,
          productSpec: true,
          productCategory: true,
          previousQuantity: true,
          purchasedQuantity: true,
          currentQuantity: true,
          quantity: true,
          unitPrice: true,
          fifoLots: { select: { consumedAmount: true } },
        },
      },
      ledgerLossItems: {
        select: {
          productId: true,
          quantity: true,
          amount: true,
        },
      },
    },
  });
  const ledgers = rawLedgers.map(normalizeReportLedgerQuantities);

  const { getPlannedUnitPriceLookup } =
    await import("../sales-plan/queries.ts");
  const plannedUnitPriceLookup = await getPlannedUnitPriceLookup(
    ledgers.map((ledger) => ({
      storeId: ledger.storeId,
      businessDate: ledger.closingDate,
    })),
  );

  type ProductSalesBucket = Omit<
    ProductSalesPeriodItem,
    | "startDateInput"
    | "endDateInput"
    | "estimatedGrossProfit"
    | "estimatedGrossMarginRate"
    | "statusLabel"
  > & {
    usedCostFallback: boolean;
    latestClosingDate: Date | null;
  };

  const byStoreProduct = new Map<string, ProductSalesBucket>();

  for (const ledger of ledgers) {
    const lossQuantityByProductId = aggregateLossQuantityByProductId(
      ledger.ledgerLossItems,
    );
    const lossAmountByProductId = new Map<string, number>();
    for (const lossItem of ledger.ledgerLossItems) {
      if (!lossItem.productId) continue;
      lossAmountByProductId.set(
        lossItem.productId,
        (lossAmountByProductId.get(lossItem.productId) ?? 0) + lossItem.amount,
      );
    }

    for (const item of ledger.ledgerInventoryItems) {
      // 품목별 매출 시트는 분류 미확정("기준 미정") 품목도 누락하지 않는다.
      // 냉동/생물만 거르던 category 필터를 두지 않고, 판매수량이 잡히는 모든 행을 합산한다.
      const enrichedItem = {
        ...item,
        lossQuantity: item.productId
          ? (lossQuantityByProductId.get(item.productId) ?? 0)
          : 0,
        plannedUnitPrice: item.productId
          ? plannedUnitPriceLookup(
              ledger.storeId,
              ledger.closingDate,
              item.productId,
            )
          : null,
      };
      const soldQuantity = getItemSoldQuantity(enrichedItem);
      if (soldQuantity === null || soldQuantity <= 0) continue;

      const productKey =
        item.productId ??
        `name:${item.productName}:${item.productSpec}:${item.productCategory}`;
      const key = `${ledger.storeId}|${productKey}`;
      const { unitPrice: salesUnitPrice, usedPlannedPrice } =
        getItemSalesUnitPrice(enrichedItem);
      const existing = byStoreProduct.get(key);
      const bucket =
        existing ??
        ({
          storeId: ledger.storeId,
          storeName: storeNameById.get(ledger.storeId) ?? ledger.storeId,
          productId: item.productId ?? productKey,
          productName: item.productName ?? "이름 없음",
          productSpec: item.productSpec ?? "",
          productCategory: item.productCategory,
          soldQuantity: 0,
          estimatedSalesAmount: 0,
          estimatedCogsAmount: 0,
          salesBasis: "planned",
          usedCostFallback: false,
          lossQuantity: 0,
          lossAmount: 0,
          currentQuantity: null,
          latestClosingDate: null,
        } satisfies ProductSalesBucket);

      bucket.soldQuantity += soldQuantity;
      bucket.estimatedSalesAmount += Math.round(soldQuantity * salesUnitPrice);
      bucket.estimatedCogsAmount += getItemCogs(enrichedItem, soldQuantity);
      bucket.lossQuantity += enrichedItem.lossQuantity;
      bucket.lossAmount += item.productId
        ? (lossAmountByProductId.get(item.productId) ?? 0)
        : 0;
      if (!usedPlannedPrice) {
        bucket.usedCostFallback = true;
        bucket.salesBasis = "cost";
      }
      if (
        bucket.latestClosingDate === null ||
        ledger.closingDate >= bucket.latestClosingDate
      ) {
        bucket.latestClosingDate = ledger.closingDate;
        bucket.currentQuantity = item.currentQuantity;
      }

      byStoreProduct.set(key, bucket);
    }
  }

  const items = [...byStoreProduct.values()]
    .map((bucket): ProductSalesPeriodItem => {
      const estimatedGrossProfit =
        bucket.estimatedSalesAmount - bucket.estimatedCogsAmount;
      const estimatedGrossMarginRate =
        bucket.estimatedSalesAmount > 0
          ? estimatedGrossProfit / bucket.estimatedSalesAmount
          : null;

      return {
        startDateInput: range.startDateInput,
        endDateInput: range.endDateInput,
        storeId: bucket.storeId,
        storeName: bucket.storeName,
        productId: bucket.productId,
        productName: bucket.productName,
        productSpec: bucket.productSpec,
        productCategory: bucket.productCategory,
        soldQuantity: bucket.soldQuantity,
        estimatedSalesAmount: bucket.estimatedSalesAmount,
        estimatedCogsAmount: bucket.estimatedCogsAmount,
        estimatedGrossProfit,
        estimatedGrossMarginRate,
        salesBasis: bucket.salesBasis,
        statusLabel:
          bucket.estimatedSalesAmount <= 0
            ? "계산 불가"
            : bucket.usedCostFallback
              ? "판매가 미반영"
              : "추정",
        lossQuantity: bucket.lossQuantity,
        lossAmount: bucket.lossAmount,
        currentQuantity: bucket.currentQuantity,
      };
    })
    .sort(
      (a, b) =>
        a.storeName.localeCompare(b.storeName, "ko") ||
        b.estimatedSalesAmount - a.estimatedSalesAmount,
    );

  return {
    startDateInput: range.startDateInput,
    endDateInput: range.endDateInput,
    selectedStoreId: matchedStore?.id ?? null,
    selectedStoreName: matchedStore?.name ?? null,
    scopedStoreIds: storeIds,
    items,
  };
}

export async function getHqStoreComparisonReport({
  startDate,
  endDate,
  storeId,
}: {
  startDate?: unknown;
  endDate?: unknown;
  storeId?: unknown;
} = {}): Promise<StoreComparisonReportData> {
  const { getHeadquartersStoreScope, requireReportAccess } =
    await import("../../server/authz.ts");
  await requireReportAccess();
  const storeScope = await getHeadquartersStoreScope();

  const range = getStoreComparisonReportDateRange({ startDate, endDate });
  const { db } = await import("../../server/db.ts");
  const { getLatestCorrectionValuesForLedgers } =
    await import("../corrections/queries.ts");
  const stores = storeScope.stores;
  const normalizedStoreId =
    typeof storeId === "string" && storeId.length > 0 ? storeId : null;
  const matchedStore = normalizedStoreId
    ? stores.find((store) => store.id === normalizedStoreId)
    : null;
  const selectedStores = normalizedStoreId
    ? matchedStore
      ? [matchedStore]
      : []
    : stores;
  const storeErrorMessage =
    normalizedStoreId && !matchedStore
      ? "조회 지점을 확인해 주세요. 권한 있는 활성 지점만 기간 비교에 포함됩니다."
      : null;
  const storeIds = selectedStores.map((store) => store.id);
  const rawLedgers =
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
                productSpec: true,
                productCategory: true,
                previousQuantity: true,
                purchasedQuantity: true,
                currentQuantity: true,
                quantity: true,
                unitPrice: true,
                inventoryAmount: true,
                fifoLots: {
                  select: {
                    sourceType: true,
                    consumedAmount: true,
                    remainingAmount: true,
                  },
                },
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
  const ledgers = rawLedgers.map(normalizeReportLedgerQuantities);
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
    stores,
    selectedStoreId: matchedStore?.id ?? null,
    selectedStoreName: matchedStore?.name ?? null,
    errorMessages: [range.errorMessage, storeErrorMessage].filter(
      (message): message is string => Boolean(message),
    ),
    rows: sortStoreComparisonReportRowsForTest(
      selectedStores.map((store) =>
        buildStoreComparisonReportRowForTest({
          store,
          dateCount: getInclusiveDateCount(range.startDate, range.endDate),
          ledgerSummaries: summariesByStoreId.get(store.id) ?? [],
        }),
      ),
    ),
  };
}

// WO-G(2026-06-22): LINE 아침 요약의 장기 적자/마진 미달 판정을 본사 리포트와 같은
// 기준(correction-aware grossProfit/grossMarginRate)으로 계산하기 위한 재사용 헬퍼.
// 단순 (총매출 - 지출)이 아니라 매출원가(COGS), 본사 정정 반영 상태를 함께 반영한다.
// 권한 게이트가 없으므로 내부 호출(스케줄러)에서만 사용한다.
export type StoreProfitSummary = {
  storeId: string;
  totalSales: number;
  // 매출원가/재고 입력이 없어 grossProfit을 계산할 수 없는 장부는 제외하고 합산한다.
  grossProfit: number | null;
  operatingProfit: number | null;
  grossMarginRate: number | null;
  ledgerCount: number;
  // grossProfit을 계산할 수 있었던(매출원가 산출 가능) 장부 수.
  computableLedgerCount: number;
};

export async function getStoreProfitSummariesForRange({
  storeIds,
  startDate,
  endDate,
}: {
  storeIds: string[];
  startDate: Date;
  endDate: Date;
}): Promise<Map<string, StoreProfitSummary>> {
  const summaries = new Map<string, StoreProfitSummary>();

  if (storeIds.length === 0) {
    return summaries;
  }

  const { db } = await import("../../server/db.ts");
  const { getLatestCorrectionValuesForLedgersScoped } =
    await import("../corrections/queries.ts");

  const rawLedgers = await db.dailyLedger.findMany({
    where: {
      storeId: { in: storeIds },
      closingDate: { gte: startDate, lte: endDate },
      status: { in: ["IN_REVIEW", "HEADQUARTERS_CLOSED"] },
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
      updatedBy: { select: { name: true, email: true } },
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
          fifoLots: {
            select: {
              sourceType: true,
              consumedAmount: true,
              remainingAmount: true,
            },
          },
        },
      },
      ledgerExpenses: { select: { id: true, amount: true } },
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
  const ledgers = rawLedgers.map(normalizeReportLedgerQuantities);

  const correctionValuesByLedgerId =
    await getLatestCorrectionValuesForLedgersScoped(
      ledgers.map((ledger) => ledger.id),
      storeIds,
    );

  type StoreAccumulator = {
    totalSales: number;
    grossProfit: number | null;
    operatingProfit: number | null;
    ledgerCount: number;
    computableLedgerCount: number;
  };
  const accumulators = new Map<string, StoreAccumulator>();

  for (const ledger of ledgers) {
    const accumulator = accumulators.get(ledger.storeId) ?? {
      totalSales: 0,
      grossProfit: null,
      operatingProfit: null,
      ledgerCount: 0,
      computableLedgerCount: 0,
    };

    const summary = toReportLedgerCalculationSummary(
      ledger,
      correctionValuesByLedgerId.get(ledger.id),
    );
    const applied = summary.applied;

    accumulator.ledgerCount += 1;

    if (applied.totalSales.value !== null) {
      accumulator.totalSales += applied.totalSales.value;
    }

    // grossProfit/operatingProfit은 매출원가 산출이 가능한 장부에서만 합산한다.
    if (applied.grossProfit.value !== null) {
      accumulator.grossProfit =
        (accumulator.grossProfit ?? 0) + applied.grossProfit.value;
      accumulator.computableLedgerCount += 1;
    }

    if (applied.operatingProfit.value !== null) {
      accumulator.operatingProfit =
        (accumulator.operatingProfit ?? 0) + applied.operatingProfit.value;
    }

    accumulators.set(ledger.storeId, accumulator);
  }

  for (const [storeId, accumulator] of accumulators) {
    const grossMarginRate =
      accumulator.grossProfit !== null && accumulator.totalSales > 0
        ? accumulator.grossProfit / accumulator.totalSales
        : null;

    summaries.set(storeId, {
      storeId,
      totalSales: accumulator.totalSales,
      grossProfit: accumulator.grossProfit,
      operatingProfit: accumulator.operatingProfit,
      grossMarginRate,
      ledgerCount: accumulator.ledgerCount,
      computableLedgerCount: accumulator.computableLedgerCount,
    });
  }

  return summaries;
}

// WO-E(2026-06-22): HR 생산성 분석이 장부별 매출/마진을 본사 리포트와 같은
// correction-aware 기준으로 사용할 수 있도록, 장부 단위 요약을 노출한다.
// grossMarginRate가 계산 불가일 때는 사유(reason)를 함께 돌려준다.
export type LedgerProfitSummary = {
  ledgerId: string;
  storeId: string;
  closingDate: Date;
  status: DailyLedgerStatus;
  workerCount: number | null;
  totalSales: number | null;
  grossProfit: number | null;
  grossMarginRate: number | null;
  grossMarginReason: string | null;
  lossItems: Array<{
    id?: string;
    lossTypeName: string;
    quantity: number;
    amount: number;
    usedPlannedPrice: boolean;
  }>;
  hasUnappliedCorrections: boolean;
};

export async function getLedgerProfitSummariesForRange({
  storeIds,
  startDate,
  endDate,
}: {
  storeIds: string[];
  startDate: Date;
  endDate: Date;
}): Promise<Map<string, LedgerProfitSummary>> {
  const result = new Map<string, LedgerProfitSummary>();

  if (storeIds.length === 0) {
    return result;
  }

  const { db } = await import("../../server/db.ts");
  const { getLatestCorrectionValuesForLedgersScoped } =
    await import("../corrections/queries.ts");

  const rawLedgers = await db.dailyLedger.findMany({
    where: {
      storeId: { in: storeIds },
      closingDate: { gte: startDate, lte: endDate },
      status: { in: ["IN_REVIEW", "HEADQUARTERS_CLOSED"] },
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
      updatedBy: { select: { name: true, email: true } },
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
          fifoLots: {
            select: {
              sourceType: true,
              consumedAmount: true,
              remainingAmount: true,
            },
          },
        },
      },
      ledgerExpenses: { select: { id: true, amount: true } },
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
          usedPlannedPrice: true,
        },
      },
    },
  });
  const ledgers = rawLedgers.map(normalizeReportLedgerQuantities);

  const correctionValuesByLedgerId =
    await getLatestCorrectionValuesForLedgersScoped(
      ledgers.map((ledger) => ledger.id),
      storeIds,
    );

  for (const ledger of ledgers) {
    const summary = toReportLedgerCalculationSummary(
      ledger,
      correctionValuesByLedgerId.get(ledger.id),
    );
    const applied = summary.applied;

    result.set(ledger.id, {
      ledgerId: ledger.id,
      storeId: ledger.storeId,
      closingDate: ledger.closingDate,
      status: ledger.status,
      workerCount: summary.workerCount,
      totalSales: applied.totalSales.value,
      grossProfit: applied.grossProfit.value,
      grossMarginRate: applied.grossMarginRate.value,
      grossMarginReason:
        applied.grossMarginRate.value === null
          ? (applied.grossMarginRate.reason ??
            applied.grossMarginRate.label ??
            "계산 불가")
          : null,
      lossItems: summary.lossItems,
      hasUnappliedCorrections: summary.hasUnappliedCorrections,
    });
  }

  return result;
}

export async function getHqMonthlyClosingAnomalyReport({
  month,
  storeId,
}: {
  month?: unknown;
  storeId?: unknown;
} = {}): Promise<MonthlyClosingAnomalyReportData> {
  const { getHeadquartersStoreScope, requireReportAccess } =
    await import("../../server/authz.ts");
  await requireReportAccess();
  const storeScope = await getHeadquartersStoreScope();

  const monthRange = getMonthlyClosingAnomalyReportMonthRange(month);
  const { db } = await import("../../server/db.ts");
  const { getAnomalyThresholdSettingsForSignals } =
    await import("../dashboard/threshold-queries.ts");
  const { getLatestCorrectionValuesForLedgers } =
    await import("../corrections/queries.ts");
  const { evaluateInventoryLossAnomalySignals, evaluateRevenueAnomalySignals } =
    await import("../../server/calculations/anomaly.ts");
  const [stores, thresholdSettings] = await Promise.all([
    Promise.resolve(storeScope.stores),
    getAnomalyThresholdSettingsForSignals(),
  ]);
  const normalizedStoreId =
    typeof storeId === "string" && storeId.length > 0 ? storeId : null;
  const matchedStore = normalizedStoreId
    ? stores.find((store) => store.id === normalizedStoreId)
    : null;
  const selectedStore =
    matchedStore ?? (normalizedStoreId ? null : (stores[0] ?? null));
  const storeErrorMessage =
    normalizedStoreId && !matchedStore
      ? "조회 지점이 권한 범위에 없거나 비활성입니다. 권한 있는 지점을 선택해 주세요."
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

  const rawLedgers = await db.dailyLedger.findMany({
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
          productCategory: true,
          previousQuantity: true,
          purchasedQuantity: true,
          currentQuantity: true,
          quantity: true,
          unitPrice: true,
          inventoryAmount: true,
          fifoLots: {
            select: {
              sourceType: true,
              consumedAmount: true,
              remainingAmount: true,
            },
          },
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
  const ledgers = rawLedgers.map(normalizeReportLedgerQuantities);
  const correctionValuesByLedgerId = await getLatestCorrectionValuesForLedgers(
    ledgers.map((ledger) => ledger.id),
  );
  // point_summary 검토 후속(2026-06-24): 월간 추정 매출/랭킹/카테고리 매출도 판매가 계획
  // 기준으로 산출한다. 단일 점포·여러 마감일이므로 (storeId, closingDate)별 계획을 일괄 조회한다.
  const { getPlannedUnitPriceLookup: getMonthlyPlannedUnitPriceLookup } =
    await import("../sales-plan/queries.ts");
  const monthlyPlannedUnitPriceLookup = await getMonthlyPlannedUnitPriceLookup(
    ledgers.map((ledger) => ({
      storeId: ledger.storeId,
      businessDate: ledger.closingDate,
    })),
  );
  const ledgersWithPlannedPrice = ledgers.map((ledger) => ({
    ...ledger,
    ledgerInventoryItems: ledger.ledgerInventoryItems.map((item) => ({
      ...item,
      plannedUnitPrice: item.productId
        ? monthlyPlannedUnitPriceLookup(
            ledger.storeId,
            ledger.closingDate,
            item.productId,
          )
        : null,
    })),
  }));
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
    const getItemPlannedUnitPrice = (productId?: string) =>
      productId
        ? monthlyPlannedUnitPriceLookup(
            ledger.storeId,
            ledger.closingDate,
            productId,
          )
        : null;

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
      // 랭킹용 추정 매출 단가를 위해 품목별 판매가 계획을 붙인다.
      // 판매량 추정(전일+매입-손실-당일)을 위해 품목별 손실 합계도 붙인다.
      inventoryItems: (() => {
        const lossQuantityByProductId = aggregateLossQuantityByProductId(
          calculationSummary.lossItems,
        );
        return calculationSummary.inventoryItems.map((item) => ({
          ...item,
          lossQuantity: item.productId
            ? (lossQuantityByProductId.get(item.productId) ?? 0)
            : 0,
          plannedUnitPrice: getItemPlannedUnitPrice(item.productId),
        }));
      })(),
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
    categoryPerformance: buildProductCategoryPerformance(
      ledgersWithPlannedPrice,
    ),
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

type MonthlyReportInventoryItem = LedgerReviewInventoryInput & {
  // point_summary 검토 후속(2026-06-24): 랭킹 추정 매출을 판매가 계획 기준으로 내기 위한 단가.
  plannedUnitPrice?: number | null;
  // 판매량 추정(전일+매입-손실-당일)을 위한 품목별 손실 합계 수량.
  lossQuantity?: number;
};

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
  categoryPerformance = [],
}: {
  store: ReportStoreRecord;
  stores?: ReportStoreRecord[];
  monthRange?: MonthlyClosingAnomalyReportMonthRange;
  monthInput: string;
  dateInputs: string[];
  ledgerSummaries: MonthlyClosingAnomalyLedgerSummaryForTest[];
  errorMessages?: string[];
  categoryPerformance?: ProductCategoryPerformance[];
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

  const statusCounts = getMonthlyStatusCounts(days);
  const unfinishedDayCount =
    statusCounts.inProgressCount + statusCounts.reviewCount;

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
    statusCounts,
    unfinishedDayCount,
    hasUnfinishedDays: unfinishedDayCount > 0,
    monthlyKpis: buildMonthlyKpis(ledgerSummaries),
    monthlyLossSummary: buildMonthlyLossSummary(ledgerSummaries),
    monthlyInventoryFlow: buildMonthlyInventoryFlow(ledgerSummaries),
    topRevenueItem: buildMonthlyTopRevenueItemSummary(),
    revenueRanking: buildMonthlyRevenueRanking(ledgerSummaries),
    profitAndLossReadiness: buildMonthlyProfitAndLossReadiness(),
    calculationDays: buildMonthlyCalculationDays(days, ledgerSummaries),
    days,
    anomalyItems: buildMonthlyAnomalyItems(days),
    errorMessages,
    categoryPerformance,
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
    unfinishedDayCount: 0,
    hasUnfinishedDays: false,
    monthlyKpis: buildMonthlyKpis([]),
    monthlyLossSummary: buildMonthlyLossSummary([]),
    monthlyInventoryFlow: buildMonthlyInventoryFlow([]),
    topRevenueItem: buildMonthlyTopRevenueItemSummary(),
    revenueRanking: buildMonthlyRevenueRanking([]),
    profitAndLossReadiness: buildMonthlyProfitAndLossReadiness(),
    calculationDays: [],
    days: [],
    anomalyItems: [],
    errorMessages,
    categoryPerformance: buildProductCategoryPerformance([]),
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
  const businessSummaries =
    getMonthlyBusinessAggregateSummaries(ledgerSummaries);
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
  const appliedCorrectionCount = businessSummaries.reduce(
    (sum, summary) =>
      sum +
      (summary.appliedCorrectionCount ??
        summary.appliedCorrectionKeys?.size ??
        0),
    0,
  );

  return {
    salesAmount: appliedAggregates.salesAmount,
    grossProfit: appliedAggregates.grossProfit,
    grossMarginRate: appliedAggregates.grossMarginRate,
    operatingProfit: appliedAggregates.operatingProfit,
    lossTotal: appliedLossTotal,
    averageInventory: appliedAggregates.averageInventory,
    averageSales: appliedAggregates.averageSales,
    inventoryToSalesRatio: appliedAggregates.inventoryToSalesRatio,
    appliedCorrectionCount,
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
  const businessSummaries =
    getMonthlyBusinessAggregateSummaries(ledgerSummaries);
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
  const businessSummaries =
    getMonthlyBusinessAggregateSummaries(ledgerSummaries);
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
        matchers: comparisonMetricCorrectionMatchers.purchase,
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
    return dataInsufficient("재고 흐름 계산에 필요한 수량 데이터가 없습니다.");
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
      calculateInventoryAmount(item.previousQuantity, item.unitPrice) ===
        null ||
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

// WO-08(2026-06-22): 손익 리포트에 필요한 입력값 준비도. 실측/추정/미구현을 명확히
// 구분해 노출한다. 출처와 사유는 docs/goal/2026-06-22-wo-08 문서의 'P&L Data Inputs'와
// 일치시킨다. 실제 입력이 확보된 항목은 actual로 유지하고, 품목별 매출처럼
// 아직 직접 기록되지 않는 값만 estimated로 둔다.
function buildMonthlyProfitAndLossReadiness(): MonthlyProfitAndLossReadiness {
  const availabilityLabels: Record<
    MonthlyProfitAndLossReadiness["inputs"][number]["availability"],
    string
  > = {
    actual: "실측",
    estimated: "추정",
    unavailable: "미구현",
  };
  const definitions: {
    key: string;
    label: string;
    availability: MonthlyProfitAndLossReadiness["inputs"][number]["availability"];
    source: string;
    note: string;
  }[] = [
    {
      key: "sales",
      label: "매출",
      availability: "actual",
      source: "일일 장부 총매출",
      note: "지점 일일 장부의 총매출 합계로 실측 집계합니다.",
    },
    {
      key: "purchaseCost",
      label: "매입 원가 / 매출원가",
      availability: "estimated",
      source: "재고 흐름/FIFO 원가",
      note: "재고 흐름과 FIFO 원가 기준으로 추정 산출합니다. 품목별 실판매 기록은 아직 직접 기록되지 않습니다.",
    },
    {
      key: "branchExpense",
      label: "지점 일일 비용",
      availability: "actual",
      source: "일일 장부 비용",
      note: "지점 일일 장부의 비용 항목으로 실측 집계합니다.",
    },
    {
      key: "headquartersExpense",
      label: "본사 지출",
      availability: "actual",
      source: "본사 지출 입력",
      note: "본사 지출 입력 화면에서 실측 집계합니다.",
    },
    {
      key: "labor",
      label: "인건비 / 급여",
      availability: "actual",
      source: "일일 장부 직원별 급여",
      note: "지점 일일 장부의 직원별 급여 금액으로 실측 집계합니다.",
    },
    {
      key: "inventoryValue",
      label: "재고 가치",
      availability: "actual",
      source: "재고 금액",
      note: "장부에 저장된 FIFO 재고금액을 실측 집계합니다.",
    },
    {
      key: "productSales",
      label: "품목별 매출",
      availability: "estimated",
      source: "판매량 × 단가 추정",
      note: "품목별 매출이 기록되지 않아 매출 상위/하위 순위는 추정값입니다.",
    },
  ];
  const inputs = definitions.map((definition) => ({
    ...definition,
    availabilityLabel: availabilityLabels[definition.availability],
  }));
  const actualCount = inputs.filter(
    (input) => input.availability === "actual",
  ).length;
  const estimatedCount = inputs.filter(
    (input) => input.availability === "estimated",
  ).length;
  const unavailableCount = inputs.filter(
    (input) => input.availability === "unavailable",
  ).length;

  return {
    statusLabel: `실측 ${actualCount} · 추정 ${estimatedCount} · 미구현 ${unavailableCount}`,
    actualCount,
    estimatedCount,
    unavailableCount,
    note: "손익(P&L) 산출에 필요한 입력값별 확보 상태입니다. 추정·미구현 항목은 실측값과 구분해 해석해 주세요.",
    inputs,
  };
}

const revenueRankingSize = 5;

// 미팅 요구: 매출 상위5/하위5 품목. 품목별 매출액이 시스템에 없으므로
// 판매량(전일재고+매입-당일재고) × 단가를 '추정 매출'로 보고 순위를 매긴다.
//
// point_summary 검토 후속(2026-06-24): 단가는 매입/적용 단가가 아니라 회의 결정대로
// 지점장 판매가 계획(plannedUnitPrice)을 우선 쓴다. 계획이 없는 날/품목은 매입단가로
// 폴백하고 그 품목은 salesBasis="cost"로 표시한다.
function buildMonthlyRevenueRanking(
  ledgerSummaries: MonthlyClosingAnomalyLedgerSummaryForTest[],
): MonthlyRevenueRankingSummary {
  const basisLabel = "판매량 × 판매가 계획 추정";
  const note =
    "품목별 매출액 데이터가 없어 판매량(전일재고+매입-당일재고)에 지점 판매가 계획을 곱한 추정 매출로 순위를 산출합니다. 판매가 계획이 없는 품목은 매입 단가로 대체(판매가 미반영)합니다.";
  const aggregates = new Map<
    string,
    {
      productName: string;
      soldQuantity: number;
      estimatedSalesAmount: number;
      usedCostFallback: boolean;
    }
  >();

  for (const summary of ledgerSummaries.filter(
    (item) => item.status !== "HOLIDAY",
  )) {
    for (const item of summary.inventoryItems ?? []) {
      if (!item.productId) {
        continue;
      }

      const currentQuantity = item.currentQuantity ?? item.quantity;

      if (currentQuantity === null || !Number.isFinite(currentQuantity)) {
        continue;
      }

      // 판매량 = 기준재고(전일+매입-손실) - 당일재고. 손실을 빼지 않으면
      // 폐기 수량이 판매로 잘못 잡혀 추정 매출이 부풀려진다.
      const soldQuantity =
        item.previousQuantity +
        item.purchasedQuantity -
        (item.lossQuantity ?? 0) -
        currentQuantity;

      if (!Number.isFinite(soldQuantity) || soldQuantity <= 0) {
        continue;
      }

      const usePlannedPrice =
        item.plannedUnitPrice !== null &&
        item.plannedUnitPrice !== undefined &&
        Number.isFinite(item.plannedUnitPrice);
      const salesUnitPrice = usePlannedPrice
        ? item.plannedUnitPrice!
        : item.unitPrice;
      const estimatedSalesAmount = Math.round(soldQuantity * salesUnitPrice);
      const current = aggregates.get(item.productId);

      if (current) {
        current.soldQuantity += soldQuantity;
        current.estimatedSalesAmount += estimatedSalesAmount;
        current.usedCostFallback = current.usedCostFallback || !usePlannedPrice;
        continue;
      }

      aggregates.set(item.productId, {
        productName: item.productName ?? "이름 미상 품목",
        soldQuantity,
        estimatedSalesAmount,
        usedCostFallback: !usePlannedPrice,
      });
    }
  }

  const ranked: MonthlyRevenueRankingItem[] = [...aggregates.entries()]
    .map(([productId, value]) => ({
      productId,
      productName: value.productName,
      soldQuantity: value.soldQuantity,
      estimatedSalesAmount: value.estimatedSalesAmount,
      salesBasis: value.usedCostFallback
        ? ("cost" as const)
        : ("planned" as const),
    }))
    .sort(
      (left, right) => right.estimatedSalesAmount - left.estimatedSalesAmount,
    );
  const salesPriceFallbackItemCount = ranked.filter(
    (item) => item.salesBasis === "cost",
  ).length;

  if (ranked.length === 0) {
    return {
      status: "data-insufficient",
      statusLabel: "데이터 부족",
      basisLabel,
      note: "판매량을 계산할 수 있는 재고 데이터가 아직 없습니다.",
      top: [],
      bottom: [],
      salesPriceFallbackItemCount: 0,
    };
  }

  const top = ranked.slice(0, revenueRankingSize);
  const bottom = [...ranked]
    .reverse()
    .slice(0, revenueRankingSize)
    .filter((item) => !top.includes(item));

  return {
    status: "available",
    statusLabel: "추정 매출 기준",
    basisLabel,
    note,
    top,
    bottom,
    salesPriceFallbackItemCount,
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
    (
      summary,
    ): summary is MonthlyClosingAnomalyLedgerSummaryForTest &
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
    .filter(
      (evidence) => evidence.isCorrected || evidence.status === "needs-review",
    )
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
      detail:
        evidence.unavailableReason ??
        "장부 상세에서 정정 근거를 확인해 주세요.",
      correctionTimelineHref: evidence.correctionTimelineHref,
      metricEvidence: evidence,
    }));
}

function getMonthlyAnomalyMetricEvidence(
  signalId: string,
  metricEvidence: DailyMeetingReportMetricEvidenceMap,
) {
  if (signalId.startsWith("margin-rate")) {
    return metricEvidence.grossMarginRate;
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
  plannedSalesItems?: LedgerReviewPlannedSalesInput[],
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
    plannedSalesItems,
  });
  const lossMetadataById = new Map(
    ledger.ledgerLossItems.map((item) => [
      item.id,
      {
        lossTypeName: item.lossTypeName,
        usedPlannedPrice: item.usedPlannedPrice ?? false,
      },
    ]),
  );
  const correctedLossItems = correctionOverlay.lossItems.map((item) => {
    const metadata = lossMetadataById.get(item.id ?? "");

    return {
      ...item,
      lossTypeName: metadata?.lossTypeName ?? "유형 미지정",
      usedPlannedPrice: metadata?.usedPlannedPrice ?? false,
    };
  });

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

function toDailyReportAnalysisLedger(
  ledger: ReportLedgerRecord | null,
  correctionsByLedgerId: Map<string, Map<string, CorrectionAppliedValue>>,
): DailyReportAnalysisLedger | null {
  if (!ledger) return null;
  const summary = toReportLedgerCalculationSummary(
    ledger,
    correctionsByLedgerId.get(ledger.id),
  );

  return {
    ledgerId: ledger.id,
    status: ledger.status,
    totalSales: summary.applied.totalSales,
    inventoryItems: summary.inventoryItems,
    appliedCorrectionKeys: summary.appliedCorrectionKeys,
    workerCount: summary.workerCount,
    ledgerLaborItems: ledger.ledgerLaborItems ?? [],
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

export function sortStoreComparisonReportRowsForTest(
  rows: StoreComparisonReportRow[],
) {
  return [...rows].sort((left, right) => {
    const salesDelta =
      getSortableMetricValue(right.salesAmount) -
      getSortableMetricValue(left.salesAmount);

    if (salesDelta !== 0) {
      return salesDelta;
    }

    const statusDelta =
      getStoreComparisonIssueCount(right) - getStoreComparisonIssueCount(left);

    if (statusDelta !== 0) {
      return statusDelta;
    }

    return left.storeName.localeCompare(right.storeName, "ko-KR");
  });
}

function getSortableMetricValue(metric: LedgerReviewMetric) {
  return metric.value ?? Number.NEGATIVE_INFINITY;
}

function getStoreComparisonIssueCount(row: StoreComparisonReportRow) {
  return (
    row.statusCounts.missingDayCount +
    row.statusCounts.inProgressCount +
    row.statusCounts.reviewCount +
    row.statusCounts.holidayCount +
    (row.hasUnappliedCorrections ? 1 : 0)
  );
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

const purchaseCorrectionMatchers = [
  { targetType: "PURCHASE_ROW", fieldKey: "unitPrice" },
  { targetType: "PURCHASE_ROW", fieldKey: "quantity" },
  { targetType: "PURCHASE_ROW", fieldKey: "amount" },
  { targetType: "PURCHASE_ROW", fieldKey: "productName" },
  { targetType: "PURCHASE_ROW", fieldKey: "referenceInfo" },
] satisfies ComparisonMetricCorrectionMatcher[];

const totalSalesCorrectionMatchers = [
  { targetType: "PAYMENT_FIELD", fieldKey: "totalSalesAmount" },
] satisfies ComparisonMetricCorrectionMatcher[];

const comparisonMetricCorrectionMatchers = {
  salesAmount: totalSalesCorrectionMatchers,
  purchase: purchaseCorrectionMatchers,
  grossProfit: [
    ...totalSalesCorrectionMatchers,
    ...purchaseCorrectionMatchers,
    ...inventoryCorrectionMatchers,
  ],
  grossMarginRate: [
    ...totalSalesCorrectionMatchers,
    ...purchaseCorrectionMatchers,
    ...inventoryCorrectionMatchers,
    { targetType: "CALCULATED_METRIC", fieldKey: "grossMarginRate" },
  ],
  operatingProfit: [
    ...totalSalesCorrectionMatchers,
    ...purchaseCorrectionMatchers,
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
    return aggregateUnavailableMetric(
      metrics,
      "합계 계산에 필요한 장부 데이터가 부족합니다.",
    );
  }

  const values = metrics.map((metric) => metric.value ?? 0);

  return metrics.length === 0
    ? dataInsufficient("합계 계산 대상 장부가 없습니다.")
    : available(values.reduce((sum, value) => sum + value, 0));
}

function averageMetric(metrics: LedgerReviewMetric[]): LedgerReviewMetric {
  if (metrics.some((metric) => metric.value === null)) {
    return aggregateUnavailableMetric(
      metrics,
      "평균 계산에 필요한 장부 데이터가 부족합니다.",
    );
  }

  const values = metrics.map((metric) => metric.value ?? 0);

  return metrics.length === 0
    ? dataInsufficient("평균 계산 대상 장부가 없습니다.")
    : available(
        Math.round(
          values.reduce((sum, value) => sum + value, 0) / values.length,
        ),
      );
}

function aggregateUnavailableMetric(
  metrics: LedgerReviewMetric[],
  dataInsufficientReason: string,
): LedgerReviewMetric {
  if (metrics.some((metric) => metric.status === "policy-unconfirmed")) {
    return unavailable("계산 기준 확인 필요");
  }

  if (metrics.some((metric) => metric.status === "calculation-unavailable")) {
    return unavailable("계산 불가");
  }

  return dataInsufficient(dataInsufficientReason);
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
  return { value, status: "ok" };
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
  plannedSalesItems,
}: {
  store: ReportStoreRecord;
  ledger: ReportLedgerRecord | null;
  closingDate: Date;
  thresholdSettings: AnomalyThresholdSignalSettings | null;
  evaluateRevenueAnomalySignals: EvaluateRevenueAnomalySignals;
  evaluateInventoryLossAnomalySignals: EvaluateInventoryLossAnomalySignals;
  corrections?: Map<string, CorrectionAppliedValue>;
  plannedSalesItems?: LedgerReviewPlannedSalesInput[];
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
          plannedSalesItems,
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
    totalSales: dataInsufficient("장부 입력 전이라 총매출 데이터가 없습니다."),
    grossMarginRate: dataInsufficient(
      "장부 입력 전이라 마진율 데이터가 없습니다.",
    ),
    salesDifference: dataInsufficient(
      "장부 입력 전이라 매출차액 데이터가 없습니다.",
    ),
  };

  const rowWithoutEvidence = {
    storeId: store.id,
    storeName: store.name,
    ledgerId: null,
    closingDate: closingDate.toISOString(),
    businessStatus: mapDashboardBusinessStatus(null),
    ledgerStatus: mapDashboardLedgerStatus(null),
    salesAmount: metrics.totalSales,
    analysisSalesAmount: dataInsufficient(
      "장부 입력 전이라 분석 매출 데이터가 없습니다.",
    ),
    grossMarginRate: metrics.grossMarginRate,
    expectedGrossMarginRate: dataInsufficient(
      "장부 입력 전이라 예상 마진율 데이터가 없습니다.",
    ),
    marginDisplay: buildMarginDisplay(
      thresholdSettings,
      metrics.totalSales,
      metrics.grossMarginRate,
    ),
    analysisMarginDisplay: buildMarginDisplay(
      null,
      metrics.totalSales,
      dataInsufficient("장부 입력 전이라 분석 이익률 데이터가 없습니다."),
    ),
    salesDifference: metrics.salesDifference,
    hasLoss: null,
    latestReflectedAt: null,
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
  plannedSalesItems,
}: {
  store: ReportStoreRecord;
  ledger: ReportLedgerRecord;
  thresholdSettings: AnomalyThresholdSignalSettings | null;
  evaluateRevenueAnomalySignals: EvaluateRevenueAnomalySignals;
  evaluateInventoryLossAnomalySignals: EvaluateInventoryLossAnomalySignals;
  corrections?: Map<string, CorrectionAppliedValue>;
  plannedSalesItems?: LedgerReviewPlannedSalesInput[];
}): ReportRowWithoutPriority {
  const calculation = toReportLedgerCalculationSummary(
    ledger,
    corrections,
    plannedSalesItems,
  );
  const originalSummary = calculation.original;
  const reviewSummary = calculation.applied;
  const correctionState = {
    appliedCorrectionCount: calculation.appliedCorrectionCount,
    hasAppliedCorrections: calculation.appliedCorrectionCount > 0,
    hasUnappliedCorrections: calculation.hasUnappliedCorrections,
  };
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
              calculation.inventoryItems,
            ),
            inventoryAdjustments: calculation.inventoryAdjustments,
            lossItems: calculation.lossItems,
          },
          evaluateRevenueAnomalySignals,
          evaluateInventoryLossAnomalySignals,
          correctionState,
        });

  const originalHasLoss = ledger.ledgerLossItems.some(
    (item) => item.quantity > 0 || item.amount > 0,
  );
  const appliedHasLoss = calculation.lossItems.some(
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
    analysisSalesAmount: reviewSummary.plannedSalesTotal,
    grossMarginRate: reviewSummary.grossMarginRate,
    expectedGrossMarginRate: reviewSummary.plannedGrossMarginRate,
    marginDisplay: buildMarginDisplay(
      ledger.status === "HOLIDAY" ? null : thresholdSettings,
      reviewSummary.totalSales,
      reviewSummary.grossMarginRate,
    ),
    analysisMarginDisplay: buildMarginDisplay(
      ledger.status === "HOLIDAY" ? null : thresholdSettings,
      reviewSummary.plannedSalesTotal,
      reviewSummary.plannedGrossMarginRate,
    ),
    salesDifference: reviewSummary.salesDifference,
    hasLoss: appliedHasLoss,
    latestReflectedAt: getLatestReflectedAt(ledger.updatedAt, corrections),
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
        appliedKeys: calculation.appliedCorrectionKeys,
        unappliedKeys: calculation.unappliedCorrectionKeys,
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
      applied.value === null
        ? (applied.reason ?? applied.label ?? applied.unavailableReason ?? null)
        : null,
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
    ...purchaseCorrectionMatchers,
    { targetType: "INVENTORY_ROW", fieldKey: "currentQuantity" },
    { targetType: "INVENTORY_ROW", fieldKey: "quantity" },
    { targetType: "CALCULATED_METRIC", fieldKey: "grossMarginRate" },
  ]);
  const salesDifferenceCorrections = getMetricCorrectionState(correctionState, [
    { targetType: "PAYMENT_FIELD", fieldKey: "totalSalesAmount" },
    ...purchaseCorrectionMatchers,
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
      original:
        originalHasLoss === null
          ? unavailable("계산 불가")
          : available(originalHasLoss ? 1 : 0),
      applied:
        appliedHasLoss === null
          ? unavailable("계산 불가")
          : available(appliedHasLoss ? 1 : 0),
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

function getLatestReflectedAt(
  ledgerUpdatedAt: Date,
  corrections?: Map<string, CorrectionAppliedValue>,
) {
  let latestTime = ledgerUpdatedAt.getTime();

  for (const correction of corrections?.values() ?? []) {
    const correctionTime = Date.parse(correction.createdAt);

    if (Number.isFinite(correctionTime) && correctionTime > latestTime) {
      latestTime = correctionTime;
    }
  }

  return new Date(latestTime).toISOString();
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
    applied.status === "policy-unconfirmed" ||
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
      return applied.label ?? "데이터 부족";
    case "needs-review":
      return applied.unavailableReason ?? applied.label ?? "정정 확인 필요";
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
  const status =
    unavailableReason === "계산 기준 확인 필요"
      ? "policy-unconfirmed"
      : "calculation-unavailable";

  return {
    value: null,
    status,
    label: status === "policy-unconfirmed" ? "확인 필요" : "계산 불가",
    unavailableReason,
  };
}

function dataInsufficient(reason: string): LedgerReviewMetric {
  return {
    value: null,
    status: "data-insufficient",
    label: "데이터 부족",
    unavailableReason: "계산 불가",
    reason,
  };
}

function emptyCorrectionState(): HqDashboardRow["correctionState"] {
  return {
    appliedCorrectionCount: 0,
    hasAppliedCorrections: false,
    hasUnappliedCorrections: false,
  };
}
