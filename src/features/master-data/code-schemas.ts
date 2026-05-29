import { z } from "zod";

export const LEDGER_INPUT_CODE_GROUPS = [
  { value: "PAYMENT_METHOD", label: "결제수단" },
  { value: "EXPENSE_ITEM", label: "비용 항목" },
  { value: "LOSS_TYPE", label: "손실 유형" },
] as const;

export type LedgerInputCodeGroupValue =
  (typeof LEDGER_INPUT_CODE_GROUPS)[number]["value"];

export const LEDGER_INPUT_CODE_GROUP_VALUES = LEDGER_INPUT_CODE_GROUPS.map(
  (group) => group.value,
);

const MAX_DB_INTEGER = 2_147_483_647;
const displayOrderError = "표시 순서는 0 이상의 정수여야 합니다.";

function isLedgerInputCodeGroup(
  value: string,
): value is LedgerInputCodeGroupValue {
  return LEDGER_INPUT_CODE_GROUP_VALUES.includes(
    value as LedgerInputCodeGroupValue,
  );
}

function isValidDisplayOrder(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_DB_INTEGER;
}

function parseOptionalDisplayOrder(value: unknown, context: z.RefinementCtx) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "number" && isValidDisplayOrder(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return null;
    }

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);

      if (isValidDisplayOrder(parsed)) {
        return parsed;
      }
    }
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: displayOrderError,
  });

  return z.NEVER;
}

const ledgerInputCodeGroupSchema = z
  .string()
  .transform((value) => value.trim())
  .refine(isLedgerInputCodeGroup, "코드 그룹을 선택해 주세요.");

const ledgerInputCodeNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "코드명을 입력해 주세요.")
      .max(80, "코드명은 80자 이하여야 합니다."),
  );

export const ledgerInputCodeFormSchema = z.object({
  group: ledgerInputCodeGroupSchema,
  name: ledgerInputCodeNameSchema,
  displayOrder: z.unknown().transform(parseOptionalDisplayOrder),
});

export type LedgerInputCodeFormInput = z.infer<
  typeof ledgerInputCodeFormSchema
> & {
  group: LedgerInputCodeGroupValue;
};

export const ledgerInputCodeStatusSchema = z.object({
  isActive: z.boolean(),
});

export type LedgerInputCodeStatusInput = z.infer<
  typeof ledgerInputCodeStatusSchema
>;

export function getLedgerInputCodeGroupLabel(value: LedgerInputCodeGroupValue) {
  return (
    LEDGER_INPUT_CODE_GROUPS.find((group) => group.value === value)?.label ??
    value
  );
}

export function toLedgerInputCodeFieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}
