// 지점별 코드 표시명(alias) 편집기 용어 사전.
// WO-09: 미팅 결정(2026-06-21)대로 코드 등록은 본사 전용이고, 지점장은 자기
// 지점 화면에 보이는 표시명만 덮어쓸 수 있다. 그 편집기에서 쓰는 라벨/문구를
// 이 한 곳에서 바꾼다. 손실 유형/비용 항목 등 코드 그룹별로 제목·설명을 나눈다.
export const codeAliasTerms = {
  // 공통 동작 라벨
  save: "저장",
  saving: "저장 중...",
  fallbackPlaceholder: "본사 등록명 사용",
  saveSuccess: "표시명을 저장했습니다.",
  saveError: "표시명 저장에 실패했습니다. 다시 시도해 주세요.",

  // 코드 그룹별 제목/설명
  lossType: {
    heading: "손실 유형 표시명",
    description:
      "본사가 등록한 손실 유형의 표시명을 이 지점 화면에서만 바꿀 수 있습니다. 비워서 저장하면 본사 등록명으로 되돌아갑니다.",
  },
  expenseItem: {
    heading: "비용 항목 표시명",
    description:
      "본사가 등록한 비용 항목의 표시명을 이 지점 화면에서만 바꿀 수 있습니다. 비워서 저장하면 본사 등록명으로 되돌아갑니다.",
  },
} as const;

export type CodeAliasGroupKey = "lossType" | "expenseItem";
