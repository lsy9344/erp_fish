import { z } from "zod";

const MAX_KRW_INTEGER = 2_147_483_647;

const totalSalesAmountError = "총매출은 0원 이상의 정수여야 합니다.";
const cashAmountError = "현금은 0원 이상의 정수여야 합니다.";
const cardAmountError = "카드는 0원 이상의 정수여야 합니다.";
const otherPaymentAmountError = "기타 결제수단은 0원 이상의 정수여야 합니다.";
const expenseCodeError = "비용 항목을 선택해 주세요.";
const expenseAmountError = "비용 금액은 0원 이상의 정수여야 합니다.";
const expenseMemoError = "메모는 0~500자 사이여야 합니다.";
const purchaseProductError = "품목을 선택해 주세요.";
const purchaseStandardError = "매입 기준을 선택해 주세요.";
const purchaseUnitPriceError = "단가는 0원 이상의 정수여야 합니다.";
const purchaseQuantityError = "수량은 0 이상의 정수여야 합니다.";
const purchaseAmountError = "매입금액은 저장 가능한 범위 이하여야 합니다.";
const workerCountError = "근무인원은 0 이상의 정수여야 합니다.";

function isValidKrwInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_KRW_INTEGER;
}

function parseRequiredKrwAmount(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
) {
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
    message: errorMessage,
  });

  return z.NEVER;
}

function parseOptionalKrwAmount(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
) {
  if (value === "" || value === null || value === undefined) {
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
    message: errorMessage,
  });

  return z.NEVER;
}

function parseOptionalMemo(value: unknown, context: z.RefinementCtx) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const memo = value.trim();

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

export const ledgerSalesPaymentSchema = z.object({
  storeId: salesPaymentStoreSchema,
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

export const ledgerExpenseSchema = z.object({
  storeId: salesPaymentStoreSchema,
  expenses: z.array(ledgerExpenseItemSchema),
});

export type LedgerExpensesInput = z.infer<typeof ledgerExpenseSchema>;

const ledgerPurchaseItemSchema = z.object({
  id: z
    .unknown()
    .transform((value) => (typeof value === "string" ? value.trim() : "")),
  productId: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, purchaseProductError)),
  purchaseStandardId: z
    .unknown()
    .transform((value) => (typeof value === "string" ? value.trim() : "")),
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
    purchases: z.array(ledgerPurchaseItemSchema),
  })
  .superRefine((value, context) => {
    value.purchases.forEach((purchase, index) => {
      if (!purchase.id && !purchase.purchaseStandardId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: purchaseStandardError,
          path: ["purchases", index, "purchaseStandardId"],
        });
      }

      if (
        typeof purchase.unitPrice !== "number" ||
        typeof purchase.quantity !== "number" ||
        !isValidKrwInteger(purchase.unitPrice) ||
        !isValidKrwInteger(purchase.quantity)
      ) {
        return;
      }

      const amount = purchase.unitPrice * purchase.quantity;

      if (!isValidKrwInteger(amount)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: purchaseAmountError,
          path: ["purchases", index, "quantity"],
        });
      }
    });
  });

export type LedgerPurchasesInput = z.infer<typeof ledgerPurchaseSchema>;

export const ledgerWorkInfoSchema = z.object({
  storeId: salesPaymentStoreSchema,
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

export const ledgerSubmitSchema = z.object({
  storeId: salesPaymentStoreSchema,
});

export type LedgerSubmitInput = z.infer<typeof ledgerSubmitSchema>;

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
