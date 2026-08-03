import assert from "node:assert/strict";
import test from "node:test";

const recheckUrl = new URL(
  "../../src/features/inventory/carryover-cost-recheck.ts",
  import.meta.url,
);

test("carryover cost basis comparison detects FIFO changes without quantity changes", async () => {
  const { isCarryoverCostBasisChanged, resolveCarryoverRecheckStatus } =
    await import(recheckUrl.href);

  // 원가가 같으면 변화 없음.
  assert.equal(
    isCarryoverCostBasisChanged({
      previousRemainingCost: 3000,
      recordedCarryoverCost: 3000,
    }),
    false,
  );

  // 수량이 같아도 원가 근거가 달라지면 변화.
  assert.equal(
    isCarryoverCostBasisChanged({
      previousRemainingCost: 3600,
      recordedCarryoverCost: 3000,
    }),
    true,
  );

  // 한쪽 근거가 없으면(false/null) 강제로 재확인을 띄우지 않는다.
  assert.equal(
    isCarryoverCostBasisChanged({
      previousRemainingCost: null,
      recordedCarryoverCost: 3000,
    }),
    false,
  );
  assert.equal(
    isCarryoverCostBasisChanged({
      previousRemainingCost: 3000,
      recordedCarryoverCost: null,
    }),
    false,
  );

  // REVIEW_REQUIRED 이월은 원천 장부 마감 시 재확인으로 승격한다(기존 정책 유지).
  assert.equal(
    resolveCarryoverRecheckStatus({
      currentStatus: "REVIEW_REQUIRED",
      isReviewRequiredCarryover: true,
      previousLedgerClosed: true,
      quantityMatches: true,
      previousRemainingCost: 3000,
      recordedCarryoverCost: 3000,
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
      previousRemainingCost: 3000,
      recordedCarryoverCost: 3000,
    }),
    "CARRYOVER_RECHECK_REQUIRED",
  );

  // 수량이 같아도 원가 근거가 달라지면 재확인.
  assert.equal(
    resolveCarryoverRecheckStatus({
      currentStatus: "PREVIOUS_CARRYOVER",
      isReviewRequiredCarryover: false,
      previousLedgerClosed: true,
      quantityMatches: true,
      previousRemainingCost: 3600,
      recordedCarryoverCost: 3000,
    }),
    "CARRYOVER_RECHECK_REQUIRED",
  );

  // 수량·원가 모두 일치하면 현재 상태를 유지한다(실제 입력 자동 변경 없음).
  assert.equal(
    resolveCarryoverRecheckStatus({
      currentStatus: "PREVIOUS_CARRYOVER",
      isReviewRequiredCarryover: false,
      previousLedgerClosed: true,
      quantityMatches: true,
      previousRemainingCost: 3000,
      recordedCarryoverCost: 3000,
    }),
    "PREVIOUS_CARRYOVER",
  );
});
