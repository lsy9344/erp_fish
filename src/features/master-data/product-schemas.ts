import { z } from "zod";

export const PRODUCT_CATEGORY_VALUES = ["냉동", "생물"] as const;

const MAX_KRW_INTEGER = 2_147_483_647;
// 정책 전환(2026-06-24): 단가는 선택적 "참고 단가"다. 비워두면 단가 없음(null)으로 저장한다.
const krwError = "참고 단가는 0원 이상의 정수여야 합니다.";

function isValidKrwInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_KRW_INTEGER;
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

const productIdentitySpecSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().max(80, "규격은 80자 이하여야 합니다."));

export const productIdentitySchema = z.object({
  name: productNameSchema,
  category: productCategorySchema,
  spec: productIdentitySpecSchema,
});

export type ProductIdentityInput = z.infer<typeof productIdentitySchema>;

// 단가는 선택값이다. 비어 있으면(undefined/null/빈 문자열) null로 저장하고,
// 값이 있으면 0 이상의 정수만 허용한다. 잘못된 값은 오류로 막는다.
function parseOptionalKrw(value: unknown, context: z.RefinementCtx) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "number" && isValidKrwInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
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
    message: krwError,
  });

  return z.NEVER;
}

export const productFormSchema = productIdentitySchema.extend({
  spec: productSpecSchema,
  defaultUnitPrice: z.unknown().transform(parseOptionalKrw),
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
