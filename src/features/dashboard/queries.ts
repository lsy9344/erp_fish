import type { DailyLedgerStatus } from "../../../generated/prisma";
import {
  applyCorrectionValuesToLedgerReviewInput,
  calculateExpenseTotal,
  calculateLedgerReviewSummary,
  type LedgerReviewCorrectionOverlayResult,
  type LedgerReviewInventoryInput,
  type LedgerReviewMetric,
} from "../../server/calculations/ledger.ts";
import { calculateInventoryAmount } from "../../server/calculations/inventory.ts";
import type {
  AnomalyThresholdSignalSettings,
  evaluateInventoryLossAnomalySignals as evaluateInventoryLossAnomalySignalsFunction,
  evaluateRevenueAnomalySignals as evaluateRevenueAnomalySignalsFunction,
} from "../../server/calculations/anomaly.ts";
import type {
  DashboardBusinessStatus,
  DashboardDatePreset,
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
    ledgerInventoryItemId: string | null;
    productName: string;
    beforeQuantity: number;
    beforeAmount: number;
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
  switch (status) {
    case "IN_PROGRESS":
      return { key: "IN_PROGRESS", label: "입력중" };
    case "IN_REVIEW":
      return { key: "IN_REVIEW", label: "검토대기" };
    case "HEADQUARTERS_CLOSED":
      return { key: "HEADQUARTERS_CLOSED", label: "본사마감" };
    case "HOLIDAY":
      return { key: "HOLIDAY", label: "휴무" };
    default:
      return { key: "EMPTY", label: "미입력" };
  }
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
  const { requireHeadquartersUser } = await import("../../server/authz.ts");
  await requireHeadquartersUser();

  const preset = getDashboardDatePreset(datePreset);
  const normalizedSortMode = getDashboardSortMode(sortMode);
  const normalizedFilterMode = getDashboardFilterMode(filterMode);
  const closingDate = getDashboardDate(preset);
  const { db } = await import("../../server/db.ts");
  const { getAnomalyThresholdSettingsForSignals } =
    await import("./threshold-queries.ts");
  const { getLatestCorrectionValuesForLedgers } = await import(
    "../corrections/queries.ts"
  );
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
                productName: true,
                beforeQuantity: true,
                beforeAmount: true,
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
      totalSales: unavailable("계산 불가"),
      grossMarginRate: unavailable("계산 불가"),
      salesDifference: unavailable("계산 기준 확인 필요"),
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
  const reviewSummary = calculateLedgerReviewSummary(
    correctionOverlay.reviewInput,
  );
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
            inventoryAdjustments: toCorrectedInventoryAdjustments(
              ledger.ledgerInventoryAdjustments,
              correctionOverlay,
            ),
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
    lastModifiedBy: ledger.updatedBy,
    lastModifiedAt: ledger.updatedAt.toISOString(),
    isHeadquartersClosed: ledger.status === "HEADQUARTERS_CLOSED",
    correctionState,
    signals,
  };
}

export async function getHqLedgerDetail(ledgerId: string) {
  const { requireHeadquartersUser } = await import("../../server/authz.ts");
  await requireHeadquartersUser();

  const { db } = await import("../../server/db.ts");
  const { getAnomalyThresholdSettingsForSignals } =
    await import("./threshold-queries.ts");
  const { getLatestCorrectionValuesForLedger } = await import(
    "../corrections/queries.ts"
  );
  const { evaluateInventoryLossAnomalySignals, evaluateRevenueAnomalySignals } =
    await import("../../server/calculations/anomaly.ts");
  const [ledger, thresholdSettings] = await Promise.all([
    db.dailyLedger.findUnique({
      where: { id: ledgerId },
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
            ledgerInventoryItemId: true,
            productName: true,
            beforeQuantity: true,
            beforeAmount: true,
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
  const correctedReviewSummary = calculateLedgerReviewSummary(
    correctionOverlay.reviewInput,
  );
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
            inventoryAdjustments: toCorrectedInventoryAdjustments(
              ledger.ledgerInventoryAdjustments,
              correctionOverlay,
            ),
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

function toInventoryLossInventoryItems(
  items: LedgerReviewInventoryInput[],
) {
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
  if (correctionOverlay.appliedInventoryItemIds.size === 0) {
    return adjustments;
  }

  const correctedItemsById = new Map(
    correctionOverlay.reviewInput.inventoryItems
      .filter((item) => item.id)
      .map((item) => [item.id, item]),
  );

  return adjustments.map((adjustment) => {
    if (
      !adjustment.ledgerInventoryItemId ||
      !correctionOverlay.appliedInventoryItemIds.has(
        adjustment.ledgerInventoryItemId,
      )
    ) {
      return adjustment;
    }

    const correctedItem = correctedItemsById.get(
      adjustment.ledgerInventoryItemId,
    );
    const correctedQuantity =
      correctedItem?.currentQuantity ?? correctedItem?.quantity ?? null;
    const correctedAmount = calculateInventoryAmount(
      correctedQuantity,
      correctedItem?.unitPrice ?? adjustment.unitPrice,
    );

    if (correctedQuantity === null || correctedAmount === null) {
      return adjustment;
    }

    return {
      ...adjustment,
      differenceQuantity: correctedQuantity - adjustment.beforeQuantity,
      differenceAmount: correctedAmount - adjustment.beforeAmount,
    };
  });
}

function hasCorrectedLoss(
  lossItems: { quantity: number; amount: number }[],
) {
  return lossItems.some((item) => item.quantity > 0 || item.amount > 0);
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
