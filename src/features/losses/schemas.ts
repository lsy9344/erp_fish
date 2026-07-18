import { z } from "zod";

import {
  isNonNegativeDecimalInRange,
  isNonNegativeIntegerInRange,
  parseRequiredNonNegativeDecimal,
  parseRequiredNonNegativeInteger,
  toFieldErrors,
} from "../../lib/validation.ts";
import { recoveredAmountError } from "./amount.ts";
import { lossTerms } from "./terms.ts";

const productError = "품목을 선택해 주세요.";
const lossTypeError = "손실 유형을 선택해 주세요.";
const quantityError = lossTerms.quantityInvalid;
const reasonError = lossTerms.reasonRequired;
const closingDateError = "영업일을 확인해 주세요.";
const ledgerVersionError = "장부 상태를 확인해 주세요.";

function parseRequiredInteger(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
) {
  return parseRequiredNonNegativeInteger(value, context, errorMessage);
}

function parseRequiredQuantity(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
) {
  if (value === null) {
    return null;
  }

  return parseRequiredNonNegativeDecimal(value, context, errorMessage);
}

const requiredIdSchema = (message: string) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, message));

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

const ledgerLossItemSchema = z.object({
  id: z
    .unknown()
    .transform((value) => (typeof value === "string" ? value.trim() : "")),
  productId: requiredIdSchema(productError),
  ledgerInputCodeId: requiredIdSchema(lossTypeError),
  quantity: z
    .unknown()
    .transform((value, context) =>
      parseRequiredQuantity(value, context, quantityError),
    ),
  recoveredAmount: z
    .unknown()
    .transform((value, context) =>
      parseRequiredInteger(value, context, recoveredAmountError),
    ),
  reason: z.unknown().transform((value, context) => {
    if (typeof value === "string") {
      const trimmed = value.trim();

      if (trimmed.length > 0 && trimmed.length <= 500) {
        return trimmed;
      }
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: reasonError,
    });

    return z.NEVER;
  }),
});

const ledgerLossesContextSchema = z.object({
  storeId: requiredIdSchema("지점을 확인해 주세요."),
  ledgerId: requiredIdSchema("장부를 확인해 주세요."),
  closingDate: closingDateSchema,
  version: versionSchema,
});

export const ledgerLossesStoreAccessSchema = z.object({
  storeId: requiredIdSchema("지점을 확인해 주세요."),
});

export type LedgerLossesStoreAccessInput = z.infer<
  typeof ledgerLossesStoreAccessSchema
>;

export const ledgerLossesSchema = ledgerLossesContextSchema
  .extend({
    losses: z.array(ledgerLossItemSchema),
  })
  .superRefine((value, context) => {
    value.losses.forEach((loss, index) => {
      if (loss.quantity === null && !loss.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: quantityError,
          path: ["losses", index, "quantity"],
        });
      }

      if (
        typeof loss.quantity !== "number" ||
        typeof loss.recoveredAmount !== "number" ||
        !isNonNegativeDecimalInRange(loss.quantity) ||
        !isNonNegativeIntegerInRange(loss.recoveredAmount)
      ) {
        return;
      }

      if (loss.quantity === 0 && loss.recoveredAmount === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: lossTerms.positiveValueRequired,
          path: ["losses", index, "quantity"],
        });
      }
    });
  });

export type LedgerLossesInput = z.infer<typeof ledgerLossesSchema>;
export { toFieldErrors };
