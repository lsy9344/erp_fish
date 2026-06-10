import type { LossSignalThresholds } from "~/server/calculations/inventory";
import { calculateExpenseTotal } from "~/server/calculations/ledger";
import { calculateLedgerReviewSummary } from "~/server/calculations/ledger";
import { db } from "~/server/db";
import { getInventoryStepDataInTx } from "~/features/inventory/queries";
import { getLossStepDataInTx } from "~/features/losses/queries";
import { getTodayStoreLedgerInTx } from "./queries";
import { toStoreManagerLedgerReviewStepData } from "./response-shaping";
import type {
  LedgerReviewMissingItem,
  LedgerReviewSignal,
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

function storeStepHref(
  storeId: string,
  step: "sales" | "cost" | "purchase" | "work",
) {
  return `/app/store-entry?storeId=${storeId}&step=${step}`;
}

function inventoryHref(storeId: string) {
  return `/app/store-entry/inventory?storeId=${storeId}`;
}

function lossesHref(storeId: string) {
  return `/app/store-entry/losses?storeId=${storeId}`;
}

function getMissingItems({
  storeId,
  totalSalesAmount,
  paymentTotal,
  expenseCount,
  purchaseCount,
  hasInventoryUnavailable,
  inventoryCount,
  lossCount,
  workerCount,
}: {
  storeId: string;
  totalSalesAmount: number;
  paymentTotal: number;
  expenseCount: number;
  purchaseCount: number;
  hasInventoryUnavailable: boolean;
  inventoryCount: number;
  lossCount: number;
  workerCount: number | null;
}): LedgerReviewMissingItem[] {
  const items: LedgerReviewMissingItem[] = [];

  if (totalSalesAmount === 0 && paymentTotal === 0) {
    items.push({
      id: "sales",
      label: "총매출/결제",
      href: storeStepHref(storeId, "sales"),
      status: "missing",
      detail: "총매출과 결제 금액이 아직 입력되지 않았습니다.",
    });
  }

  if (expenseCount === 0) {
    items.push({
      id: "expenses",
      label: "비용",
      href: storeStepHref(storeId, "cost"),
      status: "missing",
      detail: "비용 항목이 아직 입력되지 않았습니다.",
    });
  }

  if (purchaseCount === 0) {
    items.push({
      id: "purchases",
      label: "매입",
      href: storeStepHref(storeId, "purchase"),
      status: "missing",
      detail: "매입 항목이 아직 입력되지 않았습니다.",
    });
  }

  if (inventoryCount === 0 || hasInventoryUnavailable) {
    items.push({
      id: "inventory",
      label: "재고",
      href: inventoryHref(storeId),
      status: "missing",
      detail:
        inventoryCount === 0
          ? "재고 항목이 아직 저장되지 않았습니다."
          : "재고 수량 또는 금액 중 계산할 수 없는 항목이 있습니다.",
    });
  }

  items.push({
    id: "losses",
    label: "손실/폐기",
    href: lossesHref(storeId),
    status: "review",
    detail:
      lossCount === 0
        ? "손실 항목 없음으로 검토할 수 있습니다."
        : `손실 항목 ${lossCount}건이 저장되어 있습니다.`,
  });

  if (workerCount === null || workerCount <= 0) {
    items.push({
      id: "work",
      label: "근무인원",
      href: storeStepHref(storeId, "work"),
      status: "missing",
      detail: "근무인원이 아직 입력되지 않았습니다.",
    });
  }

  return items;
}

function getWarnings(paymentDifference: number): LedgerReviewWarning[] {
  if (paymentDifference === 0) {
    return [];
  }

  return [
    {
      id: "payment-difference",
      label: "결제 합계 불일치",
      detail: "총매출과 결제수단 합계가 다릅니다. 제출을 막지는 않습니다.",
      amount: paymentDifference,
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

export async function getLedgerReviewStepData(
  storeId: string,
  actorId: string,
  thresholds: LedgerReviewThresholds = {},
): Promise<LedgerReviewStepData> {
  return db.$transaction(async (tx) => {
    const ledger = await getTodayStoreLedgerInTx(tx, storeId, actorId);
    const inventory = await getInventoryStepDataInTx(tx, storeId, actorId);
    const losses = await getLossStepDataInTx(
      tx,
      storeId,
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

    return {
      id: ledger.id,
      storeId: ledger.storeId,
      closingDate: ledger.closingDate.toISOString(),
      status: ledger.status,
      submittedById: ledger.submittedById ?? null,
      submittedAt: ledger.submittedAt?.toISOString() ?? null,
      summary,
      missingItems: getMissingItems({
        storeId,
        totalSalesAmount: ledger.totalSalesAmount,
        paymentTotal:
          ledger.cashAmount + ledger.cardAmount + ledger.otherPaymentAmount,
        expenseCount: ledger.ledgerExpenses.length,
        purchaseCount: ledger.ledgerPurchaseItems.length,
        hasInventoryUnavailable,
        inventoryCount: savedInventoryItems.length,
        lossCount: losses.lossItems.length,
        workerCount: ledger.workerCount,
      }),
      warnings: getWarnings(summary.paymentDifference.value ?? 0),
      signals: getSignals({
        inventoryItems: inventory.items,
        lossSignalCandidates: losses.signalCandidates,
      }),
    };
  });
}

export async function getStoreManagerLedgerReviewStepData(
  storeId: string,
  actorId: string,
  thresholds: LedgerReviewThresholds = {},
): Promise<StoreManagerLedgerReviewStepData> {
  const data = await getLedgerReviewStepData(storeId, actorId, thresholds);

  return toStoreManagerLedgerReviewStepData(data);
}
