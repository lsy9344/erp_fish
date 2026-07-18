import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { deflateRawSync, inflateRawSync } from "node:zlib";
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

function readZipEntry(archive, targetName) {
  let endOffset = archive.length - 22;

  while (endOffset >= 0 && archive.readUInt32LE(endOffset) !== 0x06054b50) {
    endOffset -= 1;
  }

  assert.ok(endOffset >= 0, "zip end record must exist");
  const entryCount = archive.readUInt16LE(endOffset + 10);
  let offset = archive.readUInt32LE(endOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50);
    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localHeaderOffset = archive.readUInt32LE(offset + 42);
    const name = archive
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8");

    if (name === targetName) {
      const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
      const dataStart =
        localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = archive.subarray(
        dataStart,
        dataStart + compressedSize,
      );
      const content = method === 8 ? inflateRawSync(compressed) : compressed;

      return content.toString("utf8");
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  assert.fail(`zip entry must exist: ${targetName}`);
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

async function importProductSchemas() {
  const modulePath = path.join(
    root,
    "src",
    "features",
    "master-data",
    "product-schemas.ts",
  );

  return import(pathToFileURL(modulePath).href);
}

async function importInventoryOpeningRetry() {
  const modulePath = path.join(
    root,
    "src",
    "features",
    "inventory",
    "opening-import-retry.ts",
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

test("parseInventoryOpeningWorkbook reads up to two-decimal quantities and derives opening months", async () => {
  const { parseInventoryOpeningWorkbook } =
    await importInventoryOpeningImport();

  const workbook = createInventoryWorkbook([
    [
      46203,
      "삼국유통",
      "냉)포크오징어",
      "MA",
      "냉동",
      2.2,
      205000,
      451000,
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
      "0.62",
      "29,500",
      "18,290",
      "앱광어",
      "3kg",
      "앱 매핑",
    ],
    [
      "2026-06-30",
      "삼국유통",
      "참돔",
      "1kg",
      "생물",
      0.71,
      10000,
      7100,
      "",
      "",
      "",
    ],
    [
      "2026-06-30",
      "삼국유통",
      "우럭",
      "1kg",
      "생물",
      0.2,
      10000,
      2000,
      "",
      "",
      "",
    ],
    [
      "2026-06-30",
      "삼국유통",
      "도미",
      "1kg",
      "생물",
      0,
      10000,
      0,
      "",
      "",
      "",
    ],
  ]);

  const result = parseInventoryOpeningWorkbook(workbook);

  assert.equal(result.sheetName, "재고입력");
  assert.equal(result.rows.length, 5);
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
    quantity: 2.2,
    unitPrice: 205000,
    inventoryAmount: 451000,
    memo: "",
  });
  assert.equal(result.rows[1].productName, "앱광어");
  assert.equal(result.rows[1].productSpec, "3kg");
  assert.deepEqual(
    result.rows.map((row) => row.quantity),
    [2.2, 0.62, 0.71, 0.2, 0],
  );
  assert.equal(result.totalQuantity, 3.73);
  assert.equal(result.totalInventoryAmount, 478390);

  const source = readFileSync(
    path.join(root, "src", "features", "inventory", "opening-import.ts"),
    "utf8",
  );
  assert.match(source, /return roundToTwoDecimals\(parsed\);/);
  assert.match(source, /totalQuantity:\s*roundToTwoDecimals\(/);
});

test("parseInventoryOpeningWorkbook rejects negative quantities and quantities past two decimals", async () => {
  const { parseInventoryOpeningWorkbook, InventoryOpeningImportError } =
    await importInventoryOpeningImport();

  for (const invalidQuantity of [2.281, 0.001, -0.1]) {
    const workbook = createInventoryWorkbook([
      [
        "2026-06-30",
        "삼국유통",
        "냉)포크오징어",
        "MA",
        "냉동",
        invalidQuantity,
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
  }
});

test("parseInventoryOpeningWorkbook enforces the maximum quantity boundary", async () => {
  const { parseInventoryOpeningWorkbook, InventoryOpeningImportError } =
    await importInventoryOpeningImport();
  const validationModulePath = path.join(root, "src", "lib", "validation.ts");
  const { MAX_VALIDATION_DECIMAL } = await import(
    pathToFileURL(validationModulePath).href
  );
  const row = (quantity) => [
    "2026-06-30",
    "삼국유통",
    "냉)포크오징어",
    "MA",
    "냉동",
    quantity,
    0,
    0,
    "",
    "",
    "",
  ];

  const result = parseInventoryOpeningWorkbook(
    createInventoryWorkbook([row(MAX_VALIDATION_DECIMAL)]),
  );
  assert.equal(result.rows[0]?.quantity, MAX_VALIDATION_DECIMAL);

  assert.throws(
    () =>
      parseInventoryOpeningWorkbook(
        createInventoryWorkbook([row(MAX_VALIDATION_DECIMAL + 0.01)]),
      ),
    (error) =>
      error instanceof InventoryOpeningImportError &&
      error.fieldErrors.file?.[0] === "4행 남은 수량 값을 확인해 주세요.",
  );
});

test("parseInventoryOpeningWorkbook reads the tracked namespaced inventory template", async () => {
  const { parseInventoryOpeningWorkbook } =
    await importInventoryOpeningImport();
  const workbook = readFileSync(
    path.join(
      root,
      "outputs",
      "inventory_import_template",
      "과거_재고_간단_입력_양식.xlsx",
    ),
  );

  const result = parseInventoryOpeningWorkbook(workbook);

  assert.equal(result.sheetName, "재고입력");
  assert.equal(result.rows.length, 66);
  assert.equal(
    result.rows.find((row) => row.rowNumber === 4)?.quantity,
    1.5,
  );
  assert.equal(
    result.rows.find((row) => row.rowNumber === 5)?.quantity,
    0.71,
  );
  assert.equal(
    result.rows.find((row) => row.rowNumber === 53)?.quantity,
    1.38,
  );
});

test("tracked inventory template preserves customer validations and relationships", async () => {
  const workbook = readFileSync(
    path.join(
      root,
      "outputs",
      "inventory_import_template",
      "과거_재고_간단_입력_양식.xlsx",
    ),
  );

  const inventory = readZipEntry(workbook, "xl/worksheets/sheet3.xml");
  const lots = readZipEntry(workbook, "xl/worksheets/sheet4.xml");
  const categoryValidation =
    /<(?:\w+:)?dataValidation\b(?=[^>]*type="list")(?=[^>]*sqref="E4:E72")[^>]*>/.exec(
      inventory,
    )?.[0];
  assert.ok(categoryValidation, "E4:E72 list validation must exist");
  assert.match(categoryValidation, /\ballowBlank="1"/);
  assert.match(inventory, /sqref="F4:F2004"/);
  assert.match(inventory, /ROUND\(F4,2\)=F4/);
  assert.match(lots, /sqref="G4:G1004"/);
  assert.match(lots, /ROUND\(G4,2\)=G4/);
  const workbookRelationships = readZipEntry(
    workbook,
    "xl/_rels/workbook.xml.rels",
  );
  assert.doesNotMatch(workbookRelationships, /externalLink/);
});

test("inventory product identity accepts blank specs but enforces shared product bounds", async () => {
  const { productFormSchema, productIdentitySchema } =
    await importProductSchemas();

  assert.deepEqual(
    productIdentitySchema.parse({
      name: "  재고 고등어  ",
      category: " 냉동 ",
      spec: "   ",
    }),
    { name: "재고 고등어", category: "냉동", spec: "" },
  );
  assert.equal(
    productIdentitySchema.safeParse({
      name: "가".repeat(81),
      category: "냉동",
      spec: "1kg",
    }).success,
    false,
  );
  assert.equal(
    productIdentitySchema.safeParse({
      name: "고등어",
      category: "기타",
      spec: "1kg",
    }).success,
    false,
  );
  assert.equal(
    productIdentitySchema.safeParse({
      name: "고등어",
      category: "냉동",
      spec: "가".repeat(81),
    }).success,
    false,
  );
  assert.equal(
    productFormSchema.safeParse({
      name: "고등어",
      category: "냉동",
      spec: " ",
    }).success,
    false,
    "normal product forms must still require a spec",
  );
});

test("inventory product unique retry retries once only for the Product identity constraint", async () => {
  const {
    retryInventoryProductIdentityTransaction,
    isProductIdentityUniqueConstraintError,
  } = await importInventoryOpeningRetry();
  const productRace = {
    code: "P2002",
    meta: {
      modelName: "Product",
      target: ["name", "category", "spec"],
    },
  };
  let attempts = 0;

  const result = await retryInventoryProductIdentityTransaction(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw productRace;
    }
    return "winner reused";
  });

  assert.equal(result, "winner reused");
  assert.equal(attempts, 2);
  assert.equal(isProductIdentityUniqueConstraintError(productRace), true);

  for (const unrelatedError of [
    { code: "P2002", meta: { modelName: "Store", target: ["name"] } },
    { code: "P2002", meta: { modelName: "Product", target: ["name"] } },
    { code: "P2025", meta: { modelName: "Product" } },
  ]) {
    let unrelatedAttempts = 0;
    await assert.rejects(
      retryInventoryProductIdentityTransaction(async () => {
        unrelatedAttempts += 1;
        throw unrelatedError;
      }),
      (error) => error === unrelatedError,
    );
    assert.equal(unrelatedAttempts, 1);
  }

  let exhaustedAttempts = 0;
  await assert.rejects(
    retryInventoryProductIdentityTransaction(async () => {
      exhaustedAttempts += 1;
      throw productRace;
    }),
    (error) => error === productRace,
  );
  assert.equal(exhaustedAttempts, 2, "retry must be bounded to one retry");
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

test("inventory template builders keep their approved quantity precision", () => {
  const simpleSource = readFileSync(
    path.join(
      root,
      "outputs",
      "inventory_import_template",
      "build-simple-inventory-template.mjs",
    ),
    "utf8",
  );
  const fullSource = readFileSync(
    path.join(
      root,
      "outputs",
      "inventory_import_template",
      "build-inventory-template.mjs",
    ),
    "utf8",
  );

  const simpleQuantityValidation = simpleSource.match(
    /function twoDecimalQuantityValidation\(sheet, range\) \{([\s\S]*?)\r?\n\}/,
  )?.[1];
  assert.ok(simpleQuantityValidation);
  assert.match(simpleQuantityValidation, /type:\s*"custom"/);
  assert.match(
    simpleQuantityValidation,
    /ROUND\(\$\{firstCell\},2\)=\$\{firstCell\}/,
  );
  assert.match(
    simpleQuantityValidation,
    /error:\s*"0 이상의 수량을 소수점 둘째 자리까지 입력해 주세요\."/,
  );

  const simpleInventoryColumns = simpleSource.match(
    /const inventoryColumns = \[([\s\S]*?)\r?\n\];/,
  )?.[1];
  const simpleLotColumns = simpleSource.match(
    /const lotColumns = \[([\s\S]*?)\r?\n\];/,
  )?.[1];
  assert.ok(simpleInventoryColumns);
  assert.ok(simpleLotColumns);
  assert.match(
    simpleInventoryColumns,
    /\{ header: "남은 수량",[^\r\n]*numFmt: "#,##0\.00" \}/,
  );
  assert.match(
    simpleLotColumns,
    /\{ header: "남은 수량",[^\r\n]*numFmt: "#,##0\.00" \}/,
  );
  assert.match(
    simpleSource,
    /\["숫자", "수량은 0 이상 소수점 둘째 자리까지, 단가는 0 이상의 정수로 적어 주세요\. 쉼표는 써도 됩니다\."\]/,
  );
  assert.match(
    simpleSource,
    /twoDecimalQuantityValidation\(inventory,\s*"F4:F2004"\)/,
  );
  assert.match(
    simpleSource,
    /wholeNumberValidation\(inventory,\s*"G4:G2004"\)/,
  );
  assert.match(simpleSource, /wholeNumberValidation\(lots,\s*"F4:F1004"\)/);
  assert.match(
    simpleSource,
    /twoDecimalQuantityValidation\(lots,\s*"G4:G1004"\)/,
  );

  const fullQuantityValidation = fullSource.match(
    /function addOneDecimalQuantityValidation\(sheet, range\) \{([\s\S]*?)\r?\n\}/,
  )?.[1];
  assert.ok(fullQuantityValidation);
  assert.match(fullQuantityValidation, /type:\s*"custom"/);
  assert.match(
    fullQuantityValidation,
    /ROUND\(\$\{firstCell\},1\)=\$\{firstCell\}/,
  );
  assert.match(
    fullQuantityValidation,
    /error:\s*"0 이상의 수량을 소수점 첫째 자리까지 입력해 주세요\."/,
  );

  for (const [sheet, quantityRange, wholeNumberRange] of [
    ["invSheet", "H4:K2004", "L4:L2004"],
    ["lotSheet", "J4:K1004", "I4:I1004"],
    ["purchaseSheet", "H4:H1004", "I4:I1004"],
    ["lossSheet", "I4:I1004", "J4:J1004"],
  ]) {
    assert.match(
      fullSource,
      new RegExp(
        `addOneDecimalQuantityValidation\\(${sheet},\\s*"${quantityRange}"\\)`,
      ),
    );
    assert.match(
      fullSource,
      new RegExp(
        `addWholeNumberValidation\\(${sheet},\\s*"${wholeNumberRange}"\\)`,
      ),
    );
  }
  assert.match(
    fullSource,
    /\{ header: "남은 수량",[^\r\n]*numFmt: "#,##0\.0" \}/,
  );
  assert.match(
    fullSource,
    /\["숫자", "수량은 0 이상 소수점 첫째 자리까지, 단가·금액은 0 이상의 정수로 적어 주세요\. 예: 12\.5, 12000"\]/,
  );
});
