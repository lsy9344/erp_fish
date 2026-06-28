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

// 미팅 결정(2026-06-21): 지점장 계산값(검토/원가 요약)에 마진률(%)과 총 재고금액은 노출한다.
// 단, 매출원가·매출이익·영업이익·인당생산성·FIFO 원가는 이 요약 화면에서 계속 차단한다.
// 보완(2026-06-22): 재고 입력 화면 한정으로 FIFO 재고금액과 판매 lot 이력은 지점장에게도
// 노출한다(inventory/queries.ts toStoreManagerInventoryStepData). 이 요약 화면의 차단과 별개다.
// 보완(2026-06-22 WO-01): 결제차액은 본사 역할이므로 지점장 요약에서 제거, 근무인원 수 추가.
//
// 검토 후속(2026-06-22): 원문(point_summary.md:41)은 지점장 상단 요약을 "총매출·마진율·재고금액"으로
// 좁힐 것을 요구한다. 상단 summary(아래 toStoreManagerLedgerReviewStepData의 summary 블록)는
// 이를 그대로 따른다(totalSales/grossMarginRate/workerCount/inventoryAmount, 단 workerCount는 WO-01 확정).
// 단계(step) 요약의 paymentTotal·각종 count는 운영 보조 카운트/합계로 남긴다.
// WO-10(2026-06-28): 급여액·인건비 합계는 본사 전용으로 확정됐다. 2026-06-22에 의도적으로
// 노출했던 payrollTotal(급여 합계 금액)은 지점장 단계 요약에서 제거한다. laborCount(급여 항목
// "건수")는 금액이 아니므로 운영 보조 카운트로 유지한다.
// 새 지표를 단계 요약에 추가할 때는 반드시 위 민감 차단 목록과 충돌하지 않는지 먼저 확인한다.
const storeManagerReviewMetricIds = new Set([
  "totalSales",
  "paymentTotal",
  "grossMarginRate",
  "expenseCount",
  "purchaseCount",
  "inventoryCount",
  "inventoryAmount",
  "reviewStatus",
  "lossCount",
  "workerCount",
  "laborCount",
]);

// 마진률·재고금액은 정상 계산값일 때만 노출한다. 원천 lot 근거 부족 등으로
// status가 ok가 아니면(policy-unconfirmed/data-insufficient) 지점장 화면에서 숨긴다.
// 이렇게 해야 원가 근거가 "기준 확인 필요" 형태로도 새지 않는다.
const conditionalStoreManagerMetricIds = new Set([
  "grossMarginRate",
  "inventoryAmount",
]);

function isStoreManagerVisibleMetric(metric: LedgerReviewStepMetric): boolean {
  if (!storeManagerReviewMetricIds.has(metric.id)) {
    return false;
  }

  if (conditionalStoreManagerMetricIds.has(metric.id)) {
    return metric.status === "ok";
  }

  return true;
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
    summary: {
      totalSales: data.summary.totalSales,
      grossMarginRate: data.summary.grossMarginRate,
      workerCount: data.summary.workerCount,
      inventoryAmount: data.summary.inventoryAmount,
    },
  };
}
