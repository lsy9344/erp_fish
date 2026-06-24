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
      // point_summary 검토 후속(2026-06-24): 계획 판매가 대비 실제 비교 지표.
      // 계획 매출/계획 대비 차이는 지점장 본인 판매가 계획·총매출만으로 산출되어 노출,
      // 계획 마진율은 status가 ok일 때만 노출(아래에서 ok이므로 값 유지),
      // 계획 매출이익(plannedGrossProfit)은 절대 이익이라 지점장 요약에서 제외된다.
      plannedSalesTotal: { value: 130_000, status: "ok" },
      plannedGrossProfit: { value: 100_000, status: "ok" },
      plannedGrossMarginRate: { value: 0.769, status: "ok" },
      plannedVsActualSalesDifference: { value: -30_000, status: "ok" },
    },
    missingItems: [],
    warnings: [
      {
        id: "payment-difference",
        label: "결제수단 합계와 총매출 불일치",
        detail: "결제수단 합계가 총매출과 일치하지 않습니다.",
        amount: -5_000,
      },
    ],
    signals: [
      {
        id: "inventory-product-1",
        label: "재고 차이",
        detail: "광어 실제 재고 차이",
        quantity: -2,
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
        detail: "총매출과 결제수단 합계를 확인했습니다.",
        href: "/app/store-entry?storeId=store-1&date=2026-06-10&step=sales",
        metrics: [
          {
            id: "paymentDifference",
            label: "결제수단 합계와 총매출 차이",
            value: 0,
            kind: "signed-krw",
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

  // 미팅 결정(2026-06-21): 마진률과 총 재고금액은 지점장에게 노출한다.
  // 보완(2026-06-22 WO-01): 결제차액은 제거, 근무인원 수 추가.
  // 매출원가·매출이익·영업이익·인당생산성·매출차이·FIFO·lot 근거는 계속 차단한다.
  // point_summary 검토 후속(2026-06-24): 계획 매출이익(plannedGrossProfit)도 절대 이익이라 차단한다.
  const stillBlockedSummaryKeys = [
    "costOfGoodsSold",
    "grossProfit",
    "operatingProfit",
    "productivity",
    "salesDifference",
    "hopedSalePriceLossAmount",
    "paymentDifference",
    "plannedGrossProfit",
  ];

  for (const blockedKey of stillBlockedSummaryKeys) {
    assert.equal(
      Object.hasOwn(safeReview.summary, blockedKey),
      false,
      `summary.${blockedKey} should stay blocked for store managers`,
    );
  }

  // point_summary 검토 후속(2026-06-24): 계획 매출/계획 대비 차이/계획 마진율을 추가로 노출한다.
  assert.deepEqual(Object.keys(safeReview.summary).sort(), [
    "grossMarginRate",
    "inventoryAmount",
    "plannedGrossMarginRate",
    "plannedSalesTotal",
    "plannedVsActualSalesDifference",
    "totalSales",
    "workerCount",
  ]);
  // 계획 마진율은 status가 ok이므로 값이 그대로 노출된다.
  assert.equal(safeReview.summary.plannedGrossMarginRate.value, 0.769);
  assert.equal(safeReview.summary.plannedSalesTotal.value, 130_000);
  assert.equal(
    safeReview.summary.plannedVsActualSalesDifference.value,
    -30_000,
  );
  assert.deepEqual(safeReview.signals[0], {
    id: "inventory-product-1",
    label: "재고 차이",
    detail: "광어 실제 재고 차이",
    quantity: -2,
  });
  // 역산 부정행위 방지(point_summary.md:37): 합계 불일치 경고도 차액 금액(amount)을
  // 지점장 화면에 노출하지 않는다. 경고 사실(label/detail)만 남고 amount는 제거된다.
  assert.deepEqual(safeReview.warnings[0], {
    id: "payment-difference",
    label: "결제수단 합계와 총매출 불일치",
    detail: "결제수단 합계가 총매출과 일치하지 않습니다.",
  });
  assert.equal(Object.hasOwn(safeReview.warnings[0], "amount"), false);
  // 화이트리스트(WO-01 수정): inventoryAmount는 통과, paymentDifference는 제거됨.
  assert.deepEqual(
    safeReview.stepSummaries[0].metrics.map((metric) => metric.id).sort(),
    ["inventoryAmount"],
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

test("common sensitive field helper removes derived and OQ-gated metric keys", async () => {
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
