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
    [["margin-rate-unavailable", "이익률 계산 불가", "info"]],
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
  // 미팅 결정(2026-06-21): 기준 대비 몇 %p 미달과 그 미달 금액을 함께 보여준다.
  assert.match(signals[0].detail, /4\.0%p 미달/);
  assert.match(signals[0].detail, /미달 금액 6,000원/);
});

test("margin shortfall helper reuses the same math as the margin warning signal", async () => {
  const anomalyPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "anomaly.ts",
  );
  const { calculateMarginShortfall, formatMarginShortfallAmount } =
    await import(pathToFileURL(anomalyPath).href);

  // 마진율 31% + 기준 35% → 4.0%p 미달, 매출 150,000 기준 6,000원 미달.
  const shortfall = calculateMarginShortfall(thresholds, {
    totalSales: metric(150000),
    grossMarginRate: metric(0.31),
  });

  assert.ok(shortfall);
  assert.equal(shortfall.currentBps, 3100);
  assert.equal(shortfall.targetBps, 3500);
  assert.equal(shortfall.shortfallBps, 400);
  assert.equal(shortfall.shortfallAmount, 6000);
  assert.equal(formatMarginShortfallAmount(shortfall), "미달 금액 6,000원");

  // 기준 이상이면 null.
  assert.equal(
    calculateMarginShortfall(thresholds, {
      totalSales: metric(150000),
      grossMarginRate: metric(0.4),
    }),
    null,
  );

  // 마진율을 계산할 수 없으면 null.
  assert.equal(
    calculateMarginShortfall(thresholds, {
      totalSales: metric(150000),
      grossMarginRate: unavailable("계산 불가"),
    }),
    null,
  );

  // 총매출 미확정이면 미달분은 계산하되 금액은 null.
  const noSales = calculateMarginShortfall(thresholds, {
    totalSales: unavailable("계산 불가"),
    grossMarginRate: metric(0.31),
  });
  assert.ok(noSales);
  assert.equal(noSales.shortfallAmount, null);
  assert.equal(
    formatMarginShortfallAmount(noSales),
    "총매출 미확정으로 금액 계산 불가",
  );
});

test("revenue anomaly margin warning falls back gracefully when total sales is unavailable", async () => {
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
      totalSales: unavailable("계산 불가"),
      grossMarginRate: metric(0.31),
      salesDifference: unavailable("계산 기준 확인 필요"),
    },
    comparison: { policy: null, baseline: null },
  });

  assert.deepEqual(
    signals.map((signal) => [signal.id, signal.label, signal.severity]),
    [["margin-rate-below-threshold", "마진률 미달", "warning"]],
  );
  assert.match(signals[0].detail, /4\.0%p 미달/);
  assert.match(signals[0].detail, /총매출 미확정으로 금액 계산 불가/);
});
