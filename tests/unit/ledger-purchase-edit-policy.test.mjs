import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

function readProjectFile(...segments) {
  return readFileSync(assertProjectFile(...segments), "utf8");
}

async function importPolicy() {
  const policyPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "purchase-edit-policy.ts",
  );

  return import(pathToFileURL(policyPath).href);
}

test("purchase-edit-policy exports getStoreEcountPurchaseEditErrors", async () => {
  const { getStoreEcountPurchaseEditErrors } = await importPolicy();

  assert.equal(typeof getStoreEcountPurchaseEditErrors, "function");
});

test("store manager can edit ECOUNT_UPLOAD applied unitPrice but not raw fields", async () => {
  const { getStoreEcountPurchaseEditErrors } = await importPolicy();

  const existing = [
    {
      id: "item-1",
      productId: "product-1",
      purchaseStandardId: "standard-1",
      sourceType: "ECOUNT_UPLOAD",
      productName: "광어",
      productCategory: "생물",
      productSpec: "1kg",
      unitPrice: 10000,
      quantity: 5,
      referenceInfo: "ref-1",
    },
  ];

  // WO(2026-06-24): 지점장은 ECOUNT_UPLOAD 라인의 "장부 적용 단가(unitPrice)"만 수정할 수 있다.
  const modifiedUnitPrice = [
    { ...existing[0], unitPrice: 99999 },
  ];

  const unitPriceErrors = getStoreEcountPurchaseEditErrors(
    existing,
    modifiedUnitPrice,
  );

  assert.equal(
    Object.keys(unitPriceErrors).length,
    0,
    "store manager may edit the applied unitPrice of an ECOUNT_UPLOAD row",
  );

  // 원본 정보(수량 등) 변경은 여전히 차단된다.
  const modifiedRawField = [{ ...existing[0], quantity: 99 }];

  const rawFieldErrors = getStoreEcountPurchaseEditErrors(
    existing,
    modifiedRawField,
  );

  assert.ok(
    Object.keys(rawFieldErrors).some((k) => k.includes("purchases")),
    "should block store manager from changing ECOUNT_UPLOAD raw fields (quantity)",
  );

  const messages = Object.values(rawFieldErrors).flat();

  assert.ok(
    messages.some((message) =>
      message.includes("원본 정보") && message.includes("장부 적용 단가만"),
    ),
    "raw-field block should use the new applied-unit-price message",
  );
});

test("store manager cannot delete ECOUNT_UPLOAD purchase row", async () => {
  const { getStoreEcountPurchaseEditErrors } = await importPolicy();

  const existing = [
    {
      id: "item-1",
      productId: "product-1",
      purchaseStandardId: "standard-1",
      sourceType: "ECOUNT_UPLOAD",
      productName: "광어",
      productCategory: "생물",
      productSpec: "1kg",
      unitPrice: 10000,
      quantity: 5,
      referenceInfo: null,
    },
  ];

  const errors = getStoreEcountPurchaseEditErrors(existing, []);

  assert.ok(
    "purchases" in errors,
    "should block deletion of ECOUNT_UPLOAD row",
  );
});

test("store manager cannot create new ECOUNT_UPLOAD row", async () => {
  const { getStoreEcountPurchaseEditErrors } = await importPolicy();

  const incoming = [
    {
      id: "new-item",
      productId: "product-1",
      purchaseStandardId: "standard-1",
      sourceType: "ECOUNT_UPLOAD",
      productName: "광어",
      productCategory: "생물",
      productSpec: "1kg",
      unitPrice: 10000,
      quantity: 5,
      referenceInfo: null,
    },
  ];

  const errors = getStoreEcountPurchaseEditErrors([], incoming);

  assert.ok(
    Object.keys(errors).some((k) => k.includes("sourceType")),
    "should block store manager from creating ECOUNT_UPLOAD row",
  );
});

test("store manager can pass unchanged ECOUNT_UPLOAD rows without errors", async () => {
  const { getStoreEcountPurchaseEditErrors } = await importPolicy();

  const row = {
    id: "item-1",
    productId: "product-1",
    purchaseStandardId: "standard-1",
    sourceType: "ECOUNT_UPLOAD",
    productName: "광어",
    productCategory: "생물",
    productSpec: "1kg",
    unitPrice: 10000,
    quantity: 5,
    referenceInfo: "ref",
  };

  const errors = getStoreEcountPurchaseEditErrors([row], [row]);

  assert.equal(Object.keys(errors).length, 0);
});

test("store manager can freely edit MANUAL purchase rows", async () => {
  const { getStoreEcountPurchaseEditErrors } = await importPolicy();

  const existing = [
    {
      id: "item-manual",
      productId: "product-1",
      purchaseStandardId: null,
      sourceType: "MANUAL",
      productName: "우럭",
      productCategory: "생물",
      productSpec: "500g",
      unitPrice: 5000,
      quantity: 3,
      referenceInfo: null,
    },
  ];

  const modified = [{ ...existing[0], unitPrice: 6000, quantity: 4 }];

  const errors = getStoreEcountPurchaseEditErrors(existing, modified);

  assert.equal(Object.keys(errors).length, 0);
});

test("hq-edit-actions does not apply store ecount purchase edit policy", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-edit-actions.ts",
  );

  assert.doesNotMatch(
    source,
    /getStoreEcountPurchaseEditErrors/,
    "HQ edit path should not apply store-manager ecount block",
  );
});

test("purchase-edit-policy is not imported in hq-edit-actions", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-edit-actions.ts",
  );

  assert.doesNotMatch(source, /purchase-edit-policy/);
});
