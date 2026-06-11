import { z } from "zod";

const MAX_KRW_INTEGER = 2_147_483_647;

const productError = "품목을 선택해 주세요.";
const lossTypeError = "손실 유형을 선택해 주세요.";
const quantityError = "수량은 0 이상의 정수여야 합니다.";
const amountError = "손실 금액은 0원 이상의 정수여야 합니다.";
const reasonError = "사유/특이사항을 입력해 주세요.";
const closingDateError = "영업일을 확인해 주세요.";
const ledgerVersionError = "장부 상태를 확인해 주세요.";

function isValidInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_KRW_INTEGER;
}

function parseRequiredInteger(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
) {
  if (typeof value === "number" && isValidInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);

      if (isValidInteger(parsed)) {
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

function parseOptionalInteger(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  if (typeof value === "number" && isValidInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);

      if (isValidInteger(parsed)) {
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
      parseRequiredInteger(value, context, quantityError),
    ),
  amount: z
    .unknown()
    .transform((value, context) =>
      parseOptionalInteger(value, context, amountError),
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

export const ledgerLossesSchema = z
  .object({
    storeId: requiredIdSchema("지점을 확인해 주세요."),
    ledgerId: requiredIdSchema("장부를 확인해 주세요."),
    closingDate: closingDateSchema,
    version: versionSchema,
    losses: z.array(ledgerLossItemSchema),
  })
  .superRefine((value, context) => {
    value.losses.forEach((loss, index) => {
      if (
        typeof loss.quantity !== "number" ||
        (loss.amount !== null && typeof loss.amount !== "number") ||
        !isValidInteger(loss.quantity) ||
        (typeof loss.amount === "number" && !isValidInteger(loss.amount))
      ) {
        return;
      }

      if (!loss.id && loss.amount === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: amountError,
          path: ["losses", index, "amount"],
        });
        return;
      }

      if (loss.quantity === 0 && loss.amount === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "수량 또는 손실액 중 하나는 0보다 커야 합니다.",
          path: ["losses", index, "quantity"],
        });
      }
    });
  });

export type LedgerLossesInput = z.infer<typeof ledgerLossesSchema>;

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
