import type {
  InventoryManualProductOption,
  InventoryStepData,
  InventoryStepLine,
} from "./types";

/**
 * 재고 입력 폼에서 숨길 0재고 행 판정.
 * 전일재고·매입·손실·당일재고가 모두 정확히 0일 때만 숨긴다.
 * 당일재고 null(미입력)은 0으로 취급하지 않는다.
 */
export function isHiddenZeroStockInventoryItem(item: {
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number;
  currentQuantity: number | null;
}) {
  return (
    item.previousQuantity === 0 &&
    item.purchasedQuantity === 0 &&
    item.lossQuantity === 0 &&
    item.currentQuantity === 0
  );
}

function compareManualProductOption(
  left: Pick<
    InventoryManualProductOption,
    "productCategory" | "productName" | "productSpec"
  >,
  right: Pick<
    InventoryManualProductOption,
    "productCategory" | "productName" | "productSpec"
  >,
) {
  return (
    left.productCategory.localeCompare(right.productCategory, "ko") ||
    left.productName.localeCompare(right.productName, "ko") ||
    left.productSpec.localeCompare(right.productSpec, "ko")
  );
}

function toHiddenZeroStockManualOption(
  item: InventoryStepLine,
): InventoryManualProductOption {
  return {
    productId: item.productId,
    productName: item.productName,
    productCategory: item.productCategory,
    productSpec: item.productSpec,
    purchasePrice: item.purchasePrice,
    plannedUnitPrice: item.plannedUnitPrice,
    source: "HIDDEN_ZERO_STOCK",
    restoredItem: item,
  };
}

/**
 * 재고 입력 폼 응답 전용 표시 정책.
 * 내부 조회·감사·저장용 before/after에는 적용하지 않는다.
 */
export function applyInventoryFormDisplayPolicy(
  data: InventoryStepData,
): InventoryStepData {
  const visibleItems: InventoryStepLine[] = [];
  const hiddenOptions: InventoryManualProductOption[] = [];

  for (const item of data.items) {
    if (isHiddenZeroStockInventoryItem(item)) {
      hiddenOptions.push(toHiddenZeroStockManualOption(item));
    } else {
      visibleItems.push(item);
    }
  }

  const visibleProductIds = new Set(visibleItems.map((item) => item.productId));
  const optionByProductId = new Map<string, InventoryManualProductOption>();

  for (const option of data.manualProductOptions) {
    if (visibleProductIds.has(option.productId)) {
      continue;
    }

    optionByProductId.set(option.productId, {
      ...option,
      source: option.source ?? "UNGROUNDED",
    });
  }

  for (const option of hiddenOptions) {
    optionByProductId.set(option.productId, option);
  }

  return {
    ...data,
    items: visibleItems,
    manualProductOptions: [...optionByProductId.values()].sort(
      compareManualProductOption,
    ),
  };
}
