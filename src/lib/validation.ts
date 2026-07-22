import { z } from "zod";

export const MAX_VALIDATION_INTEGER = 2_147_483_647;
export const MAX_VALIDATION_DECIMAL = 9_999_999_999.9;
export const MAX_VALIDATION_TWO_DECIMAL = 9_999_999_999.99;

export function isNonNegativeIntegerInRange(
  value: number,
  max = MAX_VALIDATION_INTEGER,
) {
  return Number.isSafeInteger(value) && value >= 0 && value <= max;
}

export function roundToTwoDecimals(value: number) {
  const rounded = Math.round(value * 100) / 100;

  return Object.is(rounded, -0) ? 0 : rounded;
}

export function roundToOneDecimal(value: number) {
  const rounded = Math.round(value * 10) / 10;

  return Object.is(rounded, -0) ? 0 : rounded;
}

type StoredDecimalQuantity = {
  quantity: number;
  identity: string;
};

export function consumeStoredDecimalQuantity(
  id: string,
  value: number | null,
  identity: string,
  storedQuantityById: ReadonlyMap<string, StoredDecimalQuantity>,
  consumedStoredIds: Set<string>,
) {
  const stored = storedQuantityById.get(id);

  if (!stored) {
    return value;
  }

  if (consumedStoredIds.has(id)) {
    return null;
  }

  consumedStoredIds.add(id);

  if (value !== null) {
    return value;
  }

  return stored.identity === identity ? stored.quantity : null;
}

type PurchaseQuantityIdentityInput = {
  productId: string | null;
  purchaseStandardId: string | null;
  sourceType: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  referenceInfo: string | null;
};

export function getPurchaseQuantityIdentity(
  purchase: PurchaseQuantityIdentityInput,
) {
  return JSON.stringify([
    purchase.productId,
    purchase.purchaseStandardId,
    purchase.sourceType,
    purchase.productName,
    purchase.productCategory,
    purchase.productSpec,
    purchase.referenceInfo,
  ]);
}

type LossQuantityIdentityInput = {
  productId: string;
  ledgerInputCodeId: string;
};

export function getLossQuantityIdentity(loss: LossQuantityIdentityInput) {
  return JSON.stringify([loss.productId, loss.ledgerInputCodeId]);
}

export function consumeStoredPurchaseQuantity(
  id: string,
  value: number | null,
  purchase: PurchaseQuantityIdentityInput,
  storedQuantityById: ReadonlyMap<string, StoredDecimalQuantity>,
  consumedStoredIds: Set<string>,
) {
  return consumeStoredDecimalQuantity(
    id,
    value,
    getPurchaseQuantityIdentity(purchase),
    storedQuantityById,
    consumedStoredIds,
  );
}

export function consumeStoredLossQuantity(
  id: string,
  value: number | null,
  loss: LossQuantityIdentityInput,
  storedQuantityById: ReadonlyMap<string, StoredDecimalQuantity>,
  consumedStoredIds: Set<string>,
) {
  return consumeStoredDecimalQuantity(
    id,
    value,
    getLossQuantityIdentity(loss),
    storedQuantityById,
    consumedStoredIds,
  );
}

export function validatePurchaseAmount(index: number, amount: number | null) {
  return amount === null
    ? {
        ok: false as const,
        fieldErrors: {
          [`purchases.${index}.quantity`]: [
            "매입금액은 저장 가능한 범위 이하여야 합니다.",
          ],
        },
      }
    : { ok: true as const, amount };
}

export function isNonNegativeDecimalInRange(
  value: number,
  max = MAX_VALIDATION_DECIMAL,
) {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    return false;
  }

  const scaled = value * 10;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;

  return Math.abs(scaled - Math.round(scaled)) <= tolerance;
}

export function isNonNegativeTwoDecimalInRange(
  value: number,
  max = MAX_VALIDATION_TWO_DECIMAL,
) {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    return false;
  }

  const scaled = value * 100;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;

  return Math.abs(scaled - Math.round(scaled)) <= tolerance;
}

export function parseRequiredNonNegativeInteger(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
  max = MAX_VALIDATION_INTEGER,
) {
  if (typeof value === "number" && isNonNegativeIntegerInRange(value, max)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);

      if (isNonNegativeIntegerInRange(parsed, max)) {
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

export function parseRequiredNonNegativeDecimal(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
  max = MAX_VALIDATION_DECIMAL,
) {
  if (typeof value === "number" && isNonNegativeDecimalInRange(value, max)) {
    return roundToOneDecimal(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d+(?:\.\d)?$/.test(trimmed)) {
      const parsed = Number(trimmed);

      if (isNonNegativeDecimalInRange(parsed, max)) {
        return roundToOneDecimal(parsed);
      }
    }
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: errorMessage,
  });

  return z.NEVER;
}

export function parseRequiredNonNegativeTwoDecimal(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
  max = MAX_VALIDATION_TWO_DECIMAL,
) {
  if (typeof value === "number" && isNonNegativeTwoDecimalInRange(value, max)) {
    return roundToTwoDecimals(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d+(?:\.\d{1,2})?$/.test(trimmed)) {
      const parsed = Number(trimmed);

      if (isNonNegativeTwoDecimalInRange(parsed, max)) {
        return roundToTwoDecimals(parsed);
      }
    }
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: errorMessage,
  });

  return z.NEVER;
}

export function parseOptionalNonNegativeInteger(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
  max = MAX_VALIDATION_INTEGER,
) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return parseRequiredNonNegativeInteger(value, context, errorMessage, max);
}

export function parseOptionalNonNegativeDecimal(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
  max = MAX_VALIDATION_DECIMAL,
) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return parseRequiredNonNegativeDecimal(value, context, errorMessage, max);
}

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
