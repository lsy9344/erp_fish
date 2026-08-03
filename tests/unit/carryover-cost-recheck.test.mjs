import assert from "node:assert/strict";
import test from "node:test";

const recheckUrl = new URL(
  "../../src/features/inventory/carryover-cost-recheck.ts",
  import.meta.url,
);

test("carryover lot signature comparison detects FIFO basis changes without quantity changes", async () => {
  const {
    toCarryoverLotSignature,
    compareCarryoverCostBasis,
    resolveCarryoverRecheckStatus,
  } = await import(recheckUrl.href);

  // 같은 구성은(저장 순서와 무관하게) 같은 시그니처다.
  const signatureA = toCarryoverLotSignature([
    { unitPrice: 100, quantity: 1 },
    { unitPrice: 200, quantity: 1 },
  ]);
  assert.equal(
    signatureA,
    toCarryoverLotSignature([
      { unitPrice: 200, quantity: 1 },
      { unitPrice: 100, quantity: 1 },
    ]),
  );

  // 0 이하 수량 lot은 이월 대상이 아니라 시그니처에서 제외한다.
  assert.equal(
    toCarryoverLotSignature([
      { unitPrice: 100, quantity: 1 },
      { unitPrice: 300, quantity: 0 },
    ]),
    toCarryoverLotSignature([{ unitPrice: 100, quantity: 1 }]),
  );

  // 총액이 같아도 lot 구성이 다르면(1×100+1×200 vs 1×150+1×150) 변화로 판정한다.
  // 합계만 비교하던 기존 판정이 놓치던 케이스다.
  const equalTotalDifferentComposition = toCarryoverLotSignature([
    { unitPrice: 150, quantity: 1 },
    { unitPrice: 150, quantity: 1 },
  ]);
  assert.notEqual(signatureA, equalTotalDifferentComposition);
  assert.equal(
    compareCarryoverCostBasis({
      sourceLotSignature: signatureA,
      recordedLotSignature: equalTotalDifferentComposition,
    }),
    "changed",
  );

  // 같은 구성이면 변화 없음.
  assert.equal(
    compareCarryoverCostBasis({
      sourceLotSignature: signatureA,
      recordedLotSignature: signatureA,
    }),
    "unchanged",
  );

  // 다음 장부에 기록된 근거가 없으면 비교 불가 → 기존 상태 유지(오탐 방지).
  assert.equal(
    compareCarryoverCostBasis({
      sourceLotSignature: signatureA,
      recordedLotSignature: null,
    }),
    "unchanged",
  );
  assert.equal(
    compareCarryoverCostBasis({
      sourceLotSignature: null,
      recordedLotSignature: null,
    }),
    "unchanged",
  );

  // 기록된 근거가 있는데 원천 품목 행이 사라졌거나(null) 남은 lot이 없으면("")
  // 근거 소실로 재확인이 필요하다.
  assert.equal(
    compareCarryoverCostBasis({
      sourceLotSignature: null,
      recordedLotSignature: signatureA,
    }),
    "basis-lost",
  );
  assert.equal(
    compareCarryoverCostBasis({
      sourceLotSignature: "",
      recordedLotSignature: signatureA,
    }),
    "basis-lost",
  );

  // REVIEW_REQUIRED 이월은 원천 장부 마감 시 재확인으로 승격한다(기존 정책 유지).
  assert.equal(
    resolveCarryoverRecheckStatus({
      currentStatus: "REVIEW_REQUIRED",
      isReviewRequiredCarryover: true,
      previousLedgerClosed: true,
      quantityMatches: true,
      costBasisComparison: "unchanged",
    }),
    "CARRYOVER_RECHECK_REQUIRED",
  );

  // 수량 불일치는 기존대로 재확인.
  assert.equal(
    resolveCarryoverRecheckStatus({
      currentStatus: "PREVIOUS_CARRYOVER",
      isReviewRequiredCarryover: false,
      previousLedgerClosed: true,
      quantityMatches: false,
      costBasisComparison: "unchanged",
    }),
    "CARRYOVER_RECHECK_REQUIRED",
  );

  // 수량이 같아도 lot 구성이 달라지면 재확인.
  assert.equal(
    resolveCarryoverRecheckStatus({
      currentStatus: "PREVIOUS_CARRYOVER",
      isReviewRequiredCarryover: false,
      previousLedgerClosed: true,
      quantityMatches: true,
      costBasisComparison: "changed",
    }),
    "CARRYOVER_RECHECK_REQUIRED",
  );

  // 근거 소실도 재확인.
  assert.equal(
    resolveCarryoverRecheckStatus({
      currentStatus: "PREVIOUS_CARRYOVER",
      isReviewRequiredCarryover: false,
      previousLedgerClosed: true,
      quantityMatches: true,
      costBasisComparison: "basis-lost",
    }),
    "CARRYOVER_RECHECK_REQUIRED",
  );

  // 수량·구성 모두 일치하면 현재 상태를 유지한다(실제 입력 자동 변경 없음).
  assert.equal(
    resolveCarryoverRecheckStatus({
      currentStatus: "PREVIOUS_CARRYOVER",
      isReviewRequiredCarryover: false,
      previousLedgerClosed: true,
      quantityMatches: true,
      costBasisComparison: "unchanged",
    }),
    "PREVIOUS_CARRYOVER",
  );
});
