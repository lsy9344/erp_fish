import type { LossSignalThresholds } from "~/server/calculations/inventory";
import {
  calculateExpenseTotal,
  calculateLedgerReviewSummary,
  type LedgerReviewMetric,
} from "~/server/calculations/ledger";
// OQ-gated calculation policy is centralized in ~/server/calculations/policy-gates.
import { db } from "~/server/db";
import { getInventoryStepDataInTx } from "~/features/inventory/queries";
import { getLossStepDataInTx } from "~/features/losses/queries";
import { getStoreLedgerInTx, getKstBusinessDateParam } from "./queries";
import { toStoreManagerLedgerReviewStepData } from "./response-shaping";
import {
  getLedgerReviewMissingItems,
  getLedgerReviewStepHref,
} from "./review-validation";
import type {
  LedgerReviewMissingItem,
  LedgerReviewSignal,
  LedgerReviewStepId,
  LedgerReviewStepMetric,
  LedgerReviewStepStatus,
  LedgerReviewStepSummary,
  LedgerReviewStepData,
  LedgerReviewWarning,
  StoreManagerLedgerReviewStepData,
} from "./review-types";

type LedgerReviewThresholds = {
  loss?: LossSignalThresholds;
};

// Story 3.2 stores operating thresholds for the dashboard. Story 3.4 will wire
// them into loss/inventory signals; this review-only placeholder still marks
// any recorded loss as a candidate, not as an operating rule.
const reviewLossSignalThresholds: LossSignalThresholds = {
  quantity: 0,
  amount: 0,
};

const reviewInventoryItemSelect = {
  previousQuantity: true,
  purchasedQuantity: true,
  currentQuantity: true,
  quantity: true,
  unitPrice: true,
  inventoryAmount: true,
} as const;

function getWarnings(
  paymentDifference: LedgerReviewMetric,
): LedgerReviewWarning[] {
  if (paymentDifference.status !== "ok" || paymentDifference.value === null) {
    return [
      {
        id: "payment-difference-unavailable",
        label: "결제 차액 계산 상태 확인",
        detail:
          paymentDifference.reason ??
          paymentDifference.label ??
          paymentDifference.unavailableReason ??
          "결제 차액을 계산할 수 없습니다.",
      },
    ];
  }

  if (paymentDifference.value === 0) {
    return [];
  }

  return [
    {
      id: "payment-difference",
      label: "결제 합계 불일치",
      detail: "총매출과 결제수단 합계가 다릅니다. 제출을 막지는 않습니다.",
      amount: paymentDifference.value,
    },
  ];
}

function getSignals({
  inventoryItems,
  lossSignalCandidates,
}: {
  inventoryItems: Awaited<ReturnType<typeof getInventoryStepDataInTx>>["items"];
  lossSignalCandidates: Awaited<
    ReturnType<typeof getLossStepDataInTx>
  >["signalCandidates"];
}): LedgerReviewSignal[] {
  const inventorySignals = inventoryItems
    .filter((item) => {
      const differenceQuantity = item.adjustment?.differenceQuantity ?? 0;
      const differenceAmount = item.adjustment?.differenceAmount ?? 0;

      return differenceQuantity !== 0 || differenceAmount !== 0;
    })
    .map<LedgerReviewSignal>((item) => ({
      id: `inventory-${item.productId}`,
      label: "재고 차이",
      detail: `${item.productName} 실제 재고 차이`,
      quantity: item.adjustment?.differenceQuantity ?? 0,
      amount: item.adjustment?.differenceAmount ?? 0,
    }));

  const lossSignals = lossSignalCandidates.map<LedgerReviewSignal>((item) => ({
    id: `loss-${item.productId}`,
    label: "손실 확인 후보",
    detail: `${item.productName} 손실 항목이 기록되어 확인이 필요합니다.`,
    quantity: item.quantity,
    amount: item.amount,
  }));

  return [...inventorySignals, ...lossSignals];
}

function metricStatusText(metric: LedgerReviewMetric) {
  if (metric.status === "ok") {
    return "정상";
  }

  if (metric.status === "policy-unconfirmed") {
    return "기준 확인 필요";
  }

  if (metric.status === "data-insufficient") {
    return "데이터 부족";
  }

  return "계산 불가";
}

function metricDetail(metric: LedgerReviewMetric) {
  return metric.reason ?? metric.unavailableReason ?? metric.label;
}

function moneyMetric(
  id: string,
  label: string,
  metric: LedgerReviewMetric,
  kind: "krw" | "signed-krw" = "krw",
): LedgerReviewStepMetric {
  if (metric.status !== "ok" || metric.value === null) {
    const detail = metricDetail(metric);

    return {
      id,
      label,
      value: metricStatusText(metric),
      kind: "status",
      status: metric.status,
      ...(detail ? { detail } : {}),
    };
  }

  return {
    id,
    label,
    value: metric.value,
    kind,
    status: metric.status,
  };
}

function textMetric(
  id: string,
  label: string,
  value: string,
): LedgerReviewStepMetric {
  return {
    id,
    label,
    value,
    kind: "text",
    status: "ok",
  };
}

function statusMetric(
  id: string,
  label: string,
  metric: LedgerReviewMetric,
): LedgerReviewStepMetric {
  const detail = metricDetail(metric);

  return {
    id,
    label,
    value: metricStatusText(metric),
    kind: "status",
    status: metric.status,
    ...(detail ? { detail } : {}),
  };
}

function stepStatus(
  stepId: LedgerReviewStepId,
  missingItems: Map<string, LedgerReviewMissingItem>,
  calculationMetric?: LedgerReviewMetric,
): LedgerReviewStepStatus {
  const missingItem = missingItems.get(stepId);

  if (missingItem?.status === "missing") {
    return "missing";
  }

  if (calculationMetric && calculationMetric.status !== "ok") {
    return "needs-attention";
  }

  if (missingItem?.status === "review") {
    return "review";
  }

  return "saved";
}

function stepDetail({
  stepId,
  missingItems,
  savedDetail,
  calculationMetric,
}: {
  stepId: LedgerReviewStepId;
  missingItems: Map<string, LedgerReviewMissingItem>;
  savedDetail: string;
  calculationMetric?: LedgerReviewMetric;
}) {
  const missingItem = missingItems.get(stepId);

  if (missingItem) {
    return missingItem.detail;
  }

  if (calculationMetric && calculationMetric.status !== "ok") {
    return metricDetail(calculationMetric) ?? savedDetail;
  }

  return savedDetail;
}

export function buildLedgerReviewStepSummaries({
  storeId,
  closingDate,
  summary,
  missingItems,
  expenseCount,
  purchaseCount,
  inventoryCount,
  lossCount,
  workerCount,
}: {
  storeId: string;
  closingDate: string;
  summary: LedgerReviewStepData["summary"];
  missingItems: LedgerReviewMissingItem[];
  expenseCount: number;
  purchaseCount: number;
  inventoryCount: number;
  lossCount: number;
  workerCount: number | null;
}): LedgerReviewStepSummary[] {
  const missingById = new Map(missingItems.map((item) => [item.id, item]));

  return [
    {
      id: "sales",
      label: "매출/결제",
      status: stepStatus("sales", missingById, summary.paymentDifference),
      detail: stepDetail({
        stepId: "sales",
        missingItems: missingById,
        savedDetail: "총매출과 결제수단 합계를 확인했습니다.",
        calculationMetric: summary.paymentDifference,
      }),
      href: getLedgerReviewStepHref(storeId, closingDate, "sales"),
      metrics: [
        moneyMetric("totalSales", "총매출", summary.totalSales),
        moneyMetric("paymentTotal", "결제수단 합계", summary.paymentTotal),
        moneyMetric(
          "paymentDifference",
          "결제수단 합계와 총매출 차이",
          summary.paymentDifference,
          "signed-krw",
        ),
      ],
    },
    {
      id: "expenses",
      label: "비용",
      status: stepStatus("expenses", missingById),
      detail: stepDetail({
        stepId: "expenses",
        missingItems: missingById,
        savedDetail: `비용 ${expenseCount}건이 저장되어 있습니다.`,
      }),
      href: getLedgerReviewStepHref(storeId, closingDate, "expenses"),
      metrics: [textMetric("expenseCount", "비용 저장", `${expenseCount}건`)],
    },
    {
      id: "purchases",
      label: "매입",
      status: stepStatus("purchases", missingById),
      detail: stepDetail({
        stepId: "purchases",
        missingItems: missingById,
        savedDetail: `매입 ${purchaseCount}건이 저장되어 있습니다.`,
      }),
      href: getLedgerReviewStepHref(storeId, closingDate, "purchases"),
      metrics: [textMetric("purchaseCount", "매입 저장", `${purchaseCount}건`)],
    },
    {
      id: "inventory",
      label: "재고",
      status: stepStatus("inventory", missingById, summary.inventoryAmount),
      detail: stepDetail({
        stepId: "inventory",
        missingItems: missingById,
        savedDetail: `재고 ${inventoryCount}건이 저장되어 있습니다.`,
        calculationMetric: summary.inventoryAmount,
      }),
      href: getLedgerReviewStepHref(storeId, closingDate, "inventory"),
      metrics: [
        textMetric("inventoryCount", "재고 저장", `${inventoryCount}건`),
        statusMetric("reviewStatus", "계산 상태", summary.inventoryAmount),
      ],
    },
    {
      id: "losses",
      label: "손실",
      status: stepStatus("losses", missingById),
      detail: stepDetail({
        stepId: "losses",
        missingItems: missingById,
        savedDetail:
          lossCount === 0
            ? "손실 항목 없음으로 검토할 수 있습니다."
            : `손실 항목 ${lossCount}건이 저장되어 있습니다.`,
      }),
      href: getLedgerReviewStepHref(storeId, closingDate, "losses"),
      metrics: [textMetric("lossCount", "손실 저장", `${lossCount}건`)],
    },
    {
      id: "work",
      label: "근무",
      status: stepStatus("work", missingById, summary.workerCount),
      detail: stepDetail({
        stepId: "work",
        missingItems: missingById,
        savedDetail:
          workerCount === null
            ? "근무인원이 아직 입력되지 않았습니다."
            : `근무인원 ${workerCount}명이 저장되어 있습니다.`,
        calculationMetric: summary.workerCount,
      }),
      href: getLedgerReviewStepHref(storeId, closingDate, "work"),
      metrics: [
        textMetric(
          "workerCount",
          "근무인원",
          workerCount === null ? "미입력" : `${workerCount}명`,
        ),
      ],
    },
  ];
}

export async function getLedgerReviewStepData(
  storeId: string,
  closingDate: string | Date,
  actorId: string,
  thresholds: LedgerReviewThresholds = {},
): Promise<LedgerReviewStepData> {
  return db.$transaction(async (tx) => {
    const ledger = await getStoreLedgerInTx(tx, storeId, closingDate, actorId);
    const closingDateParam = getKstBusinessDateParam(closingDate);
    const inventory = await getInventoryStepDataInTx(
      tx,
      storeId,
      closingDate,
      actorId,
    );
    const losses = await getLossStepDataInTx(
      tx,
      storeId,
      closingDate,
      actorId,
      thresholds.loss ?? reviewLossSignalThresholds,
    );
    const savedInventoryItems = await tx.ledgerInventoryItem.findMany({
      where: { dailyLedgerId: ledger.id },
      select: reviewInventoryItemSelect,
    });
    const expenseTotal = calculateExpenseTotal(
      ledger.ledgerExpenses.map((expense) => expense.amount),
    );
    const summary = calculateLedgerReviewSummary({
      totalSalesAmount: ledger.totalSalesAmount,
      cashAmount: ledger.cashAmount,
      cardAmount: ledger.cardAmount,
      otherPaymentAmount: ledger.otherPaymentAmount,
      workerCount: ledger.workerCount,
      expenseTotal,
      inventoryItems: savedInventoryItems.map((item) => ({
        previousQuantity: item.previousQuantity,
        purchasedQuantity: item.purchasedQuantity,
        currentQuantity: item.currentQuantity,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        inventoryAmount: item.inventoryAmount,
      })),
      inventoryAdjustments: inventory.items
        .map((item) => item.adjustment)
        .filter((adjustment) => adjustment !== null),
      lossItems: losses.lossItems,
    });
    const hasInventoryUnavailable = savedInventoryItems.some(
      (item) =>
        (item.currentQuantity ?? item.quantity) === null ||
        item.inventoryAmount === null,
    );
    const missingItems = getLedgerReviewMissingItems({
      storeId,
      closingDate: closingDateParam,
      totalSalesAmount: ledger.totalSalesAmount,
      paymentTotal:
        ledger.cashAmount + ledger.cardAmount + ledger.otherPaymentAmount,
      expenseCount: ledger.ledgerExpenses.length,
      purchaseCount: ledger.ledgerPurchaseItems.length,
      hasInventoryUnavailable,
      inventoryCount: savedInventoryItems.length,
      lossCount: losses.lossItems.length,
      workerCount: ledger.workerCount,
    });

    return {
      id: ledger.id,
      storeId: ledger.storeId,
      closingDate: ledger.closingDate.toISOString(),
      updatedAt: ledger.updatedAt.toISOString(),
      version: ledger.version,
      authorDisplayName: ledger.authorDisplayName ?? null,
      status: ledger.status,
      submittedById: ledger.submittedById ?? null,
      submittedAt: ledger.submittedAt?.toISOString() ?? null,
      summary,
      missingItems,
      warnings: getWarnings(summary.paymentDifference),
      signals: getSignals({
        inventoryItems: inventory.items,
        lossSignalCandidates: losses.signalCandidates,
      }),
      stepSummaries: buildLedgerReviewStepSummaries({
        storeId,
        closingDate: closingDateParam,
        summary,
        missingItems,
        expenseCount: ledger.ledgerExpenses.length,
        purchaseCount: ledger.ledgerPurchaseItems.length,
        inventoryCount: savedInventoryItems.length,
        lossCount: losses.lossItems.length,
        workerCount: ledger.workerCount,
      }),
    };
  });
}

export async function getStoreManagerLedgerReviewStepData(
  storeId: string,
  closingDate: string | Date,
  actorId: string,
  thresholds: LedgerReviewThresholds = {},
): Promise<StoreManagerLedgerReviewStepData> {
  const data = await getLedgerReviewStepData(
    storeId,
    closingDate,
    actorId,
    thresholds,
  );

  return toStoreManagerLedgerReviewStepData(data);
}
