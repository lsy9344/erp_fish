import { roundToTwoDecimals } from "../../lib/validation.ts";

const MAX_KRW_INTEGER = 2_147_483_647;
const MAX_INVENTORY_QUANTITY = 9_999_999_999.99;

function hasAtMostTwoDecimals(value: number) {
  const scaled = value * 100;

  return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

function isValidInventoryQuantity(value: number | null): value is number {
  return (
    value !== null &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_INVENTORY_QUANTITY &&
    hasAtMostTwoDecimals(value)
  );
}

function isValidKrwInteger(value: number | null): value is number {
  return (
    value !== null &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_KRW_INTEGER
  );
}

export function calculateInventoryAmount(
  quantity: number | null,
  unitPrice: number | null,
) {
  if (
    !isValidInventoryQuantity(quantity) ||
    !isValidKrwInteger(unitPrice)
  ) {
    return null;
  }

  const amount = Math.round(quantity * unitPrice);

  if (!Number.isSafeInteger(amount) || amount > MAX_KRW_INTEGER) {
    return null;
  }

  return amount;
}

export function calculateSystemInventoryQuantity({
  previousQuantity,
  purchasedQuantity,
  lossQuantity = 0,
}: {
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity?: number;
}) {
  if (
    !isValidInventoryQuantity(previousQuantity) ||
    !isValidInventoryQuantity(purchasedQuantity) ||
    !isValidInventoryQuantity(lossQuantity)
  ) {
    return null;
  }

  const quantity = roundToTwoDecimals(
    previousQuantity + purchasedQuantity - lossQuantity,
  );

  if (
    !hasAtMostTwoDecimals(quantity) ||
    quantity < 0 ||
    quantity > MAX_INVENTORY_QUANTITY
  ) {
    return null;
  }

  return quantity;
}

export type LossSummaryInput = {
  productId: string;
  productName: string;
  quantity: number;
  amount: number;
};

export type LossSignalThresholds = {
  quantity?: number | null;
  amount?: number | null;
};

export function summarizeLossItems(items: LossSummaryInput[]) {
  const byProductMap = new Map<string, LossSummaryInput>();
  let totalQuantity = 0;
  let totalAmount = 0;

  for (const item of items) {
    totalQuantity += item.quantity;
    totalAmount += item.amount;

    const current = byProductMap.get(item.productId);

    if (current) {
      current.quantity += item.quantity;
      current.amount += item.amount;
      continue;
    }

    byProductMap.set(item.productId, { ...item });
  }

  return {
    totalQuantity,
    totalAmount,
    byProduct: [...byProductMap.values()],
  };
}

export function getLossSignalCandidates(
  items: LossSummaryInput[],
  thresholds: LossSignalThresholds,
) {
  const quantityThreshold = thresholds.quantity ?? null;
  const amountThreshold = thresholds.amount ?? null;

  return items
    .map((item) => {
      const exceededQuantity =
        quantityThreshold !== null && item.quantity > quantityThreshold;
      const exceededAmount =
        amountThreshold !== null && item.amount > amountThreshold;

      return {
        ...item,
        exceededQuantity,
        exceededAmount,
      };
    })
    .filter((item) => item.exceededQuantity || item.exceededAmount);
}

export function calculateInventoryAdjustment({
  beforeQuantity,
  beforeAmount,
  afterQuantity,
  unitPrice,
}: {
  beforeQuantity: number;
  beforeAmount: number;
  afterQuantity: number;
  unitPrice: number;
}) {
  const afterAmount = calculateInventoryAmount(afterQuantity, unitPrice);

  if (afterAmount === null) {
    return null;
  }

  const differenceQuantity = roundToTwoDecimals(
    afterQuantity - beforeQuantity,
  );
  const differenceAmount = afterAmount - beforeAmount;

  if (
    !Number.isFinite(differenceQuantity) ||
    !Number.isSafeInteger(differenceAmount)
  ) {
    return null;
  }

  return {
    beforeQuantity,
    beforeAmount,
    afterQuantity,
    afterAmount,
    differenceQuantity,
    differenceAmount,
  };
}
