import { z } from "zod";

// WO-13(2026-06-28): 품목군(category)별 장기재고 기준일 입력 검증.
const categoryError = "품목군을 입력해 주세요.";
const thresholdDaysError = "기준일은 1일 이상 3650일 이하의 정수로 입력해 주세요.";
const activeStatusError = "활성 상태는 활성 또는 비활성 중 하나여야 합니다.";
const reasonError = "변경 사유를 입력해 주세요.";

function parseCategory(value: unknown, context: z.RefinementCtx) {
  const normalized =
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

  if (!normalized || normalized.length > 40) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: categoryError });
    return z.NEVER;
  }

  return normalized;
}

function parseThresholdDays(value: unknown, context: z.RefinementCtx) {
  const normalized =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";

  if (!/^\d+$/.test(normalized)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: thresholdDaysError,
    });
    return z.NEVER;
  }

  const parsed = Number(normalized);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3650) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: thresholdDaysError,
    });
    return z.NEVER;
  }

  return parsed;
}

function parseActiveStatus(value: unknown, context: z.RefinementCtx) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";

  if (normalized === "true" || normalized === "active") {
    return true;
  }

  if (normalized === "false" || normalized === "inactive") {
    return false;
  }

  context.addIssue({ code: z.ZodIssueCode.custom, message: activeStatusError });
  return z.NEVER;
}

function parseReason(value: unknown, context: z.RefinementCtx) {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: reasonError });
    return z.NEVER;
  }

  return normalized;
}

export const longStockThresholdFormSchema = z.object({
  category: z
    .unknown()
    .transform((value, context) => parseCategory(value, context)),
  thresholdDays: z
    .unknown()
    .transform((value, context) => parseThresholdDays(value, context)),
  isActive: z
    .unknown()
    .transform((value, context) => parseActiveStatus(value, context)),
  reason: z
    .unknown()
    .transform((value, context) => parseReason(value, context)),
});

export type LongStockThresholdFormInput = z.infer<
  typeof longStockThresholdFormSchema
>;

export function toLongStockThresholdFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}
