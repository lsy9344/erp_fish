// WO-08(2026-06-22): 본사 전용 전 지점 재고 현황 리포트.
// 기존 일/기간/월간 리포트와 달리 선택 일자의 "남은 재고"를 지점·품목 단위로 한 화면에
// 모아 본다. 미입력 장부는 0이 아니라 "미입력"으로, 단가/수량이 없어 금액을 못 구하면
// "계산 불가"로 표기해 실측값과 비실측값(추정·미입력·계산 불가)을 명확히 분리한다.

export type InventoryPositionStatusLabel = "입력됨" | "미입력" | "계산 불가";

export type InventoryPositionFifoLotRow = {
  sourceType: "OPENING" | "PREVIOUS_CARRYOVER" | "PURCHASE" | "LEGACY_OPENING";
  sourceBusinessDate: string | null;
  purchaseDate: string | null;
  unitPrice: number;
  originalQuantity: number;
  consumedQuantity: number;
  remainingQuantity: number;
  remainingAmount: number;
  sortOrder: number;
};

export type InventoryPositionRow = {
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number;
  currentQuantity: number | null;
  systemQuantity: number | null;
  differenceQuantity: number | null;
  inventoryAmount: number | null;
  fifoLots: InventoryPositionFifoLotRow[];
  statusLabel: InventoryPositionStatusLabel;
};

export type InventoryPositionStoreOption = {
  id: string;
  name: string;
};

export type InventoryPositionCategoryOption = {
  value: string;
  label: string;
};

export type InventoryPositionDateRange = {
  date: Date;
  dateInput: string;
  errorMessage: string | null;
};

export type InventoryPositionFilters = {
  dateInput: string;
  storeId: string | null;
  storeName: string | null;
  category: string | null;
  productQuery: string | null;
};

export type InventoryPositionSummary = {
  storeCount: number;
  productCount: number;
  enteredRowCount: number;
  missingRowCount: number;
  uncomputableRowCount: number;
  totalInventoryAmount: number | null;
};

export type InventoryPositionReportData = {
  range: InventoryPositionDateRange;
  filters: InventoryPositionFilters;
  stores: InventoryPositionStoreOption[];
  categories: InventoryPositionCategoryOption[];
  rows: InventoryPositionRow[];
  summary: InventoryPositionSummary;
  errorMessages: string[];
};
