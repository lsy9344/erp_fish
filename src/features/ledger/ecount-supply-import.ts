// WO(2026-06-24): 이카운트 출고/입고 업로드 파서.
// 기존 parseEcountPurchaseWorkbook의 파싱 로직(zip/xml/헤더 검증)을 재사용하되,
// 단일 장부 전제(validateLedgerScope)를 제거하고 다중 지점 파일을 그대로 보존한다.
// 원본 행을 잃지 않으며, 수량 x 단가 != 공급가액 행은 throw 대신 per-row error로 표시한다.

import { Buffer } from "node:buffer";
import { inflateRawSync } from "node:zlib";

import {
  isNonNegativeDecimalInRange,
  roundToTwoDecimals,
} from "../../lib/validation.ts";
import { classifyProductCategory } from "./ecount-supply-mapping.ts";

const requiredHeaders = [
  "일자-No.",
  "거래처명",
  "품목명(규격)",
  "수량",
  "단가",
  "공급가액",
  "합계",
] as const;

type RequiredHeader = (typeof requiredHeaders)[number];

const defaultSpec = "규격 없음";

type CellValue = string | number | null;

export type EcountSupplyImportLine = {
  /** 1-based excel row number, stable original-row identifier */
  rowNumber: number;
  dateNo: string;
  rawStoreName: string;
  rawProductName: string;
  productName: string;
  productCategory: "냉동" | "생물";
  productSpec: string;
  quantity: number;
  /** 원본 이카운트 단가 */
  unitPrice: number;
  supplyAmount: number;
  totalAmount: number;
  /** preview 단계 오류(수량 x 단가 != 공급가액 등). 있으면 commit 불가 */
  error: string | null;
};

export type EcountSupplyStoreGroup = {
  rawStoreName: string;
  lineCount: number;
  totalQuantity: number;
  totalSupplyAmount: number;
};

export type EcountSupplyImportResult = {
  sheetName: string;
  matchedRowCount: number;
  totalQuantity: number;
  totalSupplyAmount: number;
  lines: EcountSupplyImportLine[];
  storeGroups: EcountSupplyStoreGroup[];
};

export class EcountSupplyImportError extends Error {
  readonly fieldErrors: Record<string, string[]>;

  constructor(
    message: string,
    fieldErrors: Record<string, string[]> = { file: [message] },
  ) {
    super(message);
    this.name = "EcountSupplyImportError";
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

  throw new EcountSupplyImportError("엑셀 파일을 읽을 수 없습니다.");
}

function readZipEntries(input: Uint8Array | ArrayBuffer) {
  const buffer = toBuffer(input);
  const endOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  const entries = new Map<string, Buffer>();

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new EcountSupplyImportError("엑셀 파일 구조를 확인해 주세요.");
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
      throw new EcountSupplyImportError("엑셀 파일 구조를 확인해 주세요.");
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
      throw new EcountSupplyImportError("지원하지 않는 엑셀 압축 형식입니다.");
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
  const regex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
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
  const regex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
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
) {
  const type = getAttribute(cellAttributes, "t");

  if (type === "inlineStr") {
    return readTexts(cellBody);
  }

  const value = /<v>([\s\S]*?)<\/v>/.exec(cellBody)?.[1] ?? "";

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
  const rowRegex = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(xml))) {
    const rowNumber = Number.parseInt(
      getAttribute(rowMatch[1] ?? "", "r") ?? String(rows.length + 1),
      10,
    );
    const cells: CellValue[] = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
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

function cellText(row: CellValue[], index: number) {
  const value = row[index];

  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function cellNumber(
  row: CellValue[],
  index: number,
  label: string,
  rowNumber: number,
) {
  const value = row[index];
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replaceAll(",", "").trim())
        : Number.NaN;

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new EcountSupplyImportError("엑셀 숫자 값을 확인해 주세요.", {
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
  const value = row[index];
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replaceAll(",", "").trim())
        : Number.NaN;

  if (!isNonNegativeDecimalInRange(parsed)) {
    throw new EcountSupplyImportError("엑셀 숫자 값을 확인해 주세요.", {
      file: [`${rowNumber}행 ${label} 값을 확인해 주세요.`],
    });
  }

  return roundToTwoDecimals(parsed);
}

function splitProductNameAndSpec(value: string) {
  const match = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(value.trim());

  if (!match) {
    return {
      productName: value.trim(),
      productSpec: defaultSpec,
    };
  }

  return {
    productName: match[1]!.trim(),
    productSpec: match[2]!.trim() || defaultSpec,
  };
}

function getSheetName(workbookXml: string | undefined) {
  if (!workbookXml) {
    return "판매현황";
  }

  return (
    getAttribute(/<sheet\b[^>]*>/.exec(workbookXml)?.[0] ?? "", "name") ??
    "판매현황"
  );
}

function getWorksheetXml(entries: Map<string, Buffer>) {
  const worksheetName = [...entries.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((left, right) =>
      left.localeCompare(right, "en", { numeric: true }),
    )[0];

  if (!worksheetName) {
    throw new EcountSupplyImportError("엑셀 시트를 찾을 수 없습니다.");
  }

  return entries.get(worksheetName)!.toString("utf8");
}

function findHeaderRow(rows: { rowNumber: number; cells: CellValue[] }[]) {
  for (let index = 0; index < rows.length; index += 1) {
    const cells = rows[index]!.cells.map((cell) =>
      cell === null || cell === undefined ? "" : String(cell).trim(),
    );
    const hasAllRequired = requiredHeaders.every((header) =>
      cells.includes(header),
    );

    if (hasAllRequired) {
      return { index, row: rows[index]!, cells };
    }
  }

  throw new EcountSupplyImportError("이카운트 엑셀 헤더를 찾을 수 없습니다.", {
    file: [
      "2행 헤더가 일자-No., 거래처명, 품목명(규격), 수량, 단가, 공급가액, 합계 형식인지 확인해 주세요.",
    ],
  });
}

function buildHeaderIndex(cells: string[]): Record<RequiredHeader, number> {
  const headerIndex = {} as Record<RequiredHeader, number>;

  for (const header of requiredHeaders) {
    headerIndex[header] = cells.indexOf(header);
  }

  return headerIndex;
}

function isSummaryRow(dateNo: string, rawProductName: string) {
  return (
    dateNo === "총합계" ||
    dateNo.endsWith(" 계") ||
    dateNo.endsWith("계") ||
    rawProductName === ""
  );
}

function normalizeStoreName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function parseEcountSupplyWorkbook(
  input: Uint8Array | ArrayBuffer,
): EcountSupplyImportResult {
  const entries = readZipEntries(input);
  const sheetName = getSheetName(
    entries.get("xl/workbook.xml")?.toString("utf8"),
  );
  const sharedStrings = parseSharedStrings(
    entries.get("xl/sharedStrings.xml")?.toString("utf8"),
  );
  const rows = parseSheetRows(getWorksheetXml(entries), sharedStrings);
  const header = findHeaderRow(rows);
  const headerIndex = buildHeaderIndex(header.cells);
  const lines: EcountSupplyImportLine[] = [];

  for (const row of rows.slice(header.index + 1)) {
    const dateNo = cellText(row.cells, headerIndex["일자-No."]);
    const rawStoreNameValue = cellText(row.cells, headerIndex["거래처명"]);
    const rawProductName = cellText(row.cells, headerIndex["품목명(규격)"]);

    if (isSummaryRow(dateNo, rawProductName)) {
      continue;
    }

    const quantity = cellQuantity(
      row.cells,
      headerIndex["수량"],
      "수량",
      row.rowNumber,
    );
    const unitPrice = cellNumber(
      row.cells,
      headerIndex["단가"],
      "단가",
      row.rowNumber,
    );
    const supplyAmountText = cellText(row.cells, headerIndex["공급가액"]);
    const supplyAmount =
      supplyAmountText === ""
        ? cellNumber(row.cells, headerIndex["합계"], "합계", row.rowNumber)
        : cellNumber(
            row.cells,
            headerIndex["공급가액"],
            "공급가액",
            row.rowNumber,
          );
    const totalText = cellText(row.cells, headerIndex["합계"]);
    const totalAmount =
      totalText === ""
        ? supplyAmount
        : cellNumber(row.cells, headerIndex["합계"], "합계", row.rowNumber);

    const { productName, productSpec } =
      splitProductNameAndSpec(rawProductName);

    const error =
      Math.round(quantity * unitPrice) !== supplyAmount
        ? `수량 x 단가(${Math.round(quantity * unitPrice)})와 공급가액(${supplyAmount})이 일치하지 않습니다.`
        : null;

    lines.push({
      rowNumber: row.rowNumber,
      dateNo,
      rawStoreName: normalizeStoreName(rawStoreNameValue),
      rawProductName,
      productName,
      productCategory: classifyProductCategory(productName),
      productSpec,
      quantity,
      unitPrice,
      supplyAmount,
      totalAmount,
      error,
    });
  }

  if (lines.length === 0) {
    throw new EcountSupplyImportError(
      "가져올 이카운트 출고/입고 행이 없습니다.",
    );
  }

  const storeGroupMap = new Map<string, EcountSupplyStoreGroup>();

  for (const line of lines) {
    const existing = storeGroupMap.get(line.rawStoreName);

    if (existing) {
      existing.lineCount += 1;
      existing.totalQuantity += line.quantity;
      existing.totalSupplyAmount += line.supplyAmount;
    } else {
      storeGroupMap.set(line.rawStoreName, {
        rawStoreName: line.rawStoreName,
        lineCount: 1,
        totalQuantity: line.quantity,
        totalSupplyAmount: line.supplyAmount,
      });
    }
  }

  const storeGroups = [...storeGroupMap.values()].sort((left, right) =>
    left.rawStoreName.localeCompare(right.rawStoreName, "ko"),
  );

  return {
    sheetName,
    matchedRowCount: lines.length,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    totalSupplyAmount: lines.reduce((sum, line) => sum + line.supplyAmount, 0),
    lines,
    storeGroups,
  };
}
