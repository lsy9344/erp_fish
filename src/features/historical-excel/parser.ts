import { createHash } from "node:crypto";
import path from "node:path";

import ExcelJS from "exceljs";

export const APPROVED_WORKBOOK_SHEETS = [
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
] as const;

export const APPROVED_HISTORICAL_STORE_NAMES = [
  "강서수산",
  "불광수산",
  "제일수산",
  "삼국유통",
  "안양참수산",
  "못골참수산",
  "구로참수산",
] as const;

export const APPROVED_WORKBOOK_EXPECTATIONS = {
  fileHash: "cea3bc37c99214db48464dfecec8483e800b8422d4619fdbcdc17f19dcac3f09",
  sheetCount: 10,
  rawRowCount: 14_309,
  canonicalFactCount: 14_072,
  normalizedRoleCount: 52_005,
  rawRoleCellCount: 52_113,
  sourceNameCount: 412,
  duplicateStoreDateCount: 28,
  firstBusinessDate: "2020-01-01",
  lastBusinessDate: "2026-06-30",
} as const;

const approvedStoreNames = new Set<string>(APPROVED_HISTORICAL_STORE_NAMES);
const REVIEW_REQUIRED_NAMES = new Set(["0", "기타"]);

export type SerializedHistoricalFormula = {
  address: string;
  column: number;
  formula: string;
  hasCachedResult: boolean;
  cachedValue: unknown;
};

export type HistoricalRawRow = {
  key: string;
  sheetIndex: number;
  sheetName: string;
  rowNumber: number;
  rawCells: {
    cellCount: number;
    hidden: boolean;
    height: number | null;
    outlineLevel: number;
    // values는 열 순서를 그대로 유지하며 null 위치가 명시적 공란이다.
    values: unknown[];
    types: number[];
    numberFormats: (string | null)[];
    blankColumns: number[];
    formulas: SerializedHistoricalFormula[];
  };
};

export type HistoricalMetricStatus =
  | "VALUE"
  | "BLANK"
  | "ORIGINAL_ERROR"
  | "INVALID";

export type HistoricalParsedMetric = {
  value: string | null;
  status: HistoricalMetricStatus;
  original: unknown;
};

export type HistoricalDailyFactInput = {
  key: string;
  sourceRawRowKey: string;
  sourceStoreName: string;
  businessDate: string;
  salesAmount: HistoricalParsedMetric;
  grossProfit: HistoricalParsedMetric;
  grossMarginRate: HistoricalParsedMetric;
  sourceOperatingProfit: HistoricalParsedMetric;
  productivity: HistoricalParsedMetric;
  workerCount: HistoricalParsedMetric;
};

export type HistoricalRoleInput = {
  sourceRawRowKey: string;
  dailyFactKey: string;
  sourceStoreName: string;
  businessDate: string;
  role: "LEAD" | "MEMBER";
  slotNumber: number;
  originalName: string;
};

export type HistoricalEmployeeInput = {
  originalName: string;
  reviewStatus: "UNLINKED" | "REVIEW_REQUIRED";
  firstSeenWorkDate: string;
  lastSeenWorkDate: string;
  leadRoleCount: number;
  memberRoleCount: number;
  storeNames: string[];
};

export type HistoricalWorkbookSummary = {
  fileHash: string;
  sourceFileName: string;
  sourceFileSize: number;
  sheetCount: number;
  sheetNames: string[];
  rawRowCount: number;
  canonicalFactCount: number;
  normalizedRoleCount: number;
  rawRoleCellCount: number;
  sourceNameCount: number;
  duplicateStoreDateCount: number;
  ignoredInputRowCount: number;
  unknownStoreNames: string[];
  firstBusinessDate: string | null;
  lastBusinessDate: string | null;
};

export type ParsedHistoricalWorkbook = {
  sourceWorkbook: Uint8Array;
  summary: HistoricalWorkbookSummary;
  rawRows: HistoricalRawRow[];
  dailyFacts: HistoricalDailyFactInput[];
  employees: HistoricalEmployeeInput[];
  roles: HistoricalRoleInput[];
  validationErrors: string[];
};

function serializeUnknown(value: unknown): unknown {
  if (value === undefined) return { kind: "undefined" };
  if (value === null) return null;
  if (value instanceof Date) {
    return { kind: "date", iso: value.toISOString() };
  }
  if (typeof value === "number") {
    if (Number.isNaN(value)) return { kind: "number", value: "NaN" };
    if (value === Number.POSITIVE_INFINITY) {
      return { kind: "number", value: "Infinity" };
    }
    if (value === Number.NEGATIVE_INFINITY) {
      return { kind: "number", value: "-Infinity" };
    }
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(serializeUnknown);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        serializeUnknown(entry),
      ]),
    );
  }
  if (typeof value === "bigint") {
    return { kind: "bigint", value: value.toString() };
  }
  if (typeof value === "symbol") {
    return { kind: "symbol", value: value.description ?? null };
  }
  if (typeof value === "function") {
    return { kind: "function", value: value.name || null };
  }
  return { kind: "unknown" };
}

function effectiveCellValue(cell: ExcelJS.Cell): unknown {
  if (cell.formula) return cell.result;
  return cell.value;
}

function parseNumericMetric(cell: ExcelJS.Cell): HistoricalParsedMetric {
  const value = effectiveCellValue(cell);

  if (value === null || value === undefined || value === "") {
    return { value: null, status: "BLANK", original: serializeUnknown(value) };
  }
  if (typeof value === "object" && value !== null && "error" in value) {
    return {
      value: null,
      status: "ORIGINAL_ERROR",
      original: serializeUnknown(value),
    };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return { value: String(value), status: "VALUE", original: value };
  }

  return { value: null, status: "INVALID", original: serializeUnknown(value) };
}

function businessDateInput(cell: ExcelJS.Cell): string | null {
  const value = effectiveCellValue(cell);

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
      ? value
      : null;
  }
  return null;
}

function validationErrorsFor(summary: HistoricalWorkbookSummary): string[] {
  const errors: string[] = [];
  const expected = APPROVED_WORKBOOK_EXPECTATIONS;

  if (summary.fileHash !== expected.fileHash) {
    errors.push(
      `파일 hash: 기대 ${expected.fileHash}, 실제 ${summary.fileHash}`,
    );
  }

  for (const [label, actual, wanted] of [
    ["시트 수", summary.sheetCount, expected.sheetCount],
    ["raw 행 수", summary.rawRowCount, expected.rawRowCount],
    [
      "canonical 지점일 수",
      summary.canonicalFactCount,
      expected.canonicalFactCount,
    ],
    [
      "정규화 역할 수",
      summary.normalizedRoleCount,
      expected.normalizedRoleCount,
    ],
    ["원본 역할 셀 수", summary.rawRoleCellCount, expected.rawRoleCellCount],
    ["원본 이름 수", summary.sourceNameCount, expected.sourceNameCount],
    [
      "동일 지점·일자 중복 수",
      summary.duplicateStoreDateCount,
      expected.duplicateStoreDateCount,
    ],
  ] as const) {
    if (actual !== wanted)
      errors.push(`${label}: 기대 ${wanted}, 실제 ${actual}`);
  }

  if (summary.firstBusinessDate !== expected.firstBusinessDate) {
    errors.push(
      `최초 일자: 기대 ${expected.firstBusinessDate}, 실제 ${summary.firstBusinessDate ?? "없음"}`,
    );
  }
  if (summary.lastBusinessDate !== expected.lastBusinessDate) {
    errors.push(
      `마지막 일자: 기대 ${expected.lastBusinessDate}, 실제 ${summary.lastBusinessDate ?? "없음"}`,
    );
  }
  if (summary.sheetNames.join("|") !== APPROVED_WORKBOOK_SHEETS.join("|")) {
    errors.push(`시트 이름/순서 불일치: ${summary.sheetNames.join(", ")}`);
  }
  if (summary.unknownStoreNames.some((name) => name !== "0")) {
    errors.push(
      `승인되지 않은 지점명: ${summary.unknownStoreNames.filter((name) => name !== "0").join(", ")}`,
    );
  }

  return errors;
}

export async function parseHistoricalWorkbook({
  fileBytes,
  sourceFileName,
}: {
  fileBytes: Uint8Array;
  sourceFileName: string;
}): Promise<ParsedHistoricalWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(fileBytes) as never);

  const rawRows: HistoricalRawRow[] = [];
  const rawRowByInputRow = new Map<number, HistoricalRawRow>();

  workbook.worksheets.forEach((worksheet, worksheetIndex) => {
    // ExcelJS columnCount getter는 전체 행을 다시 순회하므로 행/셀 루프 전에 고정한다.
    const columnCount = worksheet.columnCount;
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const key = `${worksheetIndex + 1}:${rowNumber}`;
      const values: unknown[] = [];
      const types: number[] = [];
      const numberFormats: (string | null)[] = [];
      const blankColumns: number[] = [];
      const formulas: SerializedHistoricalFormula[] = [];
      // Array.from/셀별 객체 30만 개는 큰 workbook에서 GC 지연을 만든다. 행 단위
      // primitive 배열로 같은 정보를 보존해 dry-run과 stage 메모리를 제한한다.
      for (let column = 1; column <= columnCount; column += 1) {
        const cell = row.getCell(column);
        const value = cell.value;
        values.push(
          value === null || value === undefined
            ? null
            : serializeUnknown(value),
        );
        types.push(cell.type);
        numberFormats.push(cell.numFmt ?? null);
        if (value === null || value === undefined) blankColumns.push(column);
        if (cell.formula) {
          formulas.push({
            address: cell.address,
            column,
            formula: cell.formula,
            hasCachedResult: cell.result !== undefined,
            cachedValue: serializeUnknown(cell.result),
          });
        }
      }
      const rawRow: HistoricalRawRow = {
        key,
        sheetIndex: worksheetIndex + 1,
        sheetName: worksheet.name,
        rowNumber,
        rawCells: {
          cellCount: columnCount,
          hidden: row.hidden,
          height: row.height ?? null,
          outlineLevel: row.outlineLevel ?? 0,
          values,
          types,
          numberFormats,
          blankColumns,
          formulas,
        },
      };
      rawRows.push(rawRow);
      if (worksheet.name === "입력") rawRowByInputRow.set(rowNumber, rawRow);
    });
  });

  const input = workbook.getWorksheet("입력");
  if (!input) throw new Error("승인 workbook에 `입력` 시트가 없습니다.");

  const facts: HistoricalDailyFactInput[] = [];
  const roles: HistoricalRoleInput[] = [];
  const seenStoreDates = new Set<string>();
  const unknownStoreNames = new Set<string>();
  let duplicateStoreDateCount = 0;
  let ignoredInputRowCount = 0;
  let rawRoleCellCount = 0;

  type EmployeeAccumulator = Omit<HistoricalEmployeeInput, "storeNames"> & {
    storeNames: Set<string>;
    storesByDate: Map<string, Set<string>>;
  };
  const employeeByName = new Map<string, EmployeeAccumulator>();

  input.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    for (let column = 10; column <= 22; column += 1) {
      if (row.getCell(column).text.trim()) rawRoleCellCount += 1;
    }

    const dateInput = businessDateInput(row.getCell(1));
    const sourceStoreName = row.getCell(3).text.trim();
    if (!dateInput || !approvedStoreNames.has(sourceStoreName)) {
      ignoredInputRowCount += 1;
      if (sourceStoreName) unknownStoreNames.add(sourceStoreName);
      return;
    }

    const storeDateKey = `${sourceStoreName}|${dateInput}`;
    if (seenStoreDates.has(storeDateKey)) {
      duplicateStoreDateCount += 1;
      return;
    }
    seenStoreDates.add(storeDateKey);

    const sourceRawRow = rawRowByInputRow.get(rowNumber);
    if (!sourceRawRow) {
      throw new Error(`입력!${rowNumber} raw 행을 찾을 수 없습니다.`);
    }

    const factKey = storeDateKey;
    facts.push({
      key: factKey,
      sourceRawRowKey: sourceRawRow.key,
      sourceStoreName,
      businessDate: dateInput,
      salesAmount: parseNumericMetric(row.getCell(4)),
      grossProfit: parseNumericMetric(row.getCell(5)),
      grossMarginRate: parseNumericMetric(row.getCell(6)),
      sourceOperatingProfit: parseNumericMetric(row.getCell(7)),
      productivity: parseNumericMetric(row.getCell(8)),
      workerCount: parseNumericMetric(row.getCell(9)),
    });

    const addRole = (
      column: number,
      role: HistoricalRoleInput["role"],
      slotNumber: number,
    ) => {
      const originalName = row.getCell(column).text.trim();
      if (!originalName) return;

      roles.push({
        sourceRawRowKey: sourceRawRow.key,
        dailyFactKey: factKey,
        sourceStoreName,
        businessDate: dateInput,
        role,
        slotNumber,
        originalName,
      });

      const previous = employeeByName.get(originalName);
      const next: EmployeeAccumulator = previous ?? {
        originalName,
        reviewStatus: REVIEW_REQUIRED_NAMES.has(originalName)
          ? "REVIEW_REQUIRED"
          : "UNLINKED",
        firstSeenWorkDate: dateInput,
        lastSeenWorkDate: dateInput,
        leadRoleCount: 0,
        memberRoleCount: 0,
        storeNames: new Set<string>(),
        storesByDate: new Map<string, Set<string>>(),
      };
      if (dateInput < next.firstSeenWorkDate)
        next.firstSeenWorkDate = dateInput;
      if (dateInput > next.lastSeenWorkDate) next.lastSeenWorkDate = dateInput;
      if (role === "LEAD") next.leadRoleCount += 1;
      else next.memberRoleCount += 1;
      next.storeNames.add(sourceStoreName);
      const storesOnDate =
        next.storesByDate.get(dateInput) ?? new Set<string>();
      storesOnDate.add(sourceStoreName);
      next.storesByDate.set(dateInput, storesOnDate);
      // 이름만으로 한 사람을 확정하지 않는다. 같은 원본 이름이 같은 날 여러
      // 지점에 있으면 동명이인 가능성이 있으므로 반드시 검토 대상으로 둔다.
      if (storesOnDate.size > 1) next.reviewStatus = "REVIEW_REQUIRED";
      employeeByName.set(originalName, next);
    };

    for (let column = 10; column <= 11; column += 1) {
      addRole(column, "LEAD", column - 9);
    }
    for (let column = 12; column <= 22; column += 1) {
      addRole(column, "MEMBER", column - 11);
    }
  });

  const employees = [...employeeByName.values()]
    .map(({ storesByDate: _storesByDate, ...employee }) => ({
      ...employee,
      storeNames: [...employee.storeNames].sort((a, b) =>
        a.localeCompare(b, "ko"),
      ),
    }))
    .sort((a, b) => a.originalName.localeCompare(b.originalName, "ko"));
  const businessDates = facts.map((fact) => fact.businessDate).sort();
  const summary: HistoricalWorkbookSummary = {
    fileHash: createHash("sha256").update(fileBytes).digest("hex"),
    sourceFileName: path.basename(sourceFileName),
    sourceFileSize: fileBytes.byteLength,
    sheetCount: workbook.worksheets.length,
    sheetNames: workbook.worksheets.map((worksheet) => worksheet.name),
    rawRowCount: rawRows.length,
    canonicalFactCount: facts.length,
    normalizedRoleCount: roles.length,
    rawRoleCellCount,
    sourceNameCount: employees.length,
    duplicateStoreDateCount,
    ignoredInputRowCount,
    unknownStoreNames: [...unknownStoreNames].sort((a, b) =>
      a.localeCompare(b, "ko"),
    ),
    firstBusinessDate: businessDates[0] ?? null,
    lastBusinessDate: businessDates.at(-1) ?? null,
  };

  return {
    sourceWorkbook: fileBytes,
    summary,
    rawRows,
    dailyFacts: facts,
    employees,
    roles,
    validationErrors: validationErrorsFor(summary),
  };
}
