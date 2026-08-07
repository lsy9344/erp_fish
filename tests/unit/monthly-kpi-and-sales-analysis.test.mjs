import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

const { calculateMonthlyNetProfit } = await import(
  pathToFileURL(path.join(root, "src", "features", "reports", "monthly-kpi.ts"))
    .href
);
const { buildMonthlySalesAnalysis } = await import(
  pathToFileURL(path.join(root, "src", "features", "reports", "queries.ts"))
    .href
);

// WO-0806 #3: 순이익 = 영업이익 − 인건비, 순이익률 = 순이익 ÷ 매출.
test("monthly net profit subtracts labor from operating profit", () => {
  assert.deepEqual(
    calculateMonthlyNetProfit({
      operatingProfit: 10_000_000,
      laborAmount: 4_000_000,
      salesAmount: 100_000_000,
    }),
    { netProfit: 6_000_000, netProfitRate: 0.06 },
  );

  // 인건비가 영업이익을 넘으면 적자다. 0으로 자르지 않는다.
  assert.deepEqual(
    calculateMonthlyNetProfit({
      operatingProfit: 1_000_000,
      laborAmount: 4_000_000,
      salesAmount: 100_000_000,
    }),
    { netProfit: -3_000_000, netProfitRate: -0.03 },
  );

  // 영업이익이 계산 불가면 순이익도 계산 불가다(사유는 화면이 영업이익에서 승계).
  assert.deepEqual(
    calculateMonthlyNetProfit({
      operatingProfit: null,
      laborAmount: 4_000_000,
      salesAmount: 100_000_000,
    }),
    { netProfit: null, netProfitRate: null },
  );

  // 매출이 0 이하이거나 없으면 비율만 계산 불가, 금액은 살린다.
  for (const salesAmount of [0, null]) {
    assert.deepEqual(
      calculateMonthlyNetProfit({
        operatingProfit: 10_000_000,
        laborAmount: 4_000_000,
        salesAmount,
      }),
      { netProfit: 6_000_000, netProfitRate: null },
    );
  }
});

function metric(value) {
  return value === null
    ? {
        value: null,
        status: "calculation-unavailable",
        label: "계산 불가",
        unavailableReason: "계산 불가",
        reason: "매출원가 계산 불가",
      }
    : { value, status: "available" };
}

function row({ storeId, storeName, sales, inventory = 0, avgSales = 0 }) {
  return {
    storeId,
    storeName,
    salesAmount: metric(sales),
    averageInventory: metric(inventory),
    averageSales: metric(avgSales),
    inventoryToSalesRatio: metric(
      avgSales > 0 && inventory !== null ? inventory / avgSales : null,
    ),
  };
}

// WO-0806 #4: 월간 매출분석은 기간 비교 집계를 재사용하고 share/rank/증감만 계산한다.
test("monthly sales analysis compares against the previous month", () => {
  const analysis = buildMonthlySalesAnalysis({
    currentRows: [
      {
        ...row({
          storeId: "a",
          storeName: "강남",
          sales: 120,
          inventory: 30,
          avgSales: 60,
        }),
      },
      {
        ...row({
          storeId: "b",
          storeName: "잠실",
          sales: 80,
          inventory: 20,
          avgSales: 40,
        }),
      },
    ],
    previousRows: [
      { ...row({ storeId: "a", storeName: "강남", sales: 100 }) },
      { ...row({ storeId: "b", storeName: "잠실", sales: 100 }) },
    ],
  });

  assert.deepEqual(
    analysis.salesChanges.map((change) => [
      change.storeId,
      change.difference.value,
      change.rate.value,
    ]),
    [
      ["a", 20, 0.2],
      ["b", -20, -0.2],
    ],
  );

  // 매출 내림차순으로 순위를 매기고 비중은 조회 기간 합계 기준.
  assert.deepEqual(
    analysis.positions.map((position) => [
      position.rank,
      position.storeId,
      position.share.value,
    ]),
    [
      [1, "a", 0.6],
      [2, "b", 0.4],
    ],
  );

  // 재고비율은 기간 분석과 같은 값(평균재고 ÷ 평균매출)을 그대로 쓴다.
  assert.deepEqual(
    analysis.inventoryRatios.map((ratio) => [
      ratio.storeId,
      ratio.inventoryRatio.value,
    ]),
    [
      ["a", 0.5],
      ["b", 0.5],
    ],
  );
});

test("monthly sales analysis degrades with a reason instead of Infinity", () => {
  const analysis = buildMonthlySalesAnalysis({
    currentRows: [
      row({ storeId: "a", storeName: "강남", sales: 120 }),
      row({ storeId: "b", storeName: "잠실", sales: null }),
      row({ storeId: "c", storeName: "신촌", sales: 50 }),
    ],
    // 강남은 전월 매출 0원, 신촌은 전월 장부 자체가 없다.
    previousRows: [row({ storeId: "a", storeName: "강남", sales: 0 })],
  });

  const byStore = new Map(
    analysis.salesChanges.map((change) => [change.storeId, change]),
  );
  assert.equal(byStore.get("a").rate.value, null);
  assert.equal(byStore.get("a").rate.reason, "전월 매출 0원");
  assert.equal(byStore.get("c").rate.value, null);
  assert.equal(byStore.get("c").previousSales.reason, "전월 장부 없음");

  // 매출을 계산할 수 없는 지점은 순위에서 빠지고 사유와 함께 별도 목록에 남는다.
  assert.deepEqual(
    analysis.positions.map((position) => position.storeId),
    ["a", "c"],
  );
  assert.deepEqual(
    analysis.excludedPositions.map((excluded) => excluded.storeId),
    ["b"],
  );
  assert.ok(analysis.excludedPositions[0].reason.length > 0);

  // 어떤 값도 Infinity/NaN으로 새지 않는다.
  for (const change of analysis.salesChanges) {
    for (const key of ["difference", "rate"]) {
      const value = change[key].value;
      assert.ok(
        value === null || Number.isFinite(value),
        `${change.storeId}.${key} must be null or finite`,
      );
    }
  }
});

test("monthly sales analysis returns empty rows for a malformed month", async () => {
  const { getMonthlySalesAnalysis } = await import(
    pathToFileURL(path.join(root, "src", "features", "reports", "queries.ts"))
      .href
  );

  assert.deepEqual(await getMonthlySalesAnalysis("not-a-month"), {
    salesChanges: [],
    inventoryRatios: [],
    positions: [],
    excludedPositions: [],
  });
});
