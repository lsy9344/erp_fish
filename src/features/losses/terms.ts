// 손실/폐기/떨이 화면 용어 중앙 사전.
// WO-09: 사유·수량·검증 라벨을 이 한 곳에서 바꾸면 손실 화면에 반영된다.
// 비개발자도 이 파일의 문자열만 바꾸면 용어를 수정할 수 있다.
export const lossTerms = {
  // 항목 라벨
  product: "품목",
  lossType: "처리 유형",
  quantity: "수량",
  recoveredAmount: "실제 판매/회수액(원)",
  reason: "사유/특이사항",

  // 합계/요약
  totalLossQuantity: "총 손실 수량",
  totalLossAmount: "총 손실액",

  // 도움말/검증 문구
  recoveredAmountHelp:
    "손실액은 개점 전 판매가 계획에서 이 금액을 뺀 값으로 자동 계산됩니다.",
  reasonRequired: "사유/특이사항을 입력해 주세요.",
  noOptions: "선택 가능한 active 품목 또는 active 손실 유형이 없습니다.",
} as const;
