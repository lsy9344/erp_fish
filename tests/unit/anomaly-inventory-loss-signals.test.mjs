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

// WO-01(2026-06-22): 재고 오차 허용 범위 제로화. 활성 기준값이 있으면 수량 차이 1개도 이상 신호다.
const thresholds = {
  marginRateBps: 3500,
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
  // WO-01(2026-06-22): 허용 기준 제거로 detail에 "기준 Nn개" 문구를 더 이상 넣지 않는다.
  assert.doesNotMatch(signals[0].detail, /기준 \d+개/);
  assert.ok(
    signals.every((signal) => signal.id !== "loss-amount-exceeded"),
    "손실액 이상 신호는 삭제된 기준값이므로 더 이상 생성하지 않습니다.",
  );
});

test("inventory/loss anomaly helper flags any non-zero difference once thresholds are active (WO-01 재고 오차 제로화)", async () => {
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
          differenceQuantity: 1,
          differenceAmount: 1000,
          reason: "실사 차이",
        },
      ],
      lossItems: [],
    },
  });

  assert.deepEqual(
    signals.map((signal) => [signal.id, signal.label, signal.severity]),
    [["inventory-difference-exceeded", "재고 이상", "critical"]],
  );
  assert.match(signals[0].detail, /1개/);
});

test("inventory/loss anomaly helper stays silent only when there is zero quantity difference", async () => {
  const anomalyPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "anomaly.ts",
  );
  const { evaluateInventoryLossAnomalySignals } = await import(
    pathToFileURL(anomalyPath).href
  );

  // WO-01(2026-06-22): 차이 수량이 정확히 0일 때만 이상 신호가 생기지 않는다.
  assert.deepEqual(
    evaluateInventoryLossAnomalySignals({
      thresholds,
      current: {
        inventoryItems: [completeInventoryItem],
        inventoryAdjustments: [
          {
            productName: "꽃게",
            differenceQuantity: 0,
            differenceAmount: 0,
            reason: "차이 없음",
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

  // 음수 차이도 1개라도 있으면 이상 신호로 본다.
  const negativeSignals = evaluateInventoryLossAnomalySignals({
    thresholds,
    current: {
      inventoryItems: [completeInventoryItem],
      inventoryAdjustments: [
        {
          productName: "꽃게",
          differenceQuantity: -1,
          differenceAmount: -1000,
          reason: "실사 차이",
        },
      ],
      lossItems: [],
    },
  });

  assert.deepEqual(
    negativeSignals.map((signal) => [signal.id, signal.severity]),
    [["inventory-difference-exceeded", "critical"]],
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
