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

function createWorkbook(rows) {
  return createZip([
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="판매현황" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    ["xl/worksheets/sheet1.xml", sheetXml(rows)],
  ]);
}

const headerRow = [
  "일자-No.",
  "거래처명",
  "품목명(규격)",
  "수량",
  "단가",
  "공급가액",
  "부가세",
  "합계",
];

async function importSupplyParser() {
  const modulePath = path.join(
    root,
    "src",
    "features",
    "ledger",
    "ecount-supply-import.ts",
  );

  return import(pathToFileURL(modulePath).href);
}

async function importMapping() {
  const modulePath = path.join(
    root,
    "src",
    "features",
    "ledger",
    "ecount-supply-mapping.ts",
  );

  return import(pathToFileURL(modulePath).href);
}

test("classifyProductCategory: 냉) 접두만 냉동, 나머지는 모두 생물 (2026-06-29 기준자료)", async () => {
  const { classifyProductCategory } = await importMapping();

  // 기준자료의 냉동 품목은 모두 "냉)"(또는 "냉동") 접두를 가진다.
  for (const name of [
    "냉)부세",
    "냉)동태",
    "냉)고등어",
    "냉)포크오징어",
    "냉)흰다리새우",
    "냉동삼치",
  ]) {
    assert.equal(classifyProductCategory(name), "냉동", name);
  }

  // 기준자료에 없는(=냉) 접두가 없는) 품목은 모두 생물. 동태/프로즌 부분 일치로 오분류하지 않는다.
  for (const name of ["광어", "고등어", "생물동태", "활우럭", "참돔"]) {
    assert.equal(classifyProductCategory(name), "생물", name);
  }
});

test("parseEcountSupplyWorkbook preserves multi-store rows and groups by 거래처명", async () => {
  const { parseEcountSupplyWorkbook } = await importSupplyParser();

  const workbook = createWorkbook([
    ["판매현황"],
    headerRow,
    ["2026/06/17 -1", "진수산", "고등어 [28미]", 3, 10000, 30000, null, 30000],
    ["2026/06/17 -1", "진수산", "갈치 [31-35미]", 2, 20000, 40000, null, 40000],
    ["2026/06/17 -2", "바다상회", "고등어 [28미]", 5, 9000, 45000, null, 45000],
    ["총합계", "", "", 10, "", 115000, null, 115000],
  ]);

  const result = parseEcountSupplyWorkbook(workbook);

  assert.equal(result.matchedRowCount, 3, "summary rows are excluded");
  assert.equal(result.totalQuantity, 10);
  assert.equal(result.totalSupplyAmount, 115000);
  assert.equal(result.storeGroups.length, 2, "two distinct stores");

  const jinsusan = result.storeGroups.find((g) => g.rawStoreName === "진수산");
  assert.ok(jinsusan);
  assert.equal(jinsusan.lineCount, 2);
  assert.equal(jinsusan.totalSupplyAmount, 70000);

  // 같은 품목/규격이 다른 지점에 다른 단가로 들어가도 보존된다.
  const baseLine = result.lines.find(
    (line) => line.rawStoreName === "바다상회",
  );
  assert.equal(baseLine.unitPrice, 9000);
  assert.equal(baseLine.rowNumber, 5);
});

test("parseEcountSupplyWorkbook flags amount mismatch per-row without throwing", async () => {
  const { parseEcountSupplyWorkbook } = await importSupplyParser();

  const workbook = createWorkbook([
    ["판매현황"],
    headerRow,
    ["2026/06/17 -1", "진수산", "고등어 [28미]", 3, 10000, 30000, null, 30000],
    // 수량 x 단가(20000) != 공급가액(99999)
    ["2026/06/17 -1", "진수산", "갈치 [31-35미]", 2, 10000, 99999, null, 99999],
  ]);

  const result = parseEcountSupplyWorkbook(workbook);

  assert.equal(result.lines.length, 2);
  assert.equal(result.lines[0].error, null);
  assert.ok(
    result.lines[1].error?.includes("일치하지 않습니다"),
    "mismatched row carries a preview error instead of throwing",
  );
});

test("resolveEcountLine reports mapping-required and ready states", async () => {
  const { resolveEcountLine, ECOUNT_LINE_STATUS } = await importMapping();

  const unmapped = resolveEcountLine({
    rawStoreName: "진수산",
    rawProductName: "고등어",
    productSpec: "28미",
    storeId: null,
    productId: null,
    error: null,
  });
  assert.equal(unmapped.status, ECOUNT_LINE_STATUS.MAPPING_REQUIRED);
  assert.equal(unmapped.unmappedStoreName, "진수산");
  assert.deepEqual(unmapped.unmappedProduct, {
    rawName: "고등어",
    rawSpec: "28미",
  });

  const ready = resolveEcountLine({
    rawStoreName: "진수산",
    rawProductName: "고등어",
    productSpec: "28미",
    storeId: "store-1",
    productId: "product-1",
    error: null,
  });
  assert.equal(ready.status, ECOUNT_LINE_STATUS.READY);

  const failed = resolveEcountLine({
    rawStoreName: "진수산",
    rawProductName: "고등어",
    productSpec: "28미",
    storeId: "store-1",
    productId: "product-1",
    error: "수량 x 단가와 공급가액이 일치하지 않습니다.",
  });
  assert.equal(failed.status, ECOUNT_LINE_STATUS.FAILED);
});

test("productAliasKey uses a non-whitespace separator so name/spec splits don't collide", async () => {
  const { productAliasKey } = await importMapping();

  // 공백으로 이으면 ("고등어 특", "대")와 ("고등어", "특 대")가 같은 키로 충돌한다.
  // JSON 배열로 직렬화하면 두 조합이 서로 다른 키가 되어 잘못된 매핑을 막는다.
  assert.notEqual(
    productAliasKey("고등어 특", "대"),
    productAliasKey("고등어", "특 대"),
  );
  // 같은 이름/규격(공백만 다른)은 정규화되어 같은 키여야 한다.
  assert.equal(
    productAliasKey("고등어  특", " 대 "),
    productAliasKey("고등어 특", "대"),
  );
});

test("WO-01: ecount status labels use field-friendly Korean and batch/line share one source", async () => {
  const {
    ECOUNT_BATCH_STATUS_LABELS,
    ECOUNT_LINE_STATUS_LABELS,
    getEcountLineStatusLabel,
  } = await importMapping();

  // 현장 친화 한글 라벨. READY→반영 가능, COMMITTED→반영됨. raw 영어가 보이지 않는다.
  assert.equal(ECOUNT_BATCH_STATUS_LABELS.READY, "반영 가능");
  assert.equal(ECOUNT_BATCH_STATUS_LABELS.COMMITTED, "반영됨");
  assert.equal(ECOUNT_BATCH_STATUS_LABELS.MAPPING_REQUIRED, "매핑 필요");
  assert.equal(ECOUNT_BATCH_STATUS_LABELS.FAILED, "오류");
  assert.equal(ECOUNT_BATCH_STATUS_LABELS.VOIDED, "취소됨");

  // 배치와 라인이 같은 라벨 source를 쓴다(목록/상세 문구가 어긋나지 않게).
  assert.deepEqual(ECOUNT_LINE_STATUS_LABELS, ECOUNT_BATCH_STATUS_LABELS);
  assert.equal(getEcountLineStatusLabel("READY"), "반영 가능");
  assert.equal(getEcountLineStatusLabel("COMMITTED"), "반영됨");
});

test("resolveBatchStatus aggregates line statuses with FAILED/MAPPING_REQUIRED precedence", async () => {
  const { resolveBatchStatus, ECOUNT_BATCH_STATUS } = await importMapping();

  assert.equal(
    resolveBatchStatus(["READY", "READY"]),
    ECOUNT_BATCH_STATUS.READY,
  );
  assert.equal(
    resolveBatchStatus(["READY", "MAPPING_REQUIRED"]),
    ECOUNT_BATCH_STATUS.MAPPING_REQUIRED,
  );
  assert.equal(
    resolveBatchStatus(["MAPPING_REQUIRED", "FAILED"]),
    ECOUNT_BATCH_STATUS.FAILED,
  );
  assert.equal(resolveBatchStatus([]), ECOUNT_BATCH_STATUS.FAILED);
});

test("formatEcountDateNo shows the excel date and drops the -No. suffix", async () => {
  const { formatEcountDateNo, ecountDateNoToDate } = await importMapping();

  // 전표 번호(-1, -2 등)는 무시하고 엑셀 파일 날짜만 남긴다.
  assert.equal(formatEcountDateNo("2026/06/17 -1"), "2026-06-17");
  assert.equal(formatEcountDateNo("2026/06/17 -11"), "2026-06-17");
  // 다양한 구분자/한 자리 월·일도 0 padding으로 정규화한다.
  assert.equal(formatEcountDateNo("2026.6.7-3"), "2026-06-07");
  assert.equal(ecountDateNoToDate("2026-6-7 -2"), "2026-06-07");

  // 날짜를 못 읽으면 원문을 그대로 둔다(요약/총합계 등).
  assert.equal(formatEcountDateNo("총합계"), "총합계");
  assert.equal(ecountDateNoToDate("총합계"), null);
});

test("alias keys normalize whitespace for reuse across uploads", async () => {
  const { storeAliasKey, productAliasKey } = await importMapping();

  assert.equal(storeAliasKey("  진수산   수산물 "), "진수산 수산물");
  assert.equal(
    productAliasKey("  고등어 ", "  28미 "),
    productAliasKey("고등어", "28미"),
  );
});

test("ecount supply commit and actions modules export expected server actions", () => {
  // 서버 액션 모듈은 ~ alias/db를 import하므로 raw node에서 실행하지 않고 소스 계약만 확인한다.
  const commitSource = readFileSync(
    path.join(root, "src", "features", "ledger", "ecount-supply-commit.ts"),
    "utf8",
  );
  const actionsSource = readFileSync(
    path.join(root, "src", "features", "ledger", "ecount-supply-actions.ts"),
    "utf8",
  );

  assert.match(commitSource, /export async function commitEcountSupplyImport/);
  assert.match(commitSource, /export async function voidEcountSupplyImport/);
  // commit은 다중 지점 장부를 한 transaction에서 처리하고 실패 시 전체 rollback이다.
  assert.match(commitSource, /db\.\$transaction/);
  assert.match(commitSource, /getOrCreateStoreLedgerInTx/);
  assert.match(commitSource, /refreshLedgerInventoryFifoLots/);
  // 원본 단가 보존 + 원본 행 연결
  assert.match(commitSource, /sourceUnitPrice/);
  assert.match(commitSource, /ecountImportLineId/);

  assert.match(
    actionsSource,
    /export async function previewEcountSupplyUpload/,
  );
  assert.match(actionsSource, /export async function saveEcountStoreAlias/);
  assert.match(actionsSource, /export async function saveEcountProductAlias/);
  // 중복 파일은 fileHash로 차단한다.
  assert.match(actionsSource, /fileHash/);
  // 서버 action 환경에서 File.name이 보존되지 않는 경우를 대비해 클라이언트 파일명과 xlsx MIME을 함께 허용한다.
  assert.match(actionsSource, /formData\.get\("fileName"\)/);
  assert.match(
    actionsSource,
    /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
  );
});
