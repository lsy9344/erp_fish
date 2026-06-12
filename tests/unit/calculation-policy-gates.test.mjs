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

test("ledger summary keeps MVP calculations and exposes OQ-gated policy state through the shared helper", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const gatePath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "policy-gates.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );
  const { createPolicyUnconfirmedMetric } = await import(
    pathToFileURL(gatePath).href
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
      },
    ],
    inventoryAdjustments: [],
    lossItems: [],
  });

  assert.deepEqual(summary.costOfGoodsSold, { value: 7_000, status: "ok" });
  assert.deepEqual(summary.inventoryAmount, { value: 8_000, status: "ok" });
  assert.equal(
    summary.costOfGoodsSold.reason?.includes("FIFO") ?? false,
    false,
    "MVP saved-unit-price calculation must not be labeled as FIFO final cost",
  );
  assert.deepEqual(
    createPolicyUnconfirmedMetric("fifoCostOfGoodsSold"),
    {
      metricId: "fifoCostOfGoodsSold",
      value: null,
      status: "policy-unconfirmed",
      label: "확인 필요",
      policyLabel: "FIFO 확정 원가",
      unavailableReason: "계산 기준 확인 필요",
      reason:
        "OQ-7/OQ-17 FIFO 적용 범위와 처리 순서가 확정되지 않아 FIFO 확정 원가 계산은 기준 확인 필요입니다. 정책 story로 분리하세요.",
      oqIds: ["OQ-7", "OQ-17"],
    },
  );
  assert.deepEqual(
    createPolicyUnconfirmedMetric("thirtyPercentUnitPrice"),
    {
      metricId: "thirtyPercentUnitPrice",
      value: null,
      status: "policy-unconfirmed",
      label: "확인 필요",
      policyLabel: "30%단가",
      unavailableReason: "계산 기준 확인 필요",
      reason:
        "OQ-2 30%단가 의미와 적용 우선순위가 확정되지 않아 파생 단가 계산은 기준 확인 필요입니다. 정책 story로 분리하세요.",
      oqIds: ["OQ-2"],
    },
  );
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
    assert.doesNotMatch(source, /FIFO\s*(?:원가|cost|inventory)/i);
    assert.doesNotMatch(source, /hoped|희망\s*판매가/i);
    assert.doesNotMatch(source, /0\.3\s*\*|\*\s*0\.3/);
  }
});
