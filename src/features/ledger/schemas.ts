import { z } from "zod";

import {
  isNonNegativeIntegerInRange,
  parseOptionalNonNegativeInteger,
  parseRequiredNonNegativeInteger,
  toFieldErrors,
} from "../../lib/validation.ts";

const totalSalesAmountError = "총매출은 0원 이상의 정수여야 합니다.";
const cashAmountError = "현금은 0원 이상의 정수여야 합니다.";
const cardAmountError = "카드는 0원 이상의 정수여야 합니다.";
const otherPaymentAmountError = "기타 결제수단은 0원 이상의 정수여야 합니다.";
const expenseCodeError = "비용 항목을 선택해 주세요.";
const expenseAmountError = "비용 금액은 0원 이상의 정수여야 합니다.";
const expenseMemoError = "메모는 0~500자 사이여야 합니다.";
const purchaseProductNameError = "품목명을 입력해 주세요.";
const purchaseProductCategoryError = "구분을 입력해 주세요.";
const purchaseProductSpecError = "규격을 입력해 주세요.";
const purchaseUnitPriceError = "단가는 0원 이상의 정수여야 합니다.";
const purchaseQuantityError = "수량은 0 이상의 정수여야 합니다.";
const purchaseAmountError = "매입금액은 저장 가능한 범위 이하여야 합니다.";
const workerCountError = "근무인원은 0 이상의 정수여야 합니다.";
const closingDateError = "영업일을 확인해 주세요.";
const ledgerVersionError = "장부 상태를 확인해 주세요.";
const authorDisplayNameError = "작성자 표시명은 50자 이하여야 합니다.";

function parseRequiredKrwAmount(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
) {
  return parseRequiredNonNegativeInteger(value, context, errorMessage);
}

function parseOptionalKrwAmount(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
) {
  return parseOptionalNonNegativeInteger(value, context, errorMessage);
}

function parseOptionalMemo(value: unknown, context: z.RefinementCtx) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const memo = value.trim();

    if (memo === "") {
      return null;
    }

    if (memo.length <= 500) {
      return memo;
    }
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: expenseMemoError,
  });

  return z.NEVER;
}

const salesPaymentStoreSchema = z
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

export const ledgerOpenSchema = z.object({
  storeId: salesPaymentStoreSchema,
  closingDate: closingDateSchema,
});

export const ledgerStoreAccessSchema = z.object({
  storeId: salesPaymentStoreSchema,
});

export const ledgerMutationContextSchema = ledgerOpenSchema.extend({
  ledgerId: ledgerIdSchema,
  version: versionSchema,
});

export type LedgerStoreAccessInput = z.infer<typeof ledgerStoreAccessSchema>;

export const ledgerAuthorDisplayNameSchema = z
  .unknown()
  .transform((value, context) => {
    if (value === "" || value === null || value === undefined) {
      return null;
    }

    if (typeof value === "string") {
      const displayName = value.trim();

      if (displayName === "") {
        return null;
      }

      if (displayName.length <= 50) {
        return displayName;
      }
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: authorDisplayNameError,
    });

    return z.NEVER;
  });

export const ledgerSalesPaymentSchema = ledgerMutationContextSchema.extend({
  authorDisplayName: ledgerAuthorDisplayNameSchema,
  totalSalesAmount: z
    .unknown()
    .transform((value, context) =>
      parseRequiredKrwAmount(value, context, totalSalesAmountError),
    ),
  cashAmount: z
    .unknown()
    .transform((value, context) =>
      parseRequiredKrwAmount(value, context, cashAmountError),
    ),
  cardAmount: z
    .unknown()
    .transform((value, context) =>
      parseRequiredKrwAmount(value, context, cardAmountError),
    ),
  otherPaymentAmount: z
    .unknown()
    .transform((value, context) =>
      parseRequiredKrwAmount(value, context, otherPaymentAmountError),
    ),
});

export type LedgerSalesPaymentInput = z.infer<typeof ledgerSalesPaymentSchema>;

const ledgerExpenseItemSchema = z.object({
  ledgerInputCodeId: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, expenseCodeError)),
  amount: z
    .unknown()
    .transform((value, context) =>
      parseRequiredKrwAmount(value, context, expenseAmountError),
    ),
  memo: z
    .unknown()
    .transform((value, context) => parseOptionalMemo(value, context)),
});

export const ledgerExpenseSchema = ledgerMutationContextSchema.extend({
  expenses: z.array(ledgerExpenseItemSchema),
});

export type LedgerExpensesInput = z.infer<typeof ledgerExpenseSchema>;

const ledgerPurchaseItemSchema = z.object({
  id: z
    .unknown()
    .transform((value) => (typeof value === "string" ? value.trim() : "")),
  sourceType: z.preprocess(
    (value) =>
      value === "" || value === null || value === undefined ? "MANUAL" : value,
    z.enum(["MANUAL", "ECOUNT_UPLOAD"]),
  ),
  productId: z
    .unknown()
    .transform((value) =>
      typeof value === "string" && value.trim() ? value.trim() : null,
    ),
  purchaseStandardId: z
    .unknown()
    .transform((value) =>
      typeof value === "string" && value.trim() ? value.trim() : null,
    ),
  productName: z
    .unknown()
    .transform((value) => (typeof value === "string" ? value.trim() : "")),
  productCategory: z
    .unknown()
    .transform((value) => (typeof value === "string" ? value.trim() : "")),
  productSpec: z
    .unknown()
    .transform((value) => (typeof value === "string" ? value.trim() : "")),
  referenceInfo: z
    .unknown()
    .transform((value) =>
      typeof value === "string" && value.trim() ? value.trim() : null,
    ),
  unitPrice: z
    .unknown()
    .transform((value, context) =>
      parseRequiredKrwAmount(value, context, purchaseUnitPriceError),
    ),
  quantity: z
    .unknown()
    .transform((value, context) =>
      parseRequiredKrwAmount(value, context, purchaseQuantityError),
    ),
});

export const ledgerPurchaseSchema = z
  .object({
    storeId: salesPaymentStoreSchema,
    ledgerId: ledgerIdSchema,
    closingDate: closingDateSchema,
    version: versionSchema,
    purchases: z.array(ledgerPurchaseItemSchema),
  })
  .superRefine((value, context) => {
    value.purchases.forEach((purchase, index) => {
      if (
        !purchase.productId &&
        !purchase.purchaseStandardId &&
        !purchase.productName
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: purchaseProductNameError,
          path: ["purchases", index, "productName"],
        });
      }

      if (
        !purchase.productId &&
        !purchase.purchaseStandardId &&
        !purchase.productCategory
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: purchaseProductCategoryError,
          path: ["purchases", index, "productCategory"],
        });
      }

      if (
        !purchase.productId &&
        !purchase.purchaseStandardId &&
        !purchase.productSpec
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: purchaseProductSpecError,
          path: ["purchases", index, "productSpec"],
        });
      }

      if (
        typeof purchase.unitPrice !== "number" ||
        typeof purchase.quantity !== "number" ||
        !isNonNegativeIntegerInRange(purchase.unitPrice) ||
        !isNonNegativeIntegerInRange(purchase.quantity)
      ) {
        return;
      }

      const amount = purchase.unitPrice * purchase.quantity;

      if (!isNonNegativeIntegerInRange(amount)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: purchaseAmountError,
          path: ["purchases", index, "quantity"],
        });
      }
    });
  });

export type LedgerPurchasesInput = z.infer<typeof ledgerPurchaseSchema>;

export const ledgerWorkInfoSchema = ledgerMutationContextSchema.extend({
  workerCount: z
    .unknown()
    .transform((value, context) =>
      parseOptionalKrwAmount(value, context, workerCountError),
    ),
  workMemo: z
    .unknown()
    .transform((value, context) => parseOptionalMemo(value, context)),
});

export type LedgerWorkInfoInput = z.infer<typeof ledgerWorkInfoSchema>;

export const ledgerSubmitSchema = ledgerMutationContextSchema;

export type LedgerSubmitInput = z.infer<typeof ledgerSubmitSchema>;
export { toFieldErrors };
