import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
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
            return `<c r="${ref}"/>`;
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

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, text] of entries) {
    const nameBuffer = Buffer.from(name, "utf8");
    const raw = Buffer.from(text, "utf8");
    const compressed = deflateRawSync(raw);
    const local = Buffer.alloc(30);

    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
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
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
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

function createWorkbook(sheets) {
  return createZip([
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets>${sheets
        .map(
          (sheet, index) =>
            `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
        )
        .join("")}</sheets></workbook>`,
    ],
    ...sheets.map((sheet, index) => [
      `xl/worksheets/sheet${index + 1}.xml`,
      sheetXml(sheet.rows),
    ]),
  ]);
}

function createInventoryWorkbook(rows) {
  return createWorkbook([
    { name: "선택목록", rows: [["구분", "필수여부"]] },
    { name: "작성방법", rows: [["과거 재고 간단 입력 양식"]] },
    {
      name: "재고입력",
      rows: [
        ["메모", "메모", "메모"],
        ["이 시트만 작성해도 과거 재고 DB 입력이 가능합니다."],
        [
          "날짜",
          "지점명",
          "품목명",
          "규격",
          "구분",
          "남은 수량",
          "재고 단가",
          "재고 금액",
          "앱 품목명\n다르면만",
          "앱 규격\n다르면만",
          "메모",
        ],
        ...rows,
      ],
    },
  ]);
}

async function importInventoryOpeningImport() {
  const modulePath = path.join(
    root,
    "src",
    "features",
    "inventory",
    "opening-import.ts",
  );

  return import(pathToFileURL(modulePath).href);
}

test("getNextInventoryLedgerDate returns the exact next day", async () => {
  const { getNextInventoryLedgerDate } = await importInventoryOpeningImport();

  assert.equal(getNextInventoryLedgerDate("2026-07-10"), "2026-07-11");
  assert.equal(getNextInventoryLedgerDate("2026-07-31"), "2026-08-01");
  assert.equal(getNextInventoryLedgerDate("2026-12-31"), "2027-01-01");
  assert.equal(getNextInventoryLedgerDate("9999-12-30"), "9999-12-31");
});

test("getNextInventoryLedgerDate rejects non-canonical, nonexistent, and overflowing dates", async () => {
  const { getNextInventoryLedgerDate } = await importInventoryOpeningImport();

  for (const invalidDate of [
    "2026-02-30",
    "2026-7-10",
    "2026-07-1",
    "2026-07-10T00:00:00Z",
    " 2026-07-10",
    "0000-01-01",
    "9999-12-31",
  ]) {
    assert.throws(
      () => getNextInventoryLedgerDate(invalidDate),
      /엑셀 날짜 값을 확인해 주세요/,
      invalidDate,
    );
  }
});

test("parseInventoryOpeningWorkbook reads the fixed 재고입력 sheet and derives opening months", async () => {
  const { parseInventoryOpeningWorkbook } =
    await importInventoryOpeningImport();

  const workbook = createInventoryWorkbook([
    [
      46203,
      "삼국유통",
      "냉)포크오징어",
      "MA",
      "냉동",
      2.28,
      205000,
      467399.99999999994,
      "",
      "",
      "",
    ],
    [
      "2026-06-30",
      "삼국유통",
      "원문광어",
      "",
      "생물",
      "0.06",
      "29,500",
      "1,770",
      "앱광어",
      "3kg",
      "앱 매핑",
    ],
    ["", "삼국유통", "", "", "", "", "", "", "", "", ""],
  ]);

  const result = parseInventoryOpeningWorkbook(workbook);

  assert.equal(result.sheetName, "재고입력");
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.yearMonths, ["2026-07"]);
  assert.deepEqual(result.rows[0], {
    rowNumber: 4,
    inventoryDate: "2026-06-30",
    yearMonth: "2026-07",
    storeName: "삼국유통",
    rawProductName: "냉)포크오징어",
    rawProductSpec: "MA",
    productName: "냉)포크오징어",
    productCategory: "냉동",
    productSpec: "MA",
    quantity: 2.28,
    unitPrice: 205000,
    inventoryAmount: 467400,
    memo: "",
  });
  assert.equal(result.rows[1].productName, "앱광어");
  assert.equal(result.rows[1].productSpec, "3kg");
  assert.equal(result.totalQuantity, 2.34);
  assert.equal(result.totalInventoryAmount, 469170);
});

test("parseInventoryOpeningWorkbook rejects quantities past two decimals", async () => {
  const { parseInventoryOpeningWorkbook, InventoryOpeningImportError } =
    await importInventoryOpeningImport();

  const workbook = createInventoryWorkbook([
    [
      "2026-06-30",
      "삼국유통",
      "냉)포크오징어",
      "MA",
      "냉동",
      2.285,
      205000,
      "",
      "",
      "",
      "",
    ],
  ]);

  assert.throws(
    () => parseInventoryOpeningWorkbook(workbook),
    (error) =>
      error instanceof InventoryOpeningImportError &&
      error.fieldErrors.file?.[0] === "4행 남은 수량 값을 확인해 주세요.",
  );
});

test("inventory opening upload action and ecount upload menu are wired", () => {
  const actionSource = readFileSync(
    path.join(
      root,
      "src",
      "features",
      "inventory",
      "opening-import-actions.ts",
    ),
    "utf8",
  );
  const clientSource = readFileSync(
    path.join(
      root,
      "src",
      "features",
      "ledger",
      "components",
      "ecount-supply-upload-client.tsx",
    ),
    "utf8",
  );

  assert.match(
    actionSource,
    /export async function uploadInventoryOpeningSnapshots/,
  );
  assert.match(actionSource, /requireEcountUploadCommitAccess/);
  assert.match(actionSource, /inventoryOpeningSnapshot\.upsert/);
  assert.match(actionSource, /parseInventoryOpeningWorkbook/);
  assert.match(actionSource, /productCreatedCount/);
  assert.match(actionSource, /product\.create/);
  assert.match(actionSource, /action:\s*"product\.created"/);
  assert.match(actionSource, /재고 스냅샷 업로드 미등록 품목 자동 생성/);
  assert.match(actionSource, /defaultUnitPrice:\s*null/);
  assert.match(
    actionSource,
    /ledgerInventoryItems:\s*\{\s*some:\s*\{\s*\}\s*\}/s,
  );
  assert.match(actionSource, /기존 재고 장부를 먼저 확인해 주세요/);
  assert.match(clientSource, /재고 파일 업로드/);
  assert.match(clientSource, /uploadInventoryOpeningSnapshots/);
  assert.doesNotMatch(clientSource, /스냅샷만 갱신했습니다/);
});
