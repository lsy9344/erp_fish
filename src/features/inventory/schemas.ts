import { z } from "zod";

import {
  parseOptionalNonNegativeInteger,
  parseOptionalNonNegativeDecimal,
  parseRequiredNonNegativeDecimal,
  toFieldErrors,
} from "../../lib/validation.ts";

const productError = "품목을 확인해 주세요.";
const inventoryQuantityError =
  "재고 수량은 0 이상이고 소수점 첫째 자리까지 입력할 수 있습니다.";
const storeInventoryQuantityError =
  "재고 수량은 0 이상이고 소수점 둘째 자리까지 입력할 수 있습니다.";
const actualQuantityError =
  "실제 재고 수량은 0 이상이고 소수점 첫째 자리까지 입력할 수 있습니다.";
const closingDateError = "영업일을 확인해 주세요.";
const ledgerVersionError = "장부 상태를 확인해 주세요.";
const inventoryUnitPriceError = "매입단가는 0원 이상의 정수여야 합니다.";
const plannedUnitPriceError = "판매계획가는 0원 이상의 정수여야 합니다.";
const maxStoreInventoryQuantity = 9_999_999_999.99;

function parseStoreInventoryQuantity(
  value: unknown,
  context: z.RefinementCtx,
) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+(?:\.\d{1,2})?$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  const scaled = parsed * 100;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;

  if (
    Number.isFinite(parsed) &&
    parsed >= 0 &&
    parsed <= maxStoreInventoryQuantity &&
    Math.abs(scaled - Math.round(scaled)) <= tolerance
  ) {
    return Math.round(scaled) / 100;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: storeInventoryQuantityError,
  });

  return z.NEVER;
}

function parseOptionalInventoryQuantity(
  value: unknown,
  context: z.RefinementCtx,
) {
  return parseOptionalNonNegativeDecimal(
    value,
    context,
    inventoryQuantityError,
  );
}

function parseRequiredInventoryQuantity(
  value: unknown,
  context: z.RefinementCtx,
) {
  return parseRequiredNonNegativeDecimal(value, context, actualQuantityError);
}

const storeSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1, "지점을 확인해 주세요."));

const ledgerIdSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1, "장부를 확인해 주세요."));

const closingDateSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, closingDateError));

const versionSchema = z.unknown().transform((value, context) => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;

  if (Number.isSafeInteger(parsed) && parsed > 0) {
    return parsed;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: ledgerVersionError,
  });

  return z.NEVER;
});

const ledgerMutationContextSchema = z.object({
  storeId: storeSchema,
  ledgerId: ledgerIdSchema,
  closingDate: closingDateSchema,
  version: versionSchema,
});

export const ledgerInventoryStoreAccessSchema = z.object({
  storeId: storeSchema,
});

export type LedgerInventoryStoreAccessInput = z.infer<
  typeof ledgerInventoryStoreAccessSchema
>;

const ledgerInventoryItemSchema = z.object({
  productId: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, productError)),
  currentQuantity: z
    .unknown()
    .transform((value, context) =>
      parseOptionalInventoryQuantity(value, context),
    ),
  quantity: z
    .unknown()
    .transform((value, context) =>
      parseOptionalInventoryQuantity(value, context),
    ),
  unitPrice: z
    .unknown()
    .transform((value, context) =>
      parseOptionalNonNegativeInteger(value, context, inventoryUnitPriceError),
    ),
  // 당일재고가 기준재고와 다른 행의 "고친 이유". 지점장이 일반 저장과 함께 보내면 서버가
  // 조정 레코드를 생성한다(단독 본사 전용 조정 액션과 별개로, 지점 실사 차이 사유 입력 경로).
  // 빈 값은 null(사유 없음)로 해석한다.
  adjustmentReason: z
    .unknown()
    .transform((value) =>
      typeof value === "string" && value.trim() ? value.trim() : null,
    ),
});

const ledgerStoreManagerInventoryItemSchema = ledgerInventoryItemSchema.extend({
  currentQuantity: z
    .unknown()
    .transform((value, context) =>
      parseStoreInventoryQuantity(value, context),
    ),
  quantity: z
    .unknown()
    .transform((value, context) =>
      parseStoreInventoryQuantity(value, context),
    ),
  plannedUnitPrice: z
    .unknown()
    .transform((value, context) =>
      parseRequiredNonNegativeInteger(value, context, plannedUnitPriceError),
    ),
});

export const ledgerInventorySchema = ledgerMutationContextSchema.extend({
  items: z.array(ledgerInventoryItemSchema),
});

// 지점장 재고 저장만 두 자리 수량과 필수 판매계획가를 받는다. 본사 조정/HQ 저장은
// 기존 ledgerInventorySchema의 한 자리 계약을 그대로 사용한다.
export const ledgerStoreManagerInventorySchema =
  ledgerMutationContextSchema.extend({
    items: z.array(ledgerStoreManagerInventoryItemSchema),
  });

export const ledgerInventoryAdjustmentSchema =
  ledgerMutationContextSchema.extend({
    productId: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, productError)),
    actualQuantity: z
      .unknown()
      .transform((value, context) =>
        parseRequiredInventoryQuantity(value, context),
      ),
    reason: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, "바꾼 이유를 입력해 주세요.")),
  });

export type LedgerInventoryInput = z.infer<typeof ledgerInventorySchema>;
export type LedgerStoreManagerInventoryInput = z.infer<
  typeof ledgerStoreManagerInventorySchema
>;
export type LedgerInventoryAdjustmentInput = z.infer<
  typeof ledgerInventoryAdjustmentSchema
>;
export { toFieldErrors };
