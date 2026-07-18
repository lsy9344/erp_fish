import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(__dirname, "과거_재고_간단_입력_양식.xlsx");

const workbook = new ExcelJS.Workbook();
workbook.creator = "Codex";
workbook.created = new Date();
workbook.modified = new Date();
workbook.calcProperties.fullCalcOnLoad = true;

const color = {
  navy: "1F4E78",
  white: "FFFFFF",
  header: "D9EAF7",
  required: "FFF2CC",
  optional: "E2F0D9",
  note: "F4F6F8",
  border: "D9E2EC",
  text: "1F2933",
};

function title(sheet, range, text) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(":")[0]);
  cell.value = text;
  cell.font = { name: "맑은 고딕", bold: true, size: 16, color: { argb: color.white } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color.navy } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(cell.row).height = 28;
}

function note(sheet, rowNumber, lastColumn, text) {
  sheet.mergeCells(`A${rowNumber}:${lastColumn}${rowNumber}`);
  const cell = sheet.getCell(`A${rowNumber}`);
  cell.value = text;
  cell.font = { name: "맑은 고딕", size: 10, color: { argb: color.text } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color.note } };
  cell.alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(rowNumber).height = 34;
}

function header(row) {
  row.eachCell((cell) => {
    cell.font = { name: "맑은 고딕", bold: true, size: 10, color: { argb: color.text } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color.header } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: color.border } },
      bottom: { style: "thin", color: { argb: color.border } },
    };
  });
  row.height = 28;
}

function styleRows(sheet, start, end, columns) {
  for (let rowNumber = start; rowNumber <= end; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 22;
    for (const col of columns) {
      const cell = row.getCell(col.key);
      cell.font = { name: "맑은 고딕", size: 10 };
      cell.alignment = {
        vertical: "middle",
        horizontal: col.align ?? "left",
        wrapText: false,
      };
      cell.border = { bottom: { style: "hair", color: { argb: color.border } } };
      if (col.required) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color.required } };
      } else if (col.optional) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color.optional } };
      }
      if (col.numFmt) {
        cell.numFmt = col.numFmt;
      }
    }
  }
}

function setColumns(sheet, columns) {
  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width,
    style: col.numFmt ? { numFmt: col.numFmt } : undefined,
  }));
}

function listValidation(sheet, range, formulae) {
  sheet.dataValidations.add(range, {
    type: "list",
    allowBlank: true,
    formulae,
    showErrorMessage: true,
    errorTitle: "입력 확인",
    error: "목록에서 선택해 주세요.",
  });
}

function wholeNumberValidation(sheet, range) {
  sheet.dataValidations.add(range, {
    type: "whole",
    operator: "greaterThanOrEqual",
    formulae: [0],
    allowBlank: true,
    showErrorMessage: true,
    errorTitle: "숫자 확인",
    error: "0 이상의 정수만 입력해 주세요.",
  });
}

function twoDecimalQuantityValidation(sheet, range) {
  const firstCell = range.split(":")[0];
  sheet.dataValidations.add(range, {
    type: "custom",
    formulae: [
      `OR(${firstCell}="",AND(ISNUMBER(${firstCell}),${firstCell}>=0,ROUND(${firstCell},2)=${firstCell}))`,
    ],
    allowBlank: true,
    showErrorMessage: true,
    errorTitle: "수량 확인",
    error: "0 이상의 수량을 소수점 둘째 자리까지 입력해 주세요.",
  });
}

function dateValidation(sheet, range) {
  sheet.dataValidations.add(range, {
    type: "date",
    operator: "greaterThanOrEqual",
    formulae: [new Date(2020, 0, 1)],
    allowBlank: true,
    showErrorMessage: true,
    errorTitle: "날짜 확인",
    error: "날짜는 yyyy-mm-dd 형식으로 입력해 주세요.",
  });
}

const lists = workbook.addWorksheet("선택목록");
lists.state = "hidden";
lists.getColumn(1).values = ["구분", "냉동", "생물"];
lists.getColumn(2).values = ["필수여부", "필수", "선택"];

const guide = workbook.addWorksheet("작성방법");
title(guide, "A1:F1", "과거 재고 간단 입력 양식");
guide.columns = [
  { key: "a", width: 16 },
  { key: "b", width: 76 },
  { key: "c", width: 16 },
  { key: "d", width: 16 },
  { key: "e", width: 16 },
  { key: "f", width: 16 },
];
guide.addRows([
  [],
  ["꼭 작성", "재고입력 시트만 작성해도 됩니다. 날짜·지점·품목·규격·구분·남은 수량·재고 단가가 핵심입니다."],
  ["선택 작성", "입고별잔량_선택 시트는 입고일별로 남은 수량을 알고 있을 때만 작성해 주세요."],
  ["날짜", "yyyy-mm-dd 형식으로 적어 주세요. 예: 2026-06-30"],
  ["숫자", "수량은 0 이상 소수점 둘째 자리까지, 단가는 0 이상의 정수로 적어 주세요. 쉼표는 써도 됩니다."],
  ["품목명", "품목명과 규격은 기존 장부에 적힌 그대로 적어 주세요. 앱에서 쓸 이름이 다르면 오른쪽 선택 칸에 적어 주세요."],
  ["단가", "정확한 입고별 단가를 모르면, 그날 재고를 평가할 대표 단가를 적어 주세요."],
  ["중복", "같은 날짜·지점·품목·규격은 한 번만 적어 주세요."],
]);
for (let rowNumber = 3; rowNumber <= 9; rowNumber += 1) {
  const row = guide.getRow(rowNumber);
  row.height = 30;
  row.getCell(1).font = { name: "맑은 고딕", bold: true };
  row.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: rowNumber === 3 ? color.required : color.optional },
  };
  row.getCell(2).font = { name: "맑은 고딕", size: 10 };
  row.getCell(2).alignment = { vertical: "middle", wrapText: true };
}
note(guide, 11, "F", "노란 칸은 꼭 작성, 초록 칸은 알면 작성입니다.");

const inventoryColumns = [
  { header: "날짜", key: "date", width: 14, required: true, numFmt: "yyyy-mm-dd" },
  { header: "지점명", key: "store", width: 18, required: true },
  { header: "품목명", key: "name", width: 24, required: true },
  { header: "규격", key: "spec", width: 16, required: true },
  { header: "구분", key: "category", width: 11, required: true },
  { header: "남은 수량", key: "qty", width: 14, required: true, align: "right", numFmt: "#,##0.00" },
  { header: "재고 단가", key: "unitPrice", width: 14, required: true, align: "right", numFmt: "#,##0" },
  { header: "재고 금액", key: "amount", width: 14, align: "right", numFmt: "#,##0" },
  { header: "앱 품목명\n다르면만", key: "appName", width: 22, optional: true },
  { header: "앱 규격\n다르면만", key: "appSpec", width: 16, optional: true },
  { header: "메모", key: "memo", width: 30, optional: true },
];

const inventory = workbook.addWorksheet("재고입력");
title(inventory, "A1:K1", "재고입력");
note(inventory, 2, "K", "이 시트만 작성해도 과거 재고 DB 입력이 가능합니다. 날짜별로 남은 재고 수량을 적어 주세요.");
setColumns(inventory, inventoryColumns);
inventory.getRow(3).values = inventoryColumns.map((col) => col.header);
header(inventory.getRow(3));
inventory.addRow([
  new Date(2026, 5, 30),
  "삼국유통",
  "냉)광어",
  "3kg",
  "냉동",
  12,
  12000,
  { formula: "IF(OR(F4=\"\",G4=\"\"),\"\",F4*G4)" },
  "광어",
  "3kg",
  "예시 행입니다. 실제 작성 시 지워도 됩니다.",
]);
styleRows(inventory, 4, 2004, inventoryColumns);
for (let rowNumber = 5; rowNumber <= 2004; rowNumber += 1) {
  inventory.getCell(`H${rowNumber}`).value = {
    formula: `IF(OR(F${rowNumber}="",G${rowNumber}=""),"",F${rowNumber}*G${rowNumber})`,
  };
}
dateValidation(inventory, "A4:A2004");
listValidation(inventory, "E4:E2004", ["'선택목록'!$A$2:$A$3"]);
twoDecimalQuantityValidation(inventory, "F4:F2004");
wholeNumberValidation(inventory, "G4:G2004");
inventory.views = [{ state: "frozen", ySplit: 3 }];
inventory.autoFilter = "A3:K3";

const lotColumns = [
  { header: "기준일", key: "date", width: 14, required: true, numFmt: "yyyy-mm-dd" },
  { header: "지점명", key: "store", width: 18, required: true },
  { header: "품목명", key: "name", width: 24, required: true },
  { header: "규격", key: "spec", width: 16, required: true },
  { header: "입고일", key: "inDate", width: 14, required: true, numFmt: "yyyy-mm-dd" },
  { header: "매입 단가", key: "unitPrice", width: 14, required: true, align: "right", numFmt: "#,##0" },
  { header: "남은 수량", key: "qty", width: 14, required: true, align: "right", numFmt: "#,##0.00" },
  { header: "남은 금액", key: "amount", width: 14, align: "right", numFmt: "#,##0" },
  { header: "메모", key: "memo", width: 30, optional: true },
];

const lots = workbook.addWorksheet("입고별잔량_선택");
title(lots, "A1:I1", "입고별 잔량 - 선택");
note(lots, 2, "I", "입고일별로 남은 재고를 알고 있을 때만 작성해 주세요. 모르면 비워도 됩니다.");
setColumns(lots, lotColumns);
lots.getRow(3).values = lotColumns.map((col) => col.header);
header(lots.getRow(3));
lots.addRow([
  new Date(2026, 5, 30),
  "삼국유통",
  "냉)광어",
  "3kg",
  new Date(2026, 5, 25),
  12000,
  7,
  { formula: "IF(OR(F4=\"\",G4=\"\"),\"\",F4*G4)" },
  "예시 행입니다.",
]);
styleRows(lots, 4, 1004, lotColumns);
for (let rowNumber = 5; rowNumber <= 1004; rowNumber += 1) {
  lots.getCell(`H${rowNumber}`).value = {
    formula: `IF(OR(F${rowNumber}="",G${rowNumber}=""),"",F${rowNumber}*G${rowNumber})`,
  };
}
dateValidation(lots, "A4:A1004");
dateValidation(lots, "E4:E1004");
wholeNumberValidation(lots, "F4:F1004");
twoDecimalQuantityValidation(lots, "G4:G1004");
lots.views = [{ state: "frozen", ySplit: 3 }];
lots.autoFilter = "A3:I3";

for (const sheet of workbook.worksheets) {
  sheet.properties.defaultRowHeight = 20;
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
}

await fs.mkdir(__dirname, { recursive: true });
await workbook.xlsx.writeFile(outputPath);
console.log(outputPath);
