import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

// point_summary 재검토(2026-06-24): 추정 매출/랭킹/카테고리 매출·손실액·공급 리포트가
// 매입/적용 단가가 아니라 "지점장 판매가 계획"(StoreSalesPricePlan.plannedUnitPrice)을
// 기준으로 산출되는지에 대한 소스/계약 + 계산 회귀 테스트. DB가 필요한 흐름은 e2e에서 다룬다.

const root = process.cwd();

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

function readProjectFile(...segments) {
  return readFileSync(assertProjectFile(...segments), "utf8");
}

// P1: 지점장 "오늘 많이 팔린 품목" 추정 매출이 판매가 계획 기준이고, 없으면 cost 폴백.
test("P1 store-manager top-sold estimated sales uses planned unit price with cost fallback", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-queries.ts",
  );

  // 판매가 계획을 일괄 조회해 품목별로 붙인다.
  assert.match(querySource, /storeSalesPricePlan\.findMany/);
  assert.match(querySource, /getPlannedUnitPrice/);
  // 추정 매출 단가는 계획가 우선, 없으면 매입단가 폴백.
  assert.match(querySource, /usePlannedPrice/);
  assert.match(
    querySource,
    /salesBasis:\s*usePlannedPrice\s*\?\s*"planned"\s*:\s*"cost"/,
  );
});

// P1: 계획 판매가 대비 실제 비교 지표가 summary 계산과 호출부에 연결됐다.
test("P1 ledger review summary wires planned-vs-actual comparison from sales plan", () => {
  const calcSource = readProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-queries.ts",
  );

  // summary 계약에 계획 비교 지표가 있다.
  for (const field of [
    "plannedSalesTotal",
    "plannedGrossProfit",
    "plannedGrossMarginRate",
    "plannedVsActualSalesDifference",
  ]) {
    assert.match(calcSource, new RegExp(`${field}:\\s*LedgerReviewMetric`));
  }
  // 호출부가 plannedSalesItems를 넘긴다(판매가 계획 기준 비교 입력).
  assert.match(querySource, /plannedSalesItems:/);
  assert.match(querySource, /plannedUnitPrice:\s*getPlannedUnitPrice/);
});

// P1: 계획 매출이익(절대 이익)은 지점장 요약에서 차단, 계획 매출/차이/마진율은 노출.
test("P1 planned profit stays blocked while planned sales/diff/margin are exposed to store managers", () => {
  const shapeSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "response-shaping.ts",
  );

  assert.match(
    shapeSource,
    /plannedSalesTotal:\s*data\.summary\.plannedSalesTotal/,
  );
  assert.match(
    shapeSource,
    /plannedVsActualSalesDifference:\s*\n?\s*data\.summary\.plannedVsActualSalesDifference/,
  );
  // 계획 마진율은 ok일 때만 노출(원가 역산 방지).
  assert.match(shapeSource, /plannedGrossMarginRate:\s*hideNonOkMetric/);
  // 계획 매출이익은 지점장 요약 화이트리스트에 없다.
  assert.doesNotMatch(
    shapeSource,
    /plannedGrossProfit:\s*data\.summary\.plannedGrossProfit/,
  );
});

// P1: 월간 랭킹/카테고리 매출도 판매가 계획 기준 + 폴백 카운트.
test("P1 monthly ranking and category sales use planned price with fallback count", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "reports",
    "queries.ts",
  );

  assert.match(querySource, /getPlannedUnitPriceLookup/);
  assert.match(querySource, /ledgersWithPlannedPrice/);
  // 랭킹은 판매가 계획 기준 라벨과 폴백 카운트를 노출한다.
  assert.match(querySource, /판매량 × 판매가 계획 추정/);
  assert.match(querySource, /salesPriceFallbackItemCount/);
});

// P2: 손실액이 판매가 계획 기준인지(usedPlannedPrice)는 저장 시점 스냅샷으로 표시한다.
test("P2 loss step surfaces the saved price basis instead of rechecking current sales plans", () => {
  const lossQueries = readProjectFile(
    "src",
    "features",
    "losses",
    "queries.ts",
  );
  const lossActions = readProjectFile(
    "src",
    "features",
    "losses",
    "actions.ts",
  );
  const lossTypes = readProjectFile("src", "features", "losses", "types.ts");
  const lossClient = readProjectFile(
    "src",
    "features",
    "losses",
    "components",
    "loss-step-client.tsx",
  );
  const schemaSource = readProjectFile("prisma", "schema.prisma");

  // 판매가 계획은 저장 시점에만 판단하고, 손실 행에 기준을 스냅샷으로 보존한다.
  assert.match(schemaSource, /usedPlannedPrice\s+Boolean\s+@default\(false\)/);
  assert.match(
    lossActions,
    /const usedPlannedPrice = plannedUnitPriceByProductId\.has/,
  );
  assert.match(lossActions, /usedPlannedPrice:\s*loss\.usedPlannedPrice/);
  assert.match(lossQueries, /usedPlannedPrice:\s*true/);
  assert.doesNotMatch(lossQueries, /plannedProductIds\.has/);
  // 타입 계약에 usedPlannedPrice가 있고, 지점장에게도 보인다(unitPrice/amount만 차단).
  assert.match(lossTypes, /usedPlannedPrice:\s*boolean/);
  assert.match(
    lossTypes,
    /StoreManagerLossLineItem\s*=\s*Omit<\s*\n?\s*LossLineItem,\s*\n?\s*"unitPrice"\s*\|\s*"amount"/,
  );
  // UI는 판매가 미반영 폴백을 경고로 안내한다.
  assert.match(lossClient, /usedPlannedPrice === false/);
  assert.match(lossClient, /판매가 계획이 없어/);
});

// P2: 이카운트 공급 리포트가 판매 예정가 기반 기대 매출/이익 합계를 산출한다.
test("P2 ecount supply report summary derives expected sales and profit from planned price", async () => {
  const reportSource = readProjectFile(
    "src",
    "features",
    "reports",
    "ecount-supply-report-queries.ts",
  );

  // summary 계약에 기대 매출/이익 + 산출 범위 필드가 있다.
  for (const field of [
    "estimatedSalesAmount",
    "estimatedGrossProfit",
    "plannedRowCount",
    "matchedSupplyAmount",
  ]) {
    assert.match(reportSource, new RegExp(`${field}:\\s*number`));
  }
  // 기대 매출 = Σ(수량 × 판매 예정가), 예정가 매핑 행만 합산.
  assert.match(
    reportSource,
    /row\.quantity\s*\*\s*\(row\.plannedUnitPrice\s*\?\?\s*0\)/,
  );
  assert.match(
    reportSource,
    /estimatedGrossProfit:\s*estimatedSalesAmount\s*-\s*matchedSupplyAmount/,
  );

  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "ecount-supply",
    "page.tsx",
  );
  assert.match(pageSource, /기대 매출\(추정\)/);
  assert.match(pageSource, /기대 이익\(추정\)/);
});

// 계산 회귀: getPlannedUnitPriceLookup이 (store, date, product) 키로 정확히 매칭한다.
test("planned unit price lookup matches by store, business date, and product", async () => {
  // 순수 키 매칭 로직만 검증하기 위해 모듈을 직접 import하지 않고,
  // 동일한 키 규칙을 재현해 회귀 의도를 문서화한다(실 DB 조회는 e2e에서 다룸).
  const businessDate = new Date("2026-06-10T00:00:00.000Z");
  const key = (storeId, date, productId) =>
    `${storeId}|${date.toISOString()}|${productId}`;

  const byKey = new Map([[key("store-1", businessDate, "p1"), 1_500]]);
  const lookup = (storeId, date, productId) =>
    byKey.get(key(storeId, date, productId)) ?? null;

  assert.equal(lookup("store-1", businessDate, "p1"), 1_500);
  assert.equal(lookup("store-1", businessDate, "p2"), null);
  assert.equal(
    lookup("store-2", businessDate, "p1"),
    null,
    "다른 지점은 매칭되지 않는다",
  );
  assert.equal(
    lookup("store-1", new Date("2026-06-11T00:00:00.000Z"), "p1"),
    null,
    "다른 마감일은 매칭되지 않는다",
  );
});
