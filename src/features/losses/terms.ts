// 손실/폐기/떨이 화면 용어 중앙 사전.
// WO-09: 사유·수량·검증 라벨을 이 한 곳에서 바꾸면 손실 화면에 반영된다.
// 비개발자도 이 파일의 문자열만 바꾸면 용어를 수정할 수 있다.
export const lossTerms = {
  // 항목 라벨
  product: "품목",
  lossType: "처리 유형",
  quantity: "박스단위 수량",
  quantityHelp:
    "한 박스 100마리 중 10마리를 폐기하면 0.1, 한 박스 10바구니 중 2바구니를 폐기하면 0.2로 입력하세요. 소수점 둘째 자리까지 입력할 수 있습니다.",
  recoveredAmount: "떨이로 실제 판매한 금액",
  reason: "사유/특이사항",

  // 합계/요약
  totalLossQuantity: "총 박스단위 손실 수량",
  totalLossAmount: "총 손실액",

  // 도움말/검증 문구
  recoveredAmountHelp:
    "손실 수량과 떨이 판매액을 먼저 저장하세요. 3단계 재고에서 판매한 가격을 저장하면 손실액이 자동 확정됩니다.",
  quantityInvalid:
    "박스단위 수량은 0 이상이고 소수점 둘째 자리까지 입력할 수 있습니다.",
  recoveredAmountInvalid:
    "떨이로 실제 판매한 금액은 0원 이상의 정수여야 합니다.",
  positiveValueRequired:
    "박스단위 수량 또는 떨이로 실제 판매한 금액 중 하나는 0보다 커야 합니다.",
  reasonRequired: "사유/특이사항을 입력해 주세요.",
  noOptions: "선택 가능한 active 품목 또는 active 손실 유형이 없습니다.",
} as const;
