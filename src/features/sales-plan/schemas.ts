import { z } from "zod";

import {
  parseOptionalNonNegativeInteger,
  parseRequiredNonNegativeInteger,
  toFieldErrors,
} from "../../lib/validation.ts";

const productError = "품목을 선택해 주세요.";
const plannedUnitPriceError = "예상 판매가는 0원 이상의 정수여야 합니다.";
const memoError = "메모는 0~500자 사이여야 합니다.";
const businessDateError = "영업일을 확인해 주세요.";

const requiredIdSchema = (message: string) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, message));

const businessDateSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, businessDateError));

const memoSchema = z.unknown().transform((value, context) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return null;
    }

    if (trimmed.length <= 500) {
      return trimmed;
    }
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: memoError,
  });

  return z.NEVER;
});

const salesPricePlanItemSchema = z.object({
  productId: requiredIdSchema(productError),
  plannedUnitPrice: z
    .unknown()
    .transform((value, context) =>
      parseRequiredNonNegativeInteger(value, context, plannedUnitPriceError),
    ),
  memo: memoSchema,
});

export const salesPricePlanStoreAccessSchema = z.object({
  storeId: requiredIdSchema("지점을 확인해 주세요."),
});

export type SalesPricePlanStoreAccessInput = z.infer<
  typeof salesPricePlanStoreAccessSchema
>;

export const salesPricePlanSchema = z.object({
  storeId: requiredIdSchema("지점을 확인해 주세요."),
  businessDate: businessDateSchema,
  plans: z.array(salesPricePlanItemSchema),
});

export type SalesPricePlanInput = z.infer<typeof salesPricePlanSchema>;

// 빈 가격 입력은 "계획 없음"으로 해석해 행을 저장하지 않는다(선택적 계획).
export function parseOptionalPlannedUnitPrice(
  value: unknown,
  context: z.RefinementCtx,
) {
  return parseOptionalNonNegativeInteger(value, context, plannedUnitPriceError);
}

export { toFieldErrors };
