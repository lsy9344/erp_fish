import type ExcelJS from "exceljs";

type FormulaError = { error: string };
type Scalar = number | string | boolean | null | FormulaError;

type RangeReference = {
  kind: "range";
  worksheet: ExcelJS.Worksheet;
  startColumn: number;
  endColumn: number;
  startRow: number;
  endRow: number;
};

type FormulaValue = Scalar | RangeReference;

const ERROR_CODES = new Set([
  "#DIV/0!",
  "#N/A",
  "#NAME?",
  "#NULL!",
  "#NUM!",
  "#REF!",
  "#VALUE!",
]);

const INPUT_FIXED_RANGE_PATTERN =
  /((?:'입력'|입력)!)\$?([A-Z]{1,3})\$?\d+:\$?([A-Z]{1,3})\$?\d+/gi;

/**
 * Expand the source workbook's old, fixed input ranges to whole columns.
 *
 * The original template was made for one fixed block of rows. The ERP export
 * can contain a different number of rows, so those ranges must follow the
 * exported input sheet instead of the old row numbers.
 */
export function normalizeCustomerFormula(formula: string): string {
  return formula.replace(
    INPUT_FIXED_RANGE_PATTERN,
    (match, sheetPrefix: string, startColumn: string, endColumn: string) => {
      if (startColumn.toUpperCase() !== endColumn.toUpperCase()) return match;
      return `${sheetPrefix}$${startColumn.toUpperCase()}:$${endColumn.toUpperCase()}`;
    },
  );
}

function formulaError(error: string): FormulaError {
  return { error };
}

function isFormulaError(value: unknown): value is FormulaError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "string"
  );
}

function isRangeReference(value: FormulaValue): value is RangeReference {
  return typeof value === "object" && value !== null && "kind" in value;
}

function columnNumber(column: string): number {
  let result = 0;
  for (const character of column.toUpperCase()) {
    result = result * 26 + character.charCodeAt(0) - 64;
  }
  return result;
}

function columnName(column: number): string {
  let current = column;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function excelSerial(date: Date): number {
  return date.getTime() / 86_400_000 + 25_569;
}

function serialDate(value: number): Date {
  return new Date((value - 25_569) * 86_400_000);
}

function toScalar(value: unknown): Scalar {
  if (value instanceof Date) return excelSerial(value);
  if (value === undefined) return null;
  if (isFormulaError(value)) return value;
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return null;
}

function numberValue(value: Scalar): number | FormulaError {
  if (isFormulaError(value)) return value;
  if (value === null || value === "") return 0;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const result = Number(value);
  return Number.isFinite(result) ? result : formulaError("#VALUE!");
}

function displayValue(value: Scalar): string {
  if (isFormulaError(value)) return value.error;
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

function scalarEquals(left: Scalar, right: Scalar): boolean {
  const leftNumber = numberValue(left);
  const rightNumber = numberValue(right);
  if (!isFormulaError(leftNumber) && !isFormulaError(rightNumber)) {
    if (typeof left === "number" || typeof right === "number") {
      return leftNumber === rightNumber;
    }
  }
  return displayValue(left).toLowerCase() === displayValue(right).toLowerCase();
}

function parseCriteria(criteria: Scalar): {
  operator: "=" | "<>" | ">" | ">=" | "<" | "<=";
  expected: Scalar;
} {
  if (typeof criteria !== "string") {
    return { operator: "=", expected: criteria };
  }
  const match = /^(<>|>=|<=|=|>|<)(.*)$/.exec(criteria);
  if (!match) return { operator: "=", expected: criteria };
  const [, operator, rawExpected = ""] = match;
  const expectedNumber = Number(rawExpected);
  return {
    operator: operator as ">" | ">=" | "<" | "<=" | "=" | "<>",
    expected:
      rawExpected !== "" && Number.isFinite(expectedNumber)
        ? expectedNumber
        : rawExpected,
  };
}

function criteriaMatches(value: Scalar, criteria: Scalar): boolean {
  if (isFormulaError(value) || isFormulaError(criteria)) return false;
  const { operator, expected } = parseCriteria(criteria);
  if (operator === "=") return scalarEquals(value, expected);
  if (operator === "<>") return !scalarEquals(value, expected);

  const leftNumber = numberValue(value);
  const rightNumber = numberValue(expected);
  if (!isFormulaError(leftNumber) && !isFormulaError(rightNumber)) {
    if (operator === ">") return leftNumber > rightNumber;
    if (operator === ">=") return leftNumber >= rightNumber;
    if (operator === "<") return leftNumber < rightNumber;
    return leftNumber <= rightNumber;
  }

  const left = displayValue(value).toLowerCase();
  const right = displayValue(expected).toLowerCase();
  if (operator === ">") return left > right;
  if (operator === ">=") return left >= right;
  if (operator === "<") return left < right;
  return left <= right;
}

function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < formula.length) {
    const character = formula[index]!;
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '"') {
      let value = "";
      index += 1;
      while (index < formula.length) {
        if (formula[index] === '"') {
          if (formula[index + 1] === '"') {
            value += '"';
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        value += formula[index]!;
        index += 1;
      }
      tokens.push({ kind: "string", value });
      continue;
    }
    if (character === "'") {
      const start = index;
      index += 1;
      while (index < formula.length) {
        if (formula[index] === "'") {
          if (formula[index + 1] === "'") {
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      if (formula[index] === "!") {
        index += 1;
        while (
          index < formula.length &&
          !/[\s,+\-*/&^=<>(),]/.test(formula[index]!)
        ) {
          index += 1;
        }
        tokens.push({ kind: "atom", value: formula.slice(start, index) });
        continue;
      }
      throw new Error(
        `Unsupported quoted token in customer formula: ${formula}`,
      );
    }
    if (character === "(") {
      tokens.push({ kind: "lparen", value: character });
      index += 1;
      continue;
    }
    if (character === ")") {
      tokens.push({ kind: "rparen", value: character });
      index += 1;
      continue;
    }
    if (character === ",") {
      tokens.push({ kind: "comma", value: character });
      index += 1;
      continue;
    }
    const twoCharacterOperator = formula.slice(index, index + 2);
    if (["<>", ">=", "<="].includes(twoCharacterOperator)) {
      tokens.push({ kind: "operator", value: twoCharacterOperator });
      index += 2;
      continue;
    }
    if (/[+\-*/&^=<>]/.test(character)) {
      tokens.push({ kind: "operator", value: character });
      index += 1;
      continue;
    }
    const start = index;
    while (
      index < formula.length &&
      !/[\s,+\-*/&^=<>(),]/.test(formula[index]!)
    ) {
      index += 1;
    }
    tokens.push({ kind: "atom", value: formula.slice(start, index) });
  }
  return tokens;
}

type Token =
  | { kind: "atom" | "string"; value: string }
  | { kind: "operator" | "lparen" | "rparen" | "comma"; value: string };

function resolveSheetName(name: string): string {
  if (name.startsWith("'") && name.endsWith("'")) {
    return name.slice(1, -1).replaceAll("''", "'");
  }
  return name;
}

function parseReference(
  atom: string,
  worksheet: ExcelJS.Worksheet,
): RangeReference | FormulaError | null {
  if (ERROR_CODES.has(atom.toUpperCase()))
    return formulaError(atom.toUpperCase());

  const bangIndex = atom.indexOf("!");
  const sheetName =
    bangIndex >= 0
      ? resolveSheetName(atom.slice(0, bangIndex))
      : worksheet.name;
  const reference = bangIndex >= 0 ? atom.slice(bangIndex + 1) : atom;
  if (ERROR_CODES.has(reference.toUpperCase()))
    return formulaError(reference.toUpperCase());
  const target = worksheet.workbook.getWorksheet(sheetName);
  if (!target)
    throw new Error(`Unknown sheet in customer formula: ${sheetName}`);

  const cellMatch = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(reference);
  if (cellMatch) {
    const column = columnNumber(cellMatch[1]!);
    const row = Number(cellMatch[2]);
    return {
      kind: "range",
      worksheet: target,
      startColumn: column,
      endColumn: column,
      startRow: row,
      endRow: row,
    };
  }
  const fullColumnMatch = /^\$?([A-Z]{1,3}):\$?([A-Z]{1,3})$/i.exec(reference);
  if (fullColumnMatch) {
    return {
      kind: "range",
      worksheet: target,
      startColumn: columnNumber(fullColumnMatch[1]!),
      endColumn: columnNumber(fullColumnMatch[2]!),
      startRow: 1,
      endRow: Math.max(target.rowCount, 1),
    };
  }
  const rangeMatch = /^\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)$/i.exec(
    reference,
  );
  if (rangeMatch) {
    return {
      kind: "range",
      worksheet: target,
      startColumn: columnNumber(rangeMatch[1]!),
      endColumn: columnNumber(rangeMatch[3]!),
      startRow: Number(rangeMatch[2]),
      endRow: Number(rangeMatch[4]),
    };
  }
  return null;
}

function singleReference(
  reference: RangeReference,
):
  | { worksheet: ExcelJS.Worksheet; row: number; column: number }
  | FormulaError {
  if (
    reference.startColumn !== reference.endColumn ||
    reference.startRow !== reference.endRow
  ) {
    throw new Error(
      "A scalar customer formula reference must point to one cell",
    );
  }
  return {
    worksheet: reference.worksheet,
    row: reference.startRow,
    column: reference.startColumn,
  };
}

function isErrorResult(value: FormulaValue): value is FormulaError {
  return isFormulaError(value);
}

class FormulaParser {
  private readonly tokens: Token[];
  private readonly worksheet: ExcelJS.Worksheet;
  private readonly context: EvaluationContext;
  private index = 0;

  constructor(
    formula: string,
    worksheet: ExcelJS.Worksheet,
    context: EvaluationContext,
  ) {
    this.tokens = tokenize(formula);
    this.worksheet = worksheet;
    this.context = context;
  }

  evaluate(): FormulaValue {
    const result = this.parseExpression(0);
    if (this.index !== this.tokens.length) {
      throw new Error(
        `Unsupported customer formula syntax: ${this.tokens[this.index]?.value}`,
      );
    }
    return result;
  }

  private parseExpression(minPrecedence: number): FormulaValue {
    let left = this.parseUnary();
    while (this.peek()?.kind === "operator") {
      const operator = this.peek()!.value;
      const precedence = operatorPrecedence(operator);
      if (precedence < minPrecedence) break;
      this.index += 1;
      const right = this.parseExpression(precedence + 1);
      left = applyOperator(operator, left, right);
    }
    return left;
  }

  private parseUnary(): FormulaValue {
    const token = this.peek();
    if (
      token?.kind === "operator" &&
      (token.value === "+" || token.value === "-")
    ) {
      this.index += 1;
      const value = this.parseUnary();
      if (isErrorResult(value)) return value;
      if (isRangeReference(value)) {
        throw new Error(
          "Unary operator applied to a range in customer formula",
        );
      }
      const number = numberValue(value);
      if (isFormulaError(number)) return number;
      return token.value === "-" ? -number : number;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaValue {
    const token = this.next();
    if (!token) throw new Error("Unexpected end of customer formula");
    if (token.kind === "string") return token.value;
    if (token.kind === "lparen") {
      const value = this.parseExpression(0);
      this.expect("rparen");
      return value;
    }
    if (token.kind !== "atom") {
      throw new Error(`Unexpected customer formula token: ${token.value}`);
    }
    if (this.peek()?.kind === "lparen") {
      this.index += 1;
      const args: FormulaValue[] = [];
      if (this.peek()?.kind !== "rparen") {
        while (true) {
          args.push(this.parseExpression(0));
          if (this.peek()?.kind !== "comma") break;
          this.index += 1;
        }
      }
      this.expect("rparen");
      return evaluateFunction(token.value.toUpperCase(), args, this.context);
    }
    const number = Number(token.value);
    if (token.value !== "" && Number.isFinite(number)) return number;
    const reference = parseReference(token.value, this.worksheet);
    if (reference) {
      if (isFormulaError(reference)) return reference;
      if (
        reference.startColumn !== reference.endColumn ||
        reference.startRow !== reference.endRow
      ) {
        return reference;
      }
      const scalarReference = singleReference(reference);
      if (isFormulaError(scalarReference)) return scalarReference;
      return this.context.evaluateCell(
        scalarReference.worksheet,
        scalarReference.row,
        scalarReference.column,
      );
    }
    if (token.value.toUpperCase() === "TRUE") return true;
    if (token.value.toUpperCase() === "FALSE") return false;
    throw new Error(`Unsupported customer formula token: ${token.value}`);
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private next(): Token | undefined {
    const token = this.peek();
    if (token) this.index += 1;
    return token;
  }

  private expect(kind: Token["kind"]): void {
    const token = this.next();
    if (token?.kind !== kind) {
      throw new Error(`Expected ${kind} in customer formula`);
    }
  }
}

function operatorPrecedence(operator: string): number {
  if (["=", "<>", ">", ">=", "<", "<="].includes(operator)) return 1;
  if (operator === "&") return 2;
  if (operator === "+" || operator === "-") return 3;
  if (operator === "*" || operator === "/") return 4;
  if (operator === "^") return 5;
  throw new Error(`Unsupported customer formula operator: ${operator}`);
}

function applyOperator(
  operator: string,
  left: FormulaValue,
  right: FormulaValue,
): FormulaValue {
  if (isRangeReference(left) || isRangeReference(right)) {
    throw new Error(`Range used as scalar in customer formula: ${operator}`);
  }
  if (isFormulaError(left)) return left;
  if (isFormulaError(right)) return right;
  if (["=", "<>", ">", ">=", "<", "<="].includes(operator)) {
    if (operator === "=") return scalarEquals(left, right);
    if (operator === "<>") return !scalarEquals(left, right);
    const leftNumber = numberValue(left);
    const rightNumber = numberValue(right);
    if (!isFormulaError(leftNumber) && !isFormulaError(rightNumber)) {
      if (operator === ">") return leftNumber > rightNumber;
      if (operator === ">=") return leftNumber >= rightNumber;
      if (operator === "<") return leftNumber < rightNumber;
      return leftNumber <= rightNumber;
    }
    return false;
  }
  if (operator === "&") return `${displayValue(left)}${displayValue(right)}`;
  const leftNumber = numberValue(left);
  const rightNumber = numberValue(right);
  if (isFormulaError(leftNumber)) return leftNumber;
  if (isFormulaError(rightNumber)) return rightNumber;
  if (operator === "+") return leftNumber + rightNumber;
  if (operator === "-") return leftNumber - rightNumber;
  if (operator === "*") return leftNumber * rightNumber;
  if (operator === "/") {
    if (rightNumber === 0) return formulaError("#DIV/0!");
    return leftNumber / rightNumber;
  }
  if (operator === "^") return leftNumber ** rightNumber;
  throw new Error(`Unsupported customer formula operator: ${operator}`);
}

function rangeValues(
  reference: RangeReference,
  context: EvaluationContext,
): Scalar[] {
  return context.rangeValues(reference);
}

function requireRange(
  value: FormulaValue,
  functionName: string,
): RangeReference | FormulaError {
  if (isRangeReference(value)) return value;
  if (isFormulaError(value)) return value;
  throw new Error(`${functionName} expected a range in customer formula`);
}

function requireScalar(value: FormulaValue, functionName: string): Scalar {
  if (isRangeReference(value)) {
    throw new Error(`${functionName} expected a scalar in customer formula`);
  }
  return value;
}

function evaluateFunction(
  name: string,
  args: FormulaValue[],
  context: EvaluationContext,
): FormulaValue {
  if (name === "IFERROR") {
    if (args.length !== 2) throw new Error("IFERROR requires two arguments");
    const value = requireScalar(args[0]!, name);
    return isFormulaError(value) ? requireScalar(args[1]!, name) : value;
  }
  if (name === "DATE") {
    if (args.length !== 3) throw new Error("DATE requires three arguments");
    const year = numberValue(requireScalar(args[0]!, name));
    const month = numberValue(requireScalar(args[1]!, name));
    const day = numberValue(requireScalar(args[2]!, name));
    if (isFormulaError(year)) return year;
    if (isFormulaError(month)) return month;
    if (isFormulaError(day)) return day;
    return excelSerial(new Date(Date.UTC(year, month - 1, day)));
  }
  if (name === "EOMONTH") {
    if (args.length !== 2) throw new Error("EOMONTH requires two arguments");
    const date = numberValue(requireScalar(args[0]!, name));
    const months = numberValue(requireScalar(args[1]!, name));
    if (isFormulaError(date)) return date;
    if (isFormulaError(months)) return months;
    const base = serialDate(date);
    return excelSerial(
      new Date(
        Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months + 1, 0),
      ),
    );
  }
  if (name === "SUMIF") {
    if (args.length !== 2 && args.length !== 3)
      throw new Error("SUMIF requires two or three arguments");
    const criteriaRange = requireRange(args[0]!, name);
    if (isFormulaError(criteriaRange)) return criteriaRange;
    const criteria = requireScalar(args[1]!, name);
    if (isFormulaError(criteria)) return criteria;
    const sumRange =
      args.length === 3 ? requireRange(args[2]!, name) : criteriaRange;
    if (isFormulaError(sumRange)) return sumRange;
    const criteriaValues = rangeValues(criteriaRange, context);
    const sumValues = rangeValues(sumRange, context);
    return sumIfValues(criteriaValues, criteria, sumValues);
  }
  if (name === "SUMIFS" || name === "AVERAGEIFS") {
    if (args.length < 3 || (args.length - 1) % 2 !== 0) {
      throw new Error(`${name} has invalid argument count`);
    }
    const sumRange = requireRange(args[0]!, name);
    if (isFormulaError(sumRange)) return sumRange;
    const sumValues = rangeValues(sumRange, context);
    const criteriaGroups: Array<{ values: Scalar[]; criteria: Scalar }> = [];
    for (let index = 1; index < args.length; index += 2) {
      const criteriaRange = requireRange(args[index]!, name);
      if (isFormulaError(criteriaRange)) return criteriaRange;
      const criteria = requireScalar(args[index + 1]!, name);
      if (isFormulaError(criteria)) return criteria;
      criteriaGroups.push({
        values: rangeValues(criteriaRange, context),
        criteria,
      });
    }
    if (name === "SUMIFS") {
      let total = 0;
      for (let rowIndex = 0; rowIndex < sumValues.length; rowIndex += 1) {
        const value = sumValues[rowIndex]!;
        if (
          !criteriaGroups.every((group) =>
            criteriaMatches(group.values[rowIndex] ?? null, group.criteria),
          )
        )
          continue;
        if (isFormulaError(value)) return value;
        if (typeof value === "number" && Number.isFinite(value)) total += value;
      }
      return total;
    }
    let sum = 0;
    let count = 0;
    for (let rowIndex = 0; rowIndex < sumValues.length; rowIndex += 1) {
      const value = sumValues[rowIndex]!;
      if (
        !criteriaGroups.every((group) =>
          criteriaMatches(group.values[rowIndex] ?? null, group.criteria),
        )
      )
        continue;
      if (isFormulaError(value)) return value;
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      sum += value;
      count += 1;
    }
    return count === 0 ? formulaError("#DIV/0!") : sum / count;
  }
  throw new Error(`Unsupported customer workbook function: ${name}`);
}

function sumIfValues(
  criteriaValues: Scalar[],
  criteria: Scalar,
  sumValues: Scalar[],
): Scalar {
  let total = 0;
  for (let rowIndex = 0; rowIndex < criteriaValues.length; rowIndex += 1) {
    if (!criteriaMatches(criteriaValues[rowIndex] ?? null, criteria)) continue;
    const value = sumValues[rowIndex] ?? null;
    if (isFormulaError(value)) return value;
    if (typeof value === "number" && Number.isFinite(value)) total += value;
  }
  return total;
}

class EvaluationContext {
  readonly memo = new Map<string, Scalar>();
  readonly visiting = new Set<string>();
  readonly rangeMemo = new Map<string, Scalar[]>();

  evaluateCell(
    worksheet: ExcelJS.Worksheet,
    row: number,
    column: number,
  ): Scalar {
    const cell = worksheet.getCell(row, column);
    const key = `${worksheet.name}!${cell.address}`;
    const cached = this.memo.get(key);
    if (cached !== undefined || this.memo.has(key)) return cached ?? null;
    if (this.visiting.has(key))
      throw new Error(`Circular customer workbook formula: ${key}`);
    this.visiting.add(key);
    try {
      const value = cell.value;
      let result: Scalar;
      const formula = resolveFormula(cell, worksheet);
      if (formula !== null) {
        const normalizedFormula = normalizeCustomerFormula(formula);
        const evaluated = new FormulaParser(
          normalizedFormula,
          worksheet,
          this,
        ).evaluate();
        if (isRangeReference(evaluated)) {
          throw new Error(`Formula returned a range in ${key}`);
        }
        result = evaluated;
        cell.value = {
          formula: normalizedFormula,
          result: toExcelResult(result) as ExcelJS.CellFormulaValue["result"],
        };
      } else {
        result = toScalar(value);
      }
      this.memo.set(key, result);
      return result;
    } finally {
      this.visiting.delete(key);
    }
  }

  rangeValues(reference: RangeReference): Scalar[] {
    const key = `${reference.worksheet.name}!${reference.startColumn}:${reference.endColumn}:${reference.startRow}:${reference.endRow}`;
    const cached = this.rangeMemo.get(key);
    if (cached) return cached;
    const values: Scalar[] = [];
    for (let row = reference.startRow; row <= reference.endRow; row += 1) {
      for (
        let column = reference.startColumn;
        column <= reference.endColumn;
        column += 1
      ) {
        values.push(this.evaluateCell(reference.worksheet, row, column));
      }
    }
    this.rangeMemo.set(key, values);
    return values;
  }
}

function toExcelResult(
  value: Scalar,
): number | string | boolean | null | FormulaError {
  return value;
}

function resolveFormula(
  cell: ExcelJS.Cell,
  worksheet: ExcelJS.Worksheet,
): string | null {
  const value = cell.value;
  if (!value || typeof value !== "object") return null;
  if ("formula" in value && typeof value.formula === "string")
    return value.formula;
  if ("sharedFormula" in value && typeof value.sharedFormula === "string") {
    const master = worksheet.getCell(value.sharedFormula);
    const masterFormula = resolveFormula(master, worksheet);
    if (masterFormula === null)
      throw new Error(
        `Missing shared formula master: ${worksheet.name}!${value.sharedFormula}`,
      );
    return translateFormula(masterFormula, master.address, cell.address);
  }
  return null;
}

function translateFormula(
  formula: string,
  fromAddress: string,
  toAddress: string,
): string {
  const from = parseAddress(fromAddress);
  const to = parseAddress(toAddress);
  const rowDelta = to.row - from.row;
  const columnDelta = to.column - from.column;
  return formula.replace(
    /(\$?)([A-Z]{1,3})(\$?)(\d+)/gi,
    (
      match,
      absoluteColumn: string,
      column: string,
      absoluteRow: string,
      row: string,
    ) => {
      const nextColumn = absoluteColumn
        ? column
        : columnName(columnNumber(column) + columnDelta);
      const nextRow = absoluteRow ? Number(row) : Number(row) + rowDelta;
      return `${absoluteColumn ? "$" : ""}${nextColumn}${absoluteRow ? "$" : ""}${nextRow}`;
    },
  );
}

function parseAddress(address: string): { row: number; column: number } {
  const match = /^([A-Z]+)(\d+)$/i.exec(address);
  if (!match) throw new Error(`Invalid Excel address: ${address}`);
  return { column: columnNumber(match[1]!), row: Number(match[2]) };
}

/** Recalculate all formula caches in the workbook, including shared formulas. */
export function recalculateCustomerWorkbook(workbook: ExcelJS.Workbook): void {
  const context = new EvaluationContext();
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (resolveFormula(cell, worksheet) !== null) {
          const address = parseAddress(cell.address);
          context.evaluateCell(worksheet, address.row, address.column);
        }
      });
    });
  }
}
