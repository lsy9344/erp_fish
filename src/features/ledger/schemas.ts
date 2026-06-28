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
const plannedUnitPriceError =
  "오늘 팔 가격(예상)은 0원 이상의 정수여야 합니다.";
const plannedUnitPriceConflictError =
  "같은 품목의 오늘 팔 가격은 하루에 하나만 입력해 주세요.";
const workerCountError = "근무인원은 0 이상의 정수여야 합니다.";
const laborWorkerNameError = "직원명을 1~50자로 입력해 주세요.";
const laborAmountError = "급여 금액은 0원 이상의 정수여야 합니다.";
const laborAmountForbiddenError =
  "급여 금액은 본사만 입력할 수 있습니다. 지점장은 근무자만 선택해 주세요.";
const laborMemoError = "메모는 0~500자 사이여야 합니다.";
const closingDateError = "영업일을 확인해 주세요.";
const ledgerVersionError = "장부 상태를 확인해 주세요.";
const authorDisplayNameError = "작성자 표시명은 50자 이하여야 합니다.";
const authorDisplayNameRequiredError = "작성자 표시명을 입력해 주세요.";

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

export const ledgerAuthorDisplayNameSchema = z
  .unknown()
  .transform((value, context) => {
    if (value === "" || value === null || value === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: authorDisplayNameRequiredError,
      });

      return z.NEVER;
    }

    if (typeof value === "string") {
      const displayName = value.trim();

      if (displayName === "") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: authorDisplayNameRequiredError,
        });

        return z.NEVER;
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
  // "carryover" = 전일 이월돼 오늘 팔린 품목 행(매입 아님). 판매 예정가만 저장하고
  // ledgerPurchaseItem으로는 저장하지 않는다. 빈 값/누락은 일반 매입 행으로 본다.
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
      parseRequiredKrwAmount(value, context, purchaseQuantityError),
    ),
  // 3단계 매입 화면에 통합한 "오늘 팔 가격(예상)". 선택값이라 빈 값은 "계획 없음"(null)으로
  // 해석하고, 값이 있으면 0원 이상의 정수만 허용한다. 저장은 productId가 있는 행만 대상이다.
  plannedUnitPrice: z
    .unknown()
    .transform((value, context) =>
      parseOptionalKrwAmount(value, context, plannedUnitPriceError),
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

    // 같은 품목의 "오늘 팔 가격(예상)"은 하루 1개 값만 허용한다. 같은 productId의 여러 행에
    // 서로 다른 0 이상 값이 입력되면 충돌이므로 해당 행마다 필드 오류를 표시한다.
    const plannedPriceByProductId = new Map<string, number>();
    value.purchases.forEach((purchase) => {
      if (purchase.productId && typeof purchase.plannedUnitPrice === "number") {
        if (!plannedPriceByProductId.has(purchase.productId)) {
          plannedPriceByProductId.set(
            purchase.productId,
            purchase.plannedUnitPrice,
          );
        }
      }
    });
    value.purchases.forEach((purchase, index) => {
      if (
        purchase.productId &&
        typeof purchase.plannedUnitPrice === "number" &&
        plannedPriceByProductId.get(purchase.productId) !==
          purchase.plannedUnitPrice
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: plannedUnitPriceConflictError,
          path: ["purchases", index, "plannedUnitPrice"],
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

export const storeManagerLedgerLaborSchema = ledgerMutationContextSchema.extend({
  labor: z.array(storeManagerLaborItemSchema),
});

export type StoreManagerLedgerLaborInput = z.infer<
  typeof storeManagerLedgerLaborSchema
>;

export const ledgerSubmitSchema = ledgerMutationContextSchema;

export type LedgerSubmitInput = z.infer<typeof ledgerSubmitSchema>;
export { toFieldErrors };
