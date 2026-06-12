import { z } from "zod";

export const ANOMALY_THRESHOLD_SCOPE = "GLOBAL";

const MAX_INTEGER = 2_147_483_647;
const percentError = {
  salesDropRate: "매출 하락률은 0.0% 이상 100.0% 이하로 입력해 주세요.",
  grossMarginDropRate:
    "이익률 하락폭은 0.0% 이상 100.0% 이하로 입력해 주세요.",
} as const;
const integerError = {
  salesDifferenceAmount: "매출차액 금액은 0원 이상의 정수여야 합니다.",
  lossAmount: "손실액은 0원 이상의 정수여야 합니다.",
  inventoryDifferenceQuantity: "재고 차이 기준은 0 이상의 정수여야 합니다.",
} as const;
const activeStatusError = "활성 상태는 활성 또는 비활성 중 하나여야 합니다.";
const reasonError = "변경 사유를 입력해 주세요.";

function isValidInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_INTEGER;
}

function parsePercentBps(
  value: unknown,
  context: z.RefinementCtx,
  message: string,
) {
  const normalized =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message });
    return z.NEVER;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    context.addIssue({ code: z.ZodIssueCode.custom, message });
    return z.NEVER;
  }

  return Math.round(parsed * 100);
}

function parseInteger(
  value: unknown,
  context: z.RefinementCtx,
  message: string,
) {
  const normalized =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";

  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(normalized)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message });
    return z.NEVER;
  }

  const parsed = Number(normalized.replaceAll(",", ""));

  if (!isValidInteger(parsed)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message });
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

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: activeStatusError,
  });
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

export const anomalyThresholdFormSchema = z.object({
  salesDropRate: z
    .unknown()
    .transform((value, context) =>
      parsePercentBps(value, context, percentError.salesDropRate),
    ),
  grossMarginDropRate: z
    .unknown()
    .transform((value, context) =>
      parsePercentBps(value, context, percentError.grossMarginDropRate),
    ),
  salesDifferenceAmount: z
    .unknown()
    .transform((value, context) =>
      parseInteger(value, context, integerError.salesDifferenceAmount),
    ),
  lossAmount: z
    .unknown()
    .transform((value, context) =>
      parseInteger(value, context, integerError.lossAmount),
    ),
  inventoryDifferenceQuantity: z
    .unknown()
    .transform((value, context) =>
      parseInteger(value, context, integerError.inventoryDifferenceQuantity),
    ),
  isActive: z
    .unknown()
    .transform((value, context) => parseActiveStatus(value, context)),
  reason: z.unknown().transform((value, context) => parseReason(value, context)),
}).transform((value) => ({
  salesDropRateBps: value.salesDropRate,
  grossMarginDropBps: value.grossMarginDropRate,
  salesDifferenceAmount: value.salesDifferenceAmount,
  lossAmount: value.lossAmount,
  inventoryDifferenceQuantity: value.inventoryDifferenceQuantity,
  isActive: value.isActive,
  reason: value.reason,
}));

export type AnomalyThresholdFormInput = z.infer<
  typeof anomalyThresholdFormSchema
>;

export function toAnomalyThresholdFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

export function formatBpsAsPercent(value: number) {
  return String(value / 100).replace(/\.0$/, "");
}

export function formatIntegerInput(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}
