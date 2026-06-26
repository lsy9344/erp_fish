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
  return readFileSync(assertProjectFile(...segments), "utf8").replace(
    /\r\n?/g,
    "\n",
  );
}

function ok(value) {
  return { value, status: "ok" };
}

function unavailable(status, label, unavailableReason, reason) {
  return {
    value: null,
    status,
    label,
    unavailableReason,
    ...(reason ? { reason } : {}),
  };
}

test("ledger review summary helper calculates PRD metrics and unavailable states", async () => {
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
      },
      {
        previousQuantity: 3,
        purchasedQuantity: 2,
        currentQuantity: null,
        quantity: 4,
        unitPrice: 2_000,
        inventoryAmount: 8_000,
      },
    ],
    inventoryAdjustments: [],
    lossItems: [],
  });

  assert.deepEqual(summary.totalSales, ok(100_000));
  assert.deepEqual(summary.paymentTotal, ok(98_000));
  assert.deepEqual(summary.expenseTotal, ok(12_000));
  assert.deepEqual(summary.workerCount, ok(4));
  assert.deepEqual(summary.costOfGoodsSold, ok(9_000));
  assert.deepEqual(summary.grossProfit, ok(91_000));
  assert.deepEqual(summary.grossMarginRate, ok(0.91));
  assert.deepEqual(summary.operatingProfit, ok(79_000));
  assert.deepEqual(summary.productivity, ok(25_000));
  assert.deepEqual(summary.inventoryAmount, ok(16_000));
  assert.deepEqual(summary.paymentDifference, ok(2_000));
  assert.deepEqual(summary.salesDifference, ok(91_000));
});

// point_summary 검토 후속(2026-06-24): 계획 판매가 대비 실제 비교 지표.
test("ledger review summary computes planned-sales metrics from planned unit price", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );

  // 품목 A: 판매 10+5-8=7개, 매입단가 1,000, 계획 판매가 1,500.
  // 품목 B: 판매 3+2-4=1개, 매입단가 2,000, 계획 판매가 3,000.
  // 계획 매출 = 7×1,500 + 1×3,000 = 13,500. COGS = 7×1,000 + 1×2,000 = 9,000.
  // 계획 매출이익 = 13,500-9,000 = 4,500. 계획 마진율 = 4,500/13,500 = 0.333...
  // 실제 총매출 100,000 → 계획 대비 차이 = 100,000-13,500 = 86,500.
  const baseInput = {
    totalSalesAmount: 100_000,
    cashAmount: 100_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 4,
    expenseTotal: 0,
    inventoryItems: [
      {
        previousQuantity: 10,
        purchasedQuantity: 5,
        currentQuantity: 8,
        quantity: 8,
        unitPrice: 1_000,
        inventoryAmount: 8_000,
      },
      {
        previousQuantity: 3,
        purchasedQuantity: 2,
        currentQuantity: 4,
        quantity: 4,
        unitPrice: 2_000,
        inventoryAmount: 8_000,
      },
    ],
    inventoryAdjustments: [],
    lossItems: [],
  };

  const plannedItem = (overrides) => ({
    previousQuantity: 0,
    purchasedQuantity: 0,
    currentQuantity: 0,
    quantity: 0,
    plannedUnitPrice: null,
    ...overrides,
  });

  // 1) 모든 판매 품목에 판매가 계획이 있으면 ok 값으로 노출.
  const fullPlan = calculateLedgerReviewSummary({
    ...baseInput,
    plannedSalesItems: [
      plannedItem({
        previousQuantity: 10,
        purchasedQuantity: 5,
        currentQuantity: 8,
        quantity: 8,
        plannedUnitPrice: 1_500,
      }),
      plannedItem({
        previousQuantity: 3,
        purchasedQuantity: 2,
        currentQuantity: 4,
        quantity: 4,
        plannedUnitPrice: 3_000,
      }),
    ],
  });

  assert.deepEqual(fullPlan.plannedSalesTotal, ok(13_500));
  assert.deepEqual(fullPlan.plannedGrossProfit, ok(4_500));
  assert.equal(fullPlan.plannedGrossMarginRate.status, "ok");
  assert.ok(Math.abs(fullPlan.plannedGrossMarginRate.value - 1 / 3) < 1e-9);
  assert.deepEqual(fullPlan.plannedVsActualSalesDifference, ok(86_500));

  // 2) 일부 품목만 판매가 계획이 있으면 과소 추정이다. 이는 정책(OQ) 게이트가 아니라
  //    입력 부족이므로 data-insufficient로 내리고 값은 숨긴다(과소 추정 값 노출 방지).
  const partialPlan = calculateLedgerReviewSummary({
    ...baseInput,
    plannedSalesItems: [
      plannedItem({
        previousQuantity: 10,
        purchasedQuantity: 5,
        currentQuantity: 8,
        quantity: 8,
        plannedUnitPrice: 1_500,
      }),
      plannedItem({
        previousQuantity: 3,
        purchasedQuantity: 2,
        currentQuantity: 4,
        quantity: 4,
        plannedUnitPrice: null,
      }),
    ],
  });

  // 일부 품목 판매가 미입력은 "데이터 부족"으로 노출하고, OQ 정책 게이트 문구는 쓰지 않는다.
  assert.equal(partialPlan.plannedSalesTotal.status, "data-insufficient");
  assert.equal(partialPlan.plannedSalesTotal.value, null);
  assert.equal(partialPlan.plannedSalesTotal.reason, "일부 품목 판매가 미입력 — 과소 추정");
  assert.equal(partialPlan.plannedGrossMarginRate.status, "data-insufficient");
  assert.equal(partialPlan.plannedVsActualSalesDifference.status, "data-insufficient");

  // 3) 판매가 계획 입력 자체가 없으면(plannedSalesItems 미제공) 데이터 부족으로 노출.
  const noPlan = calculateLedgerReviewSummary(baseInput);

  assert.equal(noPlan.plannedSalesTotal.value, null);
  assert.equal(noPlan.plannedSalesTotal.status, "data-insufficient");
  assert.equal(
    noPlan.plannedVsActualSalesDifference.status,
    "data-insufficient",
  );
});

test("ledger review summary helper does not calculate sales difference without adjustment and loss context", async () => {
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
    cashAmount: 100_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 2,
    expenseTotal: 0,
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
  });

  assert.deepEqual(
    {
      value: summary.salesDifference.value,
      status: summary.salesDifference.status,
      label: summary.salesDifference.label,
      unavailableReason: summary.salesDifference.unavailableReason,
      reason: summary.salesDifference.reason,
    },
    unavailable(
      "policy-unconfirmed",
      "확인 필요",
      "계산 기준 확인 필요",
      "OQ-14 차이를 당일 판매량으로 바꾸는 계산 의미 변경이 확정되지 않아 기존 차이 외 파생 계산은 기준 확인 필요입니다. 정책 story로 분리하세요.",
    ),
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

test("ledger review summary helper calculates sales difference with loss and inventory adjustment amounts", async () => {
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
    cashAmount: 100_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 2,
    expenseTotal: 0,
    inventoryItems: [
      {
        previousQuantity: 20,
        purchasedQuantity: 0,
        currentQuantity: 10,
        quantity: 10,
        unitPrice: 5_000,
        inventoryAmount: 50_000,
      },
    ],
    inventoryAdjustments: [
      {
        differenceAmount: -10_000,
      },
    ],
    lossItems: [
      {
        amount: 5_000,
      },
    ],
  });

  assert.deepEqual(summary.costOfGoodsSold, ok(50_000));
  assert.deepEqual(summary.salesDifference, ok(65_000));
});

test("ledger review summary helper does not expose divide by zero or hidden inventory calculations", async () => {
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
    totalSalesAmount: 0,
    cashAmount: 0,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 0,
    expenseTotal: 1_000,
    inventoryItems: [
      {
        previousQuantity: 1,
        purchasedQuantity: 1,
        currentQuantity: null,
        quantity: null,
        unitPrice: 1_000,
        inventoryAmount: null,
      },
    ],
  });

  assert.equal(summary.grossMarginRate.status, "data-insufficient");
  assert.equal(summary.productivity.status, "data-insufficient");
  assert.equal(summary.costOfGoodsSold.status, "data-insufficient");
  assert.equal(summary.inventoryAmount.status, "data-insufficient");
  assert.equal(Number.isFinite(summary.grossMarginRate.value), false);
  assert.equal(Number.isFinite(summary.productivity.value), false);
});

test("ledger review summary helper requires saved inventory and uses one quantity basis", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculateLedgerReviewSummary } = await import(
    pathToFileURL(calcPath).href
  );

  const noInventorySummary = calculateLedgerReviewSummary({
    totalSalesAmount: 100_000,
    cashAmount: 100_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 2,
    expenseTotal: 0,
    inventoryItems: [],
  });

  assert.equal(noInventorySummary.costOfGoodsSold.status, "data-insufficient");
  assert.equal(noInventorySummary.inventoryAmount.status, "data-insufficient");

  const adjustedSummary = calculateLedgerReviewSummary({
    totalSalesAmount: 100_000,
    cashAmount: 100_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: 2,
    expenseTotal: 0,
    inventoryItems: [
      {
        previousQuantity: 10,
        purchasedQuantity: 5,
        currentQuantity: 8,
        quantity: 10,
        unitPrice: 1_000,
        inventoryAmount: 10_000,
      },
    ],
    inventoryAdjustments: [],
    lossItems: [],
  });

  assert.deepEqual(adjustedSummary.costOfGoodsSold, ok(7_000));
  assert.deepEqual(adjustedSummary.inventoryAmount, ok(8_000));
});

test("ledger review route/query contracts use existing server flows", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "page.tsx",
  );

  assert.match(pageSource, /type\s+StoreEntryStep\s*=[^;]*"review"/s);
  assert.match(pageSource, /step\s*===\s*"review"/);
  assert.match(pageSource, /getStoreManagerLedgerReviewStepData\(/);
  assert.doesNotMatch(pageSource, /app\/api\/ledger\/review/);

  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-queries.ts",
  );
  const responseShapeSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "response-shaping.ts",
  );
  const validationSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-validation.ts",
  );

  assert.match(querySource, /getStoreLedgerInTx\(/);
  assert.match(querySource, /getKstBusinessDateParam/);
  assert.match(querySource, /getLedgerReviewMissingItems/);
  assert.match(
    validationSource,
    /export\s+function\s+getLedgerReviewMissingItems/,
  );
  assert.match(querySource, /getInventoryStepDataInTx\(/);
  assert.match(querySource, /getLossStepDataInTx\(/);
  assert.match(querySource, /calculateLedgerReviewSummary\(/);
  assert.match(querySource, /ledgerInventoryItem\.findMany\(/);
  assert.match(querySource, /getWarnings\(summary\.paymentDifference\)/);
  assert.match(querySource, /payment-difference-unavailable/);
  assert.doesNotMatch(querySource, /paymentDifference\.value\s*\?\?\s*0/);
  assert.doesNotMatch(querySource, /requireStoreAccess\(/);
  assert.doesNotMatch(
    querySource,
    /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)/,
  );
});

test("ledger review missing item helper preserves KST links and separates review-only losses", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "review-validation.ts",
  );
  const { getLedgerReviewMissingItems } = await import(
    pathToFileURL(queryPath).href
  );

  const missingItems = getLedgerReviewMissingItems({
    storeId: "store-1",
    closingDate: "2026-06-11T00:00:00.000Z",
    totalSalesAmount: 0,
    paymentTotal: 0,
    expenseCount: 0,
    purchaseCount: 0,
    hasInventoryUnavailable: true,
    inventoryCount: 1,
    lossCount: 0,
    workerCount: 0,
  });

  assert.deepEqual(
    missingItems.map((item) => [item.id, item.status]),
    [
      ["sales", "missing"],
      ["expenses", "missing"],
      ["purchases", "missing"],
      ["losses", "review"],
      ["inventory", "missing"],
      ["work", "missing"],
    ],
  );
  assert.match(missingItems[0].href, /storeId=store-1/);
  assert.match(missingItems[0].href, /date=2026-06-11/);
  assert.match(missingItems[0].href, /step=sales/);
  assert.equal(
    missingItems.find((item) => item.id === "losses")?.detail,
    "손실 항목 없음으로 검토할 수 있습니다.",
  );
  assert.equal(
    missingItems.find((item) => item.id === "work")?.detail,
    "근무인원은 1명 이상이어야 제출할 수 있습니다.",
  );
});

test("ledger review step summary contract preserves shape, KST links, signed difference, and calculation states", () => {
  const typeSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-types.ts",
  );
  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-queries.ts",
  );
  const validationSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-validation.ts",
  );

  assert.match(typeSource, /LedgerReviewStepId[\s\S]*"sales"/);
  assert.match(typeSource, /LedgerReviewStepId[\s\S]*"work"/);
  assert.match(typeSource, /LedgerReviewStepMetric/);
  assert.match(typeSource, /kind:\s*"krw"\s*\|\s*"signed-krw"/);
  assert.match(typeSource, /stepSummaries:\s*LedgerReviewStepSummary\[\]/);
  assert.match(validationSource, /getLedgerReviewStepHref/);
  assert.match(validationSource, /getKstLedgerDateParam\(closingDate\)/);
  assert.match(querySource, /buildLedgerReviewStepSummaries/);
  // WO(2026-06-25): work 단계 라벨은 입력 화면과 맞춰 "근무/인건비"로 노출한다.
  assert.match(querySource, /id:\s*"work",\s*\n\s*label:\s*"근무\/인건비"/);
  assert.match(querySource, /"paymentDifference"/);
  assert.match(querySource, /"결제수단 합계와 총매출 차이"/);
  assert.match(querySource, /"signed-krw"/);
  assert.match(querySource, /"reviewStatus"/);
  assert.match(querySource, /"데이터 부족"/);
  assert.match(querySource, /"기준 확인 필요"/);
  assert.doesNotMatch(querySource, /paymentDifference\.value\s*\?\?\s*0/);
});

test("store manager ledger review response omits sensitive accounting metrics", async () => {
  const typeSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-types.ts",
  );
  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-queries.ts",
  );
  const responseShapeSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "response-shaping.ts",
  );
  const clientSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "review-summary-client.tsx",
  );

  assert.match(typeSource, /StoreManagerLedgerReviewSummary/);
  assert.match(typeSource, /StoreManagerLedgerReviewStepData/);
  assert.match(querySource, /toStoreManagerLedgerReviewStepData/);
  assert.match(querySource, /getStoreManagerLedgerReviewStepData/);
  assert.match(querySource, /buildLedgerReviewStepSummaries/);
  assert.match(responseShapeSource, /totalSales:\s*data\.summary\.totalSales/);
  // 미팅 결정(2026-06-21): 마진률과 총 재고금액은 지점장 요약에 노출한다.
  // 보완(2026-06-22 WO-01): 근무인원 수도 노출, 결제차액은 제거.
  assert.match(
    responseShapeSource,
    /grossMarginRate:\s*data\.summary\.grossMarginRate/,
  );
  assert.match(
    responseShapeSource,
    /workerCount:\s*data\.summary\.workerCount/,
  );
  assert.match(
    responseShapeSource,
    /inventoryAmount:\s*data\.summary\.inventoryAmount/,
  );
  assert.doesNotMatch(
    responseShapeSource,
    /paymentDifference:\s*data\.summary\.paymentDifference/,
  );

  assert.doesNotMatch(clientSource, /summary\.costOfGoodsSold/);
  assert.doesNotMatch(clientSource, /summary\.grossProfit/);
  assert.doesNotMatch(clientSource, /summary\.operatingProfit/);
  assert.doesNotMatch(clientSource, /summary\.productivity/);
  assert.doesNotMatch(clientSource, /summary\.salesDifference/);
  assert.match(clientSource, /stepSummaries/);
  assert.match(clientSource, /formatSignedKrw/);
  assert.match(querySource, /결제수단 합계와 총매출 차이/);
  assert.doesNotMatch(clientSource, /임계값 초과|확정 이상/);
  assert.doesNotMatch(clientSource, /label="매출원가"/);
  assert.doesNotMatch(clientSource, /label="매출이익"/);
  assert.doesNotMatch(clientSource, /label="영업이익"/);
  assert.doesNotMatch(clientSource, /label="인당생산성"/);
  assert.doesNotMatch(clientSource, /label="매출차액"/);

  const queryPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "response-shaping.ts",
  );
  const { toStoreManagerLedgerReviewStepData } = await import(
    pathToFileURL(queryPath).href
  );
  const safeReview = toStoreManagerLedgerReviewStepData({
    id: "ledger-1",
    storeId: "store-1",
    closingDate: "2026-06-10T00:00:00.000Z",
    status: "IN_PROGRESS",
    submittedById: null,
    submittedAt: null,
    updatedAt: "2026-06-10T00:00:00.000Z",
    version: 1,
    authorDisplayName: "작성자",
    summary: {
      totalSales: ok(100_000),
      costOfGoodsSold: ok(30_000),
      grossProfit: ok(70_000),
      grossMarginRate: ok(0.7),
      operatingProfit: ok(60_000),
      productivity: ok(30_000),
      workerCount: ok(3),
      inventoryAmount: ok(8_000),
      salesDifference: ok(2_000),
      paymentDifference: ok(0),
      paymentTotal: ok(100_000),
      expenseTotal: ok(10_000),
      // point_summary 검토 후속(2026-06-24): 계획 판매가 대비 실제 비교 지표.
      plannedSalesTotal: ok(130_000),
      plannedGrossProfit: ok(100_000),
      plannedGrossMarginRate: ok(0.769),
      plannedVsActualSalesDifference: ok(-30_000),
    },
    missingItems: [],
    warnings: [],
    signals: [],
    stepCompletion: {
      sales: true,
      cost: true,
      purchase: true,
      inventory: true,
      losses: false,
      work: true,
    },
    stepSummaries: [
      {
        id: "work",
        label: "근무/급여",
        status: "saved",
        detail: "근무인원을 확인했습니다.",
        href: "/app/store-entry?storeId=store-1&date=2026-06-10&step=work",
        metrics: [
          {
            id: "workerCount",
            label: "근무인원",
            value: 3,
            kind: "text",
            status: "ok",
          },
          {
            id: "inventoryAmount",
            label: "재고금액",
            value: 8_000,
            kind: "krw",
            status: "ok",
          },
          {
            id: "paymentDifference",
            label: "결제수단 합계와 총매출 차이",
            value: 0,
            kind: "signed-krw",
            status: "ok",
          },
        ],
      },
    ],
  });

  // point_summary 검토 후속(2026-06-24): 계획 매출/계획 대비 차이/계획 마진율을 추가 노출한다.
  assert.deepEqual(Object.keys(safeReview.summary).sort(), [
    "grossMarginRate",
    "inventoryAmount",
    "plannedGrossMarginRate",
    "plannedSalesTotal",
    "plannedVsActualSalesDifference",
    "totalSales",
    "workerCount",
  ]);
  assert.equal(Object.hasOwn(safeReview.summary, "totalSales"), true);
  assert.equal(Object.hasOwn(safeReview.summary, "grossMarginRate"), true);
  assert.equal(Object.hasOwn(safeReview.summary, "workerCount"), true);
  assert.equal(Object.hasOwn(safeReview.summary, "inventoryAmount"), true);
  assert.equal(Object.hasOwn(safeReview.summary, "paymentDifference"), false);
  assert.equal(Object.hasOwn(safeReview.summary, "salesDifference"), false);
  assert.equal(Object.hasOwn(safeReview.summary, "costOfGoodsSold"), false);
  assert.equal(Object.hasOwn(safeReview.summary, "grossProfit"), false);
  assert.equal(Object.hasOwn(safeReview.summary, "operatingProfit"), false);
  assert.equal(Object.hasOwn(safeReview.summary, "productivity"), false);
  // 계획 매출이익(절대 이익)은 계속 차단한다.
  assert.equal(Object.hasOwn(safeReview.summary, "plannedGrossProfit"), false);
  // workerCount와 inventoryAmount가 보이고, paymentDifference는 제거됨
  assert.equal(safeReview.stepSummaries[0]?.metrics[0]?.kind, "text");
  assert.equal(safeReview.stepSummaries[0]?.metrics[0]?.id, "workerCount");
  assert.equal(safeReview.stepSummaries[0]?.metrics[1]?.kind, "krw");
  assert.equal(safeReview.stepSummaries[0]?.metrics[1]?.id, "inventoryAmount");
  assert.equal(safeReview.stepSummaries[0]?.metrics.length, 2);
  // 7단계 검토 화면도 1~6단계 "저장됨" 뱃지 상태를 그대로 받아야 한다.
  assert.deepEqual(safeReview.stepCompletion, {
    sales: true,
    cost: true,
    purchase: true,
    inventory: true,
    losses: false,
    work: true,
  });
});

test("store manager review exposes estimated top sold items derived from inventory flow (WO-04)", () => {
  const typeSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-types.ts",
  );
  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-queries.ts",
  );
  const clientSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "review-summary-client.tsx",
  );

  // 타입 계약: 품목ID/품목명/판매수량/추정매출 + 판매가 기준(salesBasis)을 노출한다.
  assert.match(
    typeSource,
    /export type StoreManagerTopSoldItem\s*=\s*{[^}]*productId:\s*string[^}]*productName:\s*string[^}]*soldQuantity:\s*number[^}]*estimatedSalesAmount:\s*number[^}]*salesBasis:\s*"planned"\s*\|\s*"cost"[^}]*}/s,
  );
  assert.match(typeSource, /topSoldItems:\s*StoreManagerTopSoldItem\[\]/);

  // 판매수량은 재고 흐름(기준재고=전일+매입-손실 빼고 당일재고)으로만 추정한다.
  assert.match(querySource, /buildStoreManagerTopSoldItems/);
  assert.match(
    querySource,
    /item\.previousQuantity\s*\+\s*item\.purchasedQuantity\s*-\s*item\.lossQuantity\s*-\s*item\.currentQuantity/,
  );
  // point_summary 검토 후속(2026-06-24): 추정 매출은 판매가 계획(plannedUnitPrice) 기준이고,
  // 계획이 없으면 매입단가(unitPrice)로 폴백해 salesBasis="cost"로 표시한다.
  assert.match(
    querySource,
    /estimatedSalesAmount:\s*soldQuantity\s*\*\s*salesUnitPrice/,
  );
  assert.match(
    querySource,
    /salesBasis:\s*usePlannedPrice\s*\?\s*"planned"\s*:\s*"cost"/,
  );
  assert.match(querySource, /plannedUnitPrice/);
  // currentQuantity가 null이거나 판매수량이 0 이하인 행은 제외한다.
  assert.match(querySource, /item\.currentQuantity === null/);
  assert.match(querySource, /soldQuantity <= 0/);

  // 카드 UI: 추정 라벨과 안내 문구가 있어야 하고, 판매가 미반영(cost 폴백)을 구분 표시한다.
  assert.match(clientSource, /오늘 많이 팔린 품목/);
  assert.match(clientSource, /추정 매출/);
  // WO(2026-06-25): 안내 문구를 새 입력 위치(3단계 매입의 오늘 팔 가격(예상))와 맞춘다.
  assert.match(
    clientSource,
    /추정 매출은 3단계 매입의 오늘 팔 가격\(예상\)을 우선 사용합니다\./,
  );
  // 판매가 미반영 품목이 있으면 3단계 매입(step=purchase)으로 이동하는 안내 링크를 제공한다.
  assert.match(clientSource, /3단계 매입에서 오늘 팔 가격 입력/);
  assert.match(clientSource, /step:\s*"purchase"/);
  assert.match(clientSource, /판매가 미반영/);
  assert.match(clientSource, /item\.salesBasis === "cost"/);
  assert.match(clientSource, /topSoldItems/);
  // 카드에는 여전히 단가/FIFO 같은 민감값을 직접 노출하지 않는다.
  assert.doesNotMatch(clientSource, /item\.unitPrice/);
  assert.doesNotMatch(clientSource, /item\.fifoLots/);
});

test("store manager review orders losses before inventory to match entry steps", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-queries.ts",
  );
  const validationSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-validation.ts",
  );

  const summariesStart = querySource.indexOf(
    "export function buildLedgerReviewStepSummaries",
  );
  const summariesEnd = querySource.indexOf("\n}\n\n// WO-04", summariesStart);
  const summariesSource = querySource.slice(summariesStart, summariesEnd);
  assert.ok(summariesStart >= 0 && summariesEnd > summariesStart);
  assert.ok(
    summariesSource.indexOf('id: "losses"') <
      summariesSource.indexOf('id: "inventory"'),
    "review step summaries should show 4단계 손실 before 5단계 재고",
  );

  assert.ok(
    validationSource.indexOf('id: "losses"') <
      validationSource.indexOf('id: "inventory"'),
    "review missing/review items should show 손실 before 재고",
  );
});

test("headquarters ledger detail keeps review summary read access separate from action permissions", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );

  assert.match(pageSource, /requireReportAccess\(\)/);
  assert.match(
    pageSource,
    /hasActionPermission\(user\.id,\s*PermissionAction\.LEDGER_EDIT\)/,
  );
  assert.match(
    pageSource,
    /hasActionPermission\(user\.id,\s*PermissionAction\.LEDGER_HQ_CLOSE\)/,
  );
  assert.match(
    pageSource,
    /hasActionPermission\(user\.id,\s*PermissionAction\.CORRECTION_CREATE\)/,
  );
  assert.match(pageSource, /검토 상태 요약/);
  assert.match(pageSource, /조회 전용/);
  assert.match(pageSource, /formatHqCloseCorrectionActionStatus/);
  assert.doesNotMatch(pageSource, /requireStoreAccess\(/);
});
