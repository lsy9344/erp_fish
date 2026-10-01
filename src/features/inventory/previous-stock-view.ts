export type PreviousStockLedgerStatus =
  | "IN_PROGRESS"
  | "IN_REVIEW"
  | "HEADQUARTERS_CLOSED"
  | "HOLIDAY";

export type PreviousStockViewItem = {
  productId: string;
  productName: string;
  productSpec: string;
  productCategory: string;
  previousQuantity: number;
  sourceSalesQuantity: number | null;
  sourceLastArrivalDate: string | null;
  sourceLedgerStatus: PreviousStockLedgerStatus | null;
};

type PreviousStockSource = {
  productId: string;
  productName: string;
  productSpec: string;
  productCategory: string;
  previousQuantity: number;
  previousQuantityDetail: {
    sourceSalesQuantity: number | null;
    sourceLastArrivalDate: string | null;
    sourceLedgerStatus: PreviousStockLedgerStatus | null;
  };
};

export function toPreviousStockViewItem(
  item: PreviousStockSource,
): PreviousStockViewItem {
  return {
    productId: item.productId,
    productName: item.productName,
    productSpec: item.productSpec,
    productCategory: item.productCategory,
    previousQuantity: item.previousQuantity,
    sourceSalesQuantity: item.previousQuantityDetail.sourceSalesQuantity,
    sourceLastArrivalDate: item.previousQuantityDetail.sourceLastArrivalDate,
    sourceLedgerStatus: item.previousQuantityDetail.sourceLedgerStatus,
  };
}

export function toPreviousStockViewItems(items: PreviousStockSource[]) {
  return items.map(toPreviousStockViewItem);
}
