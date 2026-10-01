import type ExcelJS from "exceljs";

type CacheKind = "num" | "str";

type CellValue = string | number | boolean | Date | null;

const RANGE_REFERENCE =
  /^(?:'((?:''|[^'])+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/;

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnNumber(column: string): number {
  return [...column].reduce(
    (total, character) => total * 26 + character.charCodeAt(0) - 64,
    0,
  );
}

function excelSerial(date: Date): number {
  return (date.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function scalarValue(value: unknown): CellValue {
  if (value instanceof Date) return value;
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value ?? null;
  if (typeof value === "object") {
    if ("error" in value) return null;
    if ("result" in value) return scalarValue(value.result);
  }
  return null;
}

function cellValue(
  worksheet: ExcelJS.Worksheet,
  row: number,
  column: number,
): CellValue {
  const cell = worksheet.getCell(row, column);
  const value = cell.value;
  if (
    value &&
    typeof value === "object" &&
    ("formula" in value || "sharedFormula" in value)
  ) {
    // ExcelJS exposes a formula's cached result through cell.result. In
    // particular, value may omit a cached numeric zero from its object shape.
    return scalarValue(
      cell.result ?? ("result" in value ? value.result : null),
    );
  }
  return scalarValue(value);
}

function parseRange(reference: string) {
  const match = RANGE_REFERENCE.exec(reference.trim());
  if (!match) return null;
  const sheetName = (match[1] ?? match[2]!).replaceAll("''", "'");
  const startColumn = columnNumber(match[3]!);
  const startRow = Number(match[4]);
  const endColumn = columnNumber(match[5] ?? match[3]!);
  const endRow = Number(match[6] ?? match[4]);
  return { sheetName, startColumn, startRow, endColumn, endRow };
}

function displayString(value: CellValue): string | null {
  if (value === null || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function numericString(value: CellValue): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date) return String(excelSerial(value));
  return null;
}

function cacheXml(
  kind: CacheKind,
  values: Array<{ index: number; value: string }>,
  length: number,
  existing: string,
): string {
  const tag = kind === "num" ? "numCache" : "strCache";
  const formatCode =
    /<c:formatCode>[\s\S]*?<\/c:formatCode>/.exec(existing)?.[0] ?? "";
  const points = values
    .map(
      ({ index, value }) =>
        `<c:pt idx="${index}"><c:v>${xmlEscape(value)}</c:v></c:pt>`,
    )
    .join("");
  return `<c:${tag}>${formatCode}<c:ptCount val="${length}"/>${points}</c:${tag}>`;
}

function refreshReferenceCache(
  xml: string,
  kind: CacheKind,
  workbook: ExcelJS.Workbook,
): string {
  const referenceTag = kind === "num" ? "numRef" : "strRef";
  const cacheTag = kind === "num" ? "numCache" : "strCache";
  const referencePattern = new RegExp(
    `<c:${referenceTag}>([\\s\\S]*?)</c:${referenceTag}>`,
    "g",
  );
  return xml.replace(referencePattern, (referenceXml, body: string) => {
    const formula = /<c:f>([\s\S]*?)<\/c:f>/.exec(body)?.[1];
    if (!formula) return referenceXml;
    const range = parseRange(
      formula
        .replaceAll("&amp;", "&")
        .replaceAll("&apos;", "'")
        .replaceAll("&quot;", '"'),
    );
    const worksheet = range
      ? workbook.getWorksheet(range.sheetName)
      : undefined;
    if (!range || !worksheet) return referenceXml;
    const values: Array<{ index: number; value: string }> = [];
    let index = 0;
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (
        let column = range.startColumn;
        column <= range.endColumn;
        column += 1
      ) {
        const value = cellValue(worksheet, row, column);
        const output =
          kind === "num" ? numericString(value) : displayString(value);
        if (output !== null) values.push({ index, value: output });
        index += 1;
      }
    }
    const cachePattern = new RegExp(
      `<c:${cacheTag}>[\\s\\S]*?</c:${cacheTag}>`,
    );
    return referenceXml.replace(
      cachePattern,
      cacheXml(kind, values, index, body),
    );
  });
}

/** Refresh only chart caches while leaving chart design and formatting XML intact. */
export function refreshCustomerWorkbookChartCache(
  chartXml: string,
  workbook: ExcelJS.Workbook,
): string {
  return refreshReferenceCache(
    refreshReferenceCache(chartXml, "str", workbook),
    "num",
    workbook,
  );
}
