import { z } from "zod";

import {
  parseRequiredNonNegativeInteger,
  toFieldErrors,
} from "../../lib/validation.ts";

const expenseDateError = "지출 일자를 확인해 주세요.";
const categoryError = "지출 분류를 1~80자로 입력해 주세요.";
const amountError = "지출 금액은 0원 이상의 정수여야 합니다.";
const memoError = "메모는 0~500자 사이여야 합니다.";

function parseCategory(value: unknown, context: z.RefinementCtx) {
  if (typeof value === "string") {
    const category = value.trim();

    if (category.length >= 1 && category.length <= 80) {
      return category;
    }
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: categoryError,
  });

  return z.NEVER;
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
    message: memoError,
  });

  return z.NEVER;
}

function parseOptionalStoreId(value: unknown) {
  if (typeof value === "string") {
    const storeId = value.trim();

    if (storeId !== "") {
      return storeId;
    }
  }

  return null;
}

const expenseDateSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, expenseDateError));

const headquartersExpenseIdSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1, "본사 지출 항목을 확인해 주세요."));

const headquartersExpenseFields = {
  expenseDate: expenseDateSchema,
  storeId: z.unknown().transform((value) => parseOptionalStoreId(value)),
  category: z.unknown().transform((value, context) =>
    parseCategory(value, context),
  ),
  amount: z
    .unknown()
    .transform((value, context) =>
      parseRequiredNonNegativeInteger(value, context, amountError),
    ),
  memo: z.unknown().transform((value, context) =>
    parseOptionalMemo(value, context),
  ),
};

export const headquartersExpenseCreateSchema = z.object(
  headquartersExpenseFields,
);

export type HeadquartersExpenseCreateInput = z.infer<
  typeof headquartersExpenseCreateSchema
>;

export const headquartersExpenseUpdateSchema = z.object({
  id: headquartersExpenseIdSchema,
  ...headquartersExpenseFields,
});

export type HeadquartersExpenseUpdateInput = z.infer<
  typeof headquartersExpenseUpdateSchema
>;

export type HeadquartersExpenseAmountSummaryInput = {
  amount: number;
  storeId?: string | null;
};

export type HeadquartersExpenseAmountSummary = {
  totalAmount: number;
  storeAttributedAmount: number;
  unattributedAmount: number;
  count: number;
};

// 본사 지출 합계 집계: 전체 합계와 더불어 지점 귀속분(storeId 존재)과 미귀속분을
// 분리해 P&L/리포트에 별도 라인으로 노출할 수 있도록 한다.
export function summarizeHeadquartersExpenseAmounts(
  expenses: readonly HeadquartersExpenseAmountSummaryInput[],
): HeadquartersExpenseAmountSummary {
  return expenses.reduce<HeadquartersExpenseAmountSummary>(
    (summary, expense) => {
      const amount = Number.isFinite(expense.amount) ? expense.amount : 0;
      const isStoreAttributed =
        typeof expense.storeId === "string" && expense.storeId.length > 0;

      return {
        totalAmount: summary.totalAmount + amount,
        storeAttributedAmount:
          summary.storeAttributedAmount + (isStoreAttributed ? amount : 0),
        unattributedAmount:
          summary.unattributedAmount + (isStoreAttributed ? 0 : amount),
        count: summary.count + 1,
      };
    },
    {
      totalAmount: 0,
      storeAttributedAmount: 0,
      unattributedAmount: 0,
      count: 0,
    },
  );
}

export { toFieldErrors };
