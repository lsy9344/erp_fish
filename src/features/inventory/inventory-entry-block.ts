import type { InventoryErrorFocusTarget } from "./inventory-save-errors.ts";

/**
 * 저장/다음 단계가 필수 입력 때문에 막혔을 때 띄우는 경고 내용.
 *
 * 행별 빨간 오류와 폼 오류만으로는 "몇 개가, 어느 품목이" 비었는지 알 수 없었다.
 * 39행 3탭짜리 화면에서 "모든 품목의 판매한 가격을 입력해 주세요"만 보고는
 * 5개가 빈 건지 39개가 빈 건지 알 수 없어, 지점이 탭을 뒤지는 대신 아무 숫자나
 * 넣고 넘어갔다(2026-07-27 안양참수산: 판매한 가격 666666).
 * 그래서 막힌 건수와 품목명을 그대로 보여준다.
 */
export type InventoryEntryBlock = {
  title: string;
  description: string;
  itemLabels: string[];
  focus: InventoryErrorFocusTarget;
};

export type InventoryEntryBlockKind = "currentQuantity" | "plannedUnitPrice";

type BlockedItem = {
  productId: string;
  productName: string;
  productSpec: string;
  /** items 배열에서의 위치. 포커스 이동 대상 인덱스로 쓴다. */
  index: number;
};

export function toBlockedItemLabel(item: {
  productName: string;
  productSpec: string;
}) {
  return item.productSpec
    ? `${item.productName} ${item.productSpec}`
    : item.productName;
}

export function buildInventoryEntryBlock(
  kind: InventoryEntryBlockKind,
  blockedItems: readonly BlockedItem[],
): InventoryEntryBlock | null {
  const first = blockedItems[0];

  if (!first) {
    return null;
  }

  return {
    title:
      kind === "plannedUnitPrice"
        ? "판매한 가격이 비어 있습니다"
        : "당일재고가 비어 있습니다",
    description:
      kind === "plannedUnitPrice"
        ? `${blockedItems.length}개 품목의 판매한 가격을 입력해야 저장할 수 있습니다.`
        : `매입·손실이 있는 ${blockedItems.length}개 품목은 남은 재고를 직접 확인해 입력해야 저장할 수 있습니다.`,
    itemLabels: blockedItems.map(toBlockedItemLabel),
    focus: {
      productId: first.productId,
      currentIndex: first.index,
      field: kind === "plannedUnitPrice" ? "plannedUnitPrice" : "quantity",
    },
  };
}
