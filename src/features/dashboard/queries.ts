import { StoreAccessMode } from "../../../generated/prisma/index.js";
import type { DailyLedgerStatus } from "../../../generated/prisma/index.js";
import {
  applyCorrectionValuesToLedgerReviewInput,
  calculateExpenseTotal,
  calculateLedgerReviewSummary,
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
import type {
  AnomalyThresholdSignalSettings,
  evaluateInventoryLossAnomalySignals as evaluateInventoryLossAnomalySignalsFunction,
  evaluateRevenueAnomalySignals as evaluateRevenueAnomalySignalsFunction,
} from "../../server/calculations/anomaly.ts";
import { mapLedgerStatus } from "../ledger/status.ts";
import type {
  DashboardBusinessStatus,
  DashboardDatePreset,
  DashboardEmptyStateReason,
  DashboardFilterMode,
  DashboardLedgerStatus,
  DashboardSortMode,
  HqDashboardData,
  HqDashboardPriority,
  HqDashboardRow,
  HqDashboardSummary,
} from "./types.ts";
import type { CorrectionAppliedValue } from "../corrections/types.ts";

const SEOUL_TIME_ZONE = "Asia/Seoul";
type HqDashboardRowWithoutPriority = Omit<HqDashboardRow, "priority">;
type EvaluateRevenueAnomalySignals =
  typeof evaluateRevenueAnomalySignalsFunction;
type EvaluateInventoryLossAnomalySignals =
  typeof evaluateInventoryLossAnomalySignalsFunction;
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
  _count: {
    ledgerLossItems: number;
  };
};

export function getDashboardDatePreset(value: unknown): DashboardDatePreset {
  return value === "yesterday" ? "yesterday" : "today";
}

export function getDashboardSortMode(value: unknown): DashboardSortMode {
  return value === "store-name" ? "store-name" : "priority";
}

export function getDashboardFilterMode(value: unknown): DashboardFilterMode {
  return value === "needs-attention" ? "needs-attention" : "all";
}

export function getDashboardPath({
  datePreset,
  sortMode,
  filterMode,
}: {
  datePreset: DashboardDatePreset;
  sortMode: DashboardSortMode;
  filterMode: DashboardFilterMode;
}) {
  return `/app/dashboard?date=${datePreset}&sort=${sortMode}&filter=${filterMode}`;
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
              },
            },
          },
        });
  const correctionValuesByLedgerId = await getLatestCorrectionValuesForLedgers(
    ledgers.map((ledger) => ledger.id),
  );
  const ledgerByStoreId = new Map<string, DashboardLedgerRecord>(
    ledgers.map((ledger) => [ledger.storeId, ledger]),
  );
  const baseRows = stores.map((store) =>
    toDashboardRow(
      store,
      ledgerByStoreId.get(store.id) ?? null,
      closingDate,
      thresholdSettings,
      evaluateRevenueAnomalySignals,
      evaluateInventoryLossAnomalySignals,
      correctionValuesByLedgerId.get(ledgerByStoreId.get(store.id)?.id ?? ""),
    ),
  );
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

  if (row.ledgerStatus.key === "IN_REVIEW") {
    return { rank: 30, label: "검토대기", reasons: ["본사 검토 필요"] };
  }

  if (row.ledgerStatus.key === "IN_PROGRESS") {
    return { rank: 40, label: "입력중", reasons: ["미마감"] };
  }

  if (row.ledgerStatus.key === "EMPTY") {
    return { rank: 50, label: "미입력", reasons: ["장부 입력 전"] };
  }

  const infoSignals = row.signals.filter(
    (signal) => signal.severity === "info",
  );
  if (infoSignals.length > 0) {
    return {
      rank: 60,
      label: "확인 필요",
      reasons: infoSignals.map((signal) => signal.label),
    };
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
      grossMarginRate: metrics.grossMarginRate,
      salesDifference: metrics.salesDifference,
      hasLoss: null,
      latestReflectedAt: null,
      lastModifiedBy: null,
      lastModifiedAt: null,
      isHeadquartersClosed: false,
      correctionState: emptyCorrectionState(),
      signals: getDashboardSignals({
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
  }

  const correctionOverlay = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: ledger.id,
    reviewInput: {
      totalSalesAmount: ledger.totalSalesAmount,
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
        });

  return {
    storeId: store.id,
    storeName: store.name,
    ledgerId: ledger.id,
    closingDate: ledger.closingDate.toISOString(),
    businessStatus: mapDashboardBusinessStatus(ledger.status),
    ledgerStatus: mapDashboardLedgerStatus(ledger.status),
    salesAmount: reviewSummary.totalSales,
    grossMarginRate: reviewSummary.grossMarginRate,
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
  const [ledger, thresholdSettings] = await Promise.all([
    db.dailyLedger.findFirst({
      where: { id: ledgerId, storeId: { in: storeScope.storeIds } },
      select: {
        id: true,
        closingDate: true,
        status: true,
        totalSalesAmount: true,
        cashAmount: true,
        cardAmount: true,
        otherPaymentAmount: true,
        workerCount: true,
        updatedAt: true,
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
          },
        },
      },
    }),
    getAnomalyThresholdSettingsForSignals(),
  ]);

  if (!ledger) {
    return null;
  }

  const corrections = await getLatestCorrectionValuesForLedger(ledger.id);
  const correctionOverlay = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: ledger.id,
    reviewInput: {
      totalSalesAmount: ledger.totalSalesAmount,
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
        });

  return {
    ledgerId: ledger.id,
    storeId: ledger.store.id,
    storeName: ledger.store.name,
    closingDate: ledger.closingDate.toISOString(),
    businessStatus: mapDashboardBusinessStatus(ledger.status),
    ledgerStatus: mapDashboardLedgerStatus(ledger.status),
    salesAmount: correctedReviewSummary.totalSales,
    grossMarginRate: correctedReviewSummary.grossMarginRate,
    salesDifference: correctedReviewSummary.salesDifference,
    hasLoss: hasCorrectedLoss(correctionOverlay.lossItems),
    latestReflectedAt: getLatestReflectedAt(ledger.updatedAt, corrections),
    lastModifiedBy: ledger.updatedBy,
    lastModifiedAt: ledger.updatedAt.toISOString(),
    isHeadquartersClosed: ledger.status === "HEADQUARTERS_CLOSED",
    correctionState,
    signals,
  };
}

function getDashboardSignals({
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
}) {
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
