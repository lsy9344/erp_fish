import ExcelJS from "exceljs";
import JSZip from "jszip";

import type { ReportExportSheet } from "./export.ts";
import { SOURCE_WORKBOOK_HEADERS } from "./source-workbook-export.ts";
import { recalculateCustomerWorkbook } from "./customer-workbook-calculations.ts";
import { refreshCustomerWorkbookChartCache } from "./customer-workbook-chart-cache.ts";
import {
  remapCustomerWorkbookNotes,
  remapCustomerWorkbookNoteShapes,
} from "./customer-workbook-notes.ts";

const TEMPLATE_SHEETS = [
  "입력",
  "분석",
  "매장 별(년도)",
  "매장 별(달)",
  "매출",
  "매출이익",
  "이익률",
  "인당생산성",
  "평균 재고",
  "Sheet3",
];

type RowTemplate = {
  attributes: string;
  cellAttributes: string[];
  marginFormula: boolean;
};

function xml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function attribute(attributes: string, name: string): string | null {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attributes)?.[1] ?? null;
}

function withoutAttributes(attributes: string, names: string[]): string {
  return attributes.replace(
    new RegExp(`\\s+(?:${names.join("|")})="[^"]*"`, "g"),
    "",
  );
}

function scalar(value: ExcelJS.CellValue): ExcelJS.CellValue {
  if (value && typeof value === "object" && "result" in value) {
    return value.result ?? null;
  }
  return value;
}

function currentCellValue(cell: ExcelJS.Cell): ExcelJS.CellValue {
  const value = cell.value;
  // ExcelJS's value getter omits a cached zero; its result getter retains it.
  if (
    value &&
    typeof value === "object" &&
    ("formula" in value || "sharedFormula" in value)
  ) {
    return { formula: cell.formula, result: cell.result ?? undefined };
  }
  return value;
}

function cellXml(
  address: string,
  attributes: string,
  value: ExcelJS.CellValue,
): string {
  const base = ` r="${address}"${withoutAttributes(attributes, ["r", "t"])}`;
  const result = scalar(value);
  const formula =
    value &&
    typeof value === "object" &&
    "formula" in value &&
    typeof value.formula === "string"
      ? `<f>${xml(value.formula)}</f>`
      : "";
  if (result === null || result === undefined) {
    return formula ? `<c${base}>${formula}</c>` : `<c${base}/>`;
  }
  if (typeof result === "object" && "error" in result) {
    return `<c${base} t="e">${formula}<v>${xml(result.error)}</v></c>`;
  }
  if (typeof result === "string") {
    return formula
      ? `<c${base} t="str">${formula}<v>${xml(result)}</v></c>`
      : `<c${base} t="inlineStr"><is><t xml:space="preserve">${xml(result)}</t></is></c>`;
  }
  if (typeof result === "boolean") {
    return `<c${base} t="b">${formula}<v>${Number(result)}</v></c>`;
  }
  const number =
    result instanceof Date ? result.getTime() / 86_400_000 + 25_569 : result;
  if (typeof number !== "number" || !Number.isFinite(number)) {
    throw new Error(`엑셀 셀 값이 올바르지 않습니다: ${address}`);
  }
  return `<c${base}>${formula}<v>${number}</v></c>`;
}

function sourceKey(date: unknown, store: unknown): string | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  if (typeof store !== "string") return null;
  return `${date.toISOString().slice(0, 10)}|${store}`;
}

async function zipText(zip: JSZip, path: string): Promise<string> {
  const part = zip.file(path);
  if (!part) throw new Error(`원본 엑셀 구성요소가 없습니다: ${path}`);
  return part.async("string");
}

/** Keep the original OOXML package: ExcelJS writing would discard its charts. */
export async function buildCustomerWorkbookExport({
  templateBytes,
  sourceSheet,
  additionalPersonnelSheet,
}: {
  templateBytes: Uint8Array;
  sourceSheet: ReportExportSheet;
  additionalPersonnelSheet?: ReportExportSheet;
}): Promise<ArrayBuffer> {
  if (
    sourceSheet.columns.length !== SOURCE_WORKBOOK_HEADERS.length ||
    sourceSheet.columns.some(
      (column, i) => column.label !== SOURCE_WORKBOOK_HEADERS[i],
    )
  ) {
    throw new Error("원본 엑셀의 23개 항목이 필요합니다.");
  }
  const zip = await JSZip.loadAsync(templateBytes);
  const workbook = new ExcelJS.Workbook();
  // The template contains whole-column validation ranges. Reading those into
  // ExcelJS creates a million cells; retain their XML without materializing them.
  await workbook.xlsx.load(new Uint8Array(templateBytes).buffer, {
    ignoreNodes: ["dataValidations"],
  });
  if (
    workbook.properties.date1904 ||
    workbook.worksheets.length !== TEMPLATE_SHEETS.length ||
    workbook.worksheets.some((sheet, i) => sheet.name !== TEMPLATE_SHEETS[i])
  ) {
    throw new Error("원본 엑셀의 시트 구성이 다릅니다.");
  }
  const input = workbook.worksheets[0]!;
  if (
    SOURCE_WORKBOOK_HEADERS.some(
      (label, i) => input.getCell(1, i + 1).text !== label,
    )
  ) {
    throw new Error("원본 엑셀의 항목 이름이 다릅니다.");
  }

  const sourceXml = await zipText(zip, "xl/worksheets/sheet1.xml");
  const originalRows = new Map<number, RowTemplate>();
  const bySourceKey = new Map<string, RowTemplate>();
  const sourceKeys = new Map<number, string>();
  let headerXml = "";
  for (const match of sourceXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(attribute(match[1]!, "r"));
    if (rowNumber === 1) {
      headerXml = match[0];
      continue;
    }
    const cellAttributes: string[] = [];
    for (const cell of match[2]!.matchAll(
      /<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g,
    )) {
      const address = attribute(cell[1]!, "r");
      if (!address) continue;
      const column = Number(input.getCell(address).col);
      cellAttributes[column - 1] = cell[1]!;
    }
    const margin = input.getCell(rowNumber, 6);
    const template = {
      attributes: withoutAttributes(match[1]!, ["r", "spans"]),
      cellAttributes,
      marginFormula: Boolean(margin.formula),
    };
    originalRows.set(rowNumber, template);
    const date = input.getCell(rowNumber, 1).value;
    const originalStore = input.getCell(rowNumber, 3).value;
    const store =
      rowNumber === 13955 &&
      originalStore === 0 &&
      date instanceof Date &&
      date.toISOString().startsWith("2026-06-01")
        ? "강서수산"
        : originalStore;
    const key = sourceKey(date, store);
    if (key) {
      sourceKeys.set(rowNumber, key);
      if (!bySourceKey.has(key)) bySourceKey.set(key, template);
    }
  }
  if (!headerXml) throw new Error("원본 엑셀의 제목 행이 없습니다.");
  const fallback = originalRows.get(2);
  if (!fallback) throw new Error("원본 엑셀의 자료 행이 없습니다.");
  input.eachRow({ includeEmpty: false }, (row) => {
    if (row.number > 1)
      row.eachCell({ includeEmpty: false }, (cell) => {
        cell.value = null;
      });
  });
  const newRows = new Map<string, number>();
  const rowTemplates: RowTemplate[] = [];
  for (const [index, row] of sourceSheet.rows.entries()) {
    const rowNumber = index + 2;
    const values = sourceSheet.columns.map((column) => row[column.key] ?? null);
    const key = sourceKey(values[0], values[2]);
    if (!key || newRows.has(key))
      throw new Error("중복되거나 잘못된 엑셀 자료 행입니다.");
    newRows.set(key, rowNumber);
    const template = bySourceKey.get(key) ?? fallback;
    rowTemplates.push(template);
    for (const [column, value] of values.entries())
      input.getCell(rowNumber, column + 1).value = value as ExcelJS.CellValue;
    // Preserve the source margin formula where it existed, using the new row.
    // Constants, original errors and blanks stay as their original cell values.
    if (bySourceKey.has(key) && template.marginFormula) {
      input.getCell(rowNumber, 6).value = {
        formula: `E${rowNumber}/D${rowNumber}`,
        result: (values[5] ?? undefined) as ExcelJS.CellFormulaValue["result"],
      };
    }
  }
  recalculateCustomerWorkbook(workbook);

  const lastDataRow = sourceSheet.rows.length + 1;
  const dimension = /<dimension\b[^>]*ref="[A-Z]+\d+:[A-Z]+(\d+)"/.exec(
    sourceXml,
  );
  const lastStyledRow = Math.max(
    lastDataRow,
    Number(dimension?.[1] ?? lastDataRow),
  );
  const blankTemplate = originalRows.get(lastStyledRow) ?? fallback;
  const rows = [headerXml];
  for (let rowNumber = 2; rowNumber <= lastStyledRow; rowNumber += 1) {
    const template = rowTemplates[rowNumber - 2] ?? blankTemplate;
    const cells = sourceSheet.columns
      .map((_, index) => {
        const address = `${String.fromCharCode(65 + index)}${rowNumber}`;
        return cellXml(
          address,
          template.cellAttributes[index] ?? "",
          rowNumber <= lastDataRow
            ? currentCellValue(input.getCell(address))
            : null,
        );
      })
      .join("");
    rows.push(
      `<row r="${rowNumber}" spans="1:23"${template.attributes}>${cells}</row>`,
    );
  }
  let updatedInput = sourceXml
    .replace(
      /<sheetData>[\s\S]*?<\/sheetData>/,
      `<sheetData>${rows.join("")}</sheetData>`,
    )
    .replace(/(<dimension\b[^>]*ref=")[^"]*(")/, `$1A1:W${lastStyledRow}$2`)
    .replace(/(<autoFilter\b[^>]*ref=")[^"]*(")/, `$1A1:W${lastDataRow}$2`);
  updatedInput = updatedInput.replace(
    /<sortState\b[\s\S]*?<\/sortState>/g,
    (state) =>
      state
        .replace(/(<sortState\b[^>]*ref=")[^"]*(")/, `$1A2:W${lastDataRow}$2`)
        .replace(
          /(<sortCondition\b[^>]*ref=")[^"]*(")/g,
          `$1A2:A${lastDataRow}$2`,
        ),
  );
  zip.file("xl/worksheets/sheet1.xml", updatedInput);

  for (let index = 1; index < workbook.worksheets.length; index += 1) {
    const worksheet = workbook.worksheets[index]!;
    const path = `xl/worksheets/sheet${index + 1}.xml`;
    const worksheetXml = await zipText(zip, path);
    zip.file(
      path,
      worksheetXml.replace(
        /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
        (match, attributes: string, content: string | undefined) => {
          if (!content || !/<f(?:\s|>|\/)/.test(content)) return match;
          const address = attribute(attributes, "r");
          if (!address) throw new Error("원본 수식의 셀 주소가 없습니다.");
          return cellXml(
            address,
            attributes,
            currentCellValue(worksheet.getCell(address)),
          );
        },
      ),
    );
  }
  // Daily ERP labor records have no legacy team-lead/member slot. Preserve their
  // names in the template's existing helper sheet instead of inventing roles.
  if (additionalPersonnelSheet?.rows.length) {
    const path = "xl/worksheets/sheet10.xml";
    const helperXml = await zipText(zip, path);
    const helper = workbook.worksheets[9]!;
    const firstRow = helper.rowCount + 2;
    const detailRows = [
      ["추가 근무자 자료"],
      additionalPersonnelSheet.columns.map((column) => column.label),
      ...additionalPersonnelSheet.rows.map((row) =>
        additionalPersonnelSheet.columns.map(
          (column) => row[column.key] ?? null,
        ),
      ),
    ];
    const content = detailRows
      .map((values, index) => {
        const rowNumber = firstRow + index;
        return `<row r="${rowNumber}">${values
          .map((value, column) =>
            cellXml(
              `${String.fromCharCode(65 + column)}${rowNumber}`,
              "",
              value as ExcelJS.CellValue,
            ),
          )
          .join("")}</row>`;
      })
      .join("");
    const lastRow = firstRow + detailRows.length - 1;
    zip.file(
      path,
      helperXml
        .replace(/<sheetData\s*\/>/, "<sheetData></sheetData>")
        .replace("</sheetData>", `${content}</sheetData>`)
        .replace(/(<dimension\b[^>]*ref=")[^"]*(")/, `$1A1:I${lastRow}$2`),
    );
  }
  const rowMap = new Map<number, number>();
  for (const [oldRow, key] of sourceKeys) {
    const newRow = newRows.get(key);
    if (newRow) rowMap.set(oldRow, newRow);
  }
  for (const path of Object.keys(zip.files)) {
    if (/^xl\/charts\/chart\d+\.xml$/.test(path)) {
      zip.file(
        path,
        refreshCustomerWorkbookChartCache(await zipText(zip, path), workbook),
      );
    } else if (/^xl\/comments\d+\.xml$/.test(path)) {
      zip.file(
        path,
        remapCustomerWorkbookNotes(await zipText(zip, path), rowMap),
      );
    } else if (/^xl\/drawings\/vmlDrawing\d+\.vml$/.test(path)) {
      zip.file(
        path,
        remapCustomerWorkbookNoteShapes(await zipText(zip, path), rowMap),
      );
    }
  }
  const workbookXml = await zipText(zip, "xl/workbook.xml");
  zip.file(
    "xl/workbook.xml",
    workbookXml
      .replace(
        /<calcPr\b([^>]*?)\/>/,
        (_, attributes: string) =>
          `<calcPr${withoutAttributes(attributes, ["calcMode", "fullCalcOnLoad", "forceFullCalc"])} calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>`,
      )
      .replace(
        /(<definedName\b[^>]*name="_xlnm\._FilterDatabase"[^>]*>)[\s\S]*?(<\/definedName>)/,
        (_, opening: string, closing: string) =>
          `${opening}입력!$A$1:$W$${lastDataRow}${closing}`,
      ),
  );
  zip.remove("xl/calcChain.xml");
  zip.file(
    "xl/_rels/workbook.xml.rels",
    (await zipText(zip, "xl/_rels/workbook.xml.rels")).replace(
      /<Relationship\b[^>]*Type="[^"]*\/calcChain"[^>]*\/>/g,
      "",
    ),
  );
  zip.file(
    "[Content_Types].xml",
    (await zipText(zip, "[Content_Types].xml")).replace(
      /<Override\b[^>]*PartName="\/xl\/calcChain.xml"[^>]*\/>/g,
      "",
    ),
  );
  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return new Uint8Array(bytes).buffer;
}
