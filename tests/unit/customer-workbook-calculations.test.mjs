import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import ExcelJS from "exceljs";

const { normalizeCustomerFormula, recalculateCustomerWorkbook } = await import(
  pathToFileURL(
    `${process.cwd()}/src/features/reports/customer-workbook-calculations.ts`,
  ).href
);

function buildWorkbook() {
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
  ]);
  input.addRow([
    new Date("2025-01-01T00:00:00.000Z"),
    "수",
    "강서수산",
    100,
    30,
    null,
    null,
    50,
    2,
  ]);
  input.addRow([
    new Date("2025-01-02T00:00:00.000Z"),
    "목",
    "강서수산",
    200,
    50,
    null,
    null,
    100,
    4,
  ]);
  input.getCell("F2").value = { formula: "E2/D2", result: 0 };
  input.getCell("F3").value = { sharedFormula: "F2", result: 0 };

  const analysis = workbook.addWorksheet("분석");
  analysis.getCell("A2").value = 2025;
  analysis.getCell("B2").value = 1;
  analysis.getCell("C2").value = 1;
  analysis.getCell("E2").value = 2025;
  analysis.getCell("F2").value = 1;
  analysis.getCell("G2").value = 31;
  analysis.getCell("A5").value = "강서수산";
  analysis.getCell("B5").value = {
    formula:
      'SUMIFS(입력!$D:$D,입력!$C:$C,분석!$A5,입력!$A:$A,">="&DATE(분석!$A$2,분석!$B$2,분석!$C$2),입력!$A:$A,"<="&DATE(분석!$E$2,분석!$F$2,분석!$G$2))',
    result: 0,
  };
  analysis.getCell("C5").value = {
    formula:
      'SUMIFS(입력!$E:$E,입력!$C:$C,분석!$A5,입력!$A:$A,">="&DATE(분석!$A$2,분석!$B$2,분석!$C$2),입력!$A:$A,"<="&DATE(분석!$E$2,분석!$F$2,분석!$G$2))',
    result: 0,
  };
  analysis.getCell("D5").value = { formula: "C5/B5", result: 0 };
  analysis.getCell("E5").value = {
    formula:
      'AVERAGEIFS(입력!$I:$I,입력!$C:$C,분석!$A5,입력!$A:$A,">="&DATE(분석!$A$2,분석!$B$2,분석!$C$2),입력!$A:$A,"<="&DATE(분석!$E$2,분석!$F$2,분석!$G$2))',
    result: 0,
  };
  analysis.getCell("F5").value = { formula: "B5/E5", result: 0 };
  analysis.getCell("G5").value = {
    formula: 'SUMIF(입력!$C:$C,"강서수산",입력!$D:$D)',
    result: 0,
  };
  analysis.getCell("H5").value = {
    formula: "EOMONTH(DATE(2025,1,1),0)",
    result: 0,
  };
  return workbook;
}

test("customer formulas recalculate shared rates and date criteria", () => {
  const workbook = buildWorkbook();
  recalculateCustomerWorkbook(workbook);
  const input = workbook.getWorksheet("입력");
  const analysis = workbook.getWorksheet("분석");

  assert.deepEqual(input.getCell("F2").value, {
    formula: "E2/D2",
    result: 0.3,
  });
  assert.deepEqual(input.getCell("F3").value, {
    formula: "E3/D3",
    result: 0.25,
  });
  assert.equal(analysis.getCell("B5").value.result, 300);
  assert.equal(analysis.getCell("C5").value.result, 80);
  assert.equal(analysis.getCell("D5").value.result, 80 / 300);
  assert.equal(analysis.getCell("E5").value.result, 3);
  assert.equal(analysis.getCell("F5").value.result, 100);
  assert.equal(analysis.getCell("G5").value.result, 300);
  assert.equal(analysis.getCell("H5").value.result, 45688);
});

test("criteria aggregates ignore unmatched errors and nonnumeric values", () => {
  const workbook = new ExcelJS.Workbook();
  const input = workbook.addWorksheet("입력");
  input.addRow(["매장", "매출", "근무인원"]);
  input.addRow(["A", 10, 2]);
  input.addRow(["B", { error: "#REF!" }, { error: "#REF!" }]);
  input.addRow(["A", "20", "4"]);
  input.addRow(["A", true, false]);
  input.addRow(["B", 7, 8]);

  const analysis = workbook.addWorksheet("분석");
  analysis.getCell("A1").value = {
    formula: 'SUMIFS(입력!$B:$B,입력!$A:$A,"A")',
    result: 0,
  };
  analysis.getCell("A2").value = {
    formula: 'AVERAGEIFS(입력!$C:$C,입력!$A:$A,"A")',
    result: 0,
  };
  analysis.getCell("A3").value = {
    formula: 'SUMIF(입력!$A:$A,"A",입력!$B:$B)',
    result: 0,
  };
  analysis.getCell("A4").value = {
    formula: 'SUMIFS(입력!$B:$B,입력!$A:$A,"B")',
    result: 0,
  };
  analysis.getCell("A5").value = {
    formula: 'AVERAGEIFS(입력!$C:$C,입력!$A:$A,"B")',
    result: 0,
  };

  recalculateCustomerWorkbook(workbook);
  assert.equal(analysis.getCell("A1").value.result, 10);
  assert.equal(analysis.getCell("A2").value.result, 2);
  assert.equal(analysis.getCell("A3").value.result, 10);
  assert.deepEqual(analysis.getCell("A4").value.result, { error: "#REF!" });
  assert.deepEqual(analysis.getCell("A5").value.result, { error: "#REF!" });
});

test("fixed input ranges normalize to the full exported input columns", () => {
  assert.equal(
    normalizeCustomerFormula(
      'AVERAGEIFS(입력!$H$1318:$H$1467,입력!$C$1318:$C$1467,"강서수산",입력!$H$1318:$H$1467,"<>0")',
    ),
    'AVERAGEIFS(입력!$H:$H,입력!$C:$C,"강서수산",입력!$H:$H,"<>0")',
  );

  const workbook = buildWorkbook();
  const analysis = workbook.addWorksheet("인당생산성");
  analysis.getCell("B2").value = "강서수산";
  analysis.getCell("C2").value = {
    formula:
      'AVERAGEIFS(입력!$H$2:$H$2,입력!$C$2:$C$2,인당생산성!B2,입력!$H$2:$H$2,"<>0")',
    result: 0,
  };
  recalculateCustomerWorkbook(workbook);
  assert.equal(analysis.getCell("C2").value.result, 75);
  assert.equal(
    analysis.getCell("C2").value.formula,
    'AVERAGEIFS(입력!$H:$H,입력!$C:$C,인당생산성!B2,입력!$H:$H,"<>0")',
  );
});

test("original #REF! cells remain safe errors while unsupported functions fail loudly", () => {
  const workbook = buildWorkbook();
  const analysis = workbook.addWorksheet("평균 재고");
  analysis.getCell("B2").value = "강서수산";
  analysis.getCell("C2").value = {
    formula:
      "AVERAGEIFS(입력!#REF!,입력!$C:$C,'평균 재고'!B2,입력!#REF!,\"<>0\")",
    result: { error: "#REF!" },
  };
  recalculateCustomerWorkbook(workbook);
  assert.deepEqual(analysis.getCell("C2").value, {
    formula:
      "AVERAGEIFS(입력!#REF!,입력!$C:$C,'평균 재고'!B2,입력!#REF!,\"<>0\")",
    result: { error: "#REF!" },
  });

  const unsupported = new ExcelJS.Workbook();
  const sheet = unsupported.addWorksheet("입력");
  sheet.getCell("A1").value = { formula: "ROUND(1.2,0)", result: 1 };
  assert.throws(
    () => recalculateCustomerWorkbook(unsupported),
    /Unsupported customer workbook function: ROUND/,
  );
});
