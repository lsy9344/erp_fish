import { z } from "zod";

const MAX_KRW_INTEGER = 2_147_483_647;
const standardUnitPriceError = "기준 단가는 0원 이상의 정수여야 합니다.";

function isValidKrwInteger(value: number) {
  return (
    Number.isSafeInteger(value) && value >= 0 && value <= MAX_KRW_INTEGER
  );
}

const productIdSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1, "품목을 선택해 주세요."));

function parseOptionalKrw(value: unknown, context: z.RefinementCtx) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && isValidKrwInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed === "") {
      return null;
    }

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);

      if (isValidKrwInteger(parsed)) {
        return parsed;
      }
    }
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: standardUnitPriceError,
  });

  return z.NEVER;
}

function parseOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

export const purchaseStandardFormSchema = z
  .object({
    productId: productIdSchema,
    standardUnitPrice: z.unknown().transform(parseOptionalKrw),
    referenceInfo: z.unknown().transform(parseOptionalText),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, context) => {
    if (value.standardUnitPrice === null && !value.referenceInfo) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "기준 단가 또는 참조 정보를 입력해 주세요.",
        path: ["standardUnitPrice"],
      });
    }
  });

export type PurchaseStandardFormInput = z.infer<
  typeof purchaseStandardFormSchema
>;

export const purchaseStandardStatusSchema = z.object({
  isActive: z.boolean(),
});

export type PurchaseStandardStatusInput = z.infer<
  typeof purchaseStandardStatusSchema
>;

export function toPurchaseStandardFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}
