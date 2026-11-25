import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const { findInventorySearchMatches } = await import(
  pathToFileURL(
    path.join(
      process.cwd(),
      "src",
      "features",
      "inventory",
      "inventory-search.ts",
    ),
  ).href
);

const items = [
  { productId: "a", productName: "고등어", productSpec: "20미" },
  { productId: "b", productName: "고등어", productSpec: "26미" },
  { productId: "c", productName: "Salmon", productSpec: "1KG" },
  { productId: "d", productName: "홍어", productSpec: "" },
];

test("inventory search matches name and spec, ignoring case and spaces", () => {
  assert.deepEqual(
    findInventorySearchMatches(items, "고등어").map((item) => item.productId),
    ["a", "b"],
  );
  assert.deepEqual(
    findInventorySearchMatches(items, "고등어 26").map(
      (item) => item.productId,
    ),
    ["b"],
  );
  assert.deepEqual(
    findInventorySearchMatches(items, "salmon 1kg").map((i) => i.productId),
    ["c"],
  );
});

test("inventory search returns nothing for a blank query", () => {
  assert.deepEqual(findInventorySearchMatches(items, "   "), []);
});
