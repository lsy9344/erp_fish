import { z } from "zod";

const MAX_INVENTORY_INTEGER = 2_147_483_647;
const productError = "품목을 확인해 주세요.";
const inventoryIntegerError = "재고 수량은 0 이상의 정수여야 합니다.";
const actualQuantityError = "실제 재고 수량은 0 이상의 정수여야 합니다.";
const closingDateError = "영업일을 확인해 주세요.";
const ledgerVersionError = "장부 상태를 확인해 주세요.";

function isValidInventoryInteger(value: number) {
  return (
    Number.isSafeInteger(value) && value >= 0 && value <= MAX_INVENTORY_INTEGER
  );
}

function parseOptionalInventoryInteger(
  value: unknown,
  context: z.RefinementCtx,
) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && isValidInventoryInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed === "") {
      return null;
    }

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);

      if (isValidInventoryInteger(parsed)) {
        return parsed;
      }
    }
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: inventoryIntegerError,
  });

  return z.NEVER;
}

function parseRequiredInventoryInteger(
  value: unknown,
  context: z.RefinementCtx,
) {
  if (typeof value === "number" && isValidInventoryInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);

      if (isValidInventoryInteger(parsed)) {
        return parsed;
      }
    }
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: actualQuantityError,
  });

  return z.NEVER;
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
      .pipe(z.string().min(1, "조정 사유를 입력해 주세요.")),
  });

export type LedgerInventoryInput = z.infer<typeof ledgerInventorySchema>;
export type LedgerInventoryAdjustmentInput = z.infer<
  typeof ledgerInventoryAdjustmentSchema
>;

export function toFieldErrors(error: z.ZodError) {
  const result: Record<string, string[]> = {};

  for (const issue of error.issues) {
    if (issue.path.length === 0) {
      continue;
    }

    const path = issue.path.map((segment) => String(segment)).join(".");

    result[path] ??= [];
    result[path].push(issue.message);
  }

  return result;
}
