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

function emptyCarryoverDetail(message = "") {
  return {
    source: "MANUAL",
    status: "CARRYOVER_EMPTY",
    resolvedQuantity: 0,
    sourceLedgerId: null,
    sourceLedgerClosingDate: null,
    sourceLedgerStatus: null,
    sourceYearMonth: null,
    sourceSnapshotId: null,
    sourcePreviousQuantity: null,
    sourcePurchasedQuantity: null,
    sourceLossQuantity: null,
    sourceCurrentQuantity: null,
    sourceQuantity: null,
    message,
    history: [],
  };
}

function makeLine(overrides = {}) {
  return {
    id: "row-1",
    productId: "product-a",
    productName: "광어",
    productCategory: "냉동",
    productSpec: "1kg",
    purchasePrice: null,
    plannedUnitPrice: null,
    unitPrice: 1000,
    previousQuantity: 0,
    purchasedQuantity: 0,
    purchaseAmount: 0,
    lossQuantity: 0,
    lossAmount: 0,
    currentQuantity: 0,
    quantity: 0,
    inventoryAmount: 0,
    fifoLots: [],
    carryoverSource: "MANUAL",
    carryoverStatus: "CARRYOVER_EMPTY",
    carryoverLedgerId: null,
    previousQuantityDetail: emptyCarryoverDetail(),
    isModified: false,
    adjustment: null,
    ...overrides,
  };
}

function makeStepData(items, manualProductOptions = []) {
  return {
    id: "ledger-1",
    storeId: "store-1",
    closingDate: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
    version: 1,
    authorDisplayName: null,
    status: "IN_PROGRESS",
    stepCompletion: { inventory: false },
    items,
    manualProductOptions,
    carryover: {
      status: "manual",
      source: "MANUAL",
      message: "manual",
    },
  };
}

test("isHiddenZeroStockInventoryItem hides only exact all-zero rows", async () => {
  const modulePath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "inventory-zero-stock-display.ts",
  );
  const { isHiddenZeroStockInventoryItem } = await import(
    pathToFileURL(modulePath).href
  );

  assert.equal(
    isHiddenZeroStockInventoryItem({
      previousQuantity: 0,
      purchasedQuantity: 0,
      lossQuantity: 0,
      currentQuantity: 0,
    }),
    true,
  );
  assert.equal(
    isHiddenZeroStockInventoryItem({
      previousQuantity: 0,
      purchasedQuantity: 0,
      lossQuantity: 0,
      currentQuantity: null,
    }),
    false,
    "unset current quantity must stay visible",
  );
  assert.equal(
    isHiddenZeroStockInventoryItem({
      previousQuantity: 1,
      purchasedQuantity: 0,
      lossQuantity: 0,
      currentQuantity: 0,
    }),
    false,
  );
  assert.equal(
    isHiddenZeroStockInventoryItem({
      previousQuantity: 0,
      purchasedQuantity: 2,
      lossQuantity: 0,
      currentQuantity: 0,
    }),
    false,
  );
  assert.equal(
    isHiddenZeroStockInventoryItem({
      previousQuantity: 0,
      purchasedQuantity: 0,
      lossQuantity: 1,
      currentQuantity: 0,
    }),
    false,
  );
  assert.equal(
    isHiddenZeroStockInventoryItem({
      previousQuantity: 0,
      purchasedQuantity: 0,
      lossQuantity: 0,
      currentQuantity: 3,
    }),
    false,
  );
});

test("applyInventoryFormDisplayPolicy moves hidden zero-stock rows into manual options", async () => {
  const modulePath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "inventory-zero-stock-display.ts",
  );
  const { applyInventoryFormDisplayPolicy } = await import(
    pathToFileURL(modulePath).href
  );

  const hidden = makeLine({
    id: "row-hidden",
    productId: "product-hidden",
    productName: "숨김광어",
    productCategory: "생물",
  });
  const visibleUnset = makeLine({
    id: "row-unset",
    productId: "product-unset",
    productName: "미입력연어",
    productCategory: "냉동",
    currentQuantity: null,
    quantity: null,
  });
  const visiblePurchase = makeLine({
    id: "row-purchase",
    productId: "product-purchase",
    productName: "매입새우",
    productCategory: "냉동",
    purchasedQuantity: 2,
    currentQuantity: 0,
  });
  const existingOption = {
    productId: "product-manual",
    productName: "추가후보",
    productCategory: "냉동",
    productSpec: "1kg",
    purchasePrice: null,
    plannedUnitPrice: null,
    source: "UNGROUNDED",
  };
  const duplicateHiddenOption = {
    productId: "product-hidden",
    productName: "중복후보",
    productCategory: "생물",
    productSpec: "1kg",
    purchasePrice: null,
    plannedUnitPrice: null,
    source: "UNGROUNDED",
  };

  const shaped = applyInventoryFormDisplayPolicy(
    makeStepData(
      [hidden, visibleUnset, visiblePurchase],
      [existingOption, duplicateHiddenOption],
    ),
  );

  assert.deepEqual(
    shaped.items.map((item) => item.productId),
    ["product-unset", "product-purchase"],
  );
  assert.deepEqual(
    shaped.manualProductOptions.map((option) => option.productId),
    ["product-manual", "product-hidden"],
  );
  assert.equal(shaped.manualProductOptions[0].source, "UNGROUNDED");
  assert.equal(shaped.manualProductOptions[1].source, "HIDDEN_ZERO_STOCK");
  assert.equal(
    shaped.manualProductOptions[1].restoredItem?.productId,
    "product-hidden",
  );
  assert.equal(
    shaped.manualProductOptions[1].productName,
    "숨김광어",
    "hidden option replaces duplicate ungrounded option",
  );
});

test("getInventorySaveRequiredEntryErrors uses submitted indexes and blocks missing required rows", async () => {
  const modulePath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "adjustment-save-guard.ts",
  );
  const { getInventorySaveRequiredEntryErrors } = await import(
    pathToFileURL(modulePath).href
  );

  const beforeItems = [
    {
      id: "zero-row",
      productId: "zero",
      purchasedQuantity: 0,
      lossQuantity: 0,
    },
    {
      id: "required",
      productId: "required",
      purchasedQuantity: 4,
      lossQuantity: 0,
    },
  ];

  assert.deepEqual(
    getInventorySaveRequiredEntryErrors(beforeItems, [
      { productId: "required", currentQuantity: null },
    ]),
    {
      "items.0.currentQuantity": [
        "당일재고를 입력해 주세요. 매입·손실이 있는 품목은 남은 재고를 직접 확인해야 합니다.",
      ],
    },
  );

  assert.deepEqual(
    getInventorySaveRequiredEntryErrors(beforeItems, [
      { productId: "zero", currentQuantity: 0 },
    ]),
    {
      items: [
        "당일재고를 입력하지 않은 매입·손실 품목이 있습니다. 남은 재고를 입력해 주세요.",
      ],
    },
  );
});
