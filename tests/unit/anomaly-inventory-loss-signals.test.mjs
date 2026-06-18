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

const completeInventoryItem = {
  productName: "꽃게",
  previousQuantity: 10,
  purchasedQuantity: 5,
  currentQuantity: 15,
  quantity: 15,
  unitPrice: 1000,
};

test("inventory/loss anomaly helper distinguishes missing thresholds, missing input, and normal zero", async () => {
  const anomalyPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "anomaly.ts",
  );
  const { evaluateInventoryLossAnomalySignals } = await import(
    pathToFileURL(anomalyPath).href
  );

  assert.deepEqual(
    evaluateInventoryLossAnomalySignals({
      thresholds: null,
      current: {
        inventoryItems: [completeInventoryItem],
        inventoryAdjustments: [],
        lossItems: [],
      },
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

  const missingInput = evaluateInventoryLossAnomalySignals({
    thresholds,
    current: {
      inventoryItems: null,
      inventoryAdjustments: null,
      lossItems: null,
    },
  });

  assert.deepEqual(
    missingInput.map((signal) => [signal.id, signal.label, signal.severity]),
    [["inventory-input-required", "재고 입력 필요", "info"]],
  );

  const missingInventoryRows = evaluateInventoryLossAnomalySignals({
    thresholds,
    current: {
      inventoryItems: [],
      inventoryAdjustments: [],
      lossItems: [],
    },
  });

  assert.deepEqual(
    missingInventoryRows.map((signal) => [
      signal.id,
      signal.label,
      signal.severity,
    ]),
    [["inventory-input-required", "재고 입력 필요", "info"]],
  );

  assert.deepEqual(
    evaluateInventoryLossAnomalySignals({
      thresholds,
      current: {
        inventoryItems: [completeInventoryItem],
        inventoryAdjustments: [],
        lossItems: [],
      },
    }),
    [],
  );
});

test("inventory/loss anomaly helper emits only inventory critical signals with actual and threshold details", async () => {
  const anomalyPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "anomaly.ts",
  );
  const { evaluateInventoryLossAnomalySignals } = await import(
    pathToFileURL(anomalyPath).href
  );

  const signals = evaluateInventoryLossAnomalySignals({
    thresholds,
    current: {
      inventoryItems: [completeInventoryItem],
      inventoryAdjustments: [
        {
          productName: "꽃게",
          differenceQuantity: -12,
          differenceAmount: -12000,
          reason: "실사 차이",
        },
      ],
      lossItems: [
        {
          productId: "product-flatfish",
          productName: "광어",
          quantity: 3,
          amount: 52000,
        },
      ],
    },
  });

  assert.deepEqual(
    signals.map((signal) => [signal.id, signal.label, signal.severity]),
    [["inventory-difference-exceeded", "재고 이상", "critical"]],
  );
  assert.match(signals[0].detail, /꽃게/);
  assert.match(signals[0].detail, /12개/);
  assert.match(signals[0].detail, /기준 10개/);
  assert.ok(
    signals.every((signal) => signal.id !== "loss-amount-exceeded"),
    "손실액 이상 신호는 삭제된 기준값이므로 더 이상 생성하지 않습니다.",
  );
});

test("inventory/loss anomaly helper requires values to exceed thresholds", async () => {
  const anomalyPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "anomaly.ts",
  );
  const { evaluateInventoryLossAnomalySignals } = await import(
    pathToFileURL(anomalyPath).href
  );

  assert.deepEqual(
    evaluateInventoryLossAnomalySignals({
      thresholds,
      current: {
        inventoryItems: [completeInventoryItem],
        inventoryAdjustments: [
          {
            productName: "꽃게",
            differenceQuantity: -10,
            differenceAmount: -10000,
            reason: "실사 차이",
          },
        ],
        lossItems: [
          {
            productId: "product-flatfish",
            productName: "광어",
            quantity: 3,
            amount: 999999,
          },
        ],
      },
    }),
    [],
  );
});

test("inventory/loss anomaly helper reports inventory calculation unavailable without silently replacing values with zero", async () => {
  const anomalyPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "anomaly.ts",
  );
  const { evaluateInventoryLossAnomalySignals } = await import(
    pathToFileURL(anomalyPath).href
  );

  const signals = evaluateInventoryLossAnomalySignals({
    thresholds,
    current: {
      inventoryItems: [
        {
          ...completeInventoryItem,
          currentQuantity: null,
          quantity: null,
        },
      ],
      inventoryAdjustments: [],
      lossItems: [],
    },
  });

  assert.deepEqual(
    signals.map((signal) => [signal.id, signal.label, signal.severity]),
    [["inventory-calculation-unavailable", "재고 계산 불가", "info"]],
  );
});
