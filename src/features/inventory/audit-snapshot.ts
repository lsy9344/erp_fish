import type {
  InventoryCarryoverDetailView,
  InventoryStepData,
  InventoryStepLine,
} from "./types.ts";

type InventoryAuditLine = Omit<InventoryStepLine, "previousQuantityDetail"> & {
  previousQuantityDetail: Omit<InventoryCarryoverDetailView, "history">;
};

export type InventoryAuditSnapshot = Omit<
  InventoryStepData,
  "items" | "manualProductOptions"
> & {
  items: InventoryAuditLine[];
};

/**
 * 화면 선택지와 과거 장부 사본은 새 감사에 중복 저장하지 않는다.
 * 복구 도구가 첫 before.items를 읽으므로 가상 행을 포함한 전체 품목과
 * 이월 근거 scalar, FIFO, 조정값은 유지한다. 화면 응답용 입력은 변경하지 않는다.
 */
export function toInventoryAuditSnapshot(
  snapshot: InventoryStepData,
): InventoryAuditSnapshot {
  return {
    id: snapshot.id,
    storeId: snapshot.storeId,
    closingDate: snapshot.closingDate,
    updatedAt: snapshot.updatedAt,
    version: snapshot.version,
    authorDisplayName: snapshot.authorDisplayName,
    status: snapshot.status,
    stepCompletion: structuredClone(snapshot.stepCompletion),
    carryover: structuredClone(snapshot.carryover),
    items: snapshot.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      productCategory: item.productCategory,
      productSpec: item.productSpec,
      purchasePrice: structuredClone(item.purchasePrice),
      plannedUnitPrice: item.plannedUnitPrice,
      unitPrice: item.unitPrice,
      previousQuantity: item.previousQuantity,
      purchasedQuantity: item.purchasedQuantity,
      conversionInQuantity: item.conversionInQuantity,
      conversionOutQuantity: item.conversionOutQuantity,
      purchaseAmount: item.purchaseAmount,
      lossQuantity: item.lossQuantity,
      lossAmount: item.lossAmount,
      currentQuantity: item.currentQuantity,
      quantity: item.quantity,
      inventoryAmount: item.inventoryAmount,
      fifoLots: structuredClone(item.fifoLots),
      carryoverSource: item.carryoverSource,
      carryoverStatus: item.carryoverStatus,
      carryoverLedgerId: item.carryoverLedgerId,
      previousQuantityDetail: {
        source: item.previousQuantityDetail.source,
        status: item.previousQuantityDetail.status,
        resolvedQuantity: item.previousQuantityDetail.resolvedQuantity,
        sourceLedgerId: item.previousQuantityDetail.sourceLedgerId,
        sourceLedgerClosingDate:
          item.previousQuantityDetail.sourceLedgerClosingDate,
        sourceLedgerStatus: item.previousQuantityDetail.sourceLedgerStatus,
        sourceYearMonth: item.previousQuantityDetail.sourceYearMonth,
        sourceSnapshotId: item.previousQuantityDetail.sourceSnapshotId,
        sourcePreviousQuantity:
          item.previousQuantityDetail.sourcePreviousQuantity,
        sourcePurchasedQuantity:
          item.previousQuantityDetail.sourcePurchasedQuantity,
        sourceLossQuantity: item.previousQuantityDetail.sourceLossQuantity,
        sourceCurrentQuantity:
          item.previousQuantityDetail.sourceCurrentQuantity,
        sourceQuantity: item.previousQuantityDetail.sourceQuantity,
        sourceSalesQuantity: item.previousQuantityDetail.sourceSalesQuantity,
        sourceLastArrivalDate:
          item.previousQuantityDetail.sourceLastArrivalDate,
        message: item.previousQuantityDetail.message,
      },
      isModified: item.isModified,
      adjustment: structuredClone(item.adjustment),
    })),
  };
}
