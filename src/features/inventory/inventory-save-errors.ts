type InventoryFieldErrors = Record<string, string[]>;

export type InventoryErrorFocusTarget = {
  productId: string;
  currentIndex: number;
  field: "quantity" | "reason";
};

export function mapInventorySaveErrors(
  errors: InventoryFieldErrors,
  submittedProductIds: readonly string[],
  currentProductIds: readonly string[],
) {
  const fieldErrors: InventoryFieldErrors = {};
  const adjustmentErrors: Record<string, string> = {};
  let firstFocusTarget: InventoryErrorFocusTarget | undefined;

  for (const [key, messages] of Object.entries(errors)) {
    const match =
      /^items\.(\d+)\.(adjustmentReason|currentQuantity|quantity)$/.exec(key);

    if (!match) {
      fieldErrors[key] = messages;
      continue;
    }

    const productId = submittedProductIds[Number(match[1])];
    const currentIndex = productId ? currentProductIds.indexOf(productId) : -1;

    if (!productId || currentIndex < 0 || messages.length === 0) {
      continue;
    }

    const field = match[2] === "adjustmentReason" ? "reason" : "quantity";
    firstFocusTarget ??= { productId, currentIndex, field };

    if (field === "reason") {
      adjustmentErrors[productId] ??= messages[0]!;
      continue;
    }

    const currentKey = `items.${currentIndex}.currentQuantity`;
    fieldErrors[currentKey] = [...(fieldErrors[currentKey] ?? []), ...messages];
  }

  return { fieldErrors, adjustmentErrors, firstFocusTarget };
}
