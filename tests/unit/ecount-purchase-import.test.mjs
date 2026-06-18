import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { deflateRawSync } from "node:zlib";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function columnName(index) {
  let value = "";
  let current = index;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }

  return value;
}

function sheetXml(rows) {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;

          if (value === null || value === undefined) {
            return `<c r="${ref}"></c>`;
          }

          if (typeof value === "number") {
            return `<c r="${ref}"><v>${value}</v></c>`;
          }

          return `<c r="${ref}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function sharedStringSheetXml(rows, sharedStringIndexes) {
  const body = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;

          if (value === null || value === undefined) {
            return `<c r="${ref}"></c>`;
          }

          if (typeof value === "number") {
            return `<c r="${ref}"><v>${value}</v></c>`;
          }

          return `<c r="${ref}" t="s"><v>${sharedStringIndexes.get(String(value))}</v></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function sharedStringsXml(strings) {
  const items = strings
    .map((value) => `<si><t>${xml(value)}</t></si>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${items}</sst>`;
}

function dosDateTime() {
  return { time: 0, date: 0 };
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, text] of entries) {
    const nameBuffer = Buffer.from(name, "utf8");
    const raw = Buffer.from(text, "utf8");
    const compressed = deflateRawSync(raw);
    const { time, date } = dosDateTime();
    const local = Buffer.alloc(30);

    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + compressed.length;
  }

  const centralStart = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function createWorkbook(rows) {
  return createZip([
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="판매현황" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    ["xl/worksheets/sheet1.xml", sheetXml(rows)],
  ]);
}

function createSharedStringWorkbook(rows) {
  const strings = [];
  const indexes = new Map();

  for (const row of rows) {
    for (const value of row) {
      if (typeof value !== "string" || indexes.has(value)) {
        continue;
      }

      indexes.set(value, strings.length);
      strings.push(value);
    }
  }

  return createZip([
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="판매현황" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    ["xl/sharedStrings.xml", sharedStringsXml(strings)],
    ["xl/worksheets/sheet1.xml", sharedStringSheetXml(rows, indexes)],
  ]);
}

async function importParser() {
  const modulePath = path.join(
    root,
    "src",
    "features",
    "ledger",
    "ecount-purchase-import.ts",
  );

  return import(pathToFileURL(modulePath).href);
}

test("parses fixed ECount purchase workbook rows for the selected store and date", async () => {
  const { parseEcountPurchaseWorkbook } = await importParser();
  const workbook = createWorkbook([
    ["회사명 : 염홍욱 / 2026/06/17  ~ 2026/06/17 "],
    [
      "일자-No.",
      "거래처명",
      "품목명(규격)",
      "수량",
      "단가",
      "공급가액",
      "부가세",
      "합계",
    ],
    [
      "2026/06/17 -1",
      "진수산(수산물)",
      "고등어 [28미]",
      4,
      34000,
      136000,
      null,
      136000,
    ],
    [
      "2026/06/17 -1",
      "진수산(수산물)",
      "냉)삼치 [15미]",
      1,
      78000,
      78000,
      null,
      78000,
    ],
    ["2026/06/17 -1", "진수산(수산물)", "바지락", 2, 35000, 70000, null, 70000],
    ["진수산(수산물) 계", null, null, 7, 147000, 284000, null, 284000],
    [
      "2026/06/17 -2",
      "다른수산",
      "고등어 [28미]",
      3,
      34000,
      102000,
      null,
      102000,
    ],
    ["총합계", null, null, 10, 181000, 386000, null, 386000],
  ]);

  const result = parseEcountPurchaseWorkbook(workbook, {
    storeName: "진수산",
    closingDate: "2026-06-17",
  });

  assert.equal(result.sheetName, "판매현황");
  assert.equal(result.matchedRowCount, 3);
  assert.deepEqual(
    result.purchases.map((line) => ({
      sourceType: line.sourceType,
      productName: line.productName,
      productCategory: line.productCategory,
      productSpec: line.productSpec,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      referenceInfo: line.referenceInfo,
    })),
    [
      {
        sourceType: "ECOUNT_UPLOAD",
        productName: "고등어",
        productCategory: "생물",
        productSpec: "28미",
        unitPrice: "34000",
        quantity: "4",
        referenceInfo:
          "이카운트 판매현황 3행 · 일자-No. 2026/06/17 -1 · 거래처 진수산(수산물)",
      },
      {
        sourceType: "ECOUNT_UPLOAD",
        productName: "냉)삼치",
        productCategory: "냉동",
        productSpec: "15미",
        unitPrice: "78000",
        quantity: "1",
        referenceInfo:
          "이카운트 판매현황 4행 · 일자-No. 2026/06/17 -1 · 거래처 진수산(수산물)",
      },
      {
        sourceType: "ECOUNT_UPLOAD",
        productName: "바지락",
        productCategory: "생물",
        productSpec: "규격 없음",
        unitPrice: "35000",
        quantity: "2",
        referenceInfo:
          "이카운트 판매현황 5행 · 일자-No. 2026/06/17 -1 · 거래처 진수산(수산물)",
      },
    ],
  );
});

test("parses shared-string ECount rows when VAT makes total differ from supply amount", async () => {
  const { parseEcountPurchaseWorkbook } = await importParser();
  const workbook = createSharedStringWorkbook([
    ["회사명 : 염홍욱 / 2026/06/17  ~ 2026/06/17 "],
    [
      "일자-No.",
      "거래처명",
      "품목명(규격)",
      "수량",
      "단가",
      "공급가액",
      "부가세",
      "합계",
    ],
    ["2026/06/17 -1", "진수산(수산물)", "새우 [1kg]", 2, 1000, 2000, 200, 2200],
  ]);

  const result = parseEcountPurchaseWorkbook(workbook, {
    storeName: "진수산",
    closingDate: "2026-06-17",
  });

  assert.equal(result.matchedRowCount, 1);
  assert.equal(result.purchases[0].productName, "새우");
  assert.equal(result.purchases[0].productSpec, "1kg");
  assert.equal(result.purchases[0].unitPrice, "1000");
  assert.equal(result.purchases[0].quantity, "2");
});

test("does not merge stores that only share the same base name", async () => {
  const { parseEcountPurchaseWorkbook } = await importParser();
  const workbook = createWorkbook([
    ["회사명 : 염홍욱 / 2026/06/17  ~ 2026/06/17 "],
    [
      "일자-No.",
      "거래처명",
      "품목명(규격)",
      "수량",
      "단가",
      "공급가액",
      "부가세",
      "합계",
    ],
    [
      "2026/06/17 -1",
      "진수산(강남)",
      "고등어 [28미]",
      3,
      34000,
      102000,
      null,
      102000,
    ],
    ["2026/06/17 -1", "진수산(수산물)", "바지락", 2, 35000, 70000, null, 70000],
  ]);

  const result = parseEcountPurchaseWorkbook(workbook, {
    storeName: "진수산(수산물)",
    closingDate: "2026-06-17",
  });

  assert.equal(result.matchedRowCount, 1);
  assert.equal(result.purchases[0].productName, "바지락");
});

test("rejects ECount rows when amount does not match quantity times unit price", async () => {
  const { parseEcountPurchaseWorkbook, EcountPurchaseImportError } =
    await importParser();
  const workbook = createWorkbook([
    ["회사명 : 염홍욱 / 2026/06/17  ~ 2026/06/17 "],
    [
      "일자-No.",
      "거래처명",
      "품목명(규격)",
      "수량",
      "단가",
      "공급가액",
      "부가세",
      "합계",
    ],
    [
      "2026/06/17 -1",
      "진수산",
      "고등어 [28미]",
      4,
      34000,
      135000,
      null,
      135000,
    ],
  ]);

  assert.throws(
    () =>
      parseEcountPurchaseWorkbook(workbook, {
        storeName: "진수산",
        closingDate: "2026-06-17",
      }),
    (error) =>
      error instanceof EcountPurchaseImportError &&
      error.message === "엑셀 매입금액을 확인해 주세요." &&
      error.fieldErrors["file"]?.[0] ===
        "3행 고등어 [28미]: 수량 x 단가와 합계가 일치하지 않습니다.",
  );
});

test("rejects ECount workbooks without rows for the selected ledger", async () => {
  const { parseEcountPurchaseWorkbook, EcountPurchaseImportError } =
    await importParser();
  const workbook = createWorkbook([
    ["회사명 : 염홍욱 / 2026/06/17  ~ 2026/06/17 "],
    [
      "일자-No.",
      "거래처명",
      "품목명(규격)",
      "수량",
      "단가",
      "공급가액",
      "부가세",
      "합계",
    ],
    [
      "2026/06/17 -1",
      "다른수산",
      "고등어 [28미]",
      4,
      34000,
      136000,
      null,
      136000,
    ],
  ]);

  assert.throws(
    () =>
      parseEcountPurchaseWorkbook(workbook, {
        storeName: "진수산",
        closingDate: "2026-06-17",
      }),
    (error) =>
      error instanceof EcountPurchaseImportError &&
      error.message === "선택한 장부와 일치하는 이카운트 행이 없습니다.",
  );
});
