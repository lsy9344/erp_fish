import { z } from "zod";

export const MAX_VALIDATION_INTEGER = 2_147_483_647;

export function isNonNegativeIntegerInRange(
  value: number,
  max = MAX_VALIDATION_INTEGER,
) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max;
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
