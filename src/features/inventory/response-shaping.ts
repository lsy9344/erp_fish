import type {
  InventoryStepData,
  StoreManagerInventoryStepData,
} from "./types";

export function shapeStoreManagerInventoryStepData(
  data: InventoryStepData,
): StoreManagerInventoryStepData {
  return {
    ...data,
    // Manual options are rebuilt from an allowlist so item-only fields such as
    // plannedUnitPrice cannot leak through a stale query result or object spread.
    manualProductOptions: data.manualProductOptions.map((option) => ({
      productId: option.productId,
      productName: option.productName,
      productCategory: option.productCategory,
      productSpec: option.productSpec,
      purchasePrice: option.purchasePrice,
    })),
    // FIFO·기본·내부 단가와 최상위 unitPrice/금액 필드는 계속 차단한다. 고객이 승인한
    // 당일·최근 실제 매입단가와 품목별 계획 판매가만 ...item 안의 예외로 유지한다.
    items: data.items.map(
      ({
        unitPrice,
        purchaseAmount,
        lossAmount,
        inventoryAmount,
        fifoLots,
        adjustment,
        ...item
      }) => {
        void unitPrice;
        void purchaseAmount;
        void lossAmount;
        void inventoryAmount;

        return {
          ...item,
          fifoLots: fifoLots.map(
            ({
              unitPrice: _unitPrice,
              originalAmount,
              consumedAmount,
              remainingAmount,
              ...lot
            }) => {
              void _unitPrice;
              void originalAmount;
              void consumedAmount;
              void remainingAmount;
              return lot;
            },
          ),
          adjustment: adjustment
            ? {
                id: adjustment.id,
                beforeQuantity: adjustment.beforeQuantity,
                afterQuantity: adjustment.afterQuantity,
                differenceQuantity: adjustment.differenceQuantity,
                amountStatus: adjustment.amountStatus,
                reason: adjustment.reason,
                createdByName: adjustment.createdByName,
                createdAt: adjustment.createdAt,
                updatedAt: adjustment.updatedAt,
              }
            : null,
        };
      },
    ),
  };
}
