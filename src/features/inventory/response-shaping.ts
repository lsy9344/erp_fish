import type { InventoryStepData, StoreManagerInventoryStepData } from "./types";
import { applySalesPriceCarryoverFallback } from "./sales-price-carryover.ts";

export function shapeStoreManagerInventoryStepData(
  data: InventoryStepData,
  carryoverByProductId: ReadonlyMap<string, number> = new Map(),
): StoreManagerInventoryStepData {
  const items = applySalesPriceCarryoverFallback(
    data.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      productCategory: item.productCategory,
      productSpec: item.productSpec,
      purchasePrice: item.purchasePrice,
      plannedUnitPrice: item.plannedUnitPrice,
      previousQuantity: item.previousQuantity,
      purchasedQuantity: item.purchasedQuantity,
      lossQuantity: item.lossQuantity,
      currentQuantity: item.currentQuantity,
      quantity: item.quantity,
      carryoverSource: item.carryoverSource,
      carryoverStatus: item.carryoverStatus,
      carryoverLedgerId: item.carryoverLedgerId,
      previousQuantityDetail: item.previousQuantityDetail,
      isModified: item.isModified,
      fifoLots: item.fifoLots.map(
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
      adjustment: item.adjustment
        ? {
            id: item.adjustment.id,
            beforeQuantity: item.adjustment.beforeQuantity,
            afterQuantity: item.adjustment.afterQuantity,
            differenceQuantity: item.adjustment.differenceQuantity,
            amountStatus: item.adjustment.amountStatus,
            reason: item.adjustment.reason,
            createdByName: item.adjustment.createdByName,
            createdAt: item.adjustment.createdAt,
            updatedAt: item.adjustment.updatedAt,
          }
        : null,
    })),
    carryoverByProductId,
  );
  const manualProductOptions = applySalesPriceCarryoverFallback(
    data.manualProductOptions.map((option) => ({
      productId: option.productId,
      productName: option.productName,
      productCategory: option.productCategory,
      productSpec: option.productSpec,
      purchasePrice: option.purchasePrice,
      plannedUnitPrice: option.plannedUnitPrice,
    })),
    carryoverByProductId,
  );

  return {
    id: data.id,
    storeId: data.storeId,
    closingDate: data.closingDate,
    updatedAt: data.updatedAt,
    version: data.version,
    authorDisplayName: data.authorDisplayName,
    status: data.status,
    stepCompletion: data.stepCompletion,
    carryover: data.carryover,
    // Manual options are rebuilt from an allowlist. Approved purchase history and
    // the store's existing sales price are the only price fields exposed here.
    // Carryover fallback is applied only at this store-manager boundary.
    manualProductOptions,
    // FIFO·기본·내부 단가와 최상위 unitPrice/금액 필드는 계속 차단한다. 고객이 승인한
    // 당일·최근 실제 매입단가, 월초 표시 단가와 품목별 판매한 가격만 ...item 안의 예외로 유지한다.
    items,
  };
}
