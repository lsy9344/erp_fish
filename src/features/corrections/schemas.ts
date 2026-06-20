import { z } from "zod";

const MAX_CORRECTION_INTEGER = 2_147_483_647;

const correctionTargetTypes = [
  "LEDGER_FIELD",
  "PAYMENT_FIELD",
  "EXPENSE_ROW",
  // Kept for existing Prisma enum/records; creation is blocked below until report overlay support exists.
  "PURCHASE_ROW",
  "INVENTORY_ROW",
  "LOSS_ROW",
  "CALCULATED_METRIC",
] as const;

const correctionValueKinds = ["money", "quantity", "text", "metric"] as const;
const unsupportedPurchaseRowCorrectionMessage =
  "매입 행 정정은 아직 지원하지 않습니다. 리포트 반영 경로가 준비된 뒤 사용해 주세요.";
const unsupportedInventoryAmountCorrectionMessage =
  "재고 금액 정정은 아직 지원하지 않습니다. 수량 정정으로 반영해 주세요.";

function parseNumericCorrectionValue(value: unknown) {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_CORRECTION_INTEGER
  ) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);

      if (
        Number.isSafeInteger(parsed) &&
        parsed >= 0 &&
        parsed <= MAX_CORRECTION_INTEGER
      ) {
        return parsed;
      }
    }
  }

  return null;
}

export const correctionValueSchema = z
  .object({
    kind: z.enum(correctionValueKinds),
    value: z.unknown(),
    label: z
      .unknown()
      .transform((value) =>
        typeof value === "string" && value.trim() ? value.trim() : undefined,
      ),
  })
  .transform((value, context) => {
    if (value.kind === "text") {
      if (
        value.value !== null &&
        value.value !== undefined &&
        typeof value.value !== "string"
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "정정값 형식을 확인해 주세요.",
          path: ["value"],
        });

        return z.NEVER;
      }

      const textValue =
        typeof value.value === "string" ? value.value.trim() : value.value;

      return {
        kind: value.kind,
        value: textValue === "" || textValue === undefined ? null : textValue,
        label: value.label,
      };
    }

    if (value.kind === "metric") {
      if (
        value.value !== null &&
        value.value !== undefined &&
        typeof value.value !== "string" &&
        typeof value.value !== "number"
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "정정값 형식을 확인해 주세요.",
          path: ["value"],
        });

        return z.NEVER;
      }

      const metricValue =
        typeof value.value === "string" ? value.value.trim() : value.value;

      return {
        kind: value.kind,
        value:
          metricValue === "" || metricValue === undefined ? null : metricValue,
        label: value.label,
      };
    }

    const parsed = parseNumericCorrectionValue(value.value);

    if (parsed === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "정정값은 0 이상의 저장 가능한 정수로 입력해 주세요.",
        path: ["value"],
      });

      return z.NEVER;
    }

    return {
      kind: value.kind,
      value: parsed,
      label: value.label,
    };
  });

export const correctionRecordSchema = z
  .object({
    ledgerId: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, "장부를 확인해 주세요.")),
    targetType: z.enum(correctionTargetTypes, {
      errorMap: () => ({ message: "정정 대상을 확인해 주세요." }),
    }),
    targetId: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, "정정 대상을 확인해 주세요.")),
    fieldKey: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, "정정 항목을 확인해 주세요.")),
    correctedValue: correctionValueSchema,
    reason: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, "정정 사유를 입력해 주세요.").max(500)),
  })
  .superRefine((value, context) => {
    if (value.targetType === "PURCHASE_ROW") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: unsupportedPurchaseRowCorrectionMessage,
        path: ["targetType"],
      });
    }

    if (
      value.targetType === "INVENTORY_ROW" &&
      value.fieldKey === "inventoryAmount"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: unsupportedInventoryAmountCorrectionMessage,
        path: ["fieldKey"],
      });
    }
  });

export type CorrectionRecordInput = z.infer<typeof correctionRecordSchema>;

export function toFieldErrors(error: z.ZodError) {
  const result: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.map((segment) => String(segment)).join(".");

    if (!path) {
      continue;
    }

    result[path] ??= [];
    result[path].push(issue.message);
  }

  return result;
}
