import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const { getInventorySaveRequiredEntryErrors, toHqCurrentQuantitySaveInput } =
  await import(
    pathToFileURL(
      path.join(
        process.cwd(),
        "src",
        "features",
        "inventory",
        "adjustment-save-guard.ts",
      ),
    ).href
  );

// 2026-11-25 현장 제보: 냉)부세 전일 1.26 + 매입 3, 3개 팔아 당일재고 1.26을 입력하면
// 본사 화면 저장이 "당일재고를 입력해 주세요"로 막혔다. 아직 저장 안 된 seed 행의
// currentQuantity는 전일재고 기본값일 뿐인데, 같은 값 입력을 "변경 없음(null)"으로 보냈다.
test("HQ save sends a required seed row's typed quantity even when it equals the previous stock", () => {
  const seed = {
    id: "product-1",
    productId: "product-1",
    purchasedQuantity: 3,
    lossQuantity: 0,
    currentQuantity: 1.26,
  };
  const sent = toHqCurrentQuantitySaveInput("1.26", seed);

  assert.equal(sent, "1.26");
  assert.deepEqual(
    getInventorySaveRequiredEntryErrors(
      [seed],
      [{ productId: "product-1", currentQuantity: Number(sent) }],
    ),
    {},
  );
});

test("HQ save still treats an unchanged persisted legacy quantity as no change", () => {
  const saved = {
    id: "row-1",
    productId: "product-1",
    purchasedQuantity: 3,
    lossQuantity: 0,
    currentQuantity: 1.26,
  };

  assert.equal(toHqCurrentQuantitySaveInput("1.26", saved), null);
  assert.equal(toHqCurrentQuantitySaveInput("1.5", saved), "1.5");
});
