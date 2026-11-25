type SearchableInventoryItem = {
  productName: string;
  productSpec: string;
};

function normalize(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

// 재고 단계 상단 검색: 품목명+규격을 공백 없이 이어 붙여 부분 일치로 찾는다.
// "고등어 26"처럼 이름과 규격을 함께 쳐도 같은 이름의 다른 규격과 구분된다.
export function findInventorySearchMatches<T extends SearchableInventoryItem>(
  items: readonly T[],
  query: string,
): T[] {
  const needle = normalize(query);

  if (!needle) {
    return [];
  }

  return items.filter((item) =>
    normalize(`${item.productName}${item.productSpec}`).includes(needle),
  );
}
