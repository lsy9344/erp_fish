import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

import { getHqStoreComparisonReport } from "../../src/features/reports/queries.ts";

test("period query uses latest Excel and preserves overlapping app statuses and losses", async () => {
  const store = { id: "anyang", name: "안양참수산" };
  const ledger = {
    id: "closed-empty-ledger",
    storeId: store.id,
    closingDate: "2026-09-15",
    updatedAt: "2026-09-15",
    updatedBy: null,
    status: "HEADQUARTERS_CLOSED",
    totalSalesAmount: 0,
    carryoverSalesAmount: 0,
    cashAmount: 0,
    cardAmount: 0,
    otherPaymentAmount: 0,
    workerCount: null,
    ledgerInventoryItems: [],
    ledgerInventoryAdjustments: [],
    ledgerExpenses: [],
    ledgerLossItems: [
      {
        id: "loss",
        productId: "fish",
        productName: "생선",
        lossTypeName: "폐기",
        quantity: 1,
        amount: 100,
      },
    ],
  };
  const historical = {
    storeId: store.id,
    businessDate: "2026-09-15",
    salesAmount: 10572000,
    grossProfit: 2371490,
    grossMarginRate: 2371490 / 10572000,
    workerCount: 4,
    productivity: 2643000,
    metricStatus: {},
  };
  const ledgers = [
    ledger,
    {
      ...ledger,
      id: "holiday-draft",
      closingDate: "2026-09-28",
      status: "IN_PROGRESS",
      ledgerLossItems: [],
    },
  ];
  const historicalRows = [
    historical,
    {
      ...historical,
      businessDate: "2026-09-28",
      salesAmount: null,
      grossProfit: null,
      grossMarginRate: null,
      workerCount: null,
      productivity: null,
    },
  ];
  const moduleUrl = (source) =>
    `data:text/javascript,${encodeURIComponent(source)}`;
  const authUrl = moduleUrl(`export async function requireReportAccess() {};
    export async function getHeadquartersStoreScope() { return { stores: [${JSON.stringify(store)}] }; }`);
  const dbUrl =
    moduleUrl(`const ledgers = ${JSON.stringify(ledgers)}.map(row => ({ ...row, closingDate: new Date(row.closingDate), updatedAt: new Date(row.updatedAt) }));
    const facts = ${JSON.stringify(historicalRows)}.map(row => ({ ...row, businessDate: new Date(row.businessDate) }));
    export const db = { dailyLedger: { findMany: async () => ledgers }, historicalDailyFact: { findMany: async () => facts } };`);
  const correctionsUrl = moduleUrl(
    "export async function getLatestCorrectionValuesForLedgers() { return new Map(); }",
  );
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.endsWith("/server/authz.ts"))
        return { url: authUrl, shortCircuit: true };
      if (specifier.endsWith("/server/db.ts"))
        return { url: dbUrl, shortCircuit: true };
      if (specifier.endsWith("/corrections/queries.ts"))
        return { url: correctionsUrl, shortCircuit: true };
      return nextResolve(specifier, context);
    },
  });
  try {
    const report = await getHqStoreComparisonReport({
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      internalHistoricalBatchId: "latest",
    });
    const row = report.rows[0];
    assert.equal(row.salesAmount.value, 10572000);
    assert.equal(row.grossProfit.value, 2371490);
    assert.equal(row.averageWorkerCount.value, 4);
    assert.equal(row.productivity.value, 2643000);
    assert.equal(row.averageSales.value, 10572000);
    assert.equal(row.sourceSummary.source, "historical");
    assert.equal(row.sourceSummary.excludedOperationalOverlapCount, 2);
    assert.equal(row.trendAggregation.businessDayCount, 1);
    assert.equal(row.statusCounts.closedCount, 1);
    assert.equal(row.statusCounts.inProgressCount, 1);
    assert.equal(row.statusCounts.missingDayCount, 28);
    assert.equal(row.hasLoss, true);
    assert.equal(row.metricEvidence.loss.applied.value, 1);
  } finally {
    hooks.deregister();
  }
});
