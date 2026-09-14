import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

function item(overrides = {}) {
  return {
    id: "product-1",
    productId: "product-1",
    previousQuantity: 0,
    purchasedQuantity: 0,
    lossQuantity: 0,
    conversionInQuantity: 0,
    conversionOutQuantity: 0,
    currentQuantity: 0,
    quantity: 0,
    ...overrides,
  };
}

test("unconfirmed same-day purchase seed can convert purchased quantity", async () => {
  const helperPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "conversion-availability.ts",
  );
  const { getFrozenConversionAvailableQuantity } = await import(
    pathToFileURL(helperPath).href
  );

  assert.equal(
    getFrozenConversionAvailableQuantity(
      item({ purchasedQuantity: 8, currentQuantity: 0, quantity: 0 }),
    ),
    8,
  );
  assert.equal(
    getFrozenConversionAvailableQuantity(
      item({
        previousQuantity: 10,
        purchasedQuantity: 8,
        currentQuantity: 10,
        quantity: 10,
      }),
    ),
    18,
  );
});

test("saved remaining stock is the conversion cap after 당일재고 is confirmed", async () => {
  const helperPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "conversion-availability.ts",
  );
  const { getFrozenConversionAvailableQuantity } = await import(
    pathToFileURL(helperPath).href
  );

  assert.equal(
    getFrozenConversionAvailableQuantity(
      item({
        id: "row-1",
        previousQuantity: 0,
        purchasedQuantity: 8,
        currentQuantity: 5,
        quantity: 5,
      }),
    ),
    5,
  );
  assert.equal(
    getFrozenConversionAvailableQuantity(
      item({
        id: "row-1",
        previousQuantity: 10,
        purchasedQuantity: 0,
        currentQuantity: 10,
        quantity: 10,
      }),
    ),
    10,
  );
  assert.equal(
    getFrozenConversionAvailableQuantity(
      item({
        id: "row-1",
        previousQuantity: 0,
        purchasedQuantity: 8,
        currentQuantity: 0,
        quantity: 0,
      }),
    ),
    0,
  );
});
