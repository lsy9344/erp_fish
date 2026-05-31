import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

const thresholds = {
  salesDropRateBps: 1250,
  grossMarginDropBps: 350,
  salesDifferenceAmount: 10000,
  lossAmount: 50000,
  inventoryDifferenceQuantity: 10,
};

const metric = (value) => ({ value });
const unavailable = (unavailableReason) => ({
  value: null,
  unavailableReason,
});

test("revenue anomaly helper reports missing thresholds and unresolved policies instead of normal", async () => {
  const anomalyPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "anomaly.ts",
  );
  const { evaluateRevenueAnomalySignals } = await import(
    pathToFileURL(anomalyPath).href
  );

  assert.deepEqual(
    evaluateRevenueAnomalySignals({
      thresholds: null,
      current: {
        totalSales: metric(120000),
        grossMarginRate: metric(0.32),
        salesDifference: unavailable("계산 기준 확인 필요"),
      },
      comparison: { policy: null, baseline: null },
    }),
    [
      {
        id: "thresholds-pending",
        label: "기준값 설정 전",
        severity: "info",
        detail: "기준값 기반 이상 신호는 기준값 저장 후 계산합니다.",
      },
    ],
  );

  const unresolved = evaluateRevenueAnomalySignals({
    thresholds,
    current: {
      totalSales: metric(120000),
      grossMarginRate: unavailable("계산 불가"),
      salesDifference: unavailable("계산 기준 확인 필요"),
    },
    comparison: { policy: null, baseline: null },
  });

  assert.deepEqual(
    unresolved.map((signal) => [signal.id, signal.label, signal.severity]),
    [
      ["sales-drop-policy-required", "매출 기준 확인", "info"],
      ["gross-margin-unavailable", "이익률 계산 불가", "info"],
      ["sales-difference-unavailable", "매출차액 기준 확인", "info"],
    ],
  );
  assert.ok(
    unresolved.every((signal) => signal.label !== "기준값 저장됨"),
    "configured thresholds should not be shown as a generic placeholder",
  );
});

test("revenue anomaly helper preserves current calculation unavailable before policy gaps", async () => {
  const anomalyPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "anomaly.ts",
  );
  const { evaluateRevenueAnomalySignals } = await import(
    pathToFileURL(anomalyPath).href
  );

  const signals = evaluateRevenueAnomalySignals({
    thresholds,
    current: {
      totalSales: metric(120000),
      grossMarginRate: unavailable("계산 불가"),
      salesDifference: unavailable("계산 기준 확인 필요"),
    },
    comparison: { policy: null, baseline: null },
  });

  assert.deepEqual(
    signals.map((signal) => [signal.id, signal.label]),
    [
      ["sales-drop-policy-required", "매출 기준 확인"],
      ["gross-margin-unavailable", "이익률 계산 불가"],
      ["sales-difference-unavailable", "매출차액 기준 확인"],
    ],
  );
});

test("revenue anomaly helper does not round below-threshold drops into warnings", async () => {
  const anomalyPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "anomaly.ts",
  );
  const { evaluateRevenueAnomalySignals } = await import(
    pathToFileURL(anomalyPath).href
  );

  const signals = evaluateRevenueAnomalySignals({
    thresholds,
    current: {
      totalSales: metric(87505),
      grossMarginRate: metric(0.38501),
      salesDifference: metric(9999),
    },
    comparison: {
      policy: "manual-baseline",
      baseline: {
        totalSales: metric(100000),
        grossMarginRate: metric(0.42),
      },
    },
  });

  assert.deepEqual(signals, []);
});

test("revenue anomaly helper emits warning chips with actual and threshold details", async () => {
  const anomalyPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "anomaly.ts",
  );
  const { evaluateRevenueAnomalySignals } = await import(
    pathToFileURL(anomalyPath).href
  );

  const signals = evaluateRevenueAnomalySignals({
    thresholds,
    current: {
      totalSales: metric(150000),
      grossMarginRate: metric(0.31),
      salesDifference: metric(-48000),
    },
    comparison: {
      policy: "manual-baseline",
      baseline: {
        totalSales: metric(200000),
        grossMarginRate: metric(0.42),
      },
    },
  });

  assert.deepEqual(
    signals.map((signal) => [signal.id, signal.label, signal.severity]),
    [
      ["sales-drop", "매출 급락", "warning"],
      ["gross-margin-drop", "이익률 급락", "warning"],
      ["sales-difference-exceeded", "매출차액 초과", "warning"],
    ],
  );
  assert.match(signals[0].detail, /25\.0% 하락/);
  assert.match(signals[0].detail, /기준 12\.5%/);
  assert.match(signals[1].detail, /11\.0%p 하락/);
  assert.match(signals[1].detail, /기준 3\.5%p/);
  assert.match(signals[2].detail, /48,000원/);
  assert.match(signals[2].detail, /기준 10,000원/);
});
