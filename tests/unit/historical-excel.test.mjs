import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
  APPROVED_HISTORICAL_STORE_NAMES,
  APPROVED_WORKBOOK_EXPECTATIONS,
  parseHistoricalWorkbook,
} from "../../src/features/historical-excel/parser.ts";
import { buildStoreComparisonReportExport } from "../../src/features/reports/export.ts";
import { mergeHistoricalStoreComparisonRow } from "../../src/features/reports/historical-integration.ts";

function metric(value) {
  return value === null
    ? {
        value: null,
        status: "data-insufficient",
        label: "데이터 부족",
        unavailableReason: "계산 불가",
      }
    : { value, status: "ok" };
}

function evidence(value, kind = "money") {
  return {
    label: "test",
    kind,
    original: { ...metric(value), kind },
    applied: { ...metric(value), kind },
    isCorrected: false,
    status: value === null ? "data-insufficient" : "original",
    statusLabel: value === null ? "데이터 부족" : "원본",
    unavailableReason: value === null ? "계산 불가" : null,
    ledgerDetailHref: null,
    correctionTimelineHref: null,
  };
}

function operationalRow() {
  return {
    storeId: "store-1",
    storeName: "강서수산",
    statusCounts: {
      missingDayCount: 1,
      inProgressCount: 0,
      reviewCount: 0,
      closedCount: 1,
      holidayCount: 0,
    },
    salesAmount: metric(100),
    closingSalesAmount: metric(100),
    carryoverSalesAmount: metric(0),
    operatingSalesAmount: metric(100),
    grossProfit: metric(20),
    grossMarginRate: metric(0.2),
    operatingProfit: metric(15),
    averageWorkerCount: metric(2),
    productivity: metric(50),
    averageInventory: metric(30),
    averageSales: metric(100),
    inventoryToSalesRatio: metric(0.3),
    hasLoss: false,
    hasUnappliedCorrections: false,
    sourceSummary: {
      source: "operational",
      operationalDayCount: 1,
      historicalDayCount: 0,
      historicalCoverageDayCount: 0,
      excludedHistoricalOverlapCount: 0,
      missingMetrics: [],
    },
    metricEvidence: {
      salesAmount: evidence(100),
      grossProfit: evidence(20),
      grossMarginRate: evidence(0.2, "percent"),
      operatingProfit: evidence(15),
      productivity: evidence(50),
      averageInventory: evidence(30),
      averageSales: evidence(100),
      inventoryToSalesRatio: evidence(0.3, "percent"),
      loss: evidence(0, "boolean"),
    },
  };
}

test("parser preserves formulas, cached values, blanks, errors, and first canonical store-date", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const input = workbook.addWorksheet("입력");
  input.addRow([
    "일자",
    "요일",
    "매장",
    "매출",
    "매출이익",
    "마진율",
    "영업이익",
    "인당생산성",
    "근무인원",
    "팀장",
    "팀장",
    "팀원",
    "팀원",
    "팀원",
    "팀원",
    "팀원",
    "팀원",
    "팀원",
    "팀원",
    "팀원",
    "팀원",
    "팀원",
    "매출차액",
  ]);
  const row = input.addRow([]);
  row.getCell(1).value = new Date("2020-01-01T00:00:00.000Z");
  row.getCell(3).value = APPROVED_HISTORICAL_STORE_NAMES[0];
  row.getCell(4).value = { formula: "1+1", result: 2 };
  row.getCell(5).value = { error: "#REF!" };
  row.getCell(9).value = 2;
  row.getCell(10).value = "기타";
  row.getCell(12).value = "원본이름";
  // 동일 지점·일자 두 번째 행은 raw에 남고 canonical/역할에서는 제외된다.
  input.addRow([
    new Date("2020-01-01T00:00:00.000Z"),
    "수",
    APPROVED_HISTORICAL_STORE_NAMES[0],
    999,
  ]);
  const ambiguous = input.addRow([
    new Date("2020-01-01T00:00:00.000Z"),
    "수",
    APPROVED_HISTORICAL_STORE_NAMES[1],
    100,
  ]);
  ambiguous.getCell(12).value = "원본이름";
  // 형식만 날짜처럼 보이는 값은 RangeError가 아니라 검증 불일치로 처리한다.
  input.addRow(["2020-13-40", "?", APPROVED_HISTORICAL_STORE_NAMES[0], 100]);
  for (const name of [
    "분석",
    "매장 별(년도)",
    "매장 별(달)",
    "매출",
    "매출이익",
    "이익률",
    "인당생산성",
    "평균 재고",
    "Sheet3",
  ]) {
    workbook.addWorksheet(name).addRow([name]);
  }
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  const parsed = await parseHistoricalWorkbook({
    fileBytes: bytes,
    sourceFileName: "fixture.xlsx",
  });

  assert.equal(parsed.summary.sheetCount, 10);
  assert.equal(parsed.summary.canonicalFactCount, 2);
  assert.equal(parsed.summary.duplicateStoreDateCount, 1);
  assert.equal(parsed.summary.normalizedRoleCount, 3);
  assert.equal(parsed.summary.sourceNameCount, 2);
  assert.ok(parsed.validationErrors.length > 0);

  const inputRow2 = parsed.rawRows.find(
    (rawRow) => rawRow.sheetName === "입력" && rawRow.rowNumber === 2,
  );
  assert.equal(inputRow2.rawCells.cellCount, 23);
  assert.deepEqual(inputRow2.rawCells.values[3], {
    formula: "1+1",
    result: 2,
  });
  assert.equal(inputRow2.rawCells.formulas[0].formula, "1+1");
  assert.equal(inputRow2.rawCells.formulas[0].cachedValue, 2);
  assert.deepEqual(inputRow2.rawCells.values[4], { error: "#REF!" });
  assert.ok(inputRow2.rawCells.blankColumns.includes(11));
  assert.equal(parsed.dailyFacts[0].grossProfit.status, "ORIGINAL_ERROR");
  assert.equal(parsed.dailyFacts[0].grossMarginRate.status, "BLANK");
  assert.equal(parsed.employees[0].firstSeenWorkDate, "2020-01-01");
  assert.ok(
    parsed.employees.some(
      (employee) =>
        employee.originalName === "기타" &&
        employee.reviewStatus === "REVIEW_REQUIRED",
    ),
  );
  assert.ok(
    parsed.employees.some(
      (employee) =>
        employee.originalName === "원본이름" &&
        employee.reviewStatus === "REVIEW_REQUIRED",
    ),
  );
});

test("approved customer workbook matches the immutable dry-run contract", async () => {
  const workbookPath = path.join(
    process.cwd(),
    "docs/reference_from_customer/2026-08-06_직영_매출_데이타.xlsx",
  );
  const fileBytes = new Uint8Array(await readFile(workbookPath));
  const parsed = await parseHistoricalWorkbook({
    fileBytes,
    sourceFileName: workbookPath,
  });

  assert.deepEqual(parsed.validationErrors, []);
  assert.equal(
    parsed.summary.fileHash,
    APPROVED_WORKBOOK_EXPECTATIONS.fileHash,
  );
  assert.equal(parsed.summary.sheetCount, 10);
  assert.equal(parsed.summary.rawRowCount, 14_309);
  assert.equal(parsed.summary.canonicalFactCount, 14_072);
  assert.equal(parsed.summary.normalizedRoleCount, 52_005);
  assert.equal(parsed.summary.rawRoleCellCount, 52_113);
  assert.equal(parsed.summary.sourceNameCount, 412);
  assert.equal(parsed.summary.duplicateStoreDateCount, 28);
});

test("historical and operational rows combine without treating broken inventory as zero", () => {
  const merged = mergeHistoricalStoreComparisonRow({
    operationalRow: operationalRow(),
    operationalLedgerCount: 1,
    operationalBusinessDayCount: 1,
    historicalFacts: [
      {
        businessDate: "2020-01-01",
        salesAmount: 300,
        grossProfit: 90,
        grossMarginRate: 0.3,
        productivity: 150,
        workerCount: 2,
        metricStatus: {},
      },
    ],
    excludedHistoricalOverlapCount: 1,
    dateCount: 3,
  });

  assert.equal(merged.sourceSummary.source, "mixed");
  assert.equal(merged.salesAmount.value, 400);
  assert.equal(merged.grossProfit.value, 110);
  assert.equal(merged.grossMarginRate.value, 110 / 400);
  assert.equal(merged.averageWorkerCount.value, 2);
  assert.equal(merged.productivity.value, 100);
  assert.equal(merged.averageSales.value, 200);
  assert.equal(merged.averageInventory.value, null);
  assert.equal(merged.inventoryToSalesRatio.value, null);
  assert.match(merged.averageInventory.reason, /원본 참조 오류/);
  assert.equal(merged.sourceSummary.excludedHistoricalOverlapCount, 1);
  assert.equal(merged.sourceSummary.historicalCoverageDayCount, 2);
  assert.equal(merged.statusCounts.missingDayCount, 1);

  const allOverlap = mergeHistoricalStoreComparisonRow({
    operationalRow: operationalRow(),
    operationalLedgerCount: 1,
    operationalBusinessDayCount: 1,
    historicalFacts: [],
    excludedHistoricalOverlapCount: 1,
    dateCount: 1,
  });
  assert.equal(allOverlap.sourceSummary.source, "operational");
  assert.equal(allOverlap.sourceSummary.historicalCoverageDayCount, 1);
  const exported = buildStoreComparisonReportExport({
    range: {
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      endDate: new Date("2020-01-01T00:00:00.000Z"),
      startDateInput: "2020-01-01",
      endDateInput: "2020-01-01",
      errorMessage: null,
    },
    selectedStoreId: "store-1",
    rows: [allOverlap],
  });
  assert.ok(
    exported.columns.some((column) => column.label === "운영 우선 제외 일수"),
  );
  assert.equal(exported.rows[0].overlapExcludedCount, 1);
});

test("historical integration preserves correction original and applied evidence", () => {
  const corrected = operationalRow();
  corrected.salesAmount = metric(120);
  corrected.grossProfit = metric(24);
  corrected.grossMarginRate = metric(0.2);
  corrected.productivity = metric(60);
  corrected.metricEvidence.salesAmount = {
    ...evidence(120),
    original: { ...metric(100), kind: "money" },
    applied: { ...metric(120), kind: "money" },
    isCorrected: true,
  };
  corrected.metricEvidence.grossProfit = {
    ...evidence(24),
    original: { ...metric(20), kind: "money" },
    applied: { ...metric(24), kind: "money" },
    isCorrected: true,
  };
  corrected.metricEvidence.grossMarginRate = {
    ...evidence(0.2, "percent"),
    original: { ...metric(0.2), kind: "percent" },
    applied: { ...metric(0.2), kind: "percent" },
    isCorrected: true,
  };
  corrected.metricEvidence.productivity = {
    ...evidence(60),
    original: { ...metric(50), kind: "money" },
    applied: { ...metric(60), kind: "money" },
    isCorrected: true,
  };

  const merged = mergeHistoricalStoreComparisonRow({
    operationalRow: corrected,
    operationalLedgerCount: 1,
    operationalBusinessDayCount: 1,
    historicalFacts: [
      {
        businessDate: "2020-01-01",
        salesAmount: 50,
        grossProfit: 10,
        grossMarginRate: 0.2,
        productivity: 50,
        workerCount: 1,
        metricStatus: {},
      },
    ],
    excludedHistoricalOverlapCount: 0,
    dateCount: 2,
  });

  assert.equal(merged.metricEvidence.salesAmount.original.value, 150);
  assert.equal(merged.metricEvidence.salesAmount.applied.value, 170);
  assert.equal(merged.metricEvidence.grossProfit.original.value, 30);
  assert.equal(merged.metricEvidence.grossProfit.applied.value, 34);
  assert.equal(merged.metricEvidence.grossMarginRate.original.value, 0.2);
  assert.equal(merged.metricEvidence.grossMarginRate.applied.value, 0.2);
  assert.equal(merged.metricEvidence.productivity.original.value, 50);
  assert.ok(
    Math.abs(merged.metricEvidence.productivity.applied.value - 170 / 3) <
      1e-12,
  );
  assert.equal(merged.metricEvidence.averageSales.original.value, 75);
  assert.equal(merged.metricEvidence.averageSales.applied.value, 85);
});

test("historical holidays and blank rows do not poison business-day metrics", () => {
  const merged = mergeHistoricalStoreComparisonRow({
    operationalRow: operationalRow(),
    operationalLedgerCount: 0,
    operationalBusinessDayCount: 0,
    historicalFacts: [
      {
        businessDate: "2020-01-01",
        salesAmount: 300,
        grossProfit: 90,
        grossMarginRate: 0.3,
        productivity: 150,
        workerCount: 2,
        metricStatus: {},
      },
      {
        businessDate: "2020-01-02",
        salesAmount: null,
        grossProfit: null,
        grossMarginRate: null,
        productivity: null,
        workerCount: null,
        metricStatus: {},
      },
      {
        businessDate: "2020-01-03",
        salesAmount: 0,
        grossProfit: null,
        grossMarginRate: null,
        productivity: null,
        workerCount: null,
        metricStatus: {},
      },
    ],
    excludedHistoricalOverlapCount: 0,
    dateCount: 3,
  });

  assert.equal(merged.sourceSummary.source, "historical");
  assert.equal(merged.sourceSummary.historicalDayCount, 1);
  assert.equal(merged.sourceSummary.historicalCoverageDayCount, 3);
  assert.equal(merged.salesAmount.value, 300);
  assert.equal(merged.grossProfit.value, 90);
  assert.equal(merged.averageWorkerCount.value, 2);
  assert.equal(merged.productivity.value, 150);
  assert.equal(merged.averageSales.value, 300);
  assert.equal(merged.statusCounts.missingDayCount, 0);

  const blankOnly = mergeHistoricalStoreComparisonRow({
    operationalRow: operationalRow(),
    operationalLedgerCount: 0,
    operationalBusinessDayCount: 0,
    historicalFacts: [
      {
        businessDate: "2020-01-02",
        salesAmount: null,
        grossProfit: null,
        grossMarginRate: null,
        productivity: null,
        workerCount: null,
        metricStatus: { salesAmount: "BLANK" },
      },
    ],
    excludedHistoricalOverlapCount: 0,
    dateCount: 1,
  });
  assert.equal(blankOnly.salesAmount.value, null);
  assert.match(blankOnly.salesAmount.reason, /공란|원본 오류/);

  const explicitZero = mergeHistoricalStoreComparisonRow({
    operationalRow: operationalRow(),
    operationalLedgerCount: 0,
    operationalBusinessDayCount: 0,
    historicalFacts: [
      {
        businessDate: "2020-01-03",
        salesAmount: 0,
        grossProfit: 0,
        grossMarginRate: 0,
        productivity: null,
        workerCount: 0,
        metricStatus: { salesAmount: "VALUE" },
      },
    ],
    excludedHistoricalOverlapCount: 0,
    dateCount: 1,
  });
  assert.equal(explicitZero.salesAmount.value, 0);
});

test("import implementation is hash-idempotent and rollback changes exposure only", async () => {
  const source = await readFile(
    path.join(process.cwd(), "src/features/historical-excel/import-service.ts"),
    "utf8",
  );

  assert.match(source, /findUnique\([\s\S]*fileHash/);
  assert.match(
    source,
    /if \(existing\) return reuseCompletedBatch\(existing\)/,
  );
  assert.match(source, /stage 행 수 검증에 실패했습니다/);
  assert.match(source, /status: "ACTIVE"/);
  assert.match(source, /status: "ROLLED_BACK"/);
  assert.doesNotMatch(source, /historicalExcelRawRow\.(?:delete|deleteMany)/);
  assert.doesNotMatch(source, /dailyLedger\.(?:create|update|delete)/);
  assert.doesNotMatch(source, /ledgerLaborItem\.(?:create|update|delete)/);
  assert.doesNotMatch(source, /employee\.(?:create|update|delete)/);
});
