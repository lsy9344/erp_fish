import type { LossSignalThresholds } from "~/server/calculations/inventory";
import {
  calculateExpenseTotal,
  calculateLedgerReviewSummary,
  calculatePayrollTotal,
  type LedgerReviewMetric,
} from "~/server/calculations/ledger";
// OQ-gated calculation policy is centralized in ~/server/calculations/policy-gates.
import { db } from "~/server/db";
import { getInventoryStepDataInTx } from "~/features/inventory/queries";
import { getLossStepDataInTx } from "~/features/losses/queries";
import { decimalToNumber, nullableDecimalToNumber } from "~/lib/decimal";
import { getStoreLedgerInTx, getKstBusinessDateParam } from "./queries";
import { toStoreManagerLedgerReviewStepData } from "./response-shaping";
import { buildLedgerReviewSignals } from "./review-signals";
import {
  getLedgerReviewMissingItems,
  getLedgerReviewStepHref,
} from "./review-validation";
import { getStoreEntryStepCompletion } from "./step-completion";
import type {
  LedgerReviewMissingItem,
  LedgerReviewStepId,
  LedgerReviewStepMetric,
  LedgerReviewStepStatus,
  LedgerReviewStepSummary,
  LedgerReviewStepData,
  LedgerReviewWarning,
  StoreManagerLedgerReviewStepData,
  StoreManagerTopSoldItem,
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

const marginRateFormatter = new Intl.NumberFormat("ko-KR", {
  style: "percent",
  maximumFractionDigits: 1,
});

function ratioMetric(
  id: string,
  label: string,
  metric: LedgerReviewMetric,
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
    value: marginRateFormatter.format(metric.value),
    kind: "text",
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
  laborCount,
  payrollTotal,
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
  laborCount: number;
  payrollTotal: number;
}): LedgerReviewStepSummary[] {
  const missingById = new Map(missingItems.map((item) => [item.id, item]));

  // 단계 순서 변경(2026-07-02): 검토 요약 카드도 지점 입력 순서
  // (매입>손실>재고>지출>근무>매출)와 동일하게 정렬한다.
  return [
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
        moneyMetric("inventoryAmount", "재고금액", summary.inventoryAmount),
        statusMetric("reviewStatus", "계산 상태", summary.inventoryAmount),
      ],
    },
    {
      id: "expenses",
      label: "지출",
      status: stepStatus("expenses", missingById),
      detail: stepDetail({
        stepId: "expenses",
        missingItems: missingById,
        savedDetail: `지출 ${expenseCount}건이 저장되어 있습니다.`,
      }),
      href: getLedgerReviewStepHref(storeId, closingDate, "expenses"),
      metrics: [textMetric("expenseCount", "지출 저장", `${expenseCount}건`)],
    },
    {
      id: "work",
      label: "근무인원/이름",
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
        textMetric("laborCount", "급여 항목", `${laborCount}건`),
        {
          id: "payrollTotal",
          label: "급여 합계",
          value: payrollTotal,
          kind: "krw",
          status: "ok",
        },
      ],
    },
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
        ratioMetric("grossMarginRate", "마진율", summary.grossMarginRate),
        // point_summary 검토 후속(2026-06-24): 아침 판매가 계획 vs 저녁 실제 비교.
        moneyMetric(
          "plannedSalesTotal",
          "계획 판매가 기준 추정 매출",
          summary.plannedSalesTotal,
        ),
        moneyMetric(
          "plannedVsActualSalesDifference",
          "계획 대비 실제 매출 차이",
          summary.plannedVsActualSalesDifference,
          "signed-krw",
        ),
        ratioMetric(
          "plannedGrossMarginRate",
          "계획 판매가 기준 마진율",
          summary.plannedGrossMarginRate,
        ),
      ],
    },
  ];
}

// WO-04(2026-06-22): 지점장 "오늘 많이 팔린 품목" 카드 데이터.
// 판매 수량은 재고 흐름(전일+매입-당일)으로만 추정하고, 추정 매출만 노출한다.
// 단가/FIFO/차액 같은 민감값은 이 카드 데이터에 담지 않는다.
//
// point_summary 검토 후속(2026-06-24): 회의 결정대로 추정 매출은 "지점장 판매가 계획"
// (plannedUnitPrice) 기준으로 산출한다. 매입/적용 단가(unitPrice)는 판매가 계획이 없을 때만
// 폴백으로 쓰고, 그 경우 salesBasis="cost"로 표시한다.
function buildStoreManagerTopSoldItems(
  items: Array<{
    productId: string;
    productName: string;
    previousQuantity: number;
    purchasedQuantity: number;
    lossQuantity: number;
    currentQuantity: number | null;
    unitPrice: number;
    plannedUnitPrice: number | null;
  }>,
  limit = 5,
): StoreManagerTopSoldItem[] {
  const topItems: StoreManagerTopSoldItem[] = [];

  for (const item of items) {
    if (item.currentQuantity === null) continue;

    // 판매량 = 기준재고(전일+매입-손실) - 당일재고. 손실을 빼지 않으면
    // 폐기/손실 수량이 판매로 잘못 잡혀 추정 매출이 부풀려진다.
    const soldQuantity =
      item.previousQuantity +
      item.purchasedQuantity -
      item.lossQuantity -
      item.currentQuantity;

    if (!Number.isFinite(soldQuantity) || soldQuantity <= 0) continue;

    const usePlannedPrice =
      item.plannedUnitPrice !== null && Number.isFinite(item.plannedUnitPrice);
    const salesUnitPrice = usePlannedPrice
      ? item.plannedUnitPrice!
      : item.unitPrice;

    topItems.push({
      productId: item.productId,
      productName: item.productName,
      soldQuantity,
      estimatedSalesAmount: Math.round(soldQuantity * salesUnitPrice),
      salesBasis: usePlannedPrice ? "planned" : "cost",
    });
  }

  return topItems
    .sort((a, b) => b.estimatedSalesAmount - a.estimatedSalesAmount)
    .slice(0, limit);
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
    const savedInventoryItems = (
      await tx.ledgerInventoryItem.findMany({
        where: { dailyLedgerId: ledger.id },
        select: reviewInventoryItemSelect,
      })
    ).map((item) => ({
      ...item,
      previousQuantity: decimalToNumber(item.previousQuantity),
      purchasedQuantity: decimalToNumber(item.purchasedQuantity),
      currentQuantity: nullableDecimalToNumber(item.currentQuantity),
      quantity: nullableDecimalToNumber(item.quantity),
    }));
    // point_summary 검토 후속(2026-06-24): 추정 매출/계획 대비 비교는 회의 결정대로
    // "지점장 판매가 계획"(StoreSalesPricePlan.plannedUnitPrice) 기준으로 계산한다.
    // (storeId, businessDate=closingDate, productId)로 당일 판매가 계획을 조회한다.
    const productIdsForPlan = [
      ...new Set(savedInventoryItems.map((item) => item.productId)),
    ];
    const salesPricePlans =
      productIdsForPlan.length > 0
        ? await tx.storeSalesPricePlan.findMany({
            where: {
              storeId: ledger.storeId,
              businessDate: ledger.closingDate,
              productId: { in: productIdsForPlan },
            },
            select: { productId: true, plannedUnitPrice: true },
          })
        : [];
    const plannedUnitPriceByProductId = new Map(
      salesPricePlans.map((plan) => [plan.productId, plan.plannedUnitPrice]),
    );
    const getPlannedUnitPrice = (productId: string): number | null =>
      plannedUnitPriceByProductId.get(productId) ?? null;
    // 손실 수량을 품목별로 합산한다. "오늘 많이 팔린 품목" 판매량 추정에서
    // 기준재고(전일+매입-손실)를 쓰기 위해 필요하다.
    const lossQuantityByProductId = new Map<string, number>();
    for (const lossItem of losses.lossItems) {
      lossQuantityByProductId.set(
        lossItem.productId,
        (lossQuantityByProductId.get(lossItem.productId) ?? 0) +
          lossItem.quantity,
      );
    }
    const expenseTotal = calculateExpenseTotal(
      ledger.ledgerExpenses.map((expense) => expense.amount),
    );
    const payrollTotal = calculatePayrollTotal(
      ledger.ledgerLaborItems.map((item) => item.amount),
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
        fifoLots: item.fifoLots,
      })),
      inventoryAdjustments: inventory.items
        .map((item) => item.adjustment)
        .filter((adjustment) => adjustment !== null),
      lossItems: losses.lossItems,
      plannedSalesItems: savedInventoryItems.map((item) => ({
        productId: item.productId,
        previousQuantity: item.previousQuantity,
        purchasedQuantity: item.purchasedQuantity,
        lossQuantity: lossQuantityByProductId.get(item.productId) ?? 0,
        currentQuantity: item.currentQuantity,
        quantity: item.quantity,
        plannedUnitPrice: getPlannedUnitPrice(item.productId),
      })),
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
      signals: buildLedgerReviewSignals({
        inventoryItems: inventory.items,
        lossSignalCandidates: losses.signalCandidates,
      }),
      stepCompletion: getStoreEntryStepCompletion({
        totalSalesAmount: ledger.totalSalesAmount,
        workerCount: ledger.workerCount,
        ledgerExpenses: ledger.ledgerExpenses,
        ledgerPurchaseItems: ledger.ledgerPurchaseItems,
        inventoryItemCount: savedInventoryItems.length,
        lossItemCount: losses.lossItems.length,
        lossReviewedAt: ledger.lossReviewedAt,
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
        laborCount: ledger.ledgerLaborItems.length,
        payrollTotal,
      }),
      topSoldItems: buildStoreManagerTopSoldItems(
        savedInventoryItems.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          previousQuantity: item.previousQuantity,
          purchasedQuantity: item.purchasedQuantity,
          lossQuantity: lossQuantityByProductId.get(item.productId) ?? 0,
          currentQuantity: item.currentQuantity,
          unitPrice: item.unitPrice,
          plannedUnitPrice: getPlannedUnitPrice(item.productId),
        })),
      ),
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
