export type SalesPlanProductOption = {
  id: string;
  name: string;
  category: string;
  spec: string;
};

export type SalesPlanItem = {
  id: string;
  productId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  plannedUnitPrice: number;
  memo: string | null;
  updatedAt: string;
};

export type SalesPricePlanStepData = {
  storeId: string;
  businessDate: string;
  // 가장 최근 저장 시각(저장 이력이 없으면 null).
  updatedAt: string | null;
  productOptions: SalesPlanProductOption[];
  plans: SalesPlanItem[];
};

// 손실 페이지에서 실제 판매/회수액과 비교하는 품목별 계획 판매가.
// 실제 품목별 판매 단가가 없으므로 항상 추정(estimated) 라벨과 함께 보여준다.
export type SalesPlanLossContextItem = {
  productId: string;
  productName: string;
  plannedUnitPrice: number;
  estimated: true;
};
