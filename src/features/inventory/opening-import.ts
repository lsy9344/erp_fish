import { Buffer } from "node:buffer";
import { inflateRawSync } from "node:zlib";

import {
  MAX_VALIDATION_DECIMAL,
  roundToTwoDecimals,
} from "../../lib/validation.ts";

const requiredHeaders = [
  "날짜",
  "지점명",
  "품목명",
  "규격",
  "구분",
  "남은 수량",
  "재고 단가",
] as const;

const optionalHeaders = [
  "재고 금액",
  "앱 품목명\n다르면만",
  "앱 규격\n다르면만",
  "메모",
] as const;

type RequiredHeader = (typeof requiredHeaders)[number];
type OptionalHeader = (typeof optionalHeaders)[number];
type CellValue = string | number | null;

export type InventoryOpeningImportRow = {
  rowNumber: number;
  inventoryDate: string;
  yearMonth: string;
  storeName: string;
  rawProductName: string;
  rawProductSpec: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  quantity: number;
  unitPrice: number;
  inventoryAmount: number;
  memo: string;
};

export type InventoryOpeningImportResult = {
  sheetName: string;
  rows: InventoryOpeningImportRow[];
  yearMonths: string[];
  totalQuantity: number;
  totalInventoryAmount: number;
};

export class InventoryOpeningImportError extends Error {
  readonly fieldErrors: Record<string, string[]>;

  constructor(
    message: string,
    fieldErrors: Record<string, string[]> = { file: [message] },
  ) {
    super(message);
    this.name = "InventoryOpeningImportError";
    this.fieldErrors = fieldErrors;
  }
}

function toBuffer(input: Uint8Array | ArrayBuffer): Buffer {
  if (Buffer.isBuffer(input)) {
    return input;
  }

  if (input instanceof ArrayBuffer) {
    return Buffer.from(input);
  }

  return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}

function findEndOfCentralDirectory(buffer: Buffer) {
  const minOffset = Math.max(0, buffer.length - 65557);

  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new InventoryOpeningImportError("엑셀 파일을 읽을 수 없습니다.");
}

function readZipEntries(input: Uint8Array | ArrayBuffer) {
  const buffer = toBuffer(input);
  const endOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  const entries = new Map<string, Buffer>();

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new InventoryOpeningImportError("엑셀 파일 구조를 확인해 주세요.");
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8");

    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new InventoryOpeningImportError("엑셀 파일 구조를 확인해 주세요.");
    }

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart =
      localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      entries.set(name, compressed);
    } else if (method === 8) {
      entries.set(name, inflateRawSync(compressed));
    } else {
      throw new InventoryOpeningImportError(
        "지원하지 않는 엑셀 압축 형식입니다.",
      );
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function decodeXml(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function getAttribute(source: string, name: string) {
  const match = new RegExp(`${name}="([^"]*)"`).exec(source);

  return match ? decodeXml(match[1]!) : null;
}

function columnIndex(ref: string) {
  const column = /^[A-Z]+/.exec(ref)?.[0] ?? "";
  let index = 0;

  for (const char of column) {
    index = index * 26 + char.charCodeAt(0) - 64;
  }

  return index - 1;
}

function readTexts(xml: string) {
  const texts: string[] = [];
  const regex =
    /<(?:[A-Za-z_][\w.-]*:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?t>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml))) {
    texts.push(decodeXml(match[1] ?? ""));
  }

  return texts.join("");
}

function parseSharedStrings(xml: string | undefined) {
  if (!xml) {
    return [];
  }

  const strings: string[] = [];
  const regex =
    /<(?:[A-Za-z_][\w.-]*:)?si\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?si>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(xml))) {
    strings.push(readTexts(match[1] ?? ""));
  }

  return strings;
}

function parseCellValue(
  cellAttributes: string,
  cellBody: string,
  shared: string[],
): CellValue {
  const type = getAttribute(cellAttributes, "t");

  if (type === "inlineStr") {
    return readTexts(cellBody);
  }

  const value =
    /<(?:[A-Za-z_][\w.-]*:)?v>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?v>/.exec(
      cellBody,
    )?.[1] ?? "";

  if (type === "s") {
    const index = Number.parseInt(value, 10);
    return Number.isSafeInteger(index) ? (shared[index] ?? "") : "";
  }

  if (value.trim() === "") {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : decodeXml(value);
}

function parseSheetRows(xml: string, shared: string[]) {
  const rows: { rowNumber: number; cells: CellValue[] }[] = [];
  const rowRegex =
    /<(?:[A-Za-z_][\w.-]*:)?row\b([^>]*)>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(xml))) {
    const rowNumber = Number.parseInt(
      getAttribute(rowMatch[1] ?? "", "r") ?? String(rows.length + 1),
      10,
    );
    const cells: CellValue[] = [];
    const cellRegex =
      /<(?:[A-Za-z_][\w.-]*:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?c>)/g;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(rowMatch[2] ?? ""))) {
      const ref = getAttribute(cellMatch[1] ?? "", "r");
      const index = ref ? columnIndex(ref) : cells.length;

      cells[index] = parseCellValue(
        cellMatch[1] ?? "",
        cellMatch[2] ?? "",
        shared,
      );
    }

    rows.push({ rowNumber, cells });
  }

  return rows;
}

function cellText(row: CellValue[], index: number | undefined) {
  if (index === undefined || index < 0) {
    return "";
  }

  const value = row[index];

  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeHeader(value: string) {
  return value.replace(/\s+/g, "");
}

function findHeaderRow(rows: { rowNumber: number; cells: CellValue[] }[]) {
  const normalizedRequired = requiredHeaders.map((header) =>
    normalizeHeader(header),
  );

  for (let index = 0; index < rows.length; index += 1) {
    const cells = rows[index]!.cells.map((cell) =>
      normalizeHeader(cell === null || cell === undefined ? "" : String(cell)),
    );
    const hasAllRequired = normalizedRequired.every((header) =>
      cells.includes(header),
    );

    if (hasAllRequired) {
      return { index, row: rows[index]!, cells };
    }
  }

  return null;
}

function buildHeaderIndex(
  cells: string[],
): Record<RequiredHeader, number> & Partial<Record<OptionalHeader, number>> {
  const normalizedCells = cells.map((cell) => normalizeHeader(cell));
  const headerIndex = {} as Record<RequiredHeader, number> &
    Partial<Record<OptionalHeader, number>>;

  for (const header of requiredHeaders) {
    headerIndex[header] = normalizedCells.indexOf(normalizeHeader(header));
  }

  for (const header of optionalHeaders) {
    const index = normalizedCells.indexOf(normalizeHeader(header));

    if (index >= 0) {
      headerIndex[header] = index;
    }
  }

  return headerIndex;
}

function getSheetNames(workbookXml: string | undefined) {
  if (!workbookXml) {
    return [];
  }

  const names: string[] = [];
  const regex = /<(?:[A-Za-z_][\w.-]*:)?sheet\b[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(workbookXml))) {
    const name = getAttribute(match[0], "name");
    names.push(name ?? `sheet${names.length + 1}`);
  }

  return names;
}

function getWorksheetEntries(entries: Map<string, Buffer>) {
  return [...entries.entries()]
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort(([left], [right]) =>
      left.localeCompare(right, "en", { numeric: true }),
    );
}

function parseNumber(value: CellValue | undefined) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value.replaceAll(",", "").trim());
  }

  return Number.NaN;
}

function isNonNegativeTwoDecimalInRange(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > MAX_VALIDATION_DECIMAL) {
    return false;
  }

  const scaled = value * 100;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;

  return Math.abs(scaled - Math.round(scaled)) <= tolerance;
}

function cellInteger(
  row: CellValue[],
  index: number,
  label: string,
  rowNumber: number,
) {
  const parsed = parseNumber(row[index]);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new InventoryOpeningImportError("엑셀 숫자 값을 확인해 주세요.", {
      file: [`${rowNumber}행 ${label} 값을 확인해 주세요.`],
    });
  }

  return parsed;
}

function cellQuantity(
  row: CellValue[],
  index: number,
  label: string,
  rowNumber: number,
) {
  const parsed = parseNumber(row[index]);

  if (!isNonNegativeTwoDecimalInRange(parsed)) {
    throw new InventoryOpeningImportError("엑셀 숫자 값을 확인해 주세요.", {
      file: [`${rowNumber}행 ${label} 값을 확인해 주세요.`],
    });
  }

  return roundToTwoDecimals(parsed);
}

function excelSerialDateToIsoDate(value: number) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * msPerDay);

  return date.toISOString().slice(0, 10);
}

function cellDate(row: CellValue[], index: number, rowNumber: number) {
  const value = row[index];

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return excelSerialDateToIsoDate(value);
  }

  if (typeof value === "string") {
    const cleaned = value.trim().replace(/^"|"$/g, "");
    const match = /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/.exec(cleaned);

    if (match) {
      const [, year, month, day] = match;

      return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
    }
  }

  throw new InventoryOpeningImportError("엑셀 날짜 값을 확인해 주세요.", {
    file: [`${rowNumber}행 날짜 값을 확인해 주세요.`],
  });
}

export function getNextInventoryLedgerDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(isoDate) ||
    Number(isoDate.slice(0, 4)) < 1 ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== isoDate
  ) {
    throw new InventoryOpeningImportError("엑셀 날짜 값을 확인해 주세요.");
  }

  date.setUTCDate(date.getUTCDate() + 1);

  if (date.getUTCFullYear() > 9999) {
    throw new InventoryOpeningImportError("엑셀 날짜 값을 확인해 주세요.");
  }

  return date.toISOString().slice(0, 10);
}

function nextDayYearMonth(isoDate: string) {
  return getNextInventoryLedgerDate(isoDate).slice(0, 7);
}

function classifyProductCategory(productName: string) {
  return productName.startsWith("냉)") || productName.startsWith("냉동")
    ? "냉동"
    : "생물";
}

function normalizeCategory(
  value: string,
  productName: string,
  rowNumber: number,
) {
  const category = value.trim();

  if (category === "냉동" || category === "생물") {
    return category;
  }

  if (category === "") {
    return classifyProductCategory(productName);
  }

  throw new InventoryOpeningImportError("구분 값을 확인해 주세요.", {
    file: [`${rowNumber}행 구분은 냉동 또는 생물이어야 합니다.`],
  });
}

function isBlankDataRow(row: CellValue[], headerIndex: Record<string, number>) {
  return (
    cellText(row, headerIndex["날짜"]) === "" &&
    cellText(row, headerIndex["남은 수량"]) === "" &&
    cellText(row, headerIndex["재고 단가"]) === ""
  );
}

function requireText(value: string, label: string, rowNumber: number): string {
  if (value) {
    return value;
  }

  throw new InventoryOpeningImportError("엑셀 필수 값을 확인해 주세요.", {
    file: [`${rowNumber}행 ${label} 값을 입력해 주세요.`],
  });
}

export function parseInventoryOpeningWorkbook(
  input: Uint8Array | ArrayBuffer,
): InventoryOpeningImportResult {
  const entries = readZipEntries(input);
  const sharedStrings = parseSharedStrings(
    entries.get("xl/sharedStrings.xml")?.toString("utf8"),
  );
  const sheetNames = getSheetNames(
    entries.get("xl/workbook.xml")?.toString("utf8"),
  );
  const worksheets = getWorksheetEntries(entries);
  const hasFixedInventorySheet = sheetNames.includes("재고입력");

  for (let sheetIndex = 0; sheetIndex < worksheets.length; sheetIndex += 1) {
    const [worksheetName, worksheetXml] = worksheets[sheetIndex]!;
    const sheetName =
      sheetNames[sheetIndex] ??
      worksheetName.replace(/^xl\/worksheets\//, "").replace(/\.xml$/, "");

    if (hasFixedInventorySheet && sheetName !== "재고입력") {
      continue;
    }

    const rows = parseSheetRows(worksheetXml.toString("utf8"), sharedStrings);
    const header = findHeaderRow(rows);

    if (!header) {
      continue;
    }

    const headerIndex = buildHeaderIndex(header.cells);
    const parsedRows: InventoryOpeningImportRow[] = [];

    for (const row of rows.slice(header.index + 1)) {
      if (isBlankDataRow(row.cells, headerIndex)) {
        continue;
      }

      const inventoryDate = cellDate(
        row.cells,
        headerIndex["날짜"],
        row.rowNumber,
      );
      const storeName = requireText(
        cellText(row.cells, headerIndex["지점명"]),
        "지점명",
        row.rowNumber,
      );
      const rawProductName = requireText(
        cellText(row.cells, headerIndex["품목명"]),
        "품목명",
        row.rowNumber,
      );
      const rawProductSpec = cellText(row.cells, headerIndex["규격"]);
      const productCategory = normalizeCategory(
        cellText(row.cells, headerIndex["구분"]),
        rawProductName,
        row.rowNumber,
      );
      const appProductName = cellText(
        row.cells,
        headerIndex["앱 품목명\n다르면만"],
      );
      const appProductSpec = cellText(
        row.cells,
        headerIndex["앱 규격\n다르면만"],
      );
      const quantity = cellQuantity(
        row.cells,
        headerIndex["남은 수량"],
        "남은 수량",
        row.rowNumber,
      );
      const unitPrice = cellInteger(
        row.cells,
        headerIndex["재고 단가"],
        "재고 단가",
        row.rowNumber,
      );
      const inventoryAmount = Math.round(quantity * unitPrice);

      parsedRows.push({
        rowNumber: row.rowNumber,
        inventoryDate,
        yearMonth: nextDayYearMonth(inventoryDate),
        storeName,
        rawProductName,
        rawProductSpec,
        productName: appProductName || rawProductName,
        productCategory,
        productSpec: appProductSpec || rawProductSpec,
        quantity,
        unitPrice,
        inventoryAmount,
        memo: cellText(row.cells, headerIndex["메모"]),
      });
    }

    if (parsedRows.length === 0) {
      throw new InventoryOpeningImportError("가져올 재고 행이 없습니다.");
    }

    return {
      sheetName,
      rows: parsedRows,
      yearMonths: [...new Set(parsedRows.map((row) => row.yearMonth))],
      totalQuantity: roundToTwoDecimals(
        parsedRows.reduce((sum, row) => sum + row.quantity, 0),
      ),
      totalInventoryAmount: parsedRows.reduce(
        (sum, row) => sum + row.inventoryAmount,
        0,
      ),
    };
  }

  throw new InventoryOpeningImportError(
    "재고입력 시트 헤더를 찾을 수 없습니다.",
    {
      file: [
        "재고입력 시트의 헤더가 날짜, 지점명, 품목명, 규격, 구분, 남은 수량, 재고 단가 형식인지 확인해 주세요.",
      ],
    },
  );
}
