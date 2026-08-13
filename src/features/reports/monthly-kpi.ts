// WO-0806 #3: 순이익 = 영업이익 − 인건비 − 본사지출.
//
// 우리 `영업이익`(operatingProfit)은 매출이익 − 장부지출이며 인건비를 빼지 않는다
// (src/server/calculations/ledger.ts:695-696). 반면 대표가 보던 엑셀의 "영업이익"은
// 인건비가 이미 빠진 값이라, 엑셀의 그 자리에 오는 것이 여기의 `순이익`이다.
// 화면에서는 두 컬럼 헤더에 계산식을 병기해 같은 값으로 오해하지 않게 한다.
export function calculateMonthlyNetProfit({
  operatingProfit,
  laborAmount,
  headquartersExpenseAmount = 0,
  salesAmount,
}: {
  operatingProfit: number | null;
  laborAmount: number;
  // 본사 지출을 볼 권한이 없으면 0으로 두고 인건비만 뺀다(화면도 컬럼을 감춘다).
  headquartersExpenseAmount?: number;
  salesAmount: number | null;
}) {
  // 영업이익이 계산 불가(매출원가 산출 실패)면 순이익도 계산할 수 없다.
  const netProfit =
    operatingProfit === null
      ? null
      : operatingProfit - laborAmount - headquartersExpenseAmount;
  const netProfitRate =
    netProfit === null || salesAmount === null || salesAmount <= 0
      ? null
      : netProfit / salesAmount;

  return { netProfit, netProfitRate };
}
