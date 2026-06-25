import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

function readProjectFile(...segments) {
  return readFileSync(assertProjectFile(...segments), "utf8");
}

test("OQ-gated calculation registry returns policy-unconfirmed metric contracts", async () => {
  const gatePath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "policy-gates.ts",
  );
  const {
    createPolicyUnconfirmedMetric,
    getCalculationPolicyGate,
    listCalculationPolicyGates,
  } = await import(pathToFileURL(gatePath).href);

  const gates = listCalculationPolicyGates();

  assert.deepEqual(
    gates.map((gate) => gate.metricId),
    [
      "salesDifferenceThresholdAnomaly",
      "thirtyPercentUnitPrice",
      "fifoCostOfGoodsSold",
      "fifoInventoryAmount",
      "hopedSalePriceLossAmount",
      "storeManagerSensitiveDerivedMetrics",
      "salesDifferenceMeaningChange",
    ],
  );

  for (const gate of gates) {
    assert.equal(gate.status, "policy-unconfirmed");
    assert.equal(typeof gate.label, "string");
    assert.equal(gate.label.length > 0, true);
    assert.equal(gate.reason.includes("정책"), true);
    assert.equal(gate.reason.includes("story로 분리"), true);
    assert.equal(gate.oqIds.length > 0, true);

    const metric = createPolicyUnconfirmedMetric(gate.metricId);
    assert.deepEqual(metric, {
      metricId: gate.metricId,
      value: null,
      status: "policy-unconfirmed",
      label: "확인 필요",
      policyLabel: gate.label,
      unavailableReason: "계산 기준 확인 필요",
      reason: gate.reason,
      oqIds: gate.oqIds,
    });
  }

  assert.deepEqual(getCalculationPolicyGate("thirtyPercentUnitPrice").oqIds, [
    "OQ-2",
  ]);
  assert.deepEqual(getCalculationPolicyGate("fifoCostOfGoodsSold").oqIds, [
    "OQ-7",
    "OQ-17",
  ]);
  assert.deepEqual(getCalculationPolicyGate("fifoInventoryAmount").oqIds, [
    "OQ-7",
    "OQ-17",
  ]);
  assert.deepEqual(getCalculationPolicyGate("hopedSalePriceLossAmount").oqIds, [
    "OQ-9",
  ]);
  assert.deepEqual(
    getCalculationPolicyGate("storeManagerSensitiveDerivedMetrics").oqIds,
    ["OQ-10A"],
  );
  assert.deepEqual(
    getCalculationPolicyGate("salesDifferenceMeaningChange").oqIds,
    ["OQ-14"],
  );
});

test("ledger summary gates FIFO cost metrics but exposes FIFO inventory amount (OQ-7/OQ-17 approved)", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );

  const summary = calculateLedgerReviewSummary({
    totalSalesAmount: 100_000,
    cashAmount: 40_000,
    cardAmount: 50_000,
    otherPaymentAmount: 8_000,
    workerCount: 4,
    expenseTotal: 12_000,
    inventoryItems: [
      {
        previousQuantity: 10,
        purchasedQuantity: 5,
        currentQuantity: 8,
        quantity: 8,
        unitPrice: 1_000,
        inventoryAmount: 8_000,
        fifoConsumedAmount: 2_000,
        fifoRemainingAmount: 1_000,
        fifoContainsLegacyOpening: false,
      },
    ],
    inventoryAdjustments: [],
    lossItems: [],
  });

  assert.equal(summary.costOfGoodsSold.value, 2_000);
  assert.equal(summary.costOfGoodsSold.status, "policy-unconfirmed");
  assert.equal(summary.grossMarginRate.value, 0.98);
  assert.equal(summary.grossMarginRate.status, "policy-unconfirmed");
  // OQ-7/OQ-17 결정(2026-06-22): FIFO 재고금액은 노출 확정. 더 이상 게이트하지 않고 ok.
  assert.equal(summary.inventoryAmount.value, 1_000);
  assert.equal(summary.inventoryAmount.status, "ok");

  const legacySummary = calculateLedgerReviewSummary({
    totalSalesAmount: 100_000,
    cashAmount: 40_000,
    cardAmount: 50_000,
    otherPaymentAmount: 8_000,
    workerCount: 4,
    expenseTotal: 12_000,
    inventoryItems: [
      {
        previousQuantity: 10,
        purchasedQuantity: 5,
        currentQuantity: 8,
        quantity: 8,
        unitPrice: 1_000,
        inventoryAmount: 8_000,
        fifoConsumedAmount: 7_000,
        fifoRemainingAmount: 8_000,
        fifoContainsLegacyOpening: true,
      },
    ],
    inventoryAdjustments: [],
    lossItems: [],
  });

  // legacy opening lot가 있어도 COGS는 계속 게이트(원가 민감), 재고금액은 노출 확정.
  assert.equal(legacySummary.costOfGoodsSold.value, 7_000);
  assert.equal(legacySummary.costOfGoodsSold.status, "policy-unconfirmed");
  assert.equal(legacySummary.inventoryAmount.value, 8_000);
  assert.equal(legacySummary.inventoryAmount.status, "ok");
});

test("ledger summary falls back when FIFO lot rows are empty", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );

  const summary = calculateLedgerReviewSummary({
    totalSalesAmount: 100_000,
    cashAmount: 40_000,
    cardAmount: 50_000,
    otherPaymentAmount: 8_000,
    workerCount: 4,
    expenseTotal: 12_000,
    inventoryItems: [
      {
        previousQuantity: 10,
        purchasedQuantity: 5,
        currentQuantity: 8,
        quantity: 8,
        unitPrice: 1_000,
        inventoryAmount: 8_000,
        fifoLots: [],
      },
    ],
    inventoryAdjustments: [],
    lossItems: [],
  });

  assert.deepEqual(summary.costOfGoodsSold, { value: 7_000, status: "ok" });
  assert.deepEqual(summary.inventoryAmount, { value: 8_000, status: "ok" });
});

test("inventory corrections discard stale FIFO amounts", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const {
    applyCorrectionValuesToLedgerReviewInput,
    calculateLedgerReviewSummary,
  } = await import(pathToFileURL(calcPath).href);

  const overlay = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: "ledger-1",
    reviewInput: {
      totalSalesAmount: 100_000,
      cashAmount: 40_000,
      cardAmount: 50_000,
      otherPaymentAmount: 8_000,
      workerCount: 4,
      expenseTotal: 12_000,
      inventoryItems: [
        {
          id: "inventory-1",
          previousQuantity: 10,
          purchasedQuantity: 0,
          currentQuantity: 8,
          quantity: 8,
          unitPrice: 100,
          inventoryAmount: 800,
          fifoConsumedAmount: 200,
          fifoRemainingAmount: 800,
          fifoContainsLegacyOpening: false,
          fifoLots: [
            {
              sourceType: "PREVIOUS_CARRYOVER",
              consumedAmount: 200,
              remainingAmount: 800,
            },
          ],
        },
      ],
      inventoryAdjustments: [],
      lossItems: [],
    },
    corrections: [
      {
        targetType: "INVENTORY_ROW",
        targetId: "inventory-1",
        fieldKey: "currentQuantity",
        latestAppliedValue: { kind: "quantity", value: 4 },
      },
    ],
  });

  assert.equal(overlay.correctionState.appliedCorrectionCount, 1);

  const summary = calculateLedgerReviewSummary(overlay.reviewInput);

  assert.deepEqual(summary.costOfGoodsSold, { value: 600, status: "ok" });
  assert.deepEqual(summary.inventoryAmount, { value: 400, status: "ok" });
});

test("dashboard and reports use shared calculation or policy gate helpers instead of local OQ formulas", () => {
  const dashboardSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );
  const reportsSource = readProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );
  const reviewQuerySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-queries.ts",
  );

  for (const source of [dashboardSource, reportsSource, reviewQuerySource]) {
    assert.match(source, /calculateLedgerReviewSummary/);
    assert.match(source, /policy-gates/);
    assert.doesNotMatch(source, /30\s*%\s*단가|thirty\s*percent/i);
    assert.doesNotMatch(source, /hoped|희망\s*판매가/i);
    assert.doesNotMatch(source, /0\.3\s*\*|\*\s*0\.3/);
  }
});
