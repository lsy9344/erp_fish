import type { Prisma } from "../../../generated/prisma";

import {
  getCorrectionRecordsForLedgerInTx,
  getLatestCorrectionValueMap,
} from "~/features/corrections/queries";
import type { CorrectionRecordListItem } from "~/features/corrections/types";
import { getDashboardSignals } from "~/features/dashboard/queries";
import { ANOMALY_THRESHOLD_SCOPE } from "~/features/dashboard/threshold-schemas";
import {
  applyCorrectionValuesToLedgerReviewInput,
  calculateExpenseTotal,
  calculateLedgerReviewSummary,
  calculatePaymentTotal,
  type LedgerReviewInventoryInput,
} from "~/server/calculations/ledger";
import {
  evaluateInventoryLossAnomalySignals,
  evaluateRevenueAnomalySignals,
  normalizeAnomalyThresholdSignalSettings,
} from "~/server/calculations/anomaly";
import {
  getLedgerReviewMissingItems,
  getLedgerReviewStepHref,
} from "./review-validation";

export type HqLedgerClosePreflightSeverity =
  | "blocking"
  | "warning"
  | "exception-allowed"
  | "info";

export type HqLedgerClosePreflightItem = {
  id: string;
  label: string;
  severity: "blocking" | "warning" | "exception-allowed" | "info";
  statusLabel: string;
  detail: string;
  actionLabel: string;
  href?: string;
  source: string;
};

export type HqLedgerClosePreflightSummary = {
  totalCount: number;
  blockingCount: number;
  warningCount: number;
  exceptionAllowedCount: number;
  infoCount: number;
};

export type HqLedgerClosePreflightResult = {
  ledgerId: string;
  storeName: string;
  closingDate: string;
  ledgerUpdatedAt: string;
  executedBy: {
    id: string;
    name: string | null;
    email: string | null;
  };
  executedAt: string;
  canClose: boolean;
  summary: HqLedgerClosePreflightSummary;
  items: HqLedgerClosePreflightItem[];
};

type HqLedgerClosePreflightActor = HqLedgerClosePreflightResult["executedBy"];

export const hqLedgerClosePreflightLedgerSelect = {
  id: true,
  storeId: true,
  closingDate: true,
  updatedAt: true,
  status: true,
  totalSalesAmount: true,
  cashAmount: true,
  cardAmount: true,
  otherPaymentAmount: true,
  workerCount: true,
  store: {
    select: {
      name: true,
    },
  },
  ledgerExpenses: {
    select: {
      id: true,
      amount: true,
    },
  },
  ledgerPurchaseItems: {
    select: {
      id: true,
      purchaseStandardId: true,
      amount: true,
      productName: true,
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
      carryoverSource: true,
      carryoverStatus: true,
      carryoverLedgerId: true,
    },
  },
  ledgerInventoryAdjustments: {
    select: {
      productId: true,
      ledgerInventoryItemId: true,
      productName: true,
      unitPrice: true,
      beforeQuantity: true,
      beforeAmount: true,
      afterQuantity: true,
      afterAmount: true,
      differenceQuantity: true,
      differenceAmount: true,
      amountStatus: true,
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
      ledgerPurchaseItems: true,
    },
  },
} as const;

type HqLedgerClosePreflightLedger = Prisma.DailyLedgerGetPayload<{
  select: typeof hqLedgerClosePreflightLedgerSelect;
}>;

const severityLabels: Record<HqLedgerClosePreflightSeverity, string> = {
  blocking: "차단",
  warning: "경고",
  "exception-allowed": "사유 필요",
  info: "정보",
};

export async function buildHqLedgerClosePreflightInTx(
  tx: Prisma.TransactionClient,
  {
    ledgerId,
    actor,
    executedAt = new Date(),
  }: {
    ledgerId: string;
    actor: HqLedgerClosePreflightActor;
    executedAt?: Date;
  },
): Promise<HqLedgerClosePreflightResult | null> {
  const [ledger, thresholdSettings, correctionRecords] = await Promise.all([
    tx.dailyLedger.findUnique({
      where: { id: ledgerId },
      select: hqLedgerClosePreflightLedgerSelect,
    }),
    tx.anomalyThresholdSetting.findUnique({
      where: { scope: ANOMALY_THRESHOLD_SCOPE },
      select: {
        marginRateBps: true,
        inventoryDifferenceQuantity: true,
        isActive: true,
      },
    }),
    getCorrectionRecordsForLedgerInTx(tx, ledgerId),
  ]);

  if (!ledger) {
    return null;
  }

  const items = buildHqLedgerClosePreflightItems(
    ledger,
    actor,
    normalizeAnomalyThresholdSignalSettings(thresholdSettings),
    correctionRecords,
  );
  const summary = summarizePreflightItems(items);

  return {
    ledgerId: ledger.id,
    storeName: ledger.store.name,
    closingDate: ledger.closingDate.toISOString(),
    ledgerUpdatedAt: ledger.updatedAt.toISOString(),
    executedBy: actor,
    executedAt: executedAt.toISOString(),
    canClose:
      summary.blockingCount === 0 && summary.exceptionAllowedCount === 0,
    summary,
    items,
  };
}

function buildHqLedgerClosePreflightItems(
  ledger: HqLedgerClosePreflightLedger,
  actor: HqLedgerClosePreflightActor,
  thresholdSettings: Parameters<
    typeof getDashboardSignals
  >[0]["thresholdSettings"],
  correctionRecords: CorrectionRecordListItem[],
) {
  const items: HqLedgerClosePreflightItem[] = [
    ...buildAuthorizationItems(actor),
    ...buildStatusItems(ledger),
  ];
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
    corrections: getLatestCorrectionValueMap(correctionRecords).values(),
  });
  const reviewSummary = calculateLedgerReviewSummary({
    ...correctionOverlay.reviewInput,
    inventoryAdjustments: ledger.ledgerInventoryAdjustments,
    lossItems: correctionOverlay.lossItems,
  });
  const missingItems = getLedgerReviewMissingItems({
    storeId: ledger.storeId,
    closingDate: ledger.closingDate.toISOString(),
    totalSalesAmount: ledger.totalSalesAmount,
    paymentTotal: calculatePaymentTotal(
      ledger.cashAmount,
      ledger.cardAmount,
      ledger.otherPaymentAmount,
    ),
    expenseCount: ledger.ledgerExpenses.length,
    purchaseCount: ledger._count.ledgerPurchaseItems,
    hasInventoryUnavailable: hasInventoryUnavailable(
      correctionOverlay.reviewInput.inventoryItems,
    ),
    inventoryCount: correctionOverlay.reviewInput.inventoryItems.length,
    lossCount: correctionOverlay.lossItems.length,
    workerCount: ledger.workerCount,
  });

  items.push(
    ...missingItems
      .filter((item) => item.status === "missing")
      .map<HqLedgerClosePreflightItem>((item) => ({
        id: `required-${item.id}`,
        label: item.label,
        severity: "exception-allowed",
        statusLabel: severityLabels["exception-allowed"],
        detail: item.detail,
        actionLabel: "기존 입력 단계에서 보완",
        href: item.href,
        source: "getLedgerReviewMissingItems",
      })),
    ...buildCalculationItems(reviewSummary),
    ...buildCorrectionItems(correctionOverlay.correctionState),
    ...buildInventoryAdjustmentPolicyItems(ledger),
    ...buildCarryoverItems(ledger),
    ...buildPurchaseBasisItems(ledger),
    ...getDashboardSignals({
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
        inventoryAdjustments: ledger.ledgerInventoryAdjustments,
        lossItems: correctionOverlay.lossItems,
      },
      evaluateRevenueAnomalySignals,
      evaluateInventoryLossAnomalySignals,
      correctionState: correctionOverlay.correctionState,
      missingItems,
    }).map<HqLedgerClosePreflightItem>((signal) => ({
      id: `signal-${signal.id}`,
      label: signal.label,
      severity: signal.severity === "info" ? "info" : "warning",
      statusLabel:
        signal.severity === "info"
          ? severityLabels.info
          : severityLabels.warning,
      detail: signal.detail ?? "이상 신호 기준 확인이 필요합니다.",
      actionLabel: "상세 검토",
      source: "dashboard-signals",
    })),
  );

  if (items.length === 0) {
    items.push({
      id: "close-ready",
      label: "마감 가능 여부",
      severity: "info",
      statusLabel: "정보",
      detail: "차단 항목 없이 본사 마감할 수 있습니다.",
      actionLabel: "마감 확정 가능",
      source: "close-preflight",
    });
  }

  return dedupeItems(items);
}

function buildAuthorizationItems(actor: HqLedgerClosePreflightActor) {
  return [
    item({
      id: "authorization-verified",
      label: "권한",
      severity: "info",
      detail: `${
        actor.name ?? actor.email ?? "본사 사용자"
      }의 본사 마감 권한과 장부 접근 범위를 확인했습니다.`,
      actionLabel: "권한 확인 완료",
      source: "requireLedgerHqCloseAccess",
    }),
  ];
}

function buildStatusItems(ledger: HqLedgerClosePreflightLedger) {
  const ledgerStatus: string = ledger.status;

  if (ledger.status === "HEADQUARTERS_CLOSED") {
    return [
      item({
        id: "ledger-already-closed",
        label: "이미 마감 여부",
        severity: "blocking",
        detail: "이미 본사 마감된 장부입니다.",
        actionLabel: "최신 장부 상태 확인",
        source: "dailyLedger.status",
      }),
    ];
  }

  if (ledger.status === "HOLIDAY") {
    return [
      item({
        id: "ledger-holiday",
        label: "휴무 장부",
        severity: "blocking",
        detail: "휴무 장부는 원본 본사 마감 대상이 아닙니다.",
        actionLabel: "휴무 상태 확인",
        source: "dailyLedger.status",
      }),
    ];
  }

  if (ledger.status !== "IN_PROGRESS" && ledger.status !== "IN_REVIEW") {
    return [
      item({
        id: "ledger-status-not-closeable",
        label: "장부 상태",
        severity: "blocking",
        detail: `현재 상태(${ledgerStatus})에서는 본사 마감을 실행할 수 없습니다.`,
        actionLabel: "장부 상태 확인",
        source: "dailyLedger.status",
      }),
    ];
  }

  return [
    item({
      id: "ledger-not-closed",
      label: "이미 마감 여부",
      severity: "info",
      detail: "아직 본사 마감 전이며 마감 전 점검 대상 상태입니다.",
      actionLabel: "장부 상태 확인 완료",
      source: "dailyLedger.status",
    }),
  ];
}

function buildCalculationItems(
  reviewSummary: ReturnType<typeof calculateLedgerReviewSummary>,
) {
  return Object.entries(reviewSummary).flatMap(([metricId, metric]) => {
    if (metric.status === "ok") {
      return [];
    }

    const severity =
      metric.status === "calculation-unavailable"
        ? "blocking"
        : metric.status === "data-insufficient"
          ? "exception-allowed"
          : "warning";

    return [
      item({
        id: `calculation-${metricId}-${metric.status}`,
        label: calculationMetricLabels[metricId] ?? metricId,
        severity,
        detail:
          metric.status === "policy-unconfirmed"
            ? `${metric.reason ?? "정책 기준이 확정되지 않았습니다."} 확정 이상이나 확정 계산값으로 보지 않습니다.`
            : (metric.reason ??
              metric.unavailableReason ??
              "계산 상태 확인이 필요합니다."),
        actionLabel:
          metric.status === "policy-unconfirmed"
            ? "기준 확인 필요"
            : "입력값 보완",
        source: "calculateLedgerReviewSummary",
      }),
    ];
  });
}

function buildCorrectionItems(
  correctionState: ReturnType<
    typeof applyCorrectionValuesToLedgerReviewInput
  >["correctionState"],
) {
  if (!correctionState.hasUnappliedCorrections) {
    return [];
  }

  return [
    item({
      id: "correction-unapplied",
      label: "정정 반영 상태",
      severity: "blocking",
      detail:
        "계산에 바로 반영할 수 없는 미확정 정정 영향이 있어 마감 전 재확인이 필요합니다.",
      actionLabel: "정정 기록 확인",
      source: "hasUnappliedCorrections",
    }),
  ];
}

function buildInventoryAdjustmentPolicyItems(
  ledger: HqLedgerClosePreflightLedger,
) {
  return ledger.ledgerInventoryAdjustments
    .filter((adjustment) => adjustment.amountStatus === "POLICY_UNCONFIRMED")
    .map((adjustment) =>
      item({
        id: `inventory-adjustment-policy-${adjustment.ledgerInventoryItemId ?? adjustment.productId}`,
        label: "재고 조정 금액 기준",
        severity: "warning",
        detail: `${adjustment.productName}: 금액 기준 확인 필요 상태입니다. 확정 재고 이상이나 확정 계산값으로 보지 않습니다.`,
        actionLabel: "재고 단계에서 기준 확인",
        href: getLedgerReviewStepHref(
          ledger.storeId,
          ledger.closingDate.toISOString(),
          "inventory",
        ),
        source: "LedgerInventoryAdjustment.amountStatus",
      }),
    );
}

function buildCarryoverItems(ledger: HqLedgerClosePreflightLedger) {
  return ledger.ledgerInventoryItems.flatMap((inventoryItem) => {
    if (
      inventoryItem.carryoverStatus === "DATA_INSUFFICIENT" ||
      inventoryItem.carryoverStatus === "CARRYOVER_EMPTY" ||
      inventoryItem.carryoverStatus === "REVIEW_REQUIRED" ||
      inventoryItem.carryoverStatus === "CARRYOVER_RECHECK_REQUIRED"
    ) {
      return [
        item({
          id: `carryover-${inventoryItem.id}-${inventoryItem.carryoverStatus}`,
          label: "재고 이월",
          severity: "exception-allowed",
          detail: `${inventoryItem.productName}: ${carryoverStatusDetails[inventoryItem.carryoverStatus]} 출처 ${inventoryItem.carryoverSource}, 기준 장부 ${inventoryItem.carryoverLedgerId ?? "없음"}.`,
          actionLabel: "재고 단계에서 이월 확인",
          href: getLedgerReviewStepHref(
            ledger.storeId,
            ledger.closingDate.toISOString(),
            "inventory",
          ),
          source: "LedgerInventoryItem.carryoverStatus",
        }),
      ];
    }

    if (inventoryItem.carryoverStatus === "POLICY_UNCONFIRMED") {
      return [
        item({
          id: `carryover-${inventoryItem.id}-policy-unconfirmed`,
          label: "재고 이월 기준",
          severity: "warning",
          detail: `${inventoryItem.productName}: 기준 확인 필요 상태입니다.`,
          actionLabel: "기준 확인 필요",
          href: getLedgerReviewStepHref(
            ledger.storeId,
            ledger.closingDate.toISOString(),
            "inventory",
          ),
          source: "LedgerInventoryItem.carryoverStatus",
        }),
      ];
    }

    return [];
  });
}

function buildPurchaseBasisItems(ledger: HqLedgerClosePreflightLedger) {
  return ledger.ledgerPurchaseItems
    .filter((purchaseItem) => purchaseItem.purchaseStandardId === null)
    .map((purchaseItem) =>
      item({
        id: `purchase-basis-${purchaseItem.id}`,
        label: "가격 기준 없음",
        severity: "exception-allowed",
        detail: `${purchaseItem.productName}: 매입 기준이 연결되지 않았습니다.`,
        actionLabel: "매입 단계에서 기준 확인",
        href: getLedgerReviewStepHref(
          ledger.storeId,
          ledger.closingDate.toISOString(),
          "purchases",
        ),
        source: "ledgerPurchaseItems.purchaseStandardId",
      }),
    );
}

function summarizePreflightItems(
  items: HqLedgerClosePreflightItem[],
): HqLedgerClosePreflightSummary {
  return {
    totalCount: items.length,
    blockingCount: countSeverity(items, "blocking"),
    warningCount: countSeverity(items, "warning"),
    exceptionAllowedCount: countSeverity(items, "exception-allowed"),
    infoCount: countSeverity(items, "info"),
  };
}

function countSeverity(
  items: HqLedgerClosePreflightItem[],
  severity: HqLedgerClosePreflightSeverity,
) {
  return items.filter((item) => item.severity === severity).length;
}

function item({
  severity,
  ...input
}: Omit<HqLedgerClosePreflightItem, "statusLabel"> & {
  severity: HqLedgerClosePreflightSeverity;
}): HqLedgerClosePreflightItem {
  return {
    ...input,
    severity,
    statusLabel: severityLabels[severity],
  };
}

function hasInventoryUnavailable(items: LedgerReviewInventoryInput[]) {
  return items.some(
    (inventoryItem) =>
      (inventoryItem.currentQuantity ?? inventoryItem.quantity) === null ||
      inventoryItem.inventoryAmount === null,
  );
}

function toInventoryLossInventoryItems(items: LedgerReviewInventoryInput[]) {
  return items.map((inventoryItem) => ({
    productName: inventoryItem.productName ?? "품목",
    previousQuantity: inventoryItem.previousQuantity,
    purchasedQuantity: inventoryItem.purchasedQuantity,
    currentQuantity: inventoryItem.currentQuantity,
    quantity: inventoryItem.quantity,
    unitPrice: inventoryItem.unitPrice,
  }));
}

function dedupeItems(items: HqLedgerClosePreflightItem[]) {
  const seen = new Set<string>();

  return items.filter((preflightItem) => {
    if (seen.has(preflightItem.id)) {
      return false;
    }

    seen.add(preflightItem.id);
    return true;
  });
}

const calculationMetricLabels: Record<string, string> = {
  totalSales: "총매출",
  paymentTotal: "결제 합계",
  expenseTotal: "비용 합계",
  workerCount: "근무인원",
  costOfGoodsSold: "매출원가",
  grossProfit: "매출이익",
  grossMarginRate: "마진율",
  operatingProfit: "영업이익",
  productivity: "생산성",
  inventoryAmount: "재고금액",
  paymentDifference: "결제 차액",
  salesDifference: "매출차액",
};

const carryoverStatusDetails = {
  DATA_INSUFFICIENT: "이월 판단에 필요한 데이터가 부족합니다.",
  CARRYOVER_EMPTY: "전일 장부 또는 이월 기준이 비어 있습니다.",
  REVIEW_REQUIRED: "본사 마감 전 후보 등 검토가 필요합니다.",
  CARRYOVER_RECHECK_REQUIRED: "최신 이월 기준 재확인이 필요합니다.",
} as const;
