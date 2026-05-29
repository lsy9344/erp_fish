import { z } from "zod";

export const PRODUCT_CATEGORY_VALUES = ["냉동", "생물"] as const;

const MAX_KRW_INTEGER = 2_147_483_647;
const krwError = "기본 단가는 0원 이상의 정수여야 합니다.";

function isValidKrwInteger(value: number) {
  return (
    Number.isSafeInteger(value) && value >= 0 && value <= MAX_KRW_INTEGER
  );
}

const productNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "품목명을 입력해 주세요.")
      .max(80, "품목명은 80자 이하여야 합니다."),
  );

const productCategorySchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "구분을 선택해 주세요.")
      .refine(
        (value) =>
          value.length === 0 ||
          PRODUCT_CATEGORY_VALUES.includes(
            value as (typeof PRODUCT_CATEGORY_VALUES)[number],
          ),
        "구분은 냉동 또는 생물이어야 합니다.",
      ),
  );

const productSpecSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "규격을 입력해 주세요.")
      .max(80, "규격은 80자 이하여야 합니다."),
  );

function parseRequiredKrw(value: unknown, context: z.RefinementCtx) {
  if (typeof value === "number" && isValidKrwInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);

      if (isValidKrwInteger(parsed)) {
        return parsed;
      }
    }
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: krwError,
  });

  return z.NEVER;
}

export const productFormSchema = z.object({
  name: productNameSchema,
  category: productCategorySchema,
  spec: productSpecSchema,
  defaultUnitPrice: z.unknown().transform(parseRequiredKrw),
  isActive: z.boolean().default(true),
});

export type ProductFormInput = z.infer<typeof productFormSchema>;

export const productStatusSchema = z.object({
  isActive: z.boolean(),
});

export type ProductStatusInput = z.infer<typeof productStatusSchema>;

export function toProductFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}
