import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const root = process.cwd();

const { buildInventoryEntryBlock, toBlockedItemLabel } = await import(
  pathToFileURL(
    path.join(root, "src", "features", "inventory", "inventory-entry-block.ts"),
  ).href
);

const item = (index, productName, productSpec = "") => ({
  productId: `product-${index}`,
  productName,
  productSpec,
  index,
});

test("blocked entry label appends the spec so same-name products stay distinguishable", () => {
  // 한 지점에 "고등어 20미 / 26미 / 26미A / 32미"가 동시에 있다. 이름만으로는 못 찾는다.
  assert.equal(toBlockedItemLabel(item(0, "고등어", "26미")), "고등어 26미");
  assert.equal(toBlockedItemLabel(item(0, "홍어", "")), "홍어");
});

test("blocked entry warning counts only the empty rows, not every product", () => {
  // 회귀 방지: "모든 품목의 판매한 가격을 입력해 주세요"만 보고 39행 중 몇 개가 빈
  // 건지 알 수 없어 지점이 666666을 넣고 넘어갔다(2026-07-27 안양참수산).
  const block = buildInventoryEntryBlock("plannedUnitPrice", [
    item(5, "갑오징어", "10미"),
    item(9, "고등어", "26미"),
    item(12, "낙지", "10미"),
  ]);

  assert.equal(block.title, "판매한 가격이 비어 있습니다");
  assert.match(block.description, /^3개 품목의 판매한 가격을/);
  assert.deepEqual(block.itemLabels, [
    "갑오징어 10미",
    "고등어 26미",
    "낙지 10미",
  ]);
  // 포커스는 첫 미입력 행으로 간다. 인덱스는 필터된 목록이 아니라 items 기준이어야 한다.
  assert.deepEqual(block.focus, {
    productId: "product-5",
    currentIndex: 5,
    field: "plannedUnitPrice",
  });
});

test("blocked entry warning covers the current-quantity validator too", () => {
  const block = buildInventoryEntryBlock("currentQuantity", [
    item(2, "삼치", "5미"),
  ]);

  assert.equal(block.title, "당일재고가 비어 있습니다");
  assert.match(block.description, /매입·손실이 있는 1개 품목/);
  assert.equal(block.focus.field, "quantity");
  assert.equal(block.focus.currentIndex, 2);
});

test("no blocked rows means no warning and the save proceeds", () => {
  assert.equal(buildInventoryEntryBlock("plannedUnitPrice", []), null);
  assert.equal(buildInventoryEntryBlock("currentQuantity", []), null);
});
