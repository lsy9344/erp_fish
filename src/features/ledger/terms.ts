// 장부(지출/근무/검토) 화면 용어 중앙 사전.
// WO-09: 사용자 화면에 보이는 한국어 라벨/문구를 이 한 곳에서 바꾸면
// 지출·근무·검토 화면에 반영되도록 표준 용어를 모았다.
// 비개발자도 이 파일의 문자열만 바꾸면 용어를 수정할 수 있다.
export const ledgerTerms = {
  // 지출 단계
  costStep: "지출",
  expenseItem: "지출 항목",
  expenseAmount: "지출 금액",
  expenseMemo: "메모 (선택)",
  draftExpenseTotal: "입력 중 지출 합계",
  lastSavedExpenseTotal: "마지막 서버 저장 지출 합계",
  grossProfit: "영업이익",

  // 근무 단계
  workerCount: "근무인원",
  workMemo: "특이사항 메모",

  // 공통 버튼/상태
  addLine: "항목 추가",
  removeLine: "삭제",
  save: "저장",
  saving: "저장 중...",
  retry: "다시 시도",
  nextStep: "다음 단계로 →",
} as const;
