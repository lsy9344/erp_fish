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

test("ledger summary uses approved FIFO cost metrics without OQ-7/OQ-17 gate", async () => {
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
  assert.equal(summary.costOfGoodsSold.status, "ok");
  assert.equal(summary.grossMarginRate.value, 0.98);
  assert.equal(summary.grossMarginRate.status, "ok");
  assert.equal(summary.salesDifference.value, 98_000);
  assert.equal(summary.salesDifference.status, "ok");
  assert.doesNotMatch(summary.grossMarginRate.reason ?? "", /OQ-7|OQ-17/);
  assert.doesNotMatch(summary.salesDifference.reason ?? "", /OQ-7|OQ-17/);
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

  // legacy opening lot는 OQ gate가 아니라 원천 lot 근거 부족으로 분리한다.
  assert.equal(legacySummary.costOfGoodsSold.value, 7_000);
  assert.equal(legacySummary.costOfGoodsSold.status, "policy-unconfirmed");
  assert.doesNotMatch(legacySummary.costOfGoodsSold.reason ?? "", /OQ-7|OQ-17/);
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

test("one-decimal inventory corrections discard stale FIFO amounts and recalculate inventory", async () => {
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
        latestAppliedValue: { kind: "quantity", value: 4.5 },
      },
    ],
  });

  assert.equal(overlay.correctionState.appliedCorrectionCount, 1);
  assert.deepEqual(overlay.reviewInput.inventoryItems[0], {
    id: "inventory-1",
    previousQuantity: 10,
    purchasedQuantity: 0,
    currentQuantity: 4.5,
    quantity: 4.5,
    unitPrice: 100,
    inventoryAmount: 800,
    fifoConsumedAmount: null,
    fifoRemainingAmount: null,
    fifoContainsLegacyOpening: false,
    fifoLots: undefined,
  });

  const summary = calculateLedgerReviewSummary(overlay.reviewInput);

  assert.deepEqual(summary.costOfGoodsSold, { value: 550, status: "ok" });
  assert.deepEqual(summary.inventoryAmount, { value: 450, status: "ok" });
});

test("one-decimal loss corrections apply while finer precision remains unapplied", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { applyCorrectionValuesToLedgerReviewInput } = await import(
    pathToFileURL(calcPath).href
  );
  const reviewInput = {
    totalSalesAmount: 100_000,
    cashAmount: 40_000,
    cardAmount: 50_000,
    otherPaymentAmount: 10_000,
    workerCount: 4,
    expenseTotal: 0,
    inventoryItems: [],
  };
  const lossItems = [
    {
      id: "loss-1",
      productId: "product-1",
      productName: "광어",
      quantity: 1,
      amount: 100,
    },
  ];

  const accepted = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: "ledger-1",
    reviewInput,
    lossItems,
    corrections: [
      {
        targetType: "LOSS_ROW",
        targetId: "loss-1",
        fieldKey: "quantity",
        latestAppliedValue: { kind: "quantity", value: 1.5 },
      },
    ],
  });

  assert.equal(accepted.lossItems[0].quantity, 1.5);
  assert.equal(accepted.correctionState.appliedCorrectionCount, 1);

  const rejected = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: "ledger-1",
    reviewInput,
    lossItems,
    corrections: [
      {
        targetType: "LOSS_ROW",
        targetId: "loss-1",
        fieldKey: "quantity",
        latestAppliedValue: { kind: "quantity", value: 1.25 },
      },
    ],
  });

  assert.equal(rejected.lossItems[0].quantity, 1);
  assert.equal(rejected.correctionState.appliedCorrectionCount, 0);
  assert.equal(rejected.correctionState.hasUnappliedCorrections, true);
});

test("fractional worker-count and money corrections remain unapplied", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { applyCorrectionValuesToLedgerReviewInput } = await import(
    pathToFileURL(calcPath).href
  );
  const overlay = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: "ledger-1",
    reviewInput: {
      totalSalesAmount: 100_000,
      cashAmount: 40_000,
      cardAmount: 50_000,
      otherPaymentAmount: 10_000,
      workerCount: 4,
      expenseTotal: 0,
      inventoryItems: [],
    },
    corrections: [
      {
        targetType: "LEDGER_FIELD",
        targetId: "ledger-1",
        fieldKey: "workerCount",
        latestAppliedValue: { kind: "quantity", value: 2.5 },
      },
      {
        targetType: "PAYMENT_FIELD",
        targetId: "ledger-1",
        fieldKey: "cashAmount",
        latestAppliedValue: { kind: "money", value: 10.5 },
      },
    ],
  });

  assert.equal(overlay.reviewInput.workerCount, 4);
  assert.equal(overlay.reviewInput.cashAmount, 40_000);
  assert.equal(overlay.correctionState.appliedCorrectionCount, 0);
  assert.equal(overlay.correctionState.hasUnappliedCorrections, true);
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
