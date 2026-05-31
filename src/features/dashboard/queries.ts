import type { DailyLedgerStatus } from "../../../generated/prisma";
import {
  calculateLedgerReviewSummary,
  type LedgerReviewMetric,
} from "../../server/calculations/ledger.ts";
import type {
  AnomalyThresholdSignalSettings,
  evaluateInventoryLossAnomalySignals as evaluateInventoryLossAnomalySignalsFunction,
  evaluateRevenueAnomalySignals as evaluateRevenueAnomalySignalsFunction,
} from "../../server/calculations/anomaly.ts";
import type {
  DashboardBusinessStatus,
  DashboardDatePreset,
  DashboardLedgerStatus,
  HqDashboardData,
  HqDashboardRow,
  HqDashboardSummary,
} from "./types.ts";

const SEOUL_TIME_ZONE = "Asia/Seoul";
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
    productName: string;
    previousQuantity: number;
    purchasedQuantity: number;
    currentQuantity: number | null;
    quantity: number | null;
    unitPrice: number;
    inventoryAmount: number | null;
  }[];
  ledgerInventoryAdjustments: {
    productName: string;
    differenceQuantity: number;
    differenceAmount: number;
    reason: string;
  }[];
  ledgerLossItems: {
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
}: {
  datePreset?: DashboardDatePreset;
} = {}): Promise<HqDashboardData> {
  const { requireHeadquartersUser } = await import("../../server/authz.ts");
  await requireHeadquartersUser();

  const preset = getDashboardDatePreset(datePreset);
  const closingDate = getDashboardDate(preset);
  const { db } = await import("../../server/db.ts");
  const { getAnomalyThresholdSettingsForSignals } =
    await import("./threshold-queries.ts");
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
                productName: true,
                previousQuantity: true,
                purchasedQuantity: true,
                currentQuantity: true,
                quantity: true,
                unitPrice: true,
                inventoryAmount: true,
              },
            },
            ledgerInventoryAdjustments: {
              select: {
                productName: true,
                differenceQuantity: true,
                differenceAmount: true,
                reason: true,
              },
            },
            ledgerLossItems: {
              select: {
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
  const ledgerByStoreId = new Map<string, DashboardLedgerRecord>(
    ledgers.map((ledger) => [ledger.storeId, ledger]),
  );
  const rows = stores.map((store) =>
    toDashboardRow(
      store,
      ledgerByStoreId.get(store.id) ?? null,
      closingDate,
      thresholdSettings,
      evaluateRevenueAnomalySignals,
      evaluateInventoryLossAnomalySignals,
    ),
  );

  return {
    datePreset: preset,
    closingDate: closingDate.toISOString(),
    rows,
    summary: summarizeDashboardRows(rows),
  };
}

function toDashboardRow(
  store: DashboardStoreRecord,
  ledger: DashboardLedgerRecord | null,
  closingDate: Date,
  thresholdSettings: AnomalyThresholdSignalSettings | null,
  evaluateRevenueAnomalySignals: EvaluateRevenueAnomalySignals,
  evaluateInventoryLossAnomalySignals: EvaluateInventoryLossAnomalySignals,
): HqDashboardRow {
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

  const reviewSummary = calculateLedgerReviewSummary({
    totalSalesAmount: ledger.totalSalesAmount,
    cashAmount: ledger.cashAmount,
    cardAmount: ledger.cardAmount,
    otherPaymentAmount: ledger.otherPaymentAmount,
    workerCount: ledger.workerCount,
    expenseTotal: 0,
    inventoryItems: ledger.ledgerInventoryItems,
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
    hasLoss: ledger._count.ledgerLossItems > 0,
    lastModifiedBy: ledger.updatedBy,
    lastModifiedAt: ledger.updatedAt.toISOString(),
    isHeadquartersClosed: ledger.status === "HEADQUARTERS_CLOSED",
    signals: getDashboardSignals({
      thresholdSettings,
      revenueCurrent: {
        totalSales: reviewSummary.totalSales,
        grossMarginRate: reviewSummary.grossMarginRate,
        salesDifference: reviewSummary.salesDifference,
      },
      inventoryLossCurrent: {
        inventoryItems: ledger.ledgerInventoryItems,
        inventoryAdjustments: ledger.ledgerInventoryAdjustments,
        lossItems: ledger.ledgerLossItems,
      },
      evaluateRevenueAnomalySignals,
      evaluateInventoryLossAnomalySignals,
    }),
  };
}

export async function getHqLedgerDetail(ledgerId: string) {
  const { requireHeadquartersUser } = await import("../../server/authz.ts");
  await requireHeadquartersUser();

  const { db } = await import("../../server/db.ts");
  const { getAnomalyThresholdSettingsForSignals } =
    await import("./threshold-queries.ts");
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
            productName: true,
            previousQuantity: true,
            purchasedQuantity: true,
            currentQuantity: true,
            quantity: true,
            unitPrice: true,
            inventoryAmount: true,
          },
        },
        ledgerInventoryAdjustments: {
          select: {
            productName: true,
            differenceQuantity: true,
            differenceAmount: true,
            reason: true,
          },
        },
        ledgerLossItems: {
          select: {
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

  const reviewSummary = calculateLedgerReviewSummary({
    totalSalesAmount: ledger.totalSalesAmount,
    cashAmount: ledger.cashAmount,
    cardAmount: ledger.cardAmount,
    otherPaymentAmount: ledger.otherPaymentAmount,
    workerCount: ledger.workerCount,
    expenseTotal: 0,
    inventoryItems: ledger.ledgerInventoryItems,
  });

  return {
    ledgerId: ledger.id,
    storeId: ledger.store.id,
    storeName: ledger.store.name,
    closingDate: ledger.closingDate.toISOString(),
    businessStatus: mapDashboardBusinessStatus(ledger.status),
    ledgerStatus: mapDashboardLedgerStatus(ledger.status),
    salesAmount: reviewSummary.totalSales,
    grossMarginRate: reviewSummary.grossMarginRate,
    salesDifference: reviewSummary.salesDifference,
    hasLoss: ledger._count.ledgerLossItems > 0,
    lastModifiedBy: ledger.updatedBy,
    lastModifiedAt: ledger.updatedAt.toISOString(),
    isHeadquartersClosed: ledger.status === "HEADQUARTERS_CLOSED",
    signals: getDashboardSignals({
      thresholdSettings,
      revenueCurrent: {
        totalSales: reviewSummary.totalSales,
        grossMarginRate: reviewSummary.grossMarginRate,
        salesDifference: reviewSummary.salesDifference,
      },
      inventoryLossCurrent: {
        inventoryItems: ledger.ledgerInventoryItems,
        inventoryAdjustments: ledger.ledgerInventoryAdjustments,
        lossItems: ledger.ledgerLossItems,
      },
      evaluateRevenueAnomalySignals,
      evaluateInventoryLossAnomalySignals,
    }),
  };
}

function getDashboardSignals({
  thresholdSettings,
  revenueCurrent,
  inventoryLossCurrent,
  evaluateRevenueAnomalySignals,
  evaluateInventoryLossAnomalySignals,
}: {
  thresholdSettings: AnomalyThresholdSignalSettings | null;
  revenueCurrent: Parameters<EvaluateRevenueAnomalySignals>[0]["current"];
  inventoryLossCurrent: Parameters<EvaluateInventoryLossAnomalySignals>[0]["current"];
  evaluateRevenueAnomalySignals: EvaluateRevenueAnomalySignals;
  evaluateInventoryLossAnomalySignals: EvaluateInventoryLossAnomalySignals;
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

  return [...revenueSignals, ...inventoryLossSignals];
}

function summarizeDashboardRows(rows: HqDashboardRow[]): HqDashboardSummary {
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
