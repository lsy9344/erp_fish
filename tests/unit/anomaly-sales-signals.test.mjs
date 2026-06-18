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
  marginRateBps: 3500,
  inventoryDifferenceQuantity: 10,
};

const metric = (value) => ({ value });
const unavailable = (unavailableReason) => ({
  value: null,
  unavailableReason,
});

test("revenue anomaly helper reports missing thresholds and unavailable margin instead of normal", async () => {
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
    [["margin-rate-unavailable", "마진률 계산 불가", "info"]],
  );
  assert.ok(
    unresolved.every((signal) => signal.label !== "기준값 저장됨"),
    "configured thresholds should not be shown as a generic placeholder",
  );
});

test("revenue anomaly helper ignores deleted sales and sales-difference threshold signals", async () => {
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
      totalSales: metric(1),
      grossMarginRate: metric(0.36),
      salesDifference: metric(999999),
    },
    comparison: {
      policy: "manual-baseline",
      baseline: {
        totalSales: metric(100000),
        grossMarginRate: metric(0.9),
      },
    },
  });

  assert.deepEqual(signals, []);
});

test("revenue anomaly helper does not round equal-threshold margin into warnings", async () => {
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
      grossMarginRate: metric(0.35),
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

test("revenue anomaly helper treats margin above threshold as normal", async () => {
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
      totalSales: metric(87500),
      grossMarginRate: metric(0.351),
      salesDifference: metric(10000),
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

test("revenue anomaly helper emits warning chip when margin is below threshold", async () => {
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
    [["margin-rate-below-threshold", "마진률 미달", "warning"]],
  );
  assert.match(signals[0].detail, /마진률 31\.0%/);
  assert.match(signals[0].detail, /기준 35\.0%/);
});
