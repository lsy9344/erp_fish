import { z } from "zod";

export const ANOMALY_THRESHOLD_SCOPE = "GLOBAL";

const percentError = {
  marginRate: "마진률은 0.0% 이상 100.0% 이하로 입력해 주세요.",
  reportMarginGap:
    "마진 차이 기준은 0.01%p 이상 100.00%p 이하로 입력해 주세요.",
} as const;
const activeStatusError = "활성 상태는 활성 또는 비활성 중 하나여야 합니다.";
const reasonError = "변경 사유를 입력해 주세요.";
const storeRequiredError = "활성 지점을 한 곳 이상 입력해 주세요.";
const duplicateStoreError = "같은 지점의 기준값을 중복 입력할 수 없습니다.";

function parsePercentBps(
  value: unknown,
  context: z.RefinementCtx,
  message: string,
  minimumBps = 0,
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

  const parsedBps = Math.round(parsed * 100);

  if (!Number.isFinite(parsed) || parsedBps < minimumBps || parsedBps > 10000) {
    context.addIssue({ code: z.ZodIssueCode.custom, message });
    return z.NEVER;
  }

  return parsedBps;
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

export const anomalyThresholdFormSchema = z
  .object({
    marginRate: z
      .unknown()
      .transform((value, context) =>
        parsePercentBps(value, context, percentError.marginRate),
      ),
    isActive: z
      .unknown()
      .transform((value, context) => parseActiveStatus(value, context)),
    reason: z
      .unknown()
      .transform((value, context) => parseReason(value, context)),
  })
  .transform((value) => ({
    marginRateBps: value.marginRate,
    isActive: value.isActive,
    reason: value.reason,
  }));

export type AnomalyThresholdFormInput = z.infer<
  typeof anomalyThresholdFormSchema
>;

const storeReportMarginGapThresholdSchema = z
  .object({
    storeId: z.string().trim().min(1, storeRequiredError),
    marginGapRate: z
      .unknown()
      .transform((value, context) =>
        parsePercentBps(value, context, percentError.reportMarginGap, 1),
      ),
  })
  .transform((value) => ({
    storeId: value.storeId,
    reportMarginGapThresholdBps: value.marginGapRate,
  }));

export const storeReportMarginGapThresholdFormSchema = z
  .object({
    stores: z.array(storeReportMarginGapThresholdSchema).min(1, {
      message: storeRequiredError,
    }),
    reason: z
      .unknown()
      .transform((value, context) => parseReason(value, context)),
  })
  .superRefine((value, context) => {
    const seenStoreIds = new Set<string>();

    value.stores.forEach((store, index) => {
      if (seenStoreIds.has(store.storeId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: duplicateStoreError,
          path: ["stores", index, "storeId"],
        });
        return;
      }

      seenStoreIds.add(store.storeId);
    });
  });

export type StoreReportMarginGapThresholdFormInput = z.infer<
  typeof storeReportMarginGapThresholdFormSchema
>;

export function toAnomalyThresholdFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

export function toStoreReportMarginGapThresholdFieldErrors(error: z.ZodError) {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "stores";
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
  }

  return fieldErrors;
}

export function formatBpsAsPercent(value: number) {
  return String(value / 100).replace(/\.0$/, "");
}
