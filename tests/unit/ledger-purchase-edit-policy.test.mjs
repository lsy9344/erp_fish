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

test("store manager cannot edit ECOUNT_UPLOAD applied unitPrice or raw fields", async () => {
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

  // 정책 반전(2026-06-28): 적용 단가 수정도 본사 전용이라 지점장 경로에서 막힌다.
  const modifiedUnitPrice = [{ ...existing[0], unitPrice: 99999 }];

  const unitPriceErrors = getStoreEcountPurchaseEditErrors(
    existing,
    modifiedUnitPrice,
  );

  assert.ok(
    Object.keys(unitPriceErrors).some((k) => k.includes("purchases")),
    "store manager must not edit the applied unitPrice of an ECOUNT_UPLOAD row",
  );

  // 원본 정보(수량 등) 변경도 여전히 차단된다.
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
    messages.some(
      (message) =>
        message.includes("원본 정보") && message.includes("본사에서만"),
    ),
    "raw-field block should use the HQ-only message",
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

test("store manager can edit MANUAL purchase rows except the applied unitPrice", async () => {
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

  // 수량 등 단가 외 필드 변경은 지점장도 허용된다.
  const quantityOnly = [{ ...existing[0], quantity: 4 }];
  assert.equal(
    Object.keys(getStoreEcountPurchaseEditErrors(existing, quantityOnly))
      .length,
    0,
    "store manager may still edit MANUAL row quantity",
  );

  // 정책 반전(2026-06-28): 기존 MANUAL 행의 적용 단가 변경은 본사 전용이라 막힌다.
  const unitPriceChanged = [{ ...existing[0], unitPrice: 6000 }];
  const errors = getStoreEcountPurchaseEditErrors(existing, unitPriceChanged);
  assert.deepEqual(errors, {
    "purchases.0.unitPrice": [
      "장부 적용 단가는 본사에서만 수정할 수 있습니다.",
    ],
  });
});

test("delete+recreate cannot bypass the applied unitPrice lock", async () => {
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

  // P1(2026-06-29): 기존 행을 지우고 새 id로 같은 품목+다른 단가를 보내는 우회를 막는다.
  const recreatedWithNewPrice = [
    {
      id: "new-row",
      productId: "product-1",
      purchaseStandardId: null,
      sourceType: "MANUAL",
      productName: "우럭",
      productCategory: "생물",
      productSpec: "500g",
      unitPrice: 6000,
      quantity: 3,
      referenceInfo: null,
    },
  ];
  assert.deepEqual(
    getStoreEcountPurchaseEditErrors(existing, recreatedWithNewPrice),
    {
      "purchases.0.unitPrice": [
        "장부 적용 단가는 본사에서만 수정할 수 있습니다.",
      ],
    },
  );

  // 같은 품목을 기존 단가 그대로 재등록하는 것은 단가 변경이 아니므로 허용한다.
  const recreatedSamePrice = [{ ...recreatedWithNewPrice[0], unitPrice: 5000 }];
  assert.deepEqual(
    getStoreEcountPurchaseEditErrors(existing, recreatedSamePrice),
    {},
  );

  // 기존 행을 그대로 두고(추가 매입) 같은 품목을 다른 단가로 한 줄 더 추가하는 것은 허용한다.
  const addedSecondPurchase = [
    existing[0],
    { ...recreatedWithNewPrice[0], id: "second-row", unitPrice: 7000 },
  ];
  assert.deepEqual(
    getStoreEcountPurchaseEditErrors(existing, addedSecondPurchase),
    {},
  );

  // 완전히 새로운 품목(기존에 없음)은 새 단가로 추가해도 허용한다.
  const brandNewProduct = [
    existing[0],
    {
      id: "brand-new",
      productId: "product-2",
      purchaseStandardId: null,
      sourceType: "MANUAL",
      productName: "광어",
      productCategory: "생물",
      productSpec: "1kg",
      unitPrice: 12000,
      quantity: 2,
      referenceInfo: null,
    },
  ];
  assert.deepEqual(
    getStoreEcountPurchaseEditErrors(existing, brandNewProduct),
    {},
  );
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
