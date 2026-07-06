import { z } from "zod";

export const MAX_VALIDATION_INTEGER = 2_147_483_647;
export const MAX_VALIDATION_DECIMAL = 9_999_999_999.99;

export function isNonNegativeIntegerInRange(
  value: number,
  max = MAX_VALIDATION_INTEGER,
) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max;
}

export function roundToTwoDecimals(value: number) {
  const rounded = Math.round(value * 100) / 100;

  return Object.is(rounded, -0) ? 0 : rounded;
}

export function isNonNegativeDecimalInRange(
  value: number,
  max = MAX_VALIDATION_DECIMAL,
) {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    return false;
  }

  const scaled = value * 100;

  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

export function parseRequiredNonNegativeInteger(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
  max = MAX_VALIDATION_INTEGER,
) {
  if (typeof value === "number" && isNonNegativeIntegerInRange(value, max)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);

      if (isNonNegativeIntegerInRange(parsed, max)) {
        return parsed;
      }
    }
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: errorMessage,
  });

  return z.NEVER;
}

export function parseRequiredNonNegativeDecimal(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
  max = MAX_VALIDATION_DECIMAL,
) {
  if (typeof value === "number" && isNonNegativeDecimalInRange(value, max)) {
    return roundToTwoDecimals(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d+(?:\.\d{1,2})?$/.test(trimmed)) {
      const parsed = Number(trimmed);

      if (isNonNegativeDecimalInRange(parsed, max)) {
        return roundToTwoDecimals(parsed);
      }
    }
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: errorMessage,
  });

  return z.NEVER;
}

export function parseOptionalNonNegativeInteger(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
  max = MAX_VALIDATION_INTEGER,
) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return parseRequiredNonNegativeInteger(value, context, errorMessage, max);
}

export function parseOptionalNonNegativeDecimal(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
  max = MAX_VALIDATION_DECIMAL,
) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return parseRequiredNonNegativeDecimal(value, context, errorMessage, max);
}

export function toFieldErrors(error: z.ZodError) {
  const result: Record<string, string[]> = {};

  for (const issue of error.issues) {
    if (issue.path.length === 0) {
      continue;
    }

    const path = issue.path.map((segment) => String(segment)).join(".");

    result[path] ??= [];
    result[path].push(issue.message);
  }

  return result;
}
