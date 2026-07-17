import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();
const sensitiveKeys = [
  "costOfGoodsSold",
  "fifoCostOfGoodsSold",
  "fifoInventoryAmount",
  "grossProfit",
  "grossMarginRate",
  "hopedSalePriceLossAmount",
  "operatingProfit",
  "productivity",
  "inventoryAmount",
  "salesDifference",
  "salesDifferenceMeaningChange",
  "salesDifferenceThresholdAnomaly",
  "storeManagerSensitiveDerivedMetrics",
  "30%단가",
  "30단가",
  "thirtyPercent",
  "thirtyPercentUnitPrice",
  "price30",
  "margin30",
  "unitPrice",
  "beforeAmount",
  "afterAmount",
  "differenceAmount",
  "amountDifference",
  "marginRate",
  "lot",
  "fixedCost",
  "comparisonStore",
  "comparisonStoreValue",
];

function compactFieldKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "");
}

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

function readProjectFile(...segments) {
  return readFileSync(assertProjectFile(...segments), "utf8");
}

function assertNoSensitiveKeys(value, location = "payload") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoSensitiveKeys(item, `${location}[${index}]`),
    );
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const compactKey = compactFieldKey(key);

    assert.equal(
      sensitiveKeys.some((sensitiveKey) =>
        compactKey.includes(compactFieldKey(sensitiveKey)),
      ),
      false,
      `${location}.${key} should not expose a sensitive field`,
    );
    assertNoSensitiveKeys(nestedValue, `${location}.${key}`);
  }
}

test("store manager response shaping recursively removes sensitive ledger metrics", async () => {
  const responseShapePath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "response-shaping.ts",
  );
  const { toStoreManagerLedgerReviewStepData } = await import(
    pathToFileURL(responseShapePath).href
  );

  const safeReview = toStoreManagerLedgerReviewStepData({
    id: "ledger-1",
    storeId: "store-1",
    closingDate: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    version: 1,
    authorDisplayName: "작성자",
    status: "IN_PROGRESS",
    submittedById: null,
    submittedAt: null,
    summary: {
      totalSales: { value: 100_000 },
      costOfGoodsSold: { value: 30_000 },
      grossProfit: { value: 70_000 },
      grossMarginRate: { value: 0.7 },
      operatingProfit: { value: 60_000 },
      productivity: { value: 30_000 },
      workerCount: { value: 3 },
      inventoryAmount: { value: 8_000 },
      salesDifference: { value: 2_000 },
      hopedSalePriceLossAmount: {
        value: null,
        status: "policy-unconfirmed",
      },
      paymentDifference: { value: 0 },
      paymentTotal: { value: 100_000 },
      expenseTotal: { value: 10_000 },
      // WO(2026-06-26): 계획 판매가 비교 지표는 본사 전용이라 지점장 요약에서 제외된다.
      plannedSalesTotal: { value: 130_000, status: "ok" },
      plannedGrossProfit: { value: 100_000, status: "ok" },
      plannedGrossMarginRate: { value: 0.769, status: "ok" },
      plannedVsActualSalesDifference: { value: -30_000, status: "ok" },
    },
    missingItems: [],
    warnings: [
      {
        id: "payment-difference",
        label: "마감 정산 불일치",
        detail:
          "총매출과 현금·카드·기타·지출 합계가 다릅니다. 제출을 막지는 않습니다.",
        amount: -5_000,
      },
    ],
    signals: [
      {
        id: "inventory-product-1",
        label: "판매 추정 확인",
        detail:
          "광어는 손실 1개를 제외한 뒤, 남은 재고를 기준으로 2개 판매로 계산됩니다.",
        quantity: -2,
        quantityLabel: "판매 추정",
        quantityText: "2개",
        amount: -2_000,
      },
    ],
    topSoldItems: [
      {
        productId: "product-1",
        productName: "광어",
        soldQuantity: 12,
        estimatedSalesAmount: 120_000,
        salesBasis: "planned",
      },
    ],
    stepSummaries: [
      {
        id: "sales",
        label: "매출/결제",
        status: "saved",
        detail: "총매출과 마감 정산 합계를 확인했습니다.",
        href: "/app/store-entry?storeId=store-1&date=2026-06-10&step=sales",
        metrics: [
          {
            id: "paymentDifference",
            label: "마감 정산 차액",
            value: 0,
            kind: "signed-krw",
            status: "ok",
          },
          {
            id: "expenseTotal",
            label: "4단계 지출 합계",
            value: 10_000,
            kind: "krw",
            status: "ok",
          },
          {
            id: "costOfGoodsSold",
            label: "매출원가",
            value: 30_000,
            kind: "krw",
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
            id: "hopedSalePriceLossAmount",
            label: "희망 판매가 기준 손실액",
            value: "기준 확인 필요",
            kind: "status",
            status: "policy-unconfirmed",
          },
        ],
      },
    ],
  });

  // 정책 반전(2026-06-28): 마진율·재고금액은 본사 전용으로 지점장 응답에서 제거한다.
  // 보완(2026-06-22 WO-01): 결제차액은 제거, 근무인원 수 추가.
  // 매출원가·매출이익·영업이익·인당생산성·매출차이·FIFO·lot 근거는 계속 차단한다.
  // WO(2026-06-26): 계획 판매가 비교 지표는 본사 전용으로 두고 지점장 요약에서는 제거한다.
  // 정책 반전(2026-06-28): 마진율(grossMarginRate)·재고금액(inventoryAmount)도 본사 전용으로
  // 확정되어 지점장 요약/단계 응답에서 제거된다.
  const stillBlockedSummaryKeys = [
    "costOfGoodsSold",
    "grossProfit",
    "operatingProfit",
    "productivity",
    "salesDifference",
    "hopedSalePriceLossAmount",
    "paymentDifference",
    "expenseTotal",
    "grossMarginRate",
    "inventoryAmount",
    "plannedSalesTotal",
    "plannedGrossProfit",
    "plannedGrossMarginRate",
    "plannedVsActualSalesDifference",
  ];

  for (const blockedKey of stillBlockedSummaryKeys) {
    assert.equal(
      Object.hasOwn(safeReview.summary, blockedKey),
      false,
      `summary.${blockedKey} should stay blocked for store managers`,
    );
  }

  // 정책 반전(2026-06-28): 지점장 요약은 총매출·근무인원만 남는다(마진율·재고금액 제거).
  assert.deepEqual(Object.keys(safeReview.summary).sort(), [
    "totalSales",
    "workerCount",
  ]);
  // 판매 추정 표시 필드(quantityLabel/quantityText)는 민감 금액이 아니므로 지점장
  // 응답에서도 유지되고, amount만 제거된다(2026-06-26 WO).
  assert.deepEqual(safeReview.signals[0], {
    id: "inventory-product-1",
    label: "판매 추정 확인",
    detail:
      "광어는 손실 1개를 제외한 뒤, 남은 재고를 기준으로 2개 판매로 계산됩니다.",
    quantity: -2,
    quantityLabel: "판매 추정",
    quantityText: "2개",
  });
  assert.equal(Object.hasOwn(safeReview.signals[0], "amount"), false);
  // 역산 부정행위 방지(point_summary.md:37): 합계 불일치 경고도 차액 금액(amount)을
  // 지점장 화면에 노출하지 않는다. 경고 사실(label/detail)만 남고 amount는 제거된다.
  assert.deepEqual(safeReview.warnings[0], {
    id: "payment-difference",
    label: "마감 정산 불일치",
    detail:
      "총매출과 현금·카드·기타·지출 합계가 다릅니다. 제출을 막지는 않습니다.",
  });
  assert.equal(Object.hasOwn(safeReview.warnings[0], "amount"), false);
  // 화이트리스트(2026-06-28 반전): inventoryAmount·paymentDifference 모두 단계 요약에서 제거됨.
  // 1단계 매출/결제 요약에는 지점장 노출 지표가 남지 않는다.
  assert.deepEqual(
    safeReview.stepSummaries[0].metrics.map((metric) => metric.id).sort(),
    [],
  );
  assert.equal(
    safeReview.stepSummaries[0].metrics.some((metric) =>
      ["paymentDifference", "expenseTotal"].includes(metric.id),
    ),
    false,
  );
  // 매출원가와 희망 판매가 손실액은 단계 요약에서 차단된다.
  assert.equal(
    safeReview.stepSummaries[0].metrics.some((metric) =>
      /매출원가|costOfGoodsSold|hopedSalePrice|희망 판매가/.test(
        `${metric.id} ${metric.label}`,
      ),
    ),
    false,
  );

  // WO-04(2026-06-22): 오늘 많이 팔린 품목 카드는 품목명/판매수량/추정매출만 노출한다.
  // point_summary 검토 후속(2026-06-24): 추정 매출이 판매가 계획 기준인지(salesBasis)도 함께 노출한다.
  assert.deepEqual(safeReview.topSoldItems, [
    {
      productId: "product-1",
      productName: "광어",
      soldQuantity: 12,
      estimatedSalesAmount: 120_000,
      salesBasis: "planned",
    },
  ]);
  for (const item of safeReview.topSoldItems) {
    for (const blockedKey of [
      "unitPrice",
      "salesDifference",
      "paymentDifference",
      "grossProfit",
      "fifoLots",
      "inventoryAmount",
    ]) {
      assert.equal(
        Object.hasOwn(item, blockedKey),
        false,
        `topSoldItems should not expose ${blockedKey} to store managers`,
      );
    }
  }
});

test("store manager response shaping replaces internal OQ details with generic copy", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "response-shaping.ts",
  );
  const { toStoreManagerLedgerReviewStepData } = await import(
    pathToFileURL(queryPath).href
  );

  const shaped = toStoreManagerLedgerReviewStepData({
    id: "ledger-1",
    storeId: "store-1",
    closingDate: "2026-06-10T00:00:00.000Z",
    status: "IN_PROGRESS",
    submittedById: null,
    submittedAt: null,
    updatedAt: "2026-06-10T00:00:00.000Z",
    version: 1,
    summary: {
      totalSales: { value: 100_000, status: "ok" },
      costOfGoodsSold: { value: 30_000, status: "ok" },
      grossProfit: { value: 70_000, status: "ok" },
      grossMarginRate: { value: 0.7, status: "ok" },
      operatingProfit: { value: 60_000, status: "ok" },
      productivity: { value: 30_000, status: "ok" },
      workerCount: { value: 3, status: "ok" },
      inventoryAmount: { value: 8_000, status: "ok" },
      salesDifference: { value: null, status: "policy-unconfirmed" },
      paymentDifference: { value: 0, status: "ok" },
      paymentTotal: { value: 100_000, status: "ok" },
      expenseTotal: { value: 10_000, status: "ok" },
      plannedSalesTotal: { value: 130_000, status: "ok" },
      plannedGrossProfit: { value: 100_000, status: "ok" },
      plannedGrossMarginRate: { value: 0.769, status: "ok" },
      plannedVsActualSalesDifference: {
        value: null,
        status: "policy-unconfirmed",
      },
    },
    missingItems: [],
    warnings: [],
    signals: [],
    stepCompletion: {
      sales: true,
      cost: true,
      purchase: true,
      inventory: true,
      losses: true,
      work: true,
    },
    stepSummaries: [
      {
        id: "sales",
        label: "매출/결제",
        status: "saved",
        detail: "OQ-14 내부 정책 코드",
        href: "/app/store-entry?storeId=store-1&date=2026-06-10&step=sales",
        metrics: [
          {
            id: "paymentTotal",
            label: "현금·카드·기타 합계",
            value: "기준 확인 필요",
            kind: "status",
            status: "policy-unconfirmed",
            detail: "OQ-14 내부 정책 코드",
          },
        ],
      },
    ],
    topSoldItems: [],
  });

  assert.equal(
    shaped.stepSummaries[0].detail,
    "계산 기준 확인이 필요합니다. 본사 기준 확인 후 확정됩니다.",
  );
  assert.equal(
    shaped.stepSummaries[0].metrics[0].detail,
    "계산 기준 확인이 필요합니다. 본사 기준 확인 후 확정됩니다.",
  );
  assert.doesNotMatch(
    `${shaped.stepSummaries[0].detail} ${shaped.stepSummaries[0].metrics[0].detail}`,
    /OQ-|재고 금액/,
  );
});

test("common sensitive field helper removes derived and sensitive metric keys", async () => {
  const helperPath = assertProjectFile("src", "server", "sensitive-fields.ts");
  const { omitSensitiveFields } = await import(pathToFileURL(helperPath).href);

  const shaped = omitSensitiveFields({
    storeId: "store-1",
    nested: {
      projectedGrossProfitAmount: 70_000,
      fifoInventoryAmount: 50_000,
      hopedSalePriceLossAmount: {
        value: null,
        status: "policy-unconfirmed",
      },
      thirtyPercentUnitPrice: 14_286,
      thirtyPercentPreview: 14_286,
      thirty_percent_unit_price: 14_286,
      "thirty-percent-preview": 14_286,
      "30%단가": 14_286,
      "30_단가": 14_286,
      price30: 14_286,
      price_30: 14_286,
      margin30: 0.3,
      margin_30: 0.3,
      comparisonStoreValue: 1,
      pilotProgramStatus: "유지",
      safeStatus: "확인 필요",
    },
    rows: [
      {
        productName: "광어",
        unitPrice: 10_000,
        quantity: 2,
      },
    ],
  });

  assert.deepEqual(shaped, {
    storeId: "store-1",
    nested: {
      pilotProgramStatus: "유지",
      safeStatus: "확인 필요",
    },
    rows: [
      {
        productName: "광어",
        quantity: 2,
      },
    ],
  });
});

test("report export forbidden response does not expose sensitive export metadata", async () => {
  const exportPath = assertProjectFile(
    "src",
    "features",
    "reports",
    "export.ts",
  );
  const { buildForbiddenReportExportResponsePayload } = await import(
    pathToFileURL(exportPath).href
  );

  const payload = buildForbiddenReportExportResponsePayload({
    report: "comparison",
    requestedStoreId: "unauthorized-store",
    requestedColumns: [
      "grossProfit",
      "operatingProfit",
      "inventoryAmount",
      "lotBasis",
    ],
  });

  assert.deepEqual(payload, {
    error: "forbidden",
    message: "export 권한이 없습니다.",
  });
  assertNoSensitiveKeys(payload);
  assert.doesNotMatch(JSON.stringify(payload), /unauthorized-store/);
  assert.doesNotMatch(
    JSON.stringify(payload),
    /grossProfit|operatingProfit|inventoryAmount|lot/i,
  );
});

test("report export source keeps sensitive unauthorised paths out of CSV and audit metadata", () => {
  const routeSource = readProjectFile(
    "src",
    "app",
    "api",
    "reports",
    "export",
    "route.ts",
  );
  const exportSource = readProjectFile(
    "src",
    "features",
    "reports",
    "export.ts",
  );

  assert.match(routeSource, /buildForbiddenReportExportResponsePayload/);
  assert.match(routeSource, /status:\s*403/);
  assert.match(routeSource, /return\s+new\s+Response\(\s*JSON\.stringify/);
  assert.doesNotMatch(routeSource, /requestedColumns/);
  assert.doesNotMatch(routeSource, /unauthorized-store/);
  assert.match(exportSource, /REPORT_EXPORT_COLUMN_ALLOWLISTS/);
  assert.match(exportSource, /omitSensitiveFields/);
  assert.doesNotMatch(exportSource, /clientColumns|requestedColumns/);
});

test("store manager inventory and loss contracts define safe response types", () => {
  const inventoryTypes = readProjectFile(
    "src",
    "features",
    "inventory",
    "types.ts",
  );
  const lossTypes = readProjectFile("src", "features", "losses", "types.ts");
  const inventoryQueries = readProjectFile(
    "src",
    "features",
    "inventory",
    "queries.ts",
  );
  const lossQueries = readProjectFile(
    "src",
    "features",
    "losses",
    "queries.ts",
  );
  const inventoryActions = readProjectFile(
    "src",
    "features",
    "inventory",
    "actions.ts",
  );
  const lossActions = readProjectFile(
    "src",
    "features",
    "losses",
    "actions.ts",
  );

  assert.match(inventoryTypes, /StoreManagerInventoryStepData/);
  assert.match(inventoryTypes, /StoreManagerInventoryStepLine/);
  assert.match(lossTypes, /StoreManagerLossStepData/);
  assert.match(lossTypes, /StoreManagerLossLineItem/);
  assert.match(
    lossTypes,
    /StoreManagerLossLineItem[\s\S]*"unitPrice"\s*\|\s*"amount"/,
  );
  assert.match(lossTypes, /StoreManagerLossProductSummary[\s\S]*"amount"/);
  assert.match(
    lossTypes,
    /StoreManagerLossSignalCandidate[\s\S]*"amount"\s*\|\s*"exceededAmount"/,
  );

  for (const source of [inventoryQueries, inventoryActions]) {
    assert.match(source, /toStoreManagerInventoryStepData/);
  }

  for (const source of [lossQueries, lossActions]) {
    assert.match(source, /toStoreManagerLossStepData/);
  }

  assert.match(
    lossQueries,
    /lossItems:\s*data\.lossItems\.map\(\(\{\s*unitPrice,\s*amount,\s*\.\.\.item\s*}\)/,
  );
  assert.match(
    lossQueries,
    /summary:\s*{[\s\S]*totalQuantity:\s*data\.summary\.totalQuantity[\s\S]*byProduct:\s*data\.summary\.byProduct\.map\(\(\{\s*amount,/,
  );
  assert.match(
    lossQueries,
    /signalCandidates:\s*data\.signalCandidates\.map\([\s\S]*\{\s*amount,\s*exceededAmount,/,
  );
});

test("authz semantic gates keep report view and export create separate", () => {
  const authz = readProjectFile("src", "server", "authz.ts");

  assert.match(
    authz,
    /requireReportAccess\(\)[\s\S]*PermissionAction\.REPORT_VIEW/,
  );
  assert.match(
    authz,
    /requireExportCreateAccess\(\)[\s\S]*PermissionAction\.EXPORT_CREATE/,
  );
  assert.doesNotMatch(
    authz,
    /function\s+requireExportCreateAccess\(\)[\s\S]*requireReportAccess\(/,
  );
  assert.match(
    authz,
    /hasActionPermission[\s\S]*permissionProfiles:\s*{\s*some:[\s\S]*actions:\s*{\s*some:\s*{\s*action/s,
  );
});

// WO-10(2026-06-28): 급여액과 인건비 합계는 본사 전용이다. 지점장 cost-step 응답에서
// payrollTotal과 개인별 amount가 제거되는지, 지점장 근무 저장 스키마가 amount를 거부하는지 확인한다.
test("WO-10: store manager cost step omits payroll total and labor amounts", async () => {
  const shapingPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "response-shaping.ts",
  );
  const { toStoreManagerLedgerCostStepData } = await import(
    pathToFileURL(shapingPath).href
  );

  const safe = toStoreManagerLedgerCostStepData({
    id: "ledger-1",
    storeId: "store-1",
    closingDate: new Date("2026-06-10T00:00:00.000Z"),
    updatedAt: new Date("2026-06-10T01:00:00.000Z"),
    status: "IN_PROGRESS",
    submittedById: null,
    submittedAt: null,
    closedById: null,
    closedAt: null,
    totalSalesAmount: 100_000,
    cashAmount: 100_000,
    cardAmount: 0,
    otherPaymentAmount: 0,
    paymentDifferenceAmount: 0,
    workerCount: 1,
    workMemo: null,
    expenseItems: [],
    expenseTotal: 0,
    purchaseItems: [],
    purchaseTotal: 0,
    laborItems: [
      {
        id: "labor-1",
        employeeId: null,
        workerName: "홍길동",
        amount: 20_000,
        lateMemo: null,
        earlyLeaveMemo: null,
        specialMemo: null,
      },
    ],
    payrollTotal: 20_000,
    grossProfit: 0,
    productivity: null,
    stepCompletion: {
      sales: true,
      cost: false,
      purchase: false,
      inventory: false,
      losses: false,
      work: true,
    },
  });

  assert.equal(Object.hasOwn(safe, "payrollTotal"), false);
  assert.equal(safe.laborItems.length, 1);
  assert.equal(Object.hasOwn(safe.laborItems[0], "amount"), false);
  assert.equal(safe.laborItems[0].workerName, "홍길동");
});

test("WO-10: store manager labor schema rejects amount input", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "schemas.ts",
  );
  const { storeManagerLedgerLaborSchema } = await import(
    pathToFileURL(schemaPath).href
  );

  const base = {
    storeId: "store-1",
    ledgerId: "ledger-1",
    closingDate: "2026-06-10",
    version: 1,
  };

  // 금액 없는 근무자 명단은 통과한다.
  const ok = storeManagerLedgerLaborSchema.safeParse({
    ...base,
    labor: [{ employeeId: "", workerName: "홍길동" }],
  });
  assert.equal(ok.success, true);

  // 조작된 amount가 들어오면 무시가 아니라 거부한다.
  const rejected = storeManagerLedgerLaborSchema.safeParse({
    ...base,
    labor: [{ employeeId: "", workerName: "홍길동", amount: 999_999 }],
  });
  assert.equal(rejected.success, false);
});
