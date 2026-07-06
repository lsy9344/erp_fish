export type AnomalyThresholdSignalSettings = {
  marginRateBps: number;
};

// WO-01(2026-06-22): 재고 오차 허용 범위를 제로화한다. inventoryDifferenceQuantity는
// 더 이상 편집 가능한 기준이 아니며, DB 호환을 위해 입력에는 남을 수 있으나 신호 계산에서는 무시한다.
type AnomalyThresholdSignalSettingsInput = AnomalyThresholdSignalSettings & {
  inventoryDifferenceQuantity?: number;
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

export type MarginShortfall = {
  currentBps: number;
  targetBps: number;
  shortfallBps: number;
  shortfallAmount: number | null;
};

/**
 * 현재 마진률이 기준 미달인지 판정하고, 미달분(%p)과 그 미달 금액을 계산한다.
 * 미팅 결정(2026-06-21): 마진률 미달 금액을 관제판에 직접 노출하기 위해
 * 마진률 이상 신호와 동일한 계산을 재사용한다. 마진률을 계산할 수 없거나
 * 기준 이상이면 null을 돌려준다.
 */
export function calculateMarginShortfall(
  thresholds: AnomalyThresholdSignalSettings,
  current: Pick<RevenueAnomalyMetrics, "totalSales" | "grossMarginRate">,
): MarginShortfall | null {
  const currentRate = current.grossMarginRate.value;

  if (currentRate === null || !Number.isFinite(currentRate)) {
    return null;
  }

  const currentBps = currentRate * 10000;

  if (currentBps >= thresholds.marginRateBps) {
    return null;
  }

  const shortfallBps = thresholds.marginRateBps - currentBps;
  const totalSales = current.totalSales.value;
  const shortfallAmount =
    totalSales !== null && Number.isFinite(totalSales)
      ? (shortfallBps / 10000) * totalSales
      : null;

  return {
    currentBps,
    targetBps: thresholds.marginRateBps,
    shortfallBps,
    shortfallAmount,
  };
}

export function formatMarginShortfallAmount(shortfall: MarginShortfall) {
  return shortfall.shortfallAmount === null
    ? "총매출 미확정으로 금액 계산 불가"
    : `미달 금액 ${formatKrw(Math.round(shortfall.shortfallAmount))}`;
}

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

  return [...evaluateInventoryDifferenceSignal(current)];
}

function evaluateInventoryDifferenceSignal(
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

  // WO-01(2026-06-22): 재고 오차 허용 범위 제로화. 수량 차이가 1개라도 있으면 이상 신호로 본다.
  if (!largestAdjustment || largestAdjustment.differenceQuantity === 0) {
    return [];
  }

  return [
    {
      id: "inventory-difference-exceeded",
      label: "재고 이상",
      severity: "critical",
      detail: `${largestAdjustment.productName} 재고 차이 ${formatQuantity(
        Math.abs(largestAdjustment.differenceQuantity),
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
        // WO-05(2026-06-22): 원문(point_summary.md:14) 확정 문구 "이익률 계산 불가"를 사용한다.
        id: "margin-rate-unavailable",
        label: "이익률 계산 불가",
        severity: "info",
        detail:
          "이익률 기준 판정에 필요한 현재 장부 이익률을 계산할 수 없습니다.",
      },
    ];
  }

  // 미팅 결정(2026-06-21): 매출 차액 금액은 삭제하고, 마진률이 기준 대비
  // 몇 %p 미달했는지와 그 미달분에 해당하는 금액을 함께 보여준다.
  const shortfall = calculateMarginShortfall(thresholds, current);

  if (shortfall === null) {
    return [];
  }

  return [
    {
      id: "margin-rate-below-threshold",
      label: "마진률 미달",
      severity: "warning",
      detail: `마진률 ${formatBps(shortfall.currentBps)}, 기준 ${formatBps(
        shortfall.targetBps,
      )}, ${formatPercentagePoints(
        shortfall.shortfallBps,
      )} 미달, ${formatMarginShortfallAmount(shortfall)}`,
    },
  ];
}

function formatPercentagePoints(bps: number) {
  return `${percentFormatter.format(bps / 100)}%p`;
}

function formatBps(value: number) {
  return `${percentFormatter.format(value / 100)}%`;
}

function formatKrw(value: number) {
  return `${krwFormatter.format(value)}원`;
}

const quantityFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 2,
});

function formatQuantity(value: number) {
  return `${quantityFormatter.format(value)}개`;
}
