// 손실 페이지에서 실제 판매/회수액과 비교하는 품목별 판매한 가격.
// 실제 품목별 판매 단가가 없으므로 항상 추정(estimated) 라벨과 함께 보여준다.
export type SalesPlanLossContextItem = {
  productId: string;
  productName: string;
  plannedUnitPrice: number;
  estimated: true;
};
