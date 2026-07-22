export type InventorySaveReceiptEntry = {
  productId: string;
  productName: string;
  quantityBefore: number | null;
  quantityAfter: number | null;
  quantityChanged: boolean;
  plannedUnitPriceChanged: boolean;
  reasonChanged: boolean;
  isNew: boolean;
};

type BaselineItem = {
  productId: string;
  productName: string;
  currentQuantity: number | null;
  plannedUnitPrice: number | null;
  adjustmentReason: string;
};

type SubmittedItem = {
  productId: string;
  productName?: string;
  currentQuantity: string | number | null;
  plannedUnitPrice?: string | number | null;
  adjustmentReason?: string | null;
};

function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildInventorySaveReceipt(input: {
  baselineItems: BaselineItem[];
  submittedItems: SubmittedItem[];
  addedProductIds: ReadonlySet<string>;
}) {
  const baselineByProductId = new Map(
    input.baselineItems.map((item) => [item.productId, item]),
  );
  const entries: InventorySaveReceiptEntry[] = [];

  for (const submitted of input.submittedItems) {
    const baseline = baselineByProductId.get(submitted.productId);
    const isNew = input.addedProductIds.has(submitted.productId);
    const quantityAfter = toNumber(submitted.currentQuantity);
    const plannedUnitPriceAfter = toNumber(submitted.plannedUnitPrice);
    const quantityChanged =
      isNew || quantityAfter !== (baseline?.currentQuantity ?? null);
    const plannedUnitPriceChanged =
      submitted.plannedUnitPrice !== undefined &&
      plannedUnitPriceAfter !== (baseline?.plannedUnitPrice ?? null);
    const reasonChanged =
      (submitted.adjustmentReason ?? "").trim() !==
      (baseline?.adjustmentReason ?? "").trim();

    if (
      !isNew &&
      !quantityChanged &&
      !plannedUnitPriceChanged &&
      !reasonChanged
    ) {
      continue;
    }

    entries.push({
      productId: submitted.productId,
      productName:
        baseline?.productName ?? submitted.productName ?? submitted.productId,
      quantityBefore: baseline?.currentQuantity ?? null,
      quantityAfter,
      quantityChanged,
      plannedUnitPriceChanged,
      reasonChanged,
      isNew,
    });
  }

  return { entries };
}
