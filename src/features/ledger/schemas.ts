import { z } from "zod";

import {
  isNonNegativeDecimalInRange,
  isNonNegativeIntegerInRange,
  parseRequiredNonNegativeDecimal,
  parseOptionalNonNegativeInteger,
  parseRequiredNonNegativeInteger,
  toFieldErrors,
} from "../../lib/validation.ts";

const totalSalesAmountError = "총매출은 0원 이상의 정수여야 합니다.";
const cashAmountError = "현금은 0원 이상의 정수여야 합니다.";
const cardAmountError = "카드는 0원 이상의 정수여야 합니다.";
const otherPaymentAmountError = "기타 결제수단은 0원 이상의 정수여야 합니다.";
const expenseCodeError = "지출 항목을 선택해 주세요.";
const expenseAmountError = "지출 금액은 0원 이상의 정수여야 합니다.";
const expenseMemoError = "메모는 0~500자 사이여야 합니다.";
const purchaseProductNameError = "품목명을 입력해 주세요.";
const purchaseProductCategoryError = "구분을 입력해 주세요.";
const purchaseProductSpecError = "규격을 입력해 주세요.";
const purchaseUnitPriceError = "단가는 0원 이상의 정수여야 합니다.";
const purchaseQuantityError =
  "수량은 0 이상이고 소수점 첫째 자리까지 입력할 수 있습니다.";
const purchaseAmountError = "매입금액은 저장 가능한 범위 이하여야 합니다.";
const workerCountError = "근무인원은 0 이상의 정수여야 합니다.";
const laborWorkerNameError = "직원명을 1~50자로 입력해 주세요.";
const laborAmountError = "급여 금액은 0원 이상의 정수여야 합니다.";
const laborAmountForbiddenError =
  "급여 금액은 본사만 입력할 수 있습니다. 지점장은 근무자만 선택해 주세요.";
const laborMemoError = "메모는 0~500자 사이여야 합니다.";
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

function parseOptionalLaborMemo(value: unknown, context: z.RefinementCtx) {
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
    message: laborMemoError,
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

// 단계 순서 변경(2026-07-02): 작성자 표시명 입력을 1단계 매입 화면으로 옮긴다. 매입 저장은
// 최초 작성자가 없을 때만 기록하고 이후엔 보존하므로, 매입 스키마에서는 선택값으로 받는다.
// 빈 값/누락은 "이번 저장에서 작성자 미변경"(null)으로 본다. 본사 매입 저장 경로도 이 스키마를
// 재사용하는데 authorDisplayName을 보내지 않으므로 선택값이어야 한다.
export const ledgerOptionalAuthorDisplayNameSchema = z
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
  // 단계 순서 변경(2026-07-02): 작성자 표시명 입력은 1단계 매입으로 옮겨졌다. 매출 저장은
  // 더 이상 작성자를 UI에서 받지 않으므로 선택값으로 둔다(최초 작성자 보존 정책은 서버에서 유지).
  authorDisplayName: ledgerOptionalAuthorDisplayNameSchema,
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
  // 구 클라이언트가 보내는 carryover 가상 행이 실제 매입으로 저장되지 않도록 구분한다.
  // 빈 값/누락은 일반 매입 행으로 본다.
  kind: z.preprocess(
    (value) => (value === "carryover" ? "carryover" : "purchase"),
    z.enum(["purchase", "carryover"]),
  ),
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
      value === null
        ? null
        : parseRequiredNonNegativeDecimal(
            value,
            context,
            purchaseQuantityError,
          ),
    ),
});

export const ledgerPurchaseSchema = z
  .object({
    storeId: salesPaymentStoreSchema,
    ledgerId: ledgerIdSchema,
    closingDate: closingDateSchema,
    version: versionSchema,
    // 1단계 매입 화면에서 받는 최초 작성자 표시명(선택). 최초 저장 때만 기록되고 이후 보존된다.
    authorDisplayName: ledgerOptionalAuthorDisplayNameSchema,
    purchases: z.array(ledgerPurchaseItemSchema),
  })
  .superRefine((value, context) => {
    value.purchases.forEach((purchase, index) => {
      if (purchase.quantity === null && !purchase.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: purchaseQuantityError,
          path: ["purchases", index, "quantity"],
        });
      }

      if (
        purchase.sourceType === "ECOUNT_UPLOAD" &&
        !purchase.productId &&
        !purchase.purchaseStandardId
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "이카운트 출고/입고 라인은 앱 품목을 선택해 주세요.",
          path: ["purchases", index, "productId"],
        });
      }

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
        !isNonNegativeDecimalInRange(purchase.quantity)
      ) {
        return;
      }

      const amount = Math.round(purchase.unitPrice * purchase.quantity);

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

const ledgerLaborItemSchema = z.object({
  // WO-05(2026-06-22): 급여 행을 직원 마스터(Employee)와 선택적으로 연결한다.
  // 선택하지 않으면 null로 저장되고 직원별 월간 롤업에서 제외된다.
  employeeId: z.unknown().transform((value) => {
    if (typeof value === "string") {
      const employeeId = value.trim();

      if (employeeId.length > 0) {
        return employeeId;
      }
    }

    return null;
  }),
  workerName: z.unknown().transform((value, context) => {
    if (typeof value === "string") {
      const workerName = value.trim();

      if (workerName.length >= 1 && workerName.length <= 50) {
        return workerName;
      }
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: laborWorkerNameError,
    });

    return z.NEVER;
  }),
  amount: z
    .unknown()
    .transform((value, context) =>
      parseRequiredNonNegativeInteger(value, context, laborAmountError),
    ),
  lateMemo: z
    .unknown()
    .transform((value, context) => parseOptionalLaborMemo(value, context)),
  earlyLeaveMemo: z
    .unknown()
    .transform((value, context) => parseOptionalLaborMemo(value, context)),
  specialMemo: z
    .unknown()
    .transform((value, context) => parseOptionalLaborMemo(value, context)),
});

export const ledgerLaborSchema = ledgerMutationContextSchema.extend({
  labor: z.array(ledgerLaborItemSchema),
});

export type LedgerLaborInput = z.infer<typeof ledgerLaborSchema>;

// WO-10(2026-06-28): 급여액은 본사만 등록/수정한다. 지점장 근무 저장은 근무자 명단과
// 메모만 받고, amount 입력은 무시가 아니라 거부한다(조작된 POST로 급여액이 저장되는 경로 차단).
// 금액은 본사가 별도로 관리하고, 지점장 저장 시 기존 amount는 이월(carry-forward)한다.
const storeManagerLaborItemSchema = ledgerLaborItemSchema
  .omit({ amount: true })
  .strict(laborAmountForbiddenError);

export const storeManagerLedgerLaborSchema = ledgerMutationContextSchema.extend(
  {
    labor: z.array(storeManagerLaborItemSchema),
  },
);

export type StoreManagerLedgerLaborInput = z.infer<
  typeof storeManagerLedgerLaborSchema
>;

export const ledgerSubmitSchema = ledgerMutationContextSchema;

export type LedgerSubmitInput = z.infer<typeof ledgerSubmitSchema>;
export { toFieldErrors };
