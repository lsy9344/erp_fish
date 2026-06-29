import type {
  LedgerReviewStepMetric,
  LedgerReviewStepData,
  StoreManagerLedgerReviewStepData,
} from "./review-types";
import type {
  LedgerCostStepData,
  StoreManagerLedgerCostStepData,
} from "./types";

export function toStoreManagerLedgerCostStepData(
  data: LedgerCostStepData,
): StoreManagerLedgerCostStepData {
  // WO-10(2026-06-28): 급여액·인건비 합계는 본사 전용. grossProfit/productivity에
  // 더해 payrollTotal과 개인별 amount도 지점장 응답에서 제거한다. 근무자 명단/메모는
  // 지점장이 다루므로 amount만 뺀 라인으로 내려준다.
  const {
    grossProfit,
    productivity,
    payrollTotal,
    laborItems,
    purchaseItems,
    ...safeLedger
  } = data;

  void grossProfit;
  void productivity;
  void payrollTotal;

  return {
    ...safeLedger,
    laborItems: laborItems.map(({ amount, ...safeLine }) => {
      void amount;

      return safeLine;
    }),
    // WO-12(2026-06-28): 원본 이카운트 단가/보정 메타는 본사 전용. 지점장 응답에서 제거한다.
    // 적용 단가(unitPrice)는 지점장이 보는 정상 값이라 유지한다.
    purchaseItems: purchaseItems.map(
      ({
        sourceUnitPrice,
        unitPriceOverridden,
        unitPriceOverrideReason,
        ...safeLine
      }) => {
        void sourceUnitPrice;
        void unitPriceOverridden;
        void unitPriceOverrideReason;

        return safeLine;
      },
    ),
  };
}

// 정책 반전(2026-06-28, client-review-checklist-2026-06-28.md §1 / gap-review §3.1):
// 지점장 네트워크 응답에서 급여액·원가·마진·매출 차이 금액·재고금액을 모두 제거한다.
// (UI 숨김만으로 끝내지 않고 서버 응답에서 뺀다.) 2026-06-21에 의도적으로 노출했던
// grossMarginRate(마진율)와 inventoryAmount(총 재고금액)는 이 결정으로 차단 대상이 됐다.
// 재고 입력 화면의 FIFO 금액/원가도 별도로 제거한다(inventory/queries.ts). 결제차액(WO-01),
// 급여 합계(WO-10)는 이미 제거됨. 지점장 요약은 총매출·근무인원·운영 보조 카운트만 남긴다.
// 새 지표를 단계 요약에 추가할 때는 반드시 위 민감 차단 정책과 충돌하지 않는지 먼저 확인한다.
const storeManagerReviewMetricIds = new Set([
  "totalSales",
  "paymentTotal",
  "expenseCount",
  "purchaseCount",
  "inventoryCount",
  "reviewStatus",
  "lossCount",
  "workerCount",
  "laborCount",
]);

function isStoreManagerVisibleMetric(metric: LedgerReviewStepMetric): boolean {
  return storeManagerReviewMetricIds.has(metric.id);
}

// 지점장 응답에는 내부 OQ 코드를 그대로 노출하지 않는다. 본사 화면(getLedgerReviewStepData)은
// full summary를 유지한다.
const STORE_MANAGER_INTERNAL_POLICY_DETAIL =
  "계산 기준 확인이 필요합니다. 본사 기준 확인 후 확정됩니다.";

function toStoreManagerDetail(detail: string | undefined): string | undefined {
  if (detail?.includes("OQ-")) {
    return STORE_MANAGER_INTERNAL_POLICY_DETAIL;
  }

  return detail;
}

function toStoreManagerReviewStepMetrics(
  metrics: LedgerReviewStepMetric[],
): LedgerReviewStepMetric[] {
  return metrics
    .filter(isStoreManagerVisibleMetric)
    .map((metric) =>
      metric.detail === undefined
        ? metric
        : { ...metric, detail: toStoreManagerDetail(metric.detail) },
    );
}

export function toStoreManagerLedgerReviewStepData(
  data: LedgerReviewStepData,
): StoreManagerLedgerReviewStepData {
  const signals = data.signals.map(({ amount, ...signal }) => {
    void amount;

    return signal;
  });
  // 역산 부정행위 방지(point_summary.md:37): 합계 불일치 경고도 차액 금액(amount)을
  // 지점장 화면에 노출하지 않는다. 경고 사실(label/detail)만 남기고 금액은 제거한다.
  const warnings = data.warnings.map(({ amount, ...warning }) => {
    void amount;

    return warning;
  });
  const stepSummaries = data.stepSummaries.map((stepSummary) => ({
    ...stepSummary,
    detail: toStoreManagerDetail(stepSummary.detail) ?? stepSummary.detail,
    metrics: toStoreManagerReviewStepMetrics(stepSummary.metrics),
  }));

  return {
    ...data,
    signals,
    warnings,
    stepSummaries,
    // 2026-06-28: 마진율·재고금액은 본사 전용. 지점장 상단 요약은 총매출·근무인원만 남긴다.
    summary: {
      totalSales: data.summary.totalSales,
      workerCount: data.summary.workerCount,
    },
  };
}
