export type AnomalyThresholdSignalSettings = {
  marginRateBps: number;
  inventoryDifferenceQuantity: number;
};

type AnomalyThresholdSignalSettingsInput = AnomalyThresholdSignalSettings & {
  isActive?: boolean;
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
  settings: AnomalyThresholdSignalSettingsInput | null,
): AnomalyThresholdSignalSettings | null {
  if (!settings || settings.isActive === false) {
    return null;
  }

  return {
    marginRateBps: settings.marginRateBps,
    inventoryDifferenceQuantity: settings.inventoryDifferenceQuantity,
  };
}

export function evaluateRevenueAnomalySignals({
  thresholds,
  current,
  comparison: _comparison,
}: {
  thresholds: AnomalyThresholdSignalSettings | null;
  current: RevenueAnomalyMetrics;
  comparison: RevenueAnomalyComparison;
}): AnomalySignalSummary[] {
  if (!thresholds) {
    return [pendingSignal];
  }

  return [...evaluateMarginRateSignal(thresholds, current)];
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

  return [...evaluateInventoryDifferenceSignal(thresholds, current)];
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
        detail:
          "재고 이상 신호 계산에 필요한 장부 재고 데이터가 아직 없습니다.",
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

  const largestAdjustment =
    current.inventoryAdjustments.reduce<InventoryLossAnomalyAdjustment | null>(
      (largest, item) => {
        if (!largest) {
          return item;
        }

        return Math.abs(item.differenceQuantity) >
          Math.abs(largest.differenceQuantity)
          ? item
          : largest;
      },
      null,
    );

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

function evaluateMarginRateSignal(
  thresholds: AnomalyThresholdSignalSettings,
  current: RevenueAnomalyMetrics,
): AnomalySignalSummary[] {
  const currentRate = current.grossMarginRate.value;

  if (currentRate === null || !Number.isFinite(currentRate)) {
    return [
      {
        id: "margin-rate-unavailable",
        label: "마진률 계산 불가",
        severity: "info",
        detail:
          "마진률 기준 판정에 필요한 현재 장부 마진률을 계산할 수 없습니다.",
      },
    ];
  }

  const currentBps = currentRate * 10000;
  if (currentBps >= thresholds.marginRateBps) {
    return [];
  }

  return [
    {
      id: "margin-rate-below-threshold",
      label: "마진률 미달",
      severity: "warning",
      detail: `마진률 ${formatBps(currentBps)}, 기준 ${formatBps(
        thresholds.marginRateBps,
      )}`,
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
