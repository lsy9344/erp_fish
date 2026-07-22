import { StoreAccessMode } from "../../../generated/prisma/index.js";
import type { DailyLedgerStatus } from "../../../generated/prisma/index.js";
import {
  applyCorrectionValuesToLedgerReviewInput,
  calculateExpenseTotal,
  calculateLedgerReviewSummary,
  calculatePaymentTotal,
  type LedgerReviewCorrectionOverlayResult,
  type LedgerReviewInventoryInput,
  type LedgerReviewMetric,
} from "../../server/calculations/ledger.ts";
// OQ-gated calculation policy is centralized in ../../server/calculations/policy-gates.
import {
  calculateInventoryAdjustment,
  calculateInventoryAmount,
  calculateSystemInventoryQuantity,
} from "../../server/calculations/inventory.ts";
import {
  calculateMarginShortfall,
  formatMarginShortfallAmount,
} from "../../server/calculations/anomaly.ts";
import type {
  AnomalySignalSummary,
  AnomalyThresholdSignalSettings,
  evaluateInventoryLossAnomalySignals as evaluateInventoryLossAnomalySignalsFunction,
  evaluateRevenueAnomalySignals as evaluateRevenueAnomalySignalsFunction,
} from "../../server/calculations/anomaly.ts";
import { mapLedgerStatus } from "../ledger/status.ts";
import { getLedgerReviewMissingItems } from "../ledger/review-validation.ts";
import type { LedgerReviewMissingItem } from "../ledger/review-types.ts";
import type {
  DashboardBusinessStatus,
  DashboardDatePreset,
  DashboardDensity,
  DashboardEmptyStateReason,
  DashboardFilterMode,
  DashboardLedgerStatus,
  DashboardMarginDisplay,
  DashboardSortMode,
  HqDashboardData,
  HqDashboardPriority,
  HqDashboardRow,
  HqDashboardSummary,
} from "./types.ts";
import type { CorrectionAppliedValue } from "../corrections/types.ts";
import {
  decimalToNumber,
  nullableDecimalToNumber,
  type DecimalNumber,
} from "../../lib/decimal.ts";

const SEOUL_TIME_ZONE = "Asia/Seoul";
type HqDashboardRowWithoutPriority = Omit<HqDashboardRow, "priority">;

// WO-14 part2(2026-06-29): 분석 매출 계산용 planned-sales 입력. calculateLedgerReviewSummary가
// 이 입력으로 plannedSalesTotal(판매한 가격 기준 추정 매출 = 장부 AE4)을 산출한다.
type DashboardPlannedSalesItem = {
  productId?: string;
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number;
  currentQuantity: number | null;
  quantity: number | null;
  plannedUnitPrice: number | null;
};

async function buildDashboardPlannedSalesItems(
  ledgers: Array<{
    id: string;
    storeId: string;
    closingDate: Date;
    ledgerInventoryItems: Array<{
      productId: string | null;
      previousQuantity: number;
      purchasedQuantity: number;
      currentQuantity: number | null;
      quantity: number | null;
    }>;
    ledgerLossItems: Array<{ productId: string | null; quantity: number }>;
  }>,
): Promise<Map<string, DashboardPlannedSalesItem[]>> {
  const result = new Map<string, DashboardPlannedSalesItem[]>();

  if (ledgers.length === 0) {
    return result;
  }

  const { getPlannedUnitPriceLookup } =
    await import("../sales-plan/queries.ts");
  const plannedUnitPriceLookup = await getPlannedUnitPriceLookup(
    ledgers.map((ledger) => ({
      storeId: ledger.storeId,
      businessDate: ledger.closingDate,
    })),
  );

  for (const ledger of ledgers) {
    // 손실 수량을 productId별로 합산해 판매량(전일+매입-손실-당일재고)에서 차감한다.
    const lossByProductId = new Map<string, number>();
    for (const loss of ledger.ledgerLossItems) {
      if (loss.productId) {
        lossByProductId.set(
          loss.productId,
          (lossByProductId.get(loss.productId) ?? 0) + loss.quantity,
        );
      }
    }

    result.set(
      ledger.id,
      ledger.ledgerInventoryItems.map((item) => ({
        productId: item.productId ?? undefined,
        previousQuantity: item.previousQuantity,
        purchasedQuantity: item.purchasedQuantity,
        lossQuantity: item.productId
          ? (lossByProductId.get(item.productId) ?? 0)
          : 0,
        currentQuantity: item.currentQuantity,
        quantity: item.quantity,
        plannedUnitPrice: item.productId
          ? plannedUnitPriceLookup(
              ledger.storeId,
              ledger.closingDate,
              item.productId,
            )
          : null,
      })),
    );
  }

  return result;
}
type EvaluateRevenueAnomalySignals =
  typeof evaluateRevenueAnomalySignalsFunction;
type EvaluateInventoryLossAnomalySignals =
  typeof evaluateInventoryLossAnomalySignalsFunction;
type DashboardRevenueCurrent = {
  totalSales: LedgerReviewMetric;
  grossMarginRate: LedgerReviewMetric;
  salesDifference: LedgerReviewMetric;
};
type DashboardStoreRecord = {
  id: string;
  name: string;
};

type DashboardLedgerRecord = {
  id: string;
  storeId: string;
  closingDate: Date;
  status: DailyLedgerStatus;
  totalSalesAmount: number;
  carryoverSalesAmount: number;
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
    quantity: number;
    amount: number;
  }[];
  _count: {
    ledgerLossItems: number;
    ledgerPurchaseItems: number;
  };
};

type DashboardLedgerRecordSource = Omit<
  DashboardLedgerRecord,
  "ledgerInventoryItems" | "ledgerInventoryAdjustments" | "ledgerLossItems"
> & {
  ledgerInventoryItems: Array<
    Omit<
      DashboardLedgerRecord["ledgerInventoryItems"][number],
      "previousQuantity" | "purchasedQuantity" | "currentQuantity" | "quantity"
    > & {
      previousQuantity: DecimalNumber;
      purchasedQuantity: DecimalNumber;
      currentQuantity: DecimalNumber | null;
      quantity: DecimalNumber | null;
    }
  >;
  ledgerInventoryAdjustments: Array<
    Omit<
      DashboardLedgerRecord["ledgerInventoryAdjustments"][number],
      "beforeQuantity" | "afterQuantity" | "differenceQuantity"
    > & {
      beforeQuantity: DecimalNumber;
      afterQuantity: DecimalNumber;
      differenceQuantity: DecimalNumber;
    }
  >;
  ledgerLossItems: Array<
    Omit<DashboardLedgerRecord["ledgerLossItems"][number], "quantity"> & {
      quantity: DecimalNumber;
    }
  >;
};

function toDashboardLedgerRecord<T extends DashboardLedgerRecordSource>(
  ledger: T,
): Omit<
  T,
  "ledgerInventoryItems" | "ledgerInventoryAdjustments" | "ledgerLossItems"
> &
  DashboardLedgerRecord {
  return {
    ...ledger,
    ledgerInventoryItems: ledger.ledgerInventoryItems.map((item) => ({
      ...item,
      previousQuantity: decimalToNumber(item.previousQuantity),
      purchasedQuantity: decimalToNumber(item.purchasedQuantity),
      currentQuantity: nullableDecimalToNumber(item.currentQuantity),
      quantity: nullableDecimalToNumber(item.quantity),
    })),
    ledgerInventoryAdjustments: ledger.ledgerInventoryAdjustments.map(
      (adjustment) => ({
        ...adjustment,
        beforeQuantity: decimalToNumber(adjustment.beforeQuantity),
        afterQuantity: decimalToNumber(adjustment.afterQuantity),
        differenceQuantity: decimalToNumber(adjustment.differenceQuantity),
      }),
    ),
    ledgerLossItems: ledger.ledgerLossItems.map((item) => ({
      ...item,
      quantity: decimalToNumber(item.quantity),
    })),
  };
}

export function getDashboardDatePreset(value: unknown): DashboardDatePreset {
  return value === "yesterday" ? "yesterday" : "today";
}

export function getDashboardSortMode(value: unknown): DashboardSortMode {
  return value === "store-name" ? "store-name" : "priority";
}

export function getDashboardFilterMode(value: unknown): DashboardFilterMode {
  return value === "needs-attention" ? "needs-attention" : "all";
}

// WO-07(2026-06-22): density URL 파라미터를 정규화한다. 기본값은 "default".
export function getDashboardDensity(value: unknown): DashboardDensity {
  return value === "wide" || value === "compact" ? value : "default";
}

export function getDashboardPath({
  datePreset,
  sortMode,
  filterMode,
  density = "default",
}: {
  datePreset: DashboardDatePreset;
  sortMode: DashboardSortMode;
  filterMode: DashboardFilterMode;
  density?: DashboardDensity;
}) {
  return `/app/dashboard?date=${datePreset}&sort=${sortMode}&filter=${filterMode}&density=${density}`;
}

export function getDashboardDate(
  datePreset: DashboardDatePreset,
  inputDate = new Date(),
) {
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

  if (datePreset === "yesterday") {
    date.setUTCDate(date.getUTCDate() - 1);
  }

  return date;
}

export function mapDashboardLedgerStatus(
  status: DailyLedgerStatus | null,
): DashboardLedgerStatus {
  return mapLedgerStatus(status);
}

export function mapDashboardBusinessStatus(
  status: DailyLedgerStatus | null,
): DashboardBusinessStatus {
  if (status === "HOLIDAY") {
    return { key: "HOLIDAY", label: "휴무일" };
  }

  if (status === null) {
    return { key: "UNKNOWN", label: "확인 필요" };
  }

  return { key: "OPEN", label: "영업일" };
}

export async function getHqDashboardRows({
  datePreset = "today",
  sortMode = "priority",
  filterMode = "all",
}: {
  datePreset?: DashboardDatePreset;
  sortMode?: DashboardSortMode;
  filterMode?: DashboardFilterMode;
} = {}): Promise<HqDashboardData> {
  const { getHeadquartersStoreScope, requireReportAccess } =
    await import("../../server/authz.ts");
  await requireReportAccess();
  const storeScope = await getHeadquartersStoreScope();

  const preset = getDashboardDatePreset(datePreset);
  const normalizedSortMode = getDashboardSortMode(sortMode);
  const normalizedFilterMode = getDashboardFilterMode(filterMode);
  const closingDate = getDashboardDate(preset);
  const { db } = await import("../../server/db.ts");
  const { getAnomalyThresholdSettingsForSignals } =
    await import("./threshold-queries.ts");
  const { getLatestCorrectionValuesForLedgers } =
    await import("../corrections/queries.ts");
  const { evaluateInventoryLossAnomalySignals, evaluateRevenueAnomalySignals } =
    await import("../../server/calculations/anomaly.ts");
  const [stores, thresholdSettings] = await Promise.all([
    Promise.resolve(storeScope.stores),
    getAnomalyThresholdSettingsForSignals(),
  ]);
  const storeIds = stores.map((store) => store.id);
  const rawLedgers =
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
            carryoverSalesAmount: true,
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
                productId: true,
                ledgerInventoryItemId: true,
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
            _count: {
              select: {
                ledgerLossItems: true,
                ledgerPurchaseItems: true,
              },
            },
          },
        });
  const ledgers = rawLedgers.map(toDashboardLedgerRecord);
  const correctionValuesByLedgerId = await getLatestCorrectionValuesForLedgers(
    ledgers.map((ledger) => ledger.id),
  );
  const ledgerByStoreId = new Map<string, DashboardLedgerRecord>(
    ledgers.map((ledger) => [ledger.storeId, ledger]),
  );
  // WO-14 part2(2026-06-29): 분석 매출(판매한 가격 기준 추정 매출)을 매출 셀에 함께 보여주기 위해
  // 각 마감의 판매한 가격을 일괄 조회해 ledger별 planned-sales 입력을 만든다.
  const plannedSalesItemsByLedgerId =
    await buildDashboardPlannedSalesItems(ledgers);
  const baseRows = stores.map((store) => {
    const ledger = ledgerByStoreId.get(store.id) ?? null;

    return toDashboardRow(
      store,
      ledger,
      closingDate,
      thresholdSettings,
      evaluateRevenueAnomalySignals,
      evaluateInventoryLossAnomalySignals,
      correctionValuesByLedgerId.get(ledger?.id ?? ""),
      ledger ? plannedSalesItemsByLedgerId.get(ledger.id) : undefined,
    );
  });
  const allRows = applyDashboardPresentation(baseRows, {
    sortMode: "store-name",
    filterMode: "all",
  });
  const rows = applyDashboardPresentation(baseRows, {
    sortMode: normalizedSortMode,
    filterMode: normalizedFilterMode,
  });

  return {
    datePreset: preset,
    sortMode: normalizedSortMode,
    filterMode: normalizedFilterMode,
    closingDate: closingDate.toISOString(),
    rows,
    summary: summarizeDashboardRows(allRows),
    emptyStateReason: getDashboardEmptyStateReason({
      storeScopeMode: storeScope.mode,
      totalStoreCount: allRows.length,
      rowCount: rows.length,
    }),
  };
}

export function applyDashboardPresentation(
  rows: HqDashboardRowWithoutPriority[],
  {
    sortMode,
    filterMode,
  }: {
    sortMode: DashboardSortMode;
    filterMode: DashboardFilterMode;
  },
): HqDashboardRow[] {
  const rowsWithPriority = rows.map((row) => ({
    ...row,
    priority: getDashboardPriority(row),
  }));
  const filteredRows =
    filterMode === "needs-attention"
      ? rowsWithPriority.filter((row) => row.priority.rank < 90)
      : rowsWithPriority;

  return [...filteredRows].sort((left, right) => {
    if (sortMode === "store-name") {
      return compareDashboardRowsByStore(left, right);
    }

    return (
      left.priority.rank - right.priority.rank ||
      compareDashboardRowsByStore(left, right)
    );
  });
}

function getDashboardPriority(
  row: HqDashboardRowWithoutPriority,
): HqDashboardPriority {
  const criticalSignals = row.signals.filter(
    (signal) => signal.severity === "critical",
  );
  if (criticalSignals.length > 0) {
    return {
      rank: 10,
      label: "심각 이상",
      reasons: criticalSignals.map((signal) => signal.label),
    };
  }

  const warningSignals = row.signals.filter(
    (signal) => signal.severity === "warning",
  );
  if (warningSignals.length > 0) {
    return {
      rank: 20,
      label: "경고 이상",
      reasons: warningSignals.map((signal) => signal.label),
    };
  }

  const infoSignals = row.signals.filter(
    (signal) => signal.severity === "info",
  );
  if (infoSignals.length > 0) {
    return {
      rank: 25,
      label: "확인 필요",
      reasons: infoSignals.map((signal) => signal.label),
    };
  }

  if (row.ledgerStatus.key === "IN_REVIEW") {
    return { rank: 30, label: "검토 대기", reasons: ["본사 검토 필요"] };
  }

  if (row.ledgerStatus.key === "IN_PROGRESS") {
    return { rank: 40, label: "입력 중", reasons: ["미마감"] };
  }

  if (row.ledgerStatus.key === "EMPTY") {
    return { rank: 50, label: "미입력", reasons: ["장부 입력 전"] };
  }

  if (row.ledgerStatus.key === "HOLIDAY") {
    return { rank: 100, label: "휴무", reasons: ["휴무일"] };
  }

  return { rank: 90, label: "정상", reasons: ["이상 신호 없음"] };
}

function compareDashboardRowsByStore(
  left: Pick<HqDashboardRow, "storeName" | "storeId">,
  right: Pick<HqDashboardRow, "storeName" | "storeId">,
) {
  return (
    left.storeName.localeCompare(right.storeName, "ko-KR") ||
    left.storeId.localeCompare(right.storeId)
  );
}

function toDashboardRow(
  store: DashboardStoreRecord,
  ledger: DashboardLedgerRecord | null,
  closingDate: Date,
  thresholdSettings: AnomalyThresholdSignalSettings | null,
  evaluateRevenueAnomalySignals: EvaluateRevenueAnomalySignals,
  evaluateInventoryLossAnomalySignals: EvaluateInventoryLossAnomalySignals,
  corrections?: Map<string, CorrectionAppliedValue>,
  // WO-14 part2(2026-06-29): 분석 매출(plannedSalesTotal) 계산용 입력.
  plannedSalesItems?: DashboardPlannedSalesItem[],
): HqDashboardRowWithoutPriority {
  if (ledger === null) {
    const metrics = {
      totalSales: dataInsufficient(
        "장부 입력 전이라 총매출 데이터가 없습니다.",
      ),
      grossMarginRate: dataInsufficient(
        "장부 입력 전이라 마진율 데이터가 없습니다.",
      ),
      salesDifference: dataInsufficient(
        "장부 입력 전이라 매출차액 데이터가 없습니다.",
      ),
    };

    return {
      storeId: store.id,
      storeName: store.name,
      ledgerId: null,
      closingDate: closingDate.toISOString(),
      businessStatus: mapDashboardBusinessStatus(null),
      ledgerStatus: mapDashboardLedgerStatus(null),
      salesAmount: metrics.totalSales,
      closingSalesAmount: metrics.totalSales,
      carryoverSalesAmount: dataInsufficient(
        "장부 입력 전이라 이월 매출 데이터가 없습니다.",
      ),
      operatingSalesAmount: metrics.totalSales,
      analysisSalesAmount: dataInsufficient(
        "장부 입력 전이라 분석 매출 데이터가 없습니다.",
      ),
      grossMarginRate: metrics.grossMarginRate,
      marginDisplay: buildMarginDisplay(
        thresholdSettings,
        metrics.totalSales,
        metrics.grossMarginRate,
      ),
      // 장부 입력 전이라 분석 이익률도 계산 불가다.
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
      signals: [],
    };
  }

  const correctionOverlay = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: ledger.id,
    reviewInput: {
      totalSalesAmount: ledger.totalSalesAmount,
      carryoverSalesAmount: ledger.carryoverSalesAmount,
      cashAmount: ledger.cashAmount,
      cardAmount: ledger.cardAmount,
      otherPaymentAmount: ledger.otherPaymentAmount,
      workerCount: ledger.workerCount,
      expenseTotal: calculateExpenseTotal(
        ledger.ledgerExpenses.map((item) => item.amount),
      ),
      inventoryItems: ledger.ledgerInventoryItems,
    },
    expenseItems: ledger.ledgerExpenses,
    lossItems: ledger.ledgerLossItems,
    corrections: corrections?.values() ?? [],
  });
  const correctionState = correctionOverlay.correctionState;
  const hasLoss = hasCorrectedLoss(correctionOverlay.lossItems);
  const inventoryAdjustments = toCorrectedInventoryAdjustments(
    ledger.ledgerInventoryAdjustments,
    correctionOverlay,
  );
  const reviewSummary = calculateLedgerReviewSummary({
    ...correctionOverlay.reviewInput,
    inventoryAdjustments,
    lossItems: correctionOverlay.lossItems,
    plannedSalesItems,
  });
  const missingItems = getLedgerReviewMissingItems({
    storeId: store.id,
    closingDate: ledger.closingDate.toISOString(),
    totalSalesAmount: correctionOverlay.reviewInput.totalSalesAmount,
    carryoverSalesAmount: correctionOverlay.reviewInput.carryoverSalesAmount,
    paymentTotal: calculatePaymentTotal(
      correctionOverlay.reviewInput.cashAmount,
      correctionOverlay.reviewInput.cardAmount,
      correctionOverlay.reviewInput.otherPaymentAmount,
    ),
    expenseCount: ledger.ledgerExpenses.length,
    purchaseCount: ledger._count.ledgerPurchaseItems,
    hasInventoryUnavailable: hasInventoryUnavailable(
      correctionOverlay.reviewInput.inventoryItems,
    ),
    inventoryCount: correctionOverlay.reviewInput.inventoryItems.length,
    lossCount: correctionOverlay.lossItems.length,
    workerCount: correctionOverlay.reviewInput.workerCount,
  });
  const signals =
    ledger.status === "HOLIDAY"
      ? []
      : getDashboardSignals({
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
          missingItems,
        });

  return {
    storeId: store.id,
    storeName: store.name,
    ledgerId: ledger.id,
    closingDate: ledger.closingDate.toISOString(),
    businessStatus: mapDashboardBusinessStatus(ledger.status),
    ledgerStatus: mapDashboardLedgerStatus(ledger.status),
    salesAmount: reviewSummary.totalSales,
    closingSalesAmount: reviewSummary.closingTotalSales,
    carryoverSalesAmount: reviewSummary.carryoverSales,
    operatingSalesAmount: reviewSummary.operatingSales,
    analysisSalesAmount: reviewSummary.plannedSalesTotal,
    grossMarginRate: reviewSummary.grossMarginRate,
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
    hasLoss,
    latestReflectedAt: getLatestReflectedAt(ledger.updatedAt, corrections),
    lastModifiedBy: ledger.updatedBy,
    lastModifiedAt: ledger.updatedAt.toISOString(),
    isHeadquartersClosed: ledger.status === "HEADQUARTERS_CLOSED",
    correctionState,
    signals,
  };
}

export async function getHqLedgerDetail(ledgerId: string) {
  const { getHeadquartersStoreScope, requireReportAccess } =
    await import("../../server/authz.ts");
  await requireReportAccess();
  const storeScope = await getHeadquartersStoreScope();

  const { db } = await import("../../server/db.ts");
  const { getAnomalyThresholdSettingsForSignals } =
    await import("./threshold-queries.ts");
  const { getLatestCorrectionValuesForLedger } =
    await import("../corrections/queries.ts");
  const { evaluateInventoryLossAnomalySignals, evaluateRevenueAnomalySignals } =
    await import("../../server/calculations/anomaly.ts");
  const [rawLedger, thresholdSettings] = await Promise.all([
    db.dailyLedger.findFirst({
      where: { id: ledgerId, storeId: { in: storeScope.storeIds } },
      select: {
        id: true,
        storeId: true,
        closingDate: true,
        status: true,
        totalSalesAmount: true,
        carryoverSalesAmount: true,
        cashAmount: true,
        cardAmount: true,
        otherPaymentAmount: true,
        workerCount: true,
        updatedAt: true,
        closedAt: true,
        store: {
          select: {
            id: true,
            name: true,
          },
        },
        updatedBy: {
          select: {
            name: true,
            email: true,
          },
        },
        closedBy: {
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
            productId: true,
            ledgerInventoryItemId: true,
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
        _count: {
          select: {
            ledgerLossItems: true,
            ledgerPurchaseItems: true,
          },
        },
      },
    }),
    getAnomalyThresholdSettingsForSignals(),
  ]);

  if (!rawLedger) {
    return null;
  }

  const ledger = toDashboardLedgerRecord(rawLedger);

  const corrections = await getLatestCorrectionValuesForLedger(ledger.id);
  const correctionOverlay = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: ledger.id,
    reviewInput: {
      totalSalesAmount: ledger.totalSalesAmount,
      carryoverSalesAmount: ledger.carryoverSalesAmount,
      cashAmount: ledger.cashAmount,
      cardAmount: ledger.cardAmount,
      otherPaymentAmount: ledger.otherPaymentAmount,
      workerCount: ledger.workerCount,
      expenseTotal: calculateExpenseTotal(
        ledger.ledgerExpenses.map((item) => item.amount),
      ),
      inventoryItems: ledger.ledgerInventoryItems,
    },
    expenseItems: ledger.ledgerExpenses,
    lossItems: ledger.ledgerLossItems,
    corrections: corrections?.values() ?? [],
  });
  const correctionState = correctionOverlay.correctionState;
  const inventoryAdjustments = toCorrectedInventoryAdjustments(
    ledger.ledgerInventoryAdjustments,
    correctionOverlay,
  );
  const correctedReviewSummary = calculateLedgerReviewSummary({
    ...correctionOverlay.reviewInput,
    inventoryAdjustments,
    lossItems: correctionOverlay.lossItems,
  });
  const missingItems = getLedgerReviewMissingItems({
    storeId: ledger.store.id,
    closingDate: ledger.closingDate.toISOString(),
    totalSalesAmount: correctionOverlay.reviewInput.totalSalesAmount,
    carryoverSalesAmount: correctionOverlay.reviewInput.carryoverSalesAmount,
    paymentTotal: calculatePaymentTotal(
      correctionOverlay.reviewInput.cashAmount,
      correctionOverlay.reviewInput.cardAmount,
      correctionOverlay.reviewInput.otherPaymentAmount,
    ),
    expenseCount: ledger.ledgerExpenses.length,
    purchaseCount: ledger._count.ledgerPurchaseItems,
    hasInventoryUnavailable: hasInventoryUnavailable(
      correctionOverlay.reviewInput.inventoryItems,
    ),
    inventoryCount: correctionOverlay.reviewInput.inventoryItems.length,
    lossCount: correctionOverlay.lossItems.length,
    workerCount: correctionOverlay.reviewInput.workerCount,
  });
  const signals =
    ledger.status === "HOLIDAY"
      ? []
      : getDashboardSignals({
          thresholdSettings,
          revenueCurrent: {
            totalSales: correctedReviewSummary.totalSales,
            grossMarginRate: correctedReviewSummary.grossMarginRate,
            salesDifference: correctedReviewSummary.salesDifference,
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
          missingItems,
        });

  return {
    ledgerId: ledger.id,
    storeId: ledger.store.id,
    storeName: ledger.store.name,
    closingDate: ledger.closingDate.toISOString(),
    businessStatus: mapDashboardBusinessStatus(ledger.status),
    ledgerStatus: mapDashboardLedgerStatus(ledger.status),
    salesAmount: correctedReviewSummary.totalSales,
    closingSalesAmount: correctedReviewSummary.closingTotalSales,
    carryoverSalesAmount: correctedReviewSummary.carryoverSales,
    operatingSalesAmount: correctedReviewSummary.operatingSales,
    analysisSalesAmount: correctedReviewSummary.plannedSalesTotal,
    grossMarginRate: correctedReviewSummary.grossMarginRate,
    marginDisplay: buildMarginDisplay(
      ledger.status === "HOLIDAY" ? null : thresholdSettings,
      correctedReviewSummary.totalSales,
      correctedReviewSummary.grossMarginRate,
    ),
    analysisMarginDisplay: buildMarginDisplay(
      ledger.status === "HOLIDAY" ? null : thresholdSettings,
      correctedReviewSummary.plannedSalesTotal,
      correctedReviewSummary.plannedGrossMarginRate,
    ),
    salesDifference: correctedReviewSummary.salesDifference,
    hasLoss: hasCorrectedLoss(correctionOverlay.lossItems),
    latestReflectedAt: getLatestReflectedAt(ledger.updatedAt, corrections),
    lastModifiedBy: ledger.updatedBy,
    lastModifiedAt: ledger.updatedAt.toISOString(),
    closedBy: ledger.closedBy,
    closedAt: ledger.closedAt?.toISOString() ?? null,
    isHeadquartersClosed: ledger.status === "HEADQUARTERS_CLOSED",
    correctionState,
    signals,
  };
}

export function getDashboardSignals({
  thresholdSettings,
  revenueCurrent,
  inventoryLossCurrent,
  evaluateRevenueAnomalySignals,
  evaluateInventoryLossAnomalySignals,
  correctionState = emptyCorrectionState(),
  missingItems = [],
}: {
  thresholdSettings: AnomalyThresholdSignalSettings | null;
  revenueCurrent: DashboardRevenueCurrent;
  inventoryLossCurrent: Parameters<EvaluateInventoryLossAnomalySignals>[0]["current"];
  evaluateRevenueAnomalySignals: EvaluateRevenueAnomalySignals;
  evaluateInventoryLossAnomalySignals: EvaluateInventoryLossAnomalySignals;
  correctionState?: HqDashboardRow["correctionState"];
  missingItems?: LedgerReviewMissingItem[];
}) {
  const missingSignals = missingItems
    .filter((item) => item.status === "missing")
    .map((item) => ({
      id: `required-input-${item.id}`,
      label: "필수 누락",
      severity: "info" as const,
      detail: `${item.label}: ${item.detail}`,
    }));
  const calculationSignals = getMetricStatusSignals(revenueCurrent);
  const anomalyReadyRevenueCurrent =
    toAnomalyReadyRevenueCurrent(revenueCurrent);
  const revenueSignals =
    thresholdSettings === null || anomalyReadyRevenueCurrent
      ? normalizeDashboardAnomalySignals(
          evaluateRevenueAnomalySignals({
            thresholds: thresholdSettings,
            current: anomalyReadyRevenueCurrent ?? revenueCurrent,
            comparison: { policy: null, baseline: null },
          }),
        )
      : [];
  const inventoryLossSignals = thresholdSettings
    ? normalizeDashboardAnomalySignals(
        evaluateInventoryLossAnomalySignals({
          thresholds: thresholdSettings,
          current: inventoryLossCurrent,
        }),
      )
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

  return [
    ...missingSignals,
    ...calculationSignals,
    ...revenueSignals,
    ...inventoryLossSignals,
    ...correctionSignals,
  ];
}

function getMetricStatusSignals(revenueCurrent: DashboardRevenueCurrent) {
  return [
    metricStatusSignal("totalSales", "매출", revenueCurrent.totalSales),
    metricStatusSignal(
      "grossMarginRate",
      "이익률",
      revenueCurrent.grossMarginRate,
    ),
    metricStatusSignal(
      "salesDifference",
      "매출 차액",
      revenueCurrent.salesDifference,
    ),
  ].filter((signal) => signal !== null);
}

function toAnomalyReadyRevenueCurrent(revenueCurrent: DashboardRevenueCurrent) {
  const metrics = [
    revenueCurrent.totalSales,
    revenueCurrent.grossMarginRate,
    revenueCurrent.salesDifference,
  ];

  return metrics.every((metric) => metric.status === "ok")
    ? revenueCurrent
    : null;
}

function metricStatusSignal(
  id: "totalSales" | "grossMarginRate" | "salesDifference",
  metricLabel: string,
  metric: LedgerReviewMetric,
) {
  if (metric.status === "ok") {
    return null;
  }

  // WO-05(2026-06-22): 관제판 신호 라벨은 원문(point_summary.md:14)의
  // 확정 문구로 고정하고, 세부 상태(data-insufficient/policy-unconfirmed 등)는
  // id/detail에만 남겨 혼동을 줄인다.
  const statusLabelByMetric = {
    totalSales: "매출 기준 확인 필요",
    grossMarginRate: "이익률 계산 불가",
    salesDifference: "매출 차액 계산 불가",
  } as const;
  const statusLabel = statusLabelByMetric[id];
  const detail =
    metric.reason ??
    metric.unavailableReason ??
    metric.label ??
    `${metricLabel} 계산 상태 확인이 필요합니다.`;

  return {
    id: `calculation-${id}-${metric.status}`,
    label: statusLabel,
    severity: "info" as const,
    detail: `${metricLabel}: ${detail}`,
  };
}

function normalizeDashboardAnomalySignals(signals: AnomalySignalSummary[]) {
  return signals.map((signal) => {
    const policySignal = policyRequiredSignalByAnomalyId[signal.id];

    if (
      !policySignal ||
      (signal.severity !== "warning" && signal.severity !== "critical")
    ) {
      return signal;
    }

    return {
      ...policySignal,
      severity: "info" as const,
      detail: `${policySignal.detail} 원 후보: ${signal.detail ?? signal.label}`,
    };
  });
}

// 이 맵은 "FIFO 원가/재고금액 같은 정책-의존 신호"를 기준 확인 info로 강등할 때만 사용한다.
// 재고 수량 불일치(inventory-difference-exceeded)는 FIFO 원가 계산 상태와 무관한
// 데이터 품질 사실이다. 원문(point_summary.md:18)은 "재고 오차 허용 제로화 — 단 1개라도
// 틀어지면 무조건 이상 신호 팝업"을 요구하므로, 수량 불일치는 anomaly.ts가 산출한 원래
// severity(critical)를 그대로 노출한다. 따라서 이 맵에서 inventory-difference-exceeded를 제외한다.
// 향후 FIFO 원가가 신호로 노출될 때만 이 맵에 항목을 추가한다.
const policyRequiredSignalByAnomalyId: Record<
  string,
  { id: string; label: string; detail: string }
> = {};

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
  adjustments: DashboardLedgerRecord["ledgerInventoryAdjustments"],
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

function hasCorrectedLoss(lossItems: { quantity: number; amount: number }[]) {
  return lossItems.some((item) => item.quantity > 0 || item.amount > 0);
}

function hasInventoryUnavailable(items: LedgerReviewInventoryInput[]) {
  return items.some(
    (item) =>
      (item.currentQuantity ?? item.quantity) === null ||
      item.inventoryAmount === null,
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

export function summarizeDashboardRows(
  rows: HqDashboardRow[],
): HqDashboardSummary {
  return {
    totalStores: rows.length,
    closedCount: rows.filter((row) => row.isHeadquartersClosed).length,
    reviewCount: rows.filter((row) => row.ledgerStatus.key === "IN_REVIEW")
      .length,
    emptyCount: rows.filter((row) => row.ledgerStatus.key === "EMPTY").length,
    lossCount: rows.filter((row) => row.hasLoss === true).length,
  };
}

function getDashboardEmptyStateReason({
  storeScopeMode,
  totalStoreCount,
  rowCount,
}: {
  storeScopeMode: StoreAccessMode;
  totalStoreCount: number;
  rowCount: number;
}): DashboardEmptyStateReason {
  if (rowCount > 0) {
    return null;
  }

  if (totalStoreCount > 0) {
    return "filtered-empty";
  }

  return storeScopeMode === StoreAccessMode.ASSIGNED_STORES
    ? "no-authorized-stores"
    : "no-active-stores";
}

const marginPercentFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * 미팅 결정(2026-06-21): 마진율을 "현재 / 기준" 형태로 보여주고, 기준 미달 시
 * 미달 금액을 표/카드에 직접 노출한다. 마진 계산은 서버 anomaly 계산을 재사용하고
 * UI에는 라벨만 내려 보낸다. 기준값이 없거나 마진율을 계산할 수 없으면 기준/금액
 * 라벨은 null로 두어 현재 마진율 또는 계산 상태만 깔끔하게 보이게 한다.
 */
export function buildMarginDisplay(
  thresholdSettings: AnomalyThresholdSignalSettings | null,
  totalSales: LedgerReviewMetric,
  grossMarginRate: LedgerReviewMetric,
): DashboardMarginDisplay {
  const currentLabel =
    grossMarginRate.value === null
      ? (grossMarginRate.label ??
        grossMarginRate.unavailableReason ??
        grossMarginRate.reason ??
        "-")
      : `${formatMarginPercent(grossMarginRate.value)}%`;

  if (thresholdSettings === null || grossMarginRate.value === null) {
    return {
      currentLabel,
      targetLabel: null,
      shortfallAmountLabel: null,
    };
  }

  const targetLabel = `${formatMarginPercent(
    thresholdSettings.marginRateBps / 10000,
  )}%`;
  const shortfall = calculateMarginShortfall(thresholdSettings, {
    totalSales: toAnomalyMetric(totalSales),
    grossMarginRate: toAnomalyMetric(grossMarginRate),
  });

  return {
    currentLabel,
    targetLabel,
    shortfallAmountLabel: shortfall
      ? formatMarginShortfallAmount(shortfall)
      : null,
  };
}

function formatMarginPercent(rate: number) {
  return marginPercentFormatter.format(rate * 100);
}

function toAnomalyMetric(metric: LedgerReviewMetric) {
  return {
    value: metric.value,
    unavailableReason:
      metric.status === "policy-unconfirmed"
        ? ("계산 기준 확인 필요" as const)
        : metric.value === null
          ? ("계산 불가" as const)
          : undefined,
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
