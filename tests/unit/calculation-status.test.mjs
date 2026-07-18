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

test("ledger calculations expose separated status code, label, and legacy reason", async () => {
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
    cashAmount: 60_000,
    cardAmount: 30_000,
    otherPaymentAmount: 5_000,
    workerCount: null,
    expenseTotal: 10_000,
    inventoryItems: [],
  });

  assert.deepEqual(summary.totalSales, {
    value: 100_000,
    status: "ok",
  });
  assert.equal(summary.paymentDifference.value, -5_000);
  assert.equal(summary.paymentDifference.status, "ok");
  assert.deepEqual(summary.paymentTotal, {
    value: 95_000,
    status: "ok",
  });
  assert.deepEqual(summary.expenseTotal, {
    value: 10_000,
    status: "ok",
  });
  assert.deepEqual(summary.workerCount, {
    value: null,
    status: "data-insufficient",
    label: "데이터 부족",
    unavailableReason: "계산 불가",
    reason: "workerCount 입력값이 없습니다.",
  });
  assert.deepEqual(summary.productivity, {
    value: null,
    status: "data-insufficient",
    label: "데이터 부족",
    unavailableReason: "계산 불가",
    reason: "근무인원이 입력되지 않았거나 1명 미만입니다.",
  });
  assert.deepEqual(
    {
      value: summary.salesDifference.value,
      status: summary.salesDifference.status,
      label: summary.salesDifference.label,
      unavailableReason: summary.salesDifference.unavailableReason,
      reason: summary.salesDifference.reason,
    },
    {
      value: null,
      status: "policy-unconfirmed",
      label: "확인 필요",
      unavailableReason: "계산 기준 확인 필요",
      reason:
        "OQ-14 차이를 당일 판매량으로 바꾸는 계산 의미 변경이 확정되지 않아 기존 차이 외 파생 계산은 기준 확인 필요입니다. 정책 story로 분리하세요.",
    },
  );
  assert.equal(
    summary.salesDifference.metricId,
    "salesDifferenceMeaningChange",
  );
  assert.equal(
    summary.salesDifference.policyLabel,
    "차이의 당일 판매량 의미 변경",
  );
  assert.deepEqual(summary.salesDifference.oqIds, ["OQ-14"]);
});

test("ledger calculations mark invalid KRW arithmetic as unavailable and log context", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );
  const errors = [];
  const originalError = console.error;

  console.error = (...args) => {
    errors.push(args);
  };

  try {
    const summary = calculateLedgerReviewSummary({
      totalSalesAmount: Number.MAX_SAFE_INTEGER,
      cashAmount: -1,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: 1,
      expenseTotal: 0,
      inventoryItems: [],
    });

    assert.deepEqual(summary.paymentDifference, {
      value: null,
      status: "calculation-unavailable",
      label: "계산 불가",
      unavailableReason: "계산 불가",
      reason:
        "paymentDifference 계산값이 integer KRW 안전 범위를 벗어났습니다.",
    });

    const unsafeExpenseSummary = calculateLedgerReviewSummary({
      totalSalesAmount: 100_000,
      cashAmount: 90_000,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: 1,
      expenseTotal: Number.MAX_SAFE_INTEGER + 1,
      inventoryItems: [],
    });

    assert.equal(
      unsafeExpenseSummary.expenseTotal.status,
      "calculation-unavailable",
    );
    assert.deepEqual(unsafeExpenseSummary.paymentDifference, {
      value: null,
      status: "calculation-unavailable",
      label: "계산 불가",
      unavailableReason: "계산 불가",
      reason:
        "paymentDifference 계산값이 integer KRW 안전 범위를 벗어났습니다.",
    });
  } finally {
    console.error = originalError;
  }

  assert.equal(errors.length, 3);
  assert.match(String(errors[0][0]), /ledger calculation unavailable/);
  assert.deepEqual(
    errors.map((entry) => entry[1]),
    [
      { metricId: "paymentDifference", reason: "unsafe-krw-integer" },
      { metricId: "expenseTotal", reason: "unsafe-krw-integer" },
      { metricId: "paymentDifference", reason: "unsafe-krw-integer" },
    ],
  );
});

test("ledger calculations reject payment difference when expense total is unsafe", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );
  const maxSafeKrw = Number.MAX_SAFE_INTEGER;
  const errors = [];
  const originalError = console.error;

  console.error = (...args) => {
    errors.push(args);
  };

  try {
    const summary = calculateLedgerReviewSummary({
      totalSalesAmount: maxSafeKrw,
      cashAmount: -maxSafeKrw,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: 1,
      expenseTotal: maxSafeKrw + 1,
      inventoryItems: [],
    });

    assert.deepEqual(summary.paymentDifference, {
      value: null,
      status: "calculation-unavailable",
      label: "계산 불가",
      unavailableReason: "계산 불가",
      reason:
        "paymentDifference 계산값이 integer KRW 안전 범위를 벗어났습니다.",
    });
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(
    errors.map((entry) => entry[1]),
    [
      { metricId: "expenseTotal", reason: "unsafe-krw-integer" },
      { metricId: "paymentDifference", reason: "unsafe-krw-integer" },
    ],
  );
});

test("ledger calculations convert unexpected calculation errors into metric status", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );
  const brokenInventoryItem = {
    previousQuantity: 1,
    purchasedQuantity: 0,
    quantity: 1,
    unitPrice: 1_000,
    inventoryAmount: 1_000,
  };
  Object.defineProperty(brokenInventoryItem, "currentQuantity", {
    get() {
      throw new Error("broken quantity getter");
    },
  });
  const errors = [];
  const originalError = console.error;

  console.error = (...args) => {
    errors.push(args);
  };

  try {
    const summary = calculateLedgerReviewSummary({
      totalSalesAmount: 100_000,
      cashAmount: 100_000,
      cardAmount: 0,
      otherPaymentAmount: 0,
      workerCount: 1,
      expenseTotal: 0,
      inventoryItems: [brokenInventoryItem],
      inventoryAdjustments: [],
      lossItems: [],
    });

    assert.equal(summary.costOfGoodsSold.status, "calculation-unavailable");
    assert.equal(summary.costOfGoodsSold.label, "계산 불가");
    assert.equal(summary.inventoryAmount.status, "calculation-unavailable");
    assert.equal(summary.salesDifference.status, "calculation-unavailable");
    assert.match(
      summary.costOfGoodsSold.reason,
      /예상하지 못한 오류가 발생했습니다/,
    );
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(
    errors.map((entry) => entry[1]),
    [
      { metricId: "costOfGoodsSold", reason: "unexpected-error:Error" },
      { metricId: "inventoryAmount", reason: "unexpected-error:Error" },
    ],
  );
});

test("review UI uses common KRW formatter and does not calculate metrics locally", () => {
  const clientSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "review-summary-client.tsx",
  );
  const formatterSource = readProjectFile("src", "lib", "format.ts");

  assert.match(clientSource, /from "~\/lib\/format"/);
  assert.doesNotMatch(clientSource, /new Intl\.NumberFormat\("ko-KR"\)/);
  assert.match(formatterSource, /export function formatKrw/);
  assert.match(clientSource, /metric\.status/);
  assert.match(clientSource, /tabular-nums/);
  assert.doesNotMatch(clientSource, /cashAmount\s*\+/);
  assert.doesNotMatch(clientSource, /totalSalesAmount\s*-/);
});

test("dashboard and reports continue to reuse server calculation boundaries", () => {
  const dashboardSource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );
  const reportSource = readProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );

  assert.match(dashboardSource, /calculateLedgerReviewSummary/);
  assert.match(reportSource, /calculateLedgerReviewSummary/);
  assert.match(reportSource, /averageMetric/);
  assert.doesNotMatch(dashboardSource, /cashAmount\s*\+\s*ledger\.cardAmount/);
  assert.doesNotMatch(reportSource, /cashAmount\s*\+\s*ledger\.cardAmount/);
});
