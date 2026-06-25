// 재고 화면 용어 중앙 사전.
// 미팅 요구: "재고 페이지의 단어 쉽게 수정". 화면 라벨/도움말을 이 한 곳에서
// 바꾸면 재고 화면에 반영되도록 표준 용어를 모았다.
// 비개발자도 이 파일의 문자열만 바꾸면 용어를 수정할 수 있다.
export const inventoryTerms = {
  // 컬럼/항목 라벨
  product: "품목",
  spec: "규격",
  previousStock: "전일재고",
  purchase: "매입",
  loss: "손실",
  baselineStock: "기준재고",
  currentStock: "당일재고",
  dailySalesQuantity: "처리재고",
  inventoryAmount: "재고금액",
  statusAndAdjustment: "확인/고치기",

  // 재고 수량을 바꾼 이유 관련
  adjustmentReason: "당일재고 바꾼 이유",
  adjustmentReasonPlaceholder: "당일재고 바꾼 이유",
  adjustmentReasonRequired: "바꾼 이유를 입력해 주세요.",

  // 도움말/안내 문구
  dailySalesQuantityHelp:
    "기준재고에서 입력한 당일재고를 뺀 재고 흐름상 처리 수량입니다. 실제 POS 판매 수량과 다를 수 있습니다.",
  carryoverHistoryTitle: "전일재고 이력",

  // FIFO 재고금액 / 판매 lot 이력
  inventoryAmountHelp:
    "선입선출(FIFO) 기준으로 계산한 재고금액입니다. 금액을 누르면 어떤 lot을 팔았는지 이력을 볼 수 있습니다.",
  fifoLotHistoryTitle: "FIFO 판매 lot 이력",
  fifoLotHistoryDescription:
    "선입선출 순서대로 어떤 매입 lot이 얼마나 소진되고 얼마나 남았는지 보여줍니다.",
  fifoLotSource: "구분",
  // 입고 영업일 기준(며칠 자 입고분인지). 매입 레코드 생성 시각이 아니라 입고 영업일을 보여준다.
  fifoLotPurchaseDate: "입고일자",
  fifoLotUnitPrice: "매입단가",
  fifoLotOriginalQuantity: "입고",
  fifoLotConsumedQuantity: "소진",
  fifoLotRemainingQuantity: "잔량",
  fifoLotRemainingAmount: "잔량금액",
  fifoLotEmpty: "FIFO lot 이력이 아직 없습니다. 저장하면 계산됩니다.",
} as const;
