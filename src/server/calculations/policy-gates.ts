export type CalculationPolicyGateMetricId =
  | "salesDifferenceThresholdAnomaly"
  | "thirtyPercentUnitPrice"
  | "hopedSalePriceLossAmount"
  | "storeManagerSensitiveDerivedMetrics"
  | "salesDifferenceMeaningChange";

export type CalculationPolicyGate = {
  metricId: CalculationPolicyGateMetricId;
  label: string;
  status: "policy-unconfirmed";
  reason: string;
  oqIds: readonly string[];
};

export type PolicyUnconfirmedMetric = {
  metricId: CalculationPolicyGateMetricId;
  value: null;
  status: "policy-unconfirmed";
  label: "확인 필요";
  policyLabel: string;
  unavailableReason: "계산 기준 확인 필요";
  reason: string;
  oqIds: readonly string[];
};

const policyGates = [
  {
    metricId: "salesDifferenceThresholdAnomaly",
    label: "매출차액 임계값 이상 판정",
    status: "policy-unconfirmed",
    reason:
      "OQ-1 매출차액 허용 기준/임계값이 확정되지 않아 이상 판정 계산은 기준 확인 필요입니다. 정책 story로 분리하세요.",
    oqIds: ["OQ-1"],
  },
  {
    metricId: "thirtyPercentUnitPrice",
    label: "30%단가",
    status: "policy-unconfirmed",
    reason:
      "OQ-2 30%단가 의미와 적용 우선순위가 확정되지 않아 파생 단가 계산은 기준 확인 필요입니다. 정책 story로 분리하세요.",
    oqIds: ["OQ-2"],
  },
  {
    metricId: "hopedSalePriceLossAmount",
    label: "희망 판매가 기준 손실액",
    status: "policy-unconfirmed",
    reason:
      "OQ-9 희망 판매가 기준 손실액 정책이 확정되지 않아 파생 손실액 계산은 기준 확인 필요입니다. 정책 story로 분리하세요.",
    oqIds: ["OQ-9"],
  },
  {
    metricId: "storeManagerSensitiveDerivedMetrics",
    label: "지점장 민감 파생 지표",
    status: "policy-unconfirmed",
    reason:
      "OQ-10A 지점장 민감 파생 지표 노출 기준이 승인되지 않아 원가/이익 기반 값은 서버 응답 차단이 기본입니다. 정책 story로 분리하세요.",
    oqIds: ["OQ-10A"],
  },
  {
    metricId: "salesDifferenceMeaningChange",
    label: "차이의 당일 판매량 의미 변경",
    status: "policy-unconfirmed",
    reason:
      "OQ-14 차이를 당일 판매량으로 바꾸는 계산 의미 변경이 확정되지 않아 기존 차이 외 파생 계산은 기준 확인 필요입니다. 정책 story로 분리하세요.",
    oqIds: ["OQ-14"],
  },
] as const satisfies readonly CalculationPolicyGate[];

const policyGatesByMetricId = new Map(
  policyGates.map((gate) => [gate.metricId, gate]),
);

export function listCalculationPolicyGates(): readonly CalculationPolicyGate[] {
  return policyGates;
}

export function getCalculationPolicyGate(
  metricId: CalculationPolicyGateMetricId,
): CalculationPolicyGate {
  const gate = policyGatesByMetricId.get(metricId);

  if (!gate) {
    throw new Error(`Unknown calculation policy gate: ${metricId}`);
  }

  return gate;
}

export function createPolicyUnconfirmedMetric(
  metricId: CalculationPolicyGateMetricId,
): PolicyUnconfirmedMetric {
  const gate = getCalculationPolicyGate(metricId);

  return {
    metricId: gate.metricId,
    value: null,
    status: "policy-unconfirmed",
    label: "확인 필요",
    policyLabel: gate.label,
    unavailableReason: "계산 기준 확인 필요",
    reason: gate.reason,
    oqIds: gate.oqIds,
  };
}
