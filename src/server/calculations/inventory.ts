const MAX_INVENTORY_INTEGER = 2_147_483_647;

function isValidInventoryInteger(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value >= 0;
}

export function calculateInventoryAmount(
  quantity: number | null,
  unitPrice: number | null,
) {
  if (
    !isValidInventoryInteger(quantity) ||
    !isValidInventoryInteger(unitPrice)
  ) {
    return null;
  }

  const amount = quantity * unitPrice;

  if (!Number.isSafeInteger(amount) || amount > MAX_INVENTORY_INTEGER) {
    return null;
  }

  return amount;
}
