import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

const { refreshCustomerWorkbookChartCache } =
  await import("../../src/features/reports/customer-workbook-chart-cache.ts");

test("refreshes chart numRef and strRef caches from workbook cells", () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("평균 재고");
  sheet.getCell("B3").value = "강서수산";
  sheet.getCell("B4").value = "불광수산";
  sheet.getCell("C3").value = 0;
  sheet.getCell("C4").value = { formula: "1+1", result: 2 };
  sheet.getCell("D3").value = new Date("2026-06-01T00:00:00.000Z");

  const original =
    '<c:ser><c:spPr><a:solidFill/></c:spPr><c:cat><c:strRef><c:f>&apos;평균 재고&apos;!$B$3:$B$4</c:f><c:strCache><c:ptCount val="2"/><c:pt idx="0"><c:v>old</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>&apos;평균 재고&apos;!$C$3:$C$4</c:f><c:numCache><c:formatCode>0</c:formatCode><c:ptCount val="2"/><c:pt idx="0"><c:v>9</c:v></c:pt><c:pt idx="1"><c:v>8</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser>';
  const refreshed = refreshCustomerWorkbookChartCache(original, workbook);

  assert.match(refreshed, /<a:solidFill\/>/);
  assert.match(
    refreshed,
    /<c:strCache><c:ptCount val="2"\/><c:pt idx="0"><c:v>강서수산<\/c:v><\/c:pt><c:pt idx="1"><c:v>불광수산<\/c:v>/,
  );
  assert.match(
    refreshed,
    /<c:numCache><c:formatCode>0<\/c:formatCode><c:ptCount val="2"\/><c:pt idx="0"><c:v>0<\/c:v><\/c:pt><c:pt idx="1"><c:v>2<\/c:v>/,
  );
  assert.doesNotMatch(refreshed, /<c:v>9<\/c:v>|<c:v>8<\/c:v>|old/);
});

test("escapes chart strings and handles bare sheet references", () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet3");
  sheet.getCell("A1").value = "A&B <test>";
  sheet.getCell("B1").value = 0;
  const chart =
    '<c:strRef><c:f>Sheet3!$A$1</c:f><c:strCache><c:ptCount val="0"/></c:strCache></c:strRef><c:numRef><c:f>Sheet3!$B$1</c:f><c:numCache><c:ptCount val="0"/></c:numCache></c:numRef>';
  const refreshed = refreshCustomerWorkbookChartCache(chart, workbook);
  assert.match(refreshed, /A&amp;B &lt;test&gt;/);
  assert.match(refreshed, /<c:v>0<\/c:v>/);
});

test("keeps a zero cached formula result as a chart point", () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet3");
  sheet.getCell("A1").value = { formula: "1-1", result: 0 };
  const chart =
    '<c:numRef><c:f>Sheet3!$A$1</c:f><c:numCache><c:ptCount val="0"/></c:numCache></c:numRef>';
  const refreshed = refreshCustomerWorkbookChartCache(chart, workbook);
  assert.match(refreshed, /<c:ptCount val="1"\/><c:pt idx="0"><c:v>0<\/c:v>/);
});
