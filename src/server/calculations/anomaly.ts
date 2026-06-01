import { summarizeLossItems } from "./inventory.ts";

export type AnomalyThresholdSignalSettings = {
  salesDropRateBps: number;
  grossMarginDropBps: number;
  salesDifferenceAmount: number;
  lossAmount: number;
  inventoryDifferenceQuantity: number;
};

export type AnomalySignalSeverity = "info" | "warning" | "critical";

export type AnomalySignalSummary = {
  id: string;
  label: string;
  severity: AnomalySignalSeverity;
  detail?: string;
};

export type AnomalyMetric = {
  value: number | null;
  unavailableReason?: "계산 불가" | "계산 기준 확인 필요";
};

export type RevenueAnomalyMetrics = {
  totalSales: AnomalyMetric;
  grossMarginRate: AnomalyMetric;
  salesDifference: AnomalyMetric;
};

export type RevenueAnomalyComparison =
  | {
      policy: string;
      baseline: {
        totalSales: AnomalyMetric;
        grossMarginRate: AnomalyMetric;
      };
    }
  | {
      policy: null;
      baseline: null;
    };

export type InventoryLossAnomalyInventoryItem = {
  productName: string;
  previousQuantity: number;
  purchasedQuantity: number;
  currentQuantity: number | null;
  quantity: number | null;
  unitPrice: number;
};

export type InventoryLossAnomalyAdjustment = {
  productName: string;
  differenceQuantity: number;
  differenceAmount: number;
  reason: string;
};

export type InventoryLossAnomalyLossItem = {
  productId: string;
  productName: string;
  quantity: number;
  amount: number;
};

export type InventoryLossAnomalyMetrics = {
  inventoryItems: InventoryLossAnomalyInventoryItem[] | null;
  inventoryAdjustments: InventoryLossAnomalyAdjustment[] | null;
  lossItems: InventoryLossAnomalyLossItem[] | null;
};

const pendingSignal: AnomalySignalSummary = {
  id: "thresholds-pending",
  label: "기준값 설정 전",
  severity: "info",
  detail: "기준값 기반 이상 신호는 기준값 저장 후 계산합니다.",
};

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat("ko-KR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function getAnomalyThresholdSignalSummary(
  settings: AnomalyThresholdSignalSettings | null,
) {
  return settings
    ? {
        id: "thresholds-configured",
        label: "기준값 저장됨",
        severity: "info",
        detail:
          "기준일 정책 확인 필요. 후속 스토리에서 이상 신호를 계산합니다.",
      }
    : pendingSignal;
}

export function normalizeAnomalyThresholdSignalSettings(
  settings: AnomalyThresholdSignalSettings | null,
): AnomalyThresholdSignalSettings | null {
  if (!settings) {
    return null;
  }

  return {
    salesDropRateBps: settings.salesDropRateBps,
    grossMarginDropBps: settings.grossMarginDropBps,
    salesDifferenceAmount: settings.salesDifferenceAmount,
    lossAmount: settings.lossAmount,
    inventoryDifferenceQuantity: settings.inventoryDifferenceQuantity,
  };
}

export function evaluateRevenueAnomalySignals({
  thresholds,
  current,
  comparison,
}: {
  thresholds: AnomalyThresholdSignalSettings | null;
  current: RevenueAnomalyMetrics;
  comparison: RevenueAnomalyComparison;
}): AnomalySignalSummary[] {
  if (!thresholds) {
    return [pendingSignal];
  }

  return [
    ...evaluateSalesDropSignal(thresholds, current, comparison),
    ...evaluateGrossMarginDropSignal(thresholds, current, comparison),
    ...evaluateSalesDifferenceSignal(thresholds, current),
  ];
}

export function evaluateInventoryLossAnomalySignals({
  thresholds,
  current,
}: {
  thresholds: AnomalyThresholdSignalSettings | null;
  current: InventoryLossAnomalyMetrics;
}): AnomalySignalSummary[] {
  if (!thresholds) {
    return [pendingSignal];
  }

  return [
    ...evaluateInventoryDifferenceSignal(thresholds, current),
    ...evaluateLossAmountSignal(thresholds, current),
  ];
}

function evaluateInventoryDifferenceSignal(
  thresholds: AnomalyThresholdSignalSettings,
  current: InventoryLossAnomalyMetrics,
): AnomalySignalSummary[] {
  if (
    current.inventoryItems === null ||
    current.inventoryItems.length === 0 ||
    current.inventoryAdjustments === null
  ) {
    return [
      {
        id: "inventory-input-required",
        label: "재고 입력 필요",
        severity: "info",
        detail: "재고 이상 신호 계산에 필요한 장부 재고 데이터가 아직 없습니다.",
      },
    ];
  }

  const hasUnavailableInventory = current.inventoryItems.some((item) => {
    const currentQuantity = item.currentQuantity ?? item.quantity;

    return currentQuantity === null || !Number.isFinite(currentQuantity);
  });

  if (hasUnavailableInventory) {
    return [
      {
        id: "inventory-calculation-unavailable",
        label: "재고 계산 불가",
        severity: "info",
        detail:
          "재고 차이 계산에 필요한 전일재고, 매입, 당일재고, 조정값 중 일부가 부족합니다.",
      },
    ];
  }

  const largestAdjustment = current.inventoryAdjustments.reduce<
    InventoryLossAnomalyAdjustment | null
  >((largest, item) => {
    if (!largest) {
      return item;
    }

    return Math.abs(item.differenceQuantity) >
      Math.abs(largest.differenceQuantity)
      ? item
      : largest;
  }, null);

  if (
    !largestAdjustment ||
    Math.abs(largestAdjustment.differenceQuantity) <=
      thresholds.inventoryDifferenceQuantity
  ) {
    return [];
  }

  return [
    {
      id: "inventory-difference-exceeded",
      label: "재고 이상",
      severity: "critical",
      detail: `${largestAdjustment.productName} 재고 차이 ${formatQuantity(
        Math.abs(largestAdjustment.differenceQuantity),
      )}, 기준 ${formatQuantity(
        thresholds.inventoryDifferenceQuantity,
      )}, 차이금액 ${formatKrw(
        Math.abs(largestAdjustment.differenceAmount),
      )}, 사유 ${largestAdjustment.reason}`,
    },
  ];
}

function evaluateLossAmountSignal(
  thresholds: AnomalyThresholdSignalSettings,
  current: InventoryLossAnomalyMetrics,
): AnomalySignalSummary[] {
  if (current.lossItems === null) {
    return [
      {
        id: "loss-input-required",
        label: "손실 입력 필요",
        severity: "info",
        detail: "손실 이상 신호 계산에 필요한 장부 손실 데이터가 아직 없습니다.",
      },
    ];
  }

  if (current.lossItems.length === 0) {
    return [];
  }

  const lossSummary = summarizeLossItems(current.lossItems);

  if (lossSummary.totalAmount <= thresholds.lossAmount) {
    return [];
  }

  const largestLossItem = lossSummary.byProduct.reduce<
    InventoryLossAnomalyLossItem | null
  >((largest, item) => {
    if (!largest) {
      return item;
    }

    return item.amount > largest.amount ? item : largest;
  }, null);
  const itemDetail = largestLossItem
    ? `, 주요 품목 ${largestLossItem.productName} ${formatKrw(
        largestLossItem.amount,
      )} (${formatQuantity(largestLossItem.quantity)})`
    : "";

  return [
    {
      id: "loss-amount-exceeded",
      label: "손실 이상",
      severity: "critical",
      detail: `손실액 ${formatKrw(lossSummary.totalAmount)}, 기준 ${formatKrw(
        thresholds.lossAmount,
      )}${itemDetail}`,
    },
  ];
}

function evaluateSalesDropSignal(
  thresholds: AnomalyThresholdSignalSettings,
  current: RevenueAnomalyMetrics,
  comparison: RevenueAnomalyComparison,
): AnomalySignalSummary[] {
  const currentSales = current.totalSales.value;

  if (currentSales === null || !Number.isFinite(currentSales)) {
    return [
      {
        id: "sales-drop-unavailable",
        label: "매출 계산 불가",
        severity: "info",
        detail:
          "매출 하락률 계산에 필요한 현재 또는 비교 기준 매출이 부족합니다.",
      },
    ];
  }

  if (!comparison.policy) {
    return [
      {
        id: "sales-drop-policy-required",
        label: "매출 기준 확인",
        severity: "info",
        detail: "매출 하락률 비교 기준일 정책이 아직 정해지지 않았습니다.",
      },
    ];
  }

  const baselineSales = comparison.baseline.totalSales.value;

  if (baselineSales === null || !Number.isFinite(baselineSales)) {
    return [
      {
        id: "sales-drop-unavailable",
        label: "매출 계산 불가",
        severity: "info",
        detail:
          "매출 하락률 계산에 필요한 현재 또는 비교 기준 매출이 부족합니다.",
      },
    ];
  }

  if (baselineSales <= 0) {
    return [
      {
        id: "sales-drop-unavailable",
        label: "매출 계산 불가",
        severity: "info",
        detail: "비교 기준 매출이 0원이라 매출 하락률을 계산할 수 없습니다.",
      },
    ];
  }

  const dropBps = ((baselineSales - currentSales) / baselineSales) * 10000;

  if (dropBps <= thresholds.salesDropRateBps) {
    return [];
  }

  return [
    {
      id: "sales-drop",
      label: "매출 급락",
      severity: "warning",
      detail: `매출 ${formatBps(dropBps)} 하락, 기준 ${formatBps(
        thresholds.salesDropRateBps,
      )}`,
    },
  ];
}

function evaluateGrossMarginDropSignal(
  thresholds: AnomalyThresholdSignalSettings,
  current: RevenueAnomalyMetrics,
  comparison: RevenueAnomalyComparison,
): AnomalySignalSummary[] {
  const currentRate = current.grossMarginRate.value;

  if (currentRate === null || !Number.isFinite(currentRate)) {
    return [
      {
        id: "gross-margin-unavailable",
        label: "이익률 계산 불가",
        severity: "info",
        detail:
          "이익률 하락폭 계산에 필요한 현재 또는 비교 기준 이익률이 부족합니다.",
      },
    ];
  }

  if (!comparison.policy) {
    return [
      {
        id: "gross-margin-policy-required",
        label: "이익률 기준 확인",
        severity: "info",
        detail: "이익률 하락폭 비교 기준일 정책이 아직 정해지지 않았습니다.",
      },
    ];
  }

  const baselineRate = comparison.baseline.grossMarginRate.value;

  if (baselineRate === null || !Number.isFinite(baselineRate)) {
    return [
      {
        id: "gross-margin-unavailable",
        label: "이익률 계산 불가",
        severity: "info",
        detail:
          "이익률 하락폭 계산에 필요한 현재 또는 비교 기준 이익률이 부족합니다.",
      },
    ];
  }

  const dropBps = (baselineRate - currentRate) * 10000;

  if (dropBps <= thresholds.grossMarginDropBps) {
    return [];
  }

  return [
    {
      id: "gross-margin-drop",
      label: "이익률 급락",
      severity: "warning",
      detail: `이익률 ${formatBps(
        dropBps,
      )}p 하락, 기준 ${formatBps(thresholds.grossMarginDropBps)}p`,
    },
  ];
}

function evaluateSalesDifferenceSignal(
  thresholds: AnomalyThresholdSignalSettings,
  current: RevenueAnomalyMetrics,
): AnomalySignalSummary[] {
  const salesDifference = current.salesDifference.value;

  if (salesDifference === null || !Number.isFinite(salesDifference)) {
    const isPolicyGap =
      current.salesDifference.unavailableReason === "계산 기준 확인 필요";

    return [
      {
        id: "sales-difference-unavailable",
        label: isPolicyGap ? "매출차액 기준 확인" : "매출차액 계산 불가",
        severity: "info",
        detail: isPolicyGap
          ? "매출차액 계산에 필요한 상품별 판매금액 기준이 아직 정해지지 않았습니다."
          : "매출차액 계산에 필요한 입력값이 부족합니다.",
      },
    ];
  }

  const absoluteDifference = Math.abs(salesDifference);

  if (absoluteDifference <= thresholds.salesDifferenceAmount) {
    return [];
  }

  return [
    {
      id: "sales-difference-exceeded",
      label: "매출차액 초과",
      severity: "warning",
      detail: `매출차액 ${formatKrw(
        absoluteDifference,
      )}, 기준 ${formatKrw(thresholds.salesDifferenceAmount)}`,
    },
  ];
}

function formatBps(value: number) {
  return `${percentFormatter.format(value / 100)}%`;
}

function formatKrw(value: number) {
  return `${krwFormatter.format(value)}원`;
}

function formatQuantity(value: number) {
  return `${krwFormatter.format(value)}개`;
}
