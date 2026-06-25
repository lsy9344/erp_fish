import { z } from "zod";

import {
  parseOptionalNonNegativeInteger,
  parseRequiredNonNegativeInteger,
  toFieldErrors,
} from "../../lib/validation.ts";

const productError = "품목을 확인해 주세요.";
const inventoryIntegerError = "재고 수량은 0 이상의 정수여야 합니다.";
const actualQuantityError = "실제 재고 수량은 0 이상의 정수여야 합니다.";
const closingDateError = "영업일을 확인해 주세요.";
const ledgerVersionError = "장부 상태를 확인해 주세요.";

function parseOptionalInventoryInteger(
  value: unknown,
  context: z.RefinementCtx,
) {
  return parseOptionalNonNegativeInteger(value, context, inventoryIntegerError);
}

function parseRequiredInventoryInteger(
  value: unknown,
  context: z.RefinementCtx,
) {
  return parseRequiredNonNegativeInteger(value, context, actualQuantityError);
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
      parseOptionalInventoryInteger(value, context),
    ),
  quantity: z
    .unknown()
    .transform((value, context) =>
      parseOptionalInventoryInteger(value, context),
    ),
});

export const ledgerInventorySchema = ledgerMutationContextSchema.extend({
  items: z.array(ledgerInventoryItemSchema),
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
        parseRequiredInventoryInteger(value, context),
      ),
    reason: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1, "바꾼 이유를 입력해 주세요.")),
  });

export type LedgerInventoryInput = z.infer<typeof ledgerInventorySchema>;
export type LedgerInventoryAdjustmentInput = z.infer<
  typeof ledgerInventoryAdjustmentSchema
>;
export { toFieldErrors };
