import { Buffer } from "node:buffer";
import { inflateRawSync } from "node:zlib";

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

const ecountPurchaseSourceType = "ECOUNT_UPLOAD" as const;
const defaultSpec = "규격 없음";

type CellValue = string | number | null;

export type EcountPurchaseImportLine = {
  id: string;
  productId: string;
  purchaseStandardId: string;
  sourceType: typeof ecountPurchaseSourceType;
  productName: string;
  productCategory: "냉동" | "생물";
  productSpec: string;
  referenceUnitPrice: number;
  unitPrice: string;
  quantity: string;
  referenceInfo: string;
};

export type EcountPurchaseImportResult = {
  sheetName: string;
  matchedRowCount: number;
  purchases: EcountPurchaseImportLine[];
};

export type EcountPurchaseImportOptions = {
  storeName: string;
  closingDate: string | Date;
  validateLedgerScope?: boolean;
};

export class EcountPurchaseImportError extends Error {
  readonly fieldErrors: Record<string, string[]>;

  constructor(
    message: string,
    fieldErrors: Record<string, string[]> = { file: [message] },
  ) {
    super(message);
    this.name = "EcountPurchaseImportError";
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

  throw new EcountPurchaseImportError("엑셀 파일을 읽을 수 없습니다.");
}

function readZipEntries(input: Uint8Array | ArrayBuffer) {
  const buffer = toBuffer(input);
  const endOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  const entries = new Map<string, Buffer>();

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new EcountPurchaseImportError("엑셀 파일 구조를 확인해 주세요.");
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
      throw new EcountPurchaseImportError("엑셀 파일 구조를 확인해 주세요.");
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
      throw new EcountPurchaseImportError(
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
    throw new EcountPurchaseImportError("엑셀 숫자 값을 확인해 주세요.", {
      file: [`${rowNumber}행 ${label} 값을 확인해 주세요.`],
    });
  }

  return parsed;
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

function getProductCategory(rawProductName: string): "냉동" | "생물" {
  return /냉\)|냉동|동태|프로즌/i.test(rawProductName) ? "냉동" : "생물";
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
    throw new EcountPurchaseImportError("엑셀 시트를 찾을 수 없습니다.");
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

  throw new EcountPurchaseImportError(
    "이카운트 엑셀 헤더를 찾을 수 없습니다.",
    {
      file: [
        "2행 헤더가 일자-No., 거래처명, 품목명(규격), 수량, 단가, 공급가액, 합계 형식인지 확인해 주세요.",
      ],
    },
  );
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

function normalizeStoreNameMatchKey(value: string) {
  return normalizeStoreName(value)
    .replaceAll("（", "(")
    .replaceAll("）", ")")
    .replace(/\s*\(수산물\)\s*$/u, "")
    .trim();
}

function normalizeDate(value: string | Date) {
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  const match = /(\d{4})[./-](\d{1,2})[./-](\d{1,2})/.exec(value);

  if (!match) {
    return value.trim();
  }

  const [, year, month, day] = match;

  return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
}

function validateLedgerScope({
  rowNumber,
  dateNo,
  storeName,
  selectedStoreName,
  selectedClosingDate,
}: {
  rowNumber: number;
  dateNo: string;
  storeName: string;
  selectedStoreName: string;
  selectedClosingDate: string;
}) {
  const errors: string[] = [];
  const rowStoreName = normalizeStoreName(storeName);
  const rowStoreMatchKey = normalizeStoreNameMatchKey(rowStoreName);
  const selectedStoreMatchKey = normalizeStoreNameMatchKey(selectedStoreName);
  const rowDate = normalizeDate(dateNo);

  if (rowStoreMatchKey !== selectedStoreMatchKey) {
    errors.push(
      `${rowNumber}행 거래처가 선택 장부의 지점과 다릅니다. 선택: ${selectedStoreName}, 엑셀: ${rowStoreName}`,
    );
  }

  if (rowDate !== selectedClosingDate) {
    errors.push(
      `${rowNumber}행 일자가 선택 장부의 마감일과 다릅니다. 선택: ${selectedClosingDate}, 엑셀: ${rowDate}`,
    );
  }

  return errors;
}

export function parseEcountPurchaseWorkbook(
  input: Uint8Array | ArrayBuffer,
  options: EcountPurchaseImportOptions,
): EcountPurchaseImportResult {
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
  const purchases: EcountPurchaseImportLine[] = [];
  const scopeErrors: string[] = [];
  const shouldValidateLedgerScope = options.validateLedgerScope !== false;
  const selectedStoreName = normalizeStoreName(options.storeName);
  const selectedClosingDate = normalizeDate(options.closingDate);

  for (const row of rows.slice(header.index + 1)) {
    const dateNo = cellText(row.cells, headerIndex["일자-No."]);
    const storeName = cellText(row.cells, headerIndex["거래처명"]);
    const rawProductName = cellText(row.cells, headerIndex["품목명(규격)"]);

    if (isSummaryRow(dateNo, rawProductName)) {
      continue;
    }

    if (shouldValidateLedgerScope) {
      const rowScopeErrors = validateLedgerScope({
        rowNumber: row.rowNumber,
        dateNo,
        storeName,
        selectedStoreName,
        selectedClosingDate,
      });

      if (rowScopeErrors.length > 0) {
        scopeErrors.push(...rowScopeErrors);
        continue;
      }
    }

    const quantity = cellNumber(
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
    const amountColumn =
      supplyAmountText === "" ? headerIndex["합계"] : headerIndex["공급가액"];
    const amount = cellNumber(row.cells, amountColumn, "합계", row.rowNumber);

    if (quantity * unitPrice !== amount) {
      throw new EcountPurchaseImportError("엑셀 매입금액을 확인해 주세요.", {
        file: [
          `${row.rowNumber}행 ${rawProductName}: 수량 x 단가와 합계가 일치하지 않습니다.`,
        ],
      });
    }

    const { productName, productSpec } =
      splitProductNameAndSpec(rawProductName);

    purchases.push({
      id: `ecount-row-${row.rowNumber}`,
      productId: "",
      purchaseStandardId: "",
      sourceType: ecountPurchaseSourceType,
      productName,
      productCategory: getProductCategory(productName),
      productSpec,
      referenceUnitPrice: unitPrice,
      unitPrice: String(unitPrice),
      quantity: String(quantity),
      referenceInfo: `이카운트 ${sheetName} ${row.rowNumber}행 · 일자-No. ${dateNo} · 거래처 ${storeName}`,
    });
  }

  if (scopeErrors.length > 0) {
    throw new EcountPurchaseImportError(
      "엑셀 지점/마감일을 확인해 주세요.",
      {
        file: scopeErrors,
      },
    );
  }

  if (purchases.length === 0) {
    throw new EcountPurchaseImportError(
      "가져올 이카운트 매입 행이 없습니다.",
    );
  }

  return {
    sheetName,
    matchedRowCount: purchases.length,
    purchases,
  };
}
