import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(__dirname, "과거_재고_입력_양식.xlsx");

const workbook = new ExcelJS.Workbook();
workbook.creator = "Codex";
workbook.created = new Date();
workbook.modified = new Date();
workbook.calcProperties.fullCalcOnLoad = true;

const colors = {
  title: "1F4E78",
  titleText: "FFFFFF",
  header: "D9EAF7",
  required: "FFF2CC",
  optional: "E2F0D9",
  note: "F4F6F8",
  border: "D9E2EC",
  warning: "FCE4D6",
  darkText: "1F2933",
};

function applyTitle(sheet, cell, text, endCell) {
  sheet.mergeCells(`${cell}:${endCell}`);
  const range = sheet.getCell(cell);
  range.value = text;
  range.font = { bold: true, size: 16, color: { argb: colors.titleText } };
  range.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: colors.title },
  };
  range.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(Number(cell.replace(/[^0-9]/g, ""))).height = 28;
}

function styleHeader(row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: colors.darkText } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: colors.header },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: colors.border } },
      bottom: { style: "thin", color: { argb: colors.border } },
    };
  });
}

function styleInputArea(sheet, startRow, endRow, columns) {
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 22;
    for (const column of columns) {
      const cell = row.getCell(column.key);
      cell.alignment = {
        vertical: "middle",
        horizontal: column.align ?? "left",
        wrapText: false,
      };
      cell.border = {
        bottom: { style: "hair", color: { argb: colors.border } },
      };
      if (column.required) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: colors.required },
        };
      } else if (column.optional) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: colors.optional },
        };
      }
      if (column.numFmt) {
        cell.numFmt = column.numFmt;
      }
    }
  }
}

function setColumnWidths(sheet, columns) {
  sheet.columns = columns.map((column) => ({
    key: column.key,
    width: column.width,
    style: column.numFmt ? { numFmt: column.numFmt } : undefined,
  }));
}

function addNote(sheet, rowNumber, text, widthEnd = "L") {
  sheet.mergeCells(`A${rowNumber}:${widthEnd}${rowNumber}`);
  const cell = sheet.getCell(`A${rowNumber}`);
  cell.value = text;
  cell.font = { color: { argb: colors.darkText } };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: colors.note },
  };
  cell.alignment = { wrapText: true, vertical: "middle" };
  sheet.getRow(rowNumber).height = 34;
}

function addListValidation(sheet, range, formulae) {
  sheet.dataValidations.add(range, {
    type: "list",
    allowBlank: true,
    formulae,
    showErrorMessage: true,
    errorTitle: "입력 확인",
    error: "목록에서 선택해 주세요.",
  });
}

function addWholeNumberValidation(sheet, range) {
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

function addOneDecimalQuantityValidation(sheet, range) {
  const firstCell = range.split(":")[0];
  sheet.dataValidations.add(range, {
    type: "custom",
    formulae: [
      `OR(${firstCell}="",AND(ISNUMBER(${firstCell}),${firstCell}>=0,ROUND(${firstCell},1)=${firstCell}))`,
    ],
    allowBlank: true,
    showErrorMessage: true,
    errorTitle: "수량 확인",
    error: "0 이상의 수량을 소수점 첫째 자리까지 입력해 주세요.",
  });
}

function addDateValidation(sheet, range) {
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

function addBasicSheetSetup(sheet) {
  sheet.views = [{ state: "frozen", ySplit: 3 }];
  sheet.properties.defaultRowHeight = 20;
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
}

const listSheet = workbook.addWorksheet("선택목록");
applyTitle(listSheet, "A1", "선택목록", "H1");
listSheet.getRow(3).values = [
  "구분",
  "예/아니오",
  "손실 종류",
  "자료 상태",
  "작성 예시",
  "",
  "",
  "",
];
styleHeader(listSheet.getRow(3));
listSheet.getColumn(1).values = ["구분", null, "냉동", "생물"];
listSheet.getColumn(2).values = ["예/아니오", null, "예", "아니오"];
listSheet.getColumn(3).values = [
  "손실 종류",
  null,
  "폐기",
  "감모",
  "반품",
  "직원식",
  "기타",
];
listSheet.getColumn(4).values = [
  "자료 상태",
  null,
  "확정",
  "확인 필요",
  "모름",
];
listSheet.getColumn(5).values = [
  "작성 예시",
  null,
  "수량과 금액은 쉼표 없이 숫자만 입력",
  "품목명이 다르면 품목맞추기 시트에도 작성",
  "같은 품목에 단가가 여러 개면 입고별_남은재고 시트에도 작성",
];
listSheet.columns.forEach((col) => {
  col.width = 22;
});
listSheet.getRow(3).height = 24;
listSheet.getRange;
listSheet.views = [{ state: "frozen", ySplit: 3 }];

const guide = workbook.addWorksheet("작성방법");
applyTitle(guide, "A1", "과거 재고 입력 양식 - 작성방법", "H1");
guide.columns = [
  { key: "a", width: 18 },
  { key: "b", width: 80 },
  { key: "c", width: 18 },
  { key: "d", width: 18 },
  { key: "e", width: 18 },
  { key: "f", width: 18 },
  { key: "g", width: 18 },
  { key: "h", width: 18 },
];
guide.addRows([
  [],
  ["먼저 작성", "날짜별_재고 시트는 꼭 작성해 주세요. 하루·지점·품목마다 한 줄입니다."],
  ["있으면 작성", "입고별_남은재고 시트는 장기재고와 선입선출 금액을 정확히 맞출 때 필요합니다."],
  ["있으면 작성", "입고_매입내역, 손실_폐기내역은 과거 흐름까지 복원할 때 필요합니다."],
  ["품목명이 다를 때", "기존 장부 품목명과 시스템 품목명이 다르면 품목맞추기 시트에 적어 주세요."],
  ["숫자", "수량은 0 이상 소수점 첫째 자리까지, 단가·금액은 0 이상의 정수로 적어 주세요. 예: 12.5, 12000"],
  ["날짜", "날짜는 yyyy-mm-dd 형식으로 적어 주세요. 예: 2026-06-30"],
  ["구분", "구분은 냉동 또는 생물 중 하나로 골라 주세요."],
  ["차이 이유", "날짜별_재고의 수량 차이가 0이 아니면 차이 이유를 적어 주세요."],
  ["중복 주의", "같은 날짜·지점·앱 품목명·앱 규격은 날짜별_재고에 한 번만 적어 주세요."],
]);
for (let row = 3; row <= 11; row += 1) {
  guide.getCell(`A${row}`).font = { bold: true };
  guide.getCell(`A${row}`).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: row === 3 ? colors.required : colors.optional },
  };
  guide.getCell(`B${row}`).alignment = { wrapText: true, vertical: "middle" };
  guide.getRow(row).height = 28;
}
addNote(
  guide,
  13,
  "작성 순서: 1) 품목맞추기 작성  2) 날짜별_재고 작성  3) 있으면 입고별_남은재고, 입고_매입내역, 손실_폐기내역 작성",
  "H",
);
guide.getRow(15).values = [
  "시트 이름",
  "언제 쓰나요?",
  "꼭 필요한가요?",
  "설명",
];
styleHeader(guide.getRow(15));
guide.addRows([
  ["품목맞추기", "품목명·규격이 다를 때", "필요시", "기존 장부 이름과 앱 이름을 맞추는 표입니다."],
  ["날짜별_재고", "모든 과거 전일/마감 재고 입력", "필수", "각 날짜의 전날 재고, 들어온 수량, 버린 수량, 끝 재고를 적습니다."],
  ["입고별_남은재고", "입고일·단가별 남은 재고를 알 때", "권장", "장기재고와 선입선출 금액을 정확히 하려면 필요합니다."],
  ["입고_매입내역", "과거 매입 내역이 있을 때", "권장", "일자별 들어온 수량과 단가입니다."],
  ["손실_폐기내역", "과거 폐기·감모 등이 있을 때", "권장", "일자별 버린 수량과 이유입니다."],
]);
for (let row = 16; row <= 20; row += 1) {
  guide.getRow(row).height = 26;
  guide.getCell(`A${row}`).font = { bold: true };
  guide.getCell(`D${row}`).alignment = { wrapText: true };
}
guide.views = [{ state: "frozen", ySplit: 1 }];

const productColumns = [
  { header: "기존 품목명", key: "oldName", width: 24, required: true },
  { header: "기존 규격", key: "oldSpec", width: 18, required: true },
  { header: "앱 품목명", key: "appName", width: 24, required: true },
  { header: "구분", key: "category", width: 12, required: true },
  { header: "앱 규격", key: "appSpec", width: 18, required: true },
  { header: "새 품목인가요?", key: "isNew", width: 15, optional: true },
  { header: "참고 단가", key: "price", width: 14, optional: true, align: "right", numFmt: "#,##0" },
  { header: "메모", key: "memo", width: 30, optional: true },
];
const productSheet = workbook.addWorksheet("품목맞추기");
applyTitle(productSheet, "A1", "품목맞추기", "H1");
addNote(productSheet, 2, "기존 전자장부의 품목명·규격과 앱에서 쓸 품목명·규격을 맞춰 주세요.", "H");
setColumnWidths(productSheet, productColumns);
productSheet.getRow(3).values = productColumns.map((column) => column.header);
styleHeader(productSheet.getRow(3));
productSheet.addRow([
  "냉)광어",
  "3kg",
  "광어",
  "냉동",
  "3kg",
  "아니오",
  12000,
  "예시 행입니다. 실제 자료 작성 시 지워도 됩니다.",
]);
styleInputArea(productSheet, 4, 504, productColumns);
addListValidation(productSheet, "D4:D504", ["'선택목록'!$A$3:$A$4"]);
addListValidation(productSheet, "F4:F504", ["'선택목록'!$B$3:$B$4"]);
addWholeNumberValidation(productSheet, "G4:G504");
productSheet.views = [{ state: "frozen", ySplit: 3 }];
productSheet.autoFilter = "A3:H3";

const inventoryColumns = [
  { header: "날짜", key: "date", width: 14, required: true, numFmt: "yyyy-mm-dd" },
  { header: "지점명", key: "store", width: 18, required: true },
  { header: "기존 품목명", key: "oldName", width: 22, required: true },
  { header: "기존 규격", key: "oldSpec", width: 16, required: true },
  { header: "앱 품목명", key: "appName", width: 22, required: true },
  { header: "구분", key: "category", width: 11, required: true },
  { header: "앱 규격", key: "appSpec", width: 16, required: true },
  { header: "전날 재고 수량", key: "prevQty", width: 16, required: true, align: "right", numFmt: "#,##0.0" },
  { header: "그날 들어온 수량", key: "inQty", width: 16, optional: true, align: "right", numFmt: "#,##0.0" },
  { header: "그날 버린 수량", key: "lossQty", width: 16, optional: true, align: "right", numFmt: "#,##0.0" },
  { header: "그날 끝 재고 수량", key: "endQty", width: 18, required: true, align: "right", numFmt: "#,##0.0" },
  { header: "재고 단가", key: "unitPrice", width: 14, required: true, align: "right", numFmt: "#,##0" },
  { header: "재고 금액", key: "amount", width: 14, align: "right", numFmt: "#,##0" },
  { header: "수량 차이", key: "diff", width: 13, align: "right", numFmt: "#,##0.0" },
  { header: "차이 이유", key: "reason", width: 28, optional: true },
  { header: "메모", key: "memo", width: 30, optional: true },
];
const invSheet = workbook.addWorksheet("날짜별_재고");
applyTitle(invSheet, "A1", "날짜별 재고", "P1");
addNote(invSheet, 2, "필수 시트입니다. 하루·지점·품목마다 한 줄로 적어 주세요. 수량 차이가 0이 아니면 차이 이유를 적어 주세요.", "P");
setColumnWidths(invSheet, inventoryColumns);
invSheet.getRow(3).values = inventoryColumns.map((column) => column.header);
styleHeader(invSheet.getRow(3));
invSheet.addRow([
  new Date(2026, 5, 30),
  "삼국유통",
  "냉)광어",
  "3kg",
  "광어",
  "냉동",
  "3kg",
  10,
  5,
  1,
  12,
  12000,
  { formula: "IF(OR(K4=\"\",L4=\"\"),\"\",K4*L4)" },
  { formula: "IF(OR(H4=\"\",K4=\"\"),\"\",K4-(H4+IF(I4=\"\",0,I4)-IF(J4=\"\",0,J4)))" },
  "실사 차이",
  "예시 행입니다. 실제 자료 작성 시 지워도 됩니다.",
]);
styleInputArea(invSheet, 4, 2004, inventoryColumns);
for (let row = 5; row <= 2004; row += 1) {
  invSheet.getCell(`M${row}`).value = {
    formula: `IF(OR(K${row}="",L${row}=""),"",K${row}*L${row})`,
  };
  invSheet.getCell(`N${row}`).value = {
    formula: `IF(OR(H${row}="",K${row}=""),"",K${row}-(H${row}+IF(I${row}="",0,I${row})-IF(J${row}="",0,J${row})))`,
  };
}
addDateValidation(invSheet, "A4:A2004");
addListValidation(invSheet, "F4:F2004", ["'선택목록'!$A$3:$A$4"]);
addOneDecimalQuantityValidation(invSheet, "H4:K2004");
addWholeNumberValidation(invSheet, "L4:L2004");
invSheet.views = [{ state: "frozen", ySplit: 3 }];
invSheet.autoFilter = "A3:P3";

const lotColumns = [
  { header: "기준일", key: "baseDate", width: 14, required: true, numFmt: "yyyy-mm-dd" },
  { header: "지점명", key: "store", width: 18, required: true },
  { header: "기존 품목명", key: "oldName", width: 22, required: true },
  { header: "기존 규격", key: "oldSpec", width: 16, required: true },
  { header: "앱 품목명", key: "appName", width: 22, required: true },
  { header: "구분", key: "category", width: 11, required: true },
  { header: "앱 규격", key: "appSpec", width: 16, required: true },
  { header: "처음 들어온 날", key: "inDate", width: 16, required: true, numFmt: "yyyy-mm-dd" },
  { header: "매입 단가", key: "unitPrice", width: 14, required: true, align: "right", numFmt: "#,##0" },
  { header: "남은 수량", key: "leftQty", width: 14, required: true, align: "right", numFmt: "#,##0.0" },
  { header: "처음 들어온 수량", key: "firstQty", width: 16, optional: true, align: "right", numFmt: "#,##0.0" },
  { header: "남은 금액", key: "leftAmount", width: 14, align: "right", numFmt: "#,##0" },
  { header: "전표/매입처", key: "source", width: 20, optional: true },
  { header: "메모", key: "memo", width: 30, optional: true },
];
const lotSheet = workbook.addWorksheet("입고별_남은재고");
applyTitle(lotSheet, "A1", "입고별 남은 재고", "N1");
addNote(lotSheet, 2, "같은 품목 안에 입고일·단가가 다른 재고가 섞여 있으면 행을 나눠 적어 주세요. 장기재고와 선입선출 금액을 정확히 맞추는 데 필요합니다.", "N");
setColumnWidths(lotSheet, lotColumns);
lotSheet.getRow(3).values = lotColumns.map((column) => column.header);
styleHeader(lotSheet.getRow(3));
lotSheet.addRow([
  new Date(2026, 5, 30),
  "삼국유통",
  "냉)광어",
  "3kg",
  "광어",
  "냉동",
  "3kg",
  new Date(2026, 5, 25),
  12000,
  7,
  10,
  { formula: "IF(OR(I4=\"\",J4=\"\"),\"\",I4*J4)" },
  "전표번호",
  "예시 행입니다.",
]);
styleInputArea(lotSheet, 4, 1004, lotColumns);
for (let row = 5; row <= 1004; row += 1) {
  lotSheet.getCell(`L${row}`).value = {
    formula: `IF(OR(I${row}="",J${row}=""),"",I${row}*J${row})`,
  };
}
addDateValidation(lotSheet, "A4:A1004");
addDateValidation(lotSheet, "H4:H1004");
addListValidation(lotSheet, "F4:F1004", ["'선택목록'!$A$3:$A$4"]);
addWholeNumberValidation(lotSheet, "I4:I1004");
addOneDecimalQuantityValidation(lotSheet, "J4:K1004");
lotSheet.views = [{ state: "frozen", ySplit: 3 }];
lotSheet.autoFilter = "A3:N3";

const purchaseColumns = [
  { header: "날짜", key: "date", width: 14, required: true, numFmt: "yyyy-mm-dd" },
  { header: "지점명", key: "store", width: 18, required: true },
  { header: "기존 품목명", key: "oldName", width: 22, required: true },
  { header: "기존 규격", key: "oldSpec", width: 16, required: true },
  { header: "앱 품목명", key: "appName", width: 22, required: true },
  { header: "구분", key: "category", width: 11, required: true },
  { header: "앱 규격", key: "appSpec", width: 16, required: true },
  { header: "들어온 수량", key: "qty", width: 14, required: true, align: "right", numFmt: "#,##0.0" },
  { header: "매입 단가", key: "unitPrice", width: 14, required: true, align: "right", numFmt: "#,##0" },
  { header: "공급 금액", key: "amount", width: 14, align: "right", numFmt: "#,##0" },
  { header: "전표/매입처", key: "source", width: 20, optional: true },
  { header: "메모", key: "memo", width: 30, optional: true },
];
const purchaseSheet = workbook.addWorksheet("입고_매입내역");
applyTitle(purchaseSheet, "A1", "입고 / 매입 내역", "L1");
addNote(purchaseSheet, 2, "과거 매입 내역이 있으면 적어 주세요. 날짜별_재고의 '그날 들어온 수량'과 맞는지 확인하는 데 씁니다.", "L");
setColumnWidths(purchaseSheet, purchaseColumns);
purchaseSheet.getRow(3).values = purchaseColumns.map((column) => column.header);
styleHeader(purchaseSheet.getRow(3));
purchaseSheet.addRow([
  new Date(2026, 5, 30),
  "삼국유통",
  "냉)광어",
  "3kg",
  "광어",
  "냉동",
  "3kg",
  5,
  12000,
  { formula: "IF(OR(H4=\"\",I4=\"\"),\"\",H4*I4)" },
  "전표번호",
  "예시 행입니다.",
]);
styleInputArea(purchaseSheet, 4, 1004, purchaseColumns);
for (let row = 5; row <= 1004; row += 1) {
  purchaseSheet.getCell(`J${row}`).value = {
    formula: `IF(OR(H${row}="",I${row}=""),"",H${row}*I${row})`,
  };
}
addDateValidation(purchaseSheet, "A4:A1004");
addListValidation(purchaseSheet, "F4:F1004", ["'선택목록'!$A$3:$A$4"]);
addOneDecimalQuantityValidation(purchaseSheet, "H4:H1004");
addWholeNumberValidation(purchaseSheet, "I4:I1004");
purchaseSheet.views = [{ state: "frozen", ySplit: 3 }];
purchaseSheet.autoFilter = "A3:L3";

const lossColumns = [
  { header: "날짜", key: "date", width: 14, required: true, numFmt: "yyyy-mm-dd" },
  { header: "지점명", key: "store", width: 18, required: true },
  { header: "기존 품목명", key: "oldName", width: 22, required: true },
  { header: "기존 규격", key: "oldSpec", width: 16, required: true },
  { header: "앱 품목명", key: "appName", width: 22, required: true },
  { header: "구분", key: "category", width: 11, required: true },
  { header: "앱 규격", key: "appSpec", width: 16, required: true },
  { header: "손실 종류", key: "lossType", width: 14, required: true },
  { header: "버린 수량", key: "qty", width: 14, required: true, align: "right", numFmt: "#,##0.0" },
  { header: "회수 금액", key: "recover", width: 14, optional: true, align: "right", numFmt: "#,##0" },
  { header: "사유", key: "reason", width: 28, required: true },
  { header: "메모", key: "memo", width: 30, optional: true },
];
const lossSheet = workbook.addWorksheet("손실_폐기내역");
applyTitle(lossSheet, "A1", "손실 / 폐기 내역", "L1");
addNote(lossSheet, 2, "폐기, 감모, 반품 등 재고가 줄어든 내역이 있으면 적어 주세요. 사유는 꼭 적어 주세요.", "L");
setColumnWidths(lossSheet, lossColumns);
lossSheet.getRow(3).values = lossColumns.map((column) => column.header);
styleHeader(lossSheet.getRow(3));
lossSheet.addRow([
  new Date(2026, 5, 30),
  "삼국유통",
  "냉)광어",
  "3kg",
  "광어",
  "냉동",
  "3kg",
  "폐기",
  1,
  0,
  "상태 불량",
  "예시 행입니다.",
]);
styleInputArea(lossSheet, 4, 1004, lossColumns);
addDateValidation(lossSheet, "A4:A1004");
addListValidation(lossSheet, "F4:F1004", ["'선택목록'!$A$3:$A$4"]);
addListValidation(lossSheet, "H4:H1004", ["'선택목록'!$C$3:$C$7"]);
addOneDecimalQuantityValidation(lossSheet, "I4:I1004");
addWholeNumberValidation(lossSheet, "J4:J1004");
lossSheet.views = [{ state: "frozen", ySplit: 3 }];
lossSheet.autoFilter = "A3:L3";

for (const sheet of workbook.worksheets) {
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.font = { name: "맑은 고딕", size: cell.font?.size ?? 10, ...cell.font };
    });
  });
}

await fs.mkdir(__dirname, { recursive: true });
await workbook.xlsx.writeFile(outputPath);
console.log(outputPath);
