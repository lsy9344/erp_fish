import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

function migrationDirNames() {
  const migrationDir = assertProjectFile("prisma", "migrations");

  return readdirSync(migrationDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

test("ledger purchase model and migration preserve manual purchase snapshots", () => {
  const schema = readProjectFile("prisma", "schema.prisma");

  assert.match(
    schema,
    /model\s+LedgerPurchaseItem\s*{[^}]*id\s+String\s+@id\s+[^}]*dailyLedgerId\s+String[^}]*productId\s+String\?[^}]*purchaseStandardId\s+String\?[^}]*sourceType\s+LedgerPurchaseSource\s+@default\(MANUAL\)[^}]*productName\s+String[^}]*productCategory\s+String[^}]*productSpec\s+String[^}]*unitPrice\s+Int[^}]*quantity\s+Decimal\s+@db\.Decimal\(12,\s*2\)[^}]*amount\s+Int[^}]*referenceInfo\s+String\?[^}]*createdById\s+String[^}]*updatedById\s+String[^}]*@@index\(\[dailyLedgerId\]\)[^}]*@@index\(\[productId\]\)[^}]*@@index\(\[purchaseStandardId\]\)[^}]*@@index\(\[sourceType\]\)/s,
  );
  assert.match(
    schema,
    /enum\s+LedgerPurchaseSource\s*{\s*MANUAL\s+ECOUNT_UPLOAD\s*}/s,
  );
  assert.match(
    schema,
    /model\s+DailyLedger\s*{[^}]*ledgerPurchaseItems\s+LedgerPurchaseItem\[\]/s,
  );
  assert.match(
    schema,
    /model\s+User\s*{[^}]*createdLedgerPurchaseItems\s+LedgerPurchaseItem\[\]\s+@relation\("LedgerPurchaseItemCreatedBy"\)[^}]*updatedLedgerPurchaseItems\s+LedgerPurchaseItem\[\]\s+@relation\("LedgerPurchaseItemUpdatedBy"\)/s,
  );

  const migrationName = migrationDirNames().find((name) =>
    name.includes("ledger_purchase_manual_source_or_raw_snapshot"),
  );
  assert.ok(migrationName, "manual purchase source migration should exist");

  const migration = readFileSync(
    assertProjectFile("prisma", "migrations", migrationName, "migration.sql"),
    "utf8",
  );
  assert.ok(
    migration.includes('CREATE TYPE "LedgerPurchaseSource"') &&
      migration.includes("'MANUAL'"),
    "migration should create LedgerPurchaseSource enum",
  );
  assert.ok(
    migration.includes('ADD COLUMN "sourceType"') &&
      migration.includes("DEFAULT 'MANUAL'") &&
      migration.includes('ALTER COLUMN "productId" DROP NOT NULL'),
    "migration should add sourceType and allow raw manual product snapshots",
  );

  const uploadMigrationName = migrationDirNames().find((name) =>
    name.includes("add_ecount_purchase_source"),
  );
  assert.ok(
    uploadMigrationName,
    "ECount purchase source migration should exist",
  );

  const uploadMigration = readFileSync(
    assertProjectFile(
      "prisma",
      "migrations",
      uploadMigrationName,
      "migration.sql",
    ),
    "utf8",
  );
  assert.ok(
    uploadMigration.includes("ECOUNT_UPLOAD"),
    "migration should add ECOUNT_UPLOAD source type",
  );

  const decimalQuantityMigrationName = migrationDirNames().find((name) =>
    name.includes("decimal_inventory_quantities"),
  );
  assert.ok(
    decimalQuantityMigrationName,
    "decimal inventory quantity migration should exist",
  );

  const decimalQuantityMigration = readFileSync(
    assertProjectFile(
      "prisma",
      "migrations",
      decimalQuantityMigrationName,
      "migration.sql",
    ),
    "utf8",
  );
  assert.ok(
    decimalQuantityMigration.includes('"LedgerPurchaseItem"') &&
      decimalQuantityMigration.includes('"quantity" TYPE NUMERIC(12,2)'),
    "migration should convert purchase quantity to NUMERIC(12,2)",
  );
});

test("ledger purchase schema allows raw manual input and decimal quantities", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "schemas.ts",
  );
  const { ledgerPurchaseSchema, toFieldErrors } = await import(
    pathToFileURL(schemaPath).href
  );

  const basePayload = {
    storeId: "store-gangnam",
    ledgerId: "ledger-1",
    closingDate: "2026-06-11",
    version: 1,
    purchases: [
      {
        productId: "product-1",
        purchaseStandardId: "standard-1",
        unitPrice: "12000",
        quantity: "3",
      },
    ],
  };

  assert.equal(ledgerPurchaseSchema.safeParse(basePayload).success, true);

  const rawManual = ledgerPurchaseSchema.parse({
    ...basePayload,
    purchases: [
      {
        productId: "",
        purchaseStandardId: "",
        productName: "수기 광어",
        productCategory: "생물",
        productSpec: "1kg",
        unitPrice: "12000",
        quantity: "3",
      },
    ],
  });
  assert.equal(rawManual.purchases[0].productId, null);
  assert.equal(rawManual.purchases[0].purchaseStandardId, null);
  assert.equal(rawManual.purchases[0].productName, "수기 광어");
  assert.equal(rawManual.purchases[0].productCategory, "생물");
  assert.equal(rawManual.purchases[0].productSpec, "1kg");
  assert.equal(rawManual.purchases[0].sourceType, "MANUAL");

  const unmappedEcountUpload = ledgerPurchaseSchema.safeParse({
    ...basePayload,
    purchases: [
      {
        productId: "",
        purchaseStandardId: "",
        sourceType: "ECOUNT_UPLOAD",
        productName: "냉)삼치",
        productCategory: "냉동",
        productSpec: "15미",
        referenceInfo:
          "이카운트 판매현황 4행 · 일자-No. 2026/06/17 -1 · 거래처 진수산(수산물)",
        unitPrice: "78000",
        quantity: "1",
      },
    ],
  });
  assert.equal(unmappedEcountUpload.success, false);
  assert.deepEqual(toFieldErrors(unmappedEcountUpload.error), {
    "purchases.0.productId": [
      "이카운트 출고/입고 라인은 앱 품목을 선택해 주세요.",
    ],
  });

  const ecountUpload = ledgerPurchaseSchema.parse({
    ...basePayload,
    purchases: [
      {
        productId: "product-1",
        purchaseStandardId: "standard-1",
        sourceType: "ECOUNT_UPLOAD",
        productName: "냉)삼치",
        productCategory: "냉동",
        productSpec: "15미",
        referenceInfo:
          "이카운트 판매현황 4행 · 일자-No. 2026/06/17 -1 · 거래처 진수산(수산물)",
        unitPrice: "78000",
        quantity: "1",
      },
    ],
  });
  assert.equal(ecountUpload.purchases[0].sourceType, "ECOUNT_UPLOAD");
  assert.equal(ecountUpload.purchases[0].productId, "product-1");

  const zeroValues = ledgerPurchaseSchema.parse({
    ...basePayload,
    purchases: [
      {
        productId: "product-1",
        purchaseStandardId: "standard-1",
        unitPrice: "0",
        quantity: "0",
      },
    ],
  });
  assert.equal(zeroValues.purchases[0].unitPrice, 0);
  assert.equal(zeroValues.purchases[0].quantity, 0);

  const standardOnly = ledgerPurchaseSchema.parse({
    ...basePayload,
    purchases: [
      {
        productId: "",
        purchaseStandardId: "standard-1",
        productName: "",
        productCategory: "",
        productSpec: "",
        unitPrice: "12000",
        quantity: "3",
      },
    ],
  });
  assert.equal(standardOnly.purchases[0].productId, null);
  assert.equal(standardOnly.purchases[0].purchaseStandardId, "standard-1");

  const blankRawProductName = ledgerPurchaseSchema.safeParse({
    ...basePayload,
    purchases: [
      {
        productId: "",
        purchaseStandardId: "",
        productName: " ",
        productCategory: "생물",
        productSpec: "1kg",
        unitPrice: "12000",
        quantity: "3",
      },
    ],
  });
  assert.equal(blankRawProductName.success, false);
  assert.deepEqual(toFieldErrors(blankRawProductName.error), {
    "purchases.0.productName": ["품목명을 입력해 주세요."],
  });

  const negativePrice = ledgerPurchaseSchema.safeParse({
    ...basePayload,
    purchases: [{ ...basePayload.purchases[0], unitPrice: -1 }],
  });
  assert.equal(negativePrice.success, false);
  assert.deepEqual(negativePrice.error.flatten().fieldErrors.purchases, [
    "단가는 0원 이상의 정수여야 합니다.",
  ]);

  const decimalQuantity = ledgerPurchaseSchema.parse({
    ...basePayload,
    purchases: [{ ...basePayload.purchases[0], quantity: "2.2" }],
  });
  assert.equal(decimalQuantity.purchases[0].quantity, 2.2);

  const tooManyDecimalPlaces = ledgerPurchaseSchema.safeParse({
    ...basePayload,
    purchases: [{ ...basePayload.purchases[0], quantity: "2.28" }],
  });
  assert.equal(tooManyDecimalPlaces.success, false);
  assert.deepEqual(
    tooManyDecimalPlaces.error.flatten().fieldErrors.purchases,
    ["수량은 0 이상이고 소수점 첫째 자리까지 입력할 수 있습니다."],
  );

  const formattedPrice = ledgerPurchaseSchema.safeParse({
    ...basePayload,
    purchases: [{ ...basePayload.purchases[0], unitPrice: "1,000" }],
  });
  assert.equal(formattedPrice.success, false);

  const overflowAmount = ledgerPurchaseSchema.safeParse({
    ...basePayload,
    purchases: [
      {
        ...basePayload.purchases[0],
        unitPrice: "2147483647",
        quantity: "2",
      },
    ],
  });
  assert.equal(overflowAmount.success, false);
  assert.deepEqual(toFieldErrors(overflowAmount.error), {
    "purchases.0.quantity": ["매입금액은 저장 가능한 범위 이하여야 합니다."],
  });
});

test("ledger purchase schema treats plannedUnitPrice as optional and blocks same-product conflicts", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "schemas.ts",
  );
  const { ledgerPurchaseSchema, toFieldErrors } = await import(
    pathToFileURL(schemaPath).href
  );

  const base = {
    storeId: "store-gangnam",
    ledgerId: "ledger-1",
    closingDate: "2026-06-25",
    version: 1,
  };

  // 빈 판매 예정가는 "계획 없음"(null)으로 해석한다(선택값).
  const emptyPlan = ledgerPurchaseSchema.parse({
    ...base,
    purchases: [
      {
        productId: "product-1",
        unitPrice: "12000",
        quantity: "3",
        plannedUnitPrice: "",
      },
    ],
  });
  assert.equal(emptyPlan.purchases[0].plannedUnitPrice, null);

  // 값이 있으면 0 이상의 정수만 허용하고 그대로 보존한다.
  const withPlan = ledgerPurchaseSchema.parse({
    ...base,
    purchases: [
      {
        productId: "product-1",
        unitPrice: "12000",
        quantity: "3",
        plannedUnitPrice: "15000",
      },
    ],
  });
  assert.equal(withPlan.purchases[0].plannedUnitPrice, 15000);

  // plannedUnitPrice를 아예 보내지 않아도(본사 경로) 유효해야 한다.
  assert.equal(
    ledgerPurchaseSchema.safeParse({
      ...base,
      purchases: [
        { productId: "product-1", unitPrice: "12000", quantity: "3" },
      ],
    }).success,
    true,
  );

  // 같은 품목의 여러 행에 같은 값이면 통과한다.
  assert.equal(
    ledgerPurchaseSchema.safeParse({
      ...base,
      purchases: [
        {
          productId: "product-1",
          unitPrice: "12000",
          quantity: "1",
          plannedUnitPrice: "15000",
        },
        {
          productId: "product-1",
          unitPrice: "12000",
          quantity: "2",
          plannedUnitPrice: "15000",
        },
      ],
    }).success,
    true,
  );

  // 같은 품목의 여러 행에 서로 다른 값이면 충돌로 막는다.
  const conflict = ledgerPurchaseSchema.safeParse({
    ...base,
    purchases: [
      {
        productId: "product-1",
        unitPrice: "12000",
        quantity: "1",
        plannedUnitPrice: "15000",
      },
      {
        productId: "product-1",
        unitPrice: "12000",
        quantity: "2",
        plannedUnitPrice: "16000",
      },
    ],
  });
  assert.equal(conflict.success, false);
  const conflictErrors = toFieldErrors(conflict.error);
  assert.deepEqual(conflictErrors["purchases.1.plannedUnitPrice"], [
    "같은 품목의 오늘 팔 가격은 하루에 하나만 입력해 주세요.",
  ]);

  // 음수 판매 예정가는 거부된다.
  const negative = ledgerPurchaseSchema.safeParse({
    ...base,
    purchases: [
      {
        productId: "product-1",
        unitPrice: "12000",
        quantity: "3",
        plannedUnitPrice: -1,
      },
    ],
  });
  assert.equal(negative.success, false);
});

test("carryover rows: schema discriminates kind; save skips purchase create; GET appends from inventory", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "schemas.ts",
  );
  const { ledgerPurchaseSchema } = await import(pathToFileURL(schemaPath).href);

  const base = {
    storeId: "store-1",
    ledgerId: "ledger-1",
    closingDate: "2026-06-25",
    version: 1,
  };

  // kind를 안 보내면 일반 매입 행(purchase)으로 본다(본사/기존 클라이언트 호환).
  const defaulted = ledgerPurchaseSchema.parse({
    ...base,
    purchases: [{ productId: "p1", unitPrice: "1000", quantity: "1" }],
  });
  assert.equal(defaulted.purchases[0].kind, "purchase");

  // carryover 행은 수량/단가 0이어도 통과하고 kind를 보존한다(판매 예정가만 받는 행).
  const carry = ledgerPurchaseSchema.parse({
    ...base,
    purchases: [
      {
        kind: "carryover",
        productId: "p2",
        unitPrice: "0",
        quantity: "0",
        plannedUnitPrice: "5000",
      },
    ],
  });
  assert.equal(carry.purchases[0].kind, "carryover");
  assert.equal(carry.purchases[0].plannedUnitPrice, 5000);

  // 저장 액션: carryover 행은 ledgerPurchaseItem 생성에서 제외(realPurchases)하되
  // 판매 예정가 저장(saveStoreSalesPricePlansForPurchasesInTx)에는 전체 purchases를 넘긴다.
  const actionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  assert.match(
    actionSource,
    /const realPurchases = parsed\.data\.purchases\.filter\(/,
  );
  assert.match(actionSource, /purchase\.kind !== "carryover"/);
  assert.match(actionSource, /realPurchases\.map\(\(purchase, index\)/);
  // 계획 저장은 carryover를 포함한 전체 purchases를 받는다(이월 판매가도 저장).
  assert.match(
    actionSource,
    /saveStoreSalesPricePlansForPurchasesInTx\(tx,\s*\{[\s\S]*?purchases:\s*parsed\.data\.purchases/,
  );

  // GET/저장 응답: 전일재고>0 이고 오늘 매입 안 한 품목을 carryover 행으로 붙인다.
  const queriesSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "queries.ts",
  );
  assert.match(queriesSource, /previousQuantity:\s*\{\s*gt:\s*0\s*\}/);
  assert.match(
    queriesSource,
    /productId:\s*\{\s*notIn:\s*\[\.\.\.purchaseProductIds\]/,
  );
  assert.match(queriesSource, /kind:\s*"carryover" as const/);
});

test("store purchase edit policy blocks ECount uploaded rows from store edits", async () => {
  const policyPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "purchase-edit-policy.ts",
  );
  const { getStoreEcountPurchaseEditErrors } = await import(
    pathToFileURL(policyPath).href
  );
  const existingRows = [
    {
      id: "purchase-ecount-1",
      productId: null,
      purchaseStandardId: null,
      sourceType: "ECOUNT_UPLOAD",
      productName: "고등어",
      productCategory: "생물",
      productSpec: "28미",
      unitPrice: 34000,
      quantity: 4,
      referenceInfo:
        "이카운트 판매현황 3행 · 일자-No. 2026/06/17 -1 · 거래처 진수산(수산물)",
    },
  ];

  // 정책 반전(2026-06-28): 지점장은 ECOUNT_UPLOAD 라인의 원본 필드도, 장부 적용 단가도
  // 수정할 수 없다(본사 전용). 원본 필드 변경은 원본-정보 차단 메시지로 막힌다.
  assert.deepEqual(
    getStoreEcountPurchaseEditErrors(existingRows, [
      { ...existingRows[0], quantity: 5 },
    ]),
    {
      "purchases.0": [
        "이카운트 출고/입고 라인의 원본 정보(품목·수량·원본 행·적용 단가)는 본사에서만 수정할 수 있습니다.",
      ],
    },
  );
  // 정책 반전(2026-06-28): 적용 단가 변경도 본사 전용이라 지점장 경로에서 막힌다.
  assert.deepEqual(
    getStoreEcountPurchaseEditErrors(existingRows, [
      { ...existingRows[0], unitPrice: 40000 },
    ]),
    {
      "purchases.0": [
        "이카운트 출고/입고 라인의 원본 정보(품목·수량·원본 행·적용 단가)는 본사에서만 수정할 수 있습니다.",
      ],
    },
  );
  // 정책 반전(2026-06-28): 수동(MANUAL) 기존 행의 적용 단가 변경도 막힌다.
  const existingManualRow = {
    id: "purchase-manual-1",
    productId: "product-1",
    purchaseStandardId: null,
    sourceType: "MANUAL",
    productName: "광어",
    productCategory: "활어",
    productSpec: "1kg",
    unitPrice: 12000,
    quantity: 3,
    referenceInfo: null,
  };
  assert.deepEqual(
    getStoreEcountPurchaseEditErrors(
      [existingManualRow],
      [{ ...existingManualRow, unitPrice: 15000 }],
    ),
    {
      "purchases.0.unitPrice": [
        "장부 적용 단가는 본사에서만 수정할 수 있습니다.",
      ],
    },
  );
  // 신규 수동 행(기존 id 없음)의 최초 단가 입력은 수정이 아니므로 허용한다.
  assert.deepEqual(
    getStoreEcountPurchaseEditErrors(
      [],
      [{ ...existingManualRow, id: "draft-manual", unitPrice: 15000 }],
    ),
    {},
  );
  assert.deepEqual(getStoreEcountPurchaseEditErrors(existingRows, []), {
    purchases: [
      "이카운트 출고/입고 라인은 장부 매입 화면에서 삭제할 수 없습니다.",
    ],
  });
  assert.deepEqual(
    getStoreEcountPurchaseEditErrors(
      [],
      [
        {
          id: "draft-ecount",
          sourceType: "ECOUNT_UPLOAD",
          productId: null,
          purchaseStandardId: null,
          productName: "고등어",
          productCategory: "생물",
          productSpec: "28미",
          unitPrice: 34000,
          quantity: 4,
          referenceInfo:
            "이카운트 판매현황 3행 · 일자-No. 2026/06/17 -1 · 거래처 진수산(수산물)",
        },
      ],
    ),
    {
      "purchases.0.sourceType": [
        "이카운트 출고/입고 라인은 본사 이카운트 업로드 화면에서만 만들 수 있습니다.",
      ],
    },
  );
});

test("ledger purchase calculations, queries, and actions expose expected contracts", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { calculatePurchaseTotal } = await import(pathToFileURL(calcPath).href);

  assert.equal(calculatePurchaseTotal([12000, 3000, 0]), 15000);
  assert.equal(calculatePurchaseTotal([]), 0);

  const typeSource = readProjectFile("src", "features", "ledger", "types.ts");
  assert.match(typeSource, /export\s+type\s+LedgerPurchaseLine\s+=/);
  assert.match(typeSource, /sourceType:\s+LedgerPurchaseSource/);
  assert.match(typeSource, /export\s+type\s+LedgerPurchaseStepData\s+=/);

  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "queries.ts",
  );
  assert.match(querySource, /ledgerPurchaseItems:/);
  assert.match(querySource, /function\s+getLedgerPurchaseItems/);
  assert.match(querySource, /purchaseTotal:\s+calculatePurchaseTotal/);
  assert.match(querySource, /export\s+function\s+toLedgerPurchaseStepData/);
  assert.match(querySource, /purchaseTotal/);

  const reconciliationSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "adjustment-reconciliation.ts",
  );
  assert.match(
    reconciliationSource,
    /export\s+async\s+function\s+syncLedgerInventoryPurchasedQuantitiesInTx/,
  );
  assert.match(reconciliationSource, /ledgerPurchaseItem\.findMany/);
  assert.match(reconciliationSource, /ledgerInventoryItem\.findMany/);
  assert.match(reconciliationSource, /purchasedQuantity/);

  const actionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  const purchaseActionStart = actionSource.indexOf(
    "export async function saveLedgerPurchases",
  );
  const purchaseActionEnd = actionSource.indexOf(
    "\nexport async function",
    purchaseActionStart + 1,
  );
  const purchaseActionSource = actionSource.slice(
    purchaseActionStart,
    purchaseActionEnd,
  );
  assert.ok(
    purchaseActionStart >= 0 && purchaseActionEnd > purchaseActionStart,
  );
  assert.match(actionSource, /export\s+async\s+function\s+saveLedgerPurchases/);
  assert.match(actionSource, /ledgerPurchaseSchema\.safeParse/);
  assert.match(actionSource, /requireStoreManagerLedgerEditAccess\(/);
  assert.match(actionSource, /db\.\$transaction/);
  assert.match(
    purchaseActionSource,
    /lossReviewedById:\s*null[\s\S]*lossReviewedAt:\s*null/,
    "saving purchases should clear the loss-step review marker so losses are reviewed again before inventory",
  );
  assert.match(actionSource, /beforeLedger\.status\s*!==\s*"IN_PROGRESS"/);
  assert.match(actionSource, /existingPurchaseItemsById/);
  assert.match(actionSource, /isExistingSnapshotPurchase/);
  assert.match(actionSource, /LedgerPurchaseValidationError/);
  assert.match(actionSource, /getStoreEcountPurchaseEditErrors/);
  assert.match(actionSource, /참고 단가와 품목이 일치하지 않습니다\./);
  assert.match(actionSource, /참고 단가를 확인해 주세요\./);
  assert.match(actionSource, /품목을 확인해 주세요\./);
  assert.match(actionSource, /tx\.ledgerPurchaseItem\.deleteMany/);
  assert.match(actionSource, /tx\.ledgerPurchaseItem\.createMany/);
  assert.match(actionSource, /syncLedgerInventoryPurchasedQuantitiesInTx/);
  const storeInventorySyncIndex = actionSource.indexOf(
    "await syncLedgerInventoryPurchasedQuantitiesInTx",
  );
  const storeAdjustmentReconcileIndex = actionSource.indexOf(
    "await reconcileLedgerInventoryAdjustments",
  );
  assert.ok(
    actionSource.indexOf("tx.ledgerPurchaseItem.createMany") <
      storeInventorySyncIndex,
    "store purchase save should create purchase rows before syncing inventory purchased quantity",
  );
  assert.ok(
    storeInventorySyncIndex < storeAdjustmentReconcileIndex,
    "store purchase save should sync inventory purchased quantity before reconciling adjustments",
  );
  // WO-02(2026-06-22): 매입 저장은 조정 정합화 이후 FIFO lot snapshot을 최신화한다.
  assert.match(actionSource, /from\s+"[^"]*fifo-lots"/);
  assert.match(actionSource, /refreshLedgerInventoryFifoLots\(/);
  assert.ok(
    storeAdjustmentReconcileIndex <
      actionSource.indexOf("await refreshLedgerInventoryFifoLots"),
    "store purchase save should refresh FIFO lots after reconciling adjustments",
  );
  assert.match(actionSource, /calculateInventoryAmount\(/);
  assert.match(actionSource, /action:\s*"ledger\.purchases\.saved"/);
  assert.match(actionSource, /sourceType:\s*purchase\.sourceType/);
  assert.match(actionSource, /writeAuditLog\(/);
  assert.match(actionSource, /revalidateLedgerSalesPaths\(\)/);

  // WO(2026-06-25): 매입 저장 트랜잭션이 "오늘 팔 가격(예상)"을 StoreSalesPricePlan에
  // 함께 반영한다. 같은 품목은 upsert로 하루 1개 값, 비운 품목은 deleteMany로 계획 삭제.
  assert.match(actionSource, /saveStoreSalesPricePlansForPurchasesInTx\(/);
  assert.match(actionSource, /tx\.storeSalesPricePlan\.upsert/);
  assert.match(actionSource, /tx\.storeSalesPricePlan\.deleteMany/);
  assert.match(actionSource, /syncLedgerLossItemsWithSalesPricePlansInTx/);
  // 저장 응답도 매입 행에 판매 예정가를 채워야 한다(없으면 저장 직후 미저장 변경 경고가 잘못 뜸).
  assert.match(actionSource, /fillPurchasePlannedUnitPricesInTx\(/);
  // 계획 반영은 매입 행 생성 이후, 같은 트랜잭션에서 일어나야 한다(부분 저장 방지).
  assert.ok(
    actionSource.indexOf("tx.ledgerPurchaseItem.createMany") <
      actionSource.indexOf("await saveStoreSalesPricePlansForPurchasesInTx("),
    "sales price plan upsert should run after purchase rows are created",
  );
  // 판매 예정가와 손실 검토 상태가 함께 바뀌므로 후속 손실/재고 페이지를 갱신한다.
  assert.match(
    actionSource,
    /revalidateStoreEntryPaths\(\["losses",\s*"inventory"\]\)/,
  );

  const hqActionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-edit-actions.ts",
  );
  // WO-08(2026-06-22): 최종 정책은 본사 ECOUNT_UPLOAD 오버라이트 허용이므로
  // HQ 매입 저장 경로는 getStoreEcountPurchaseEditErrors를 호출하지 않는다.
  // 해당 차단 검증은 지점장 저장 경로(actions.ts)에만 남는다.
  assert.doesNotMatch(hqActionSource, /getStoreEcountPurchaseEditErrors/);
  // WO(2026-06-25): 판매가 계획(StoreSalesPricePlan)은 지점장 매입 화면 전용이므로
  // 본사 매입 저장 경로는 계획을 쓰지 않는다.
  assert.doesNotMatch(hqActionSource, /storeSalesPricePlan/i);
  // WO(2026-06-24) 검토 #2: 본사 보정은 "적용 단가(unitPrice)"만 바꿀 수 있고,
  // 이카운트 원본 식별 정보(품목/구분/규격/수량)는 기존 행에서 그대로 가져온다.
  // 따라서 HQ 저장은 ECOUNT 행에 한해 입력값 quantity/원본필드를 그대로 신뢰하지 않는다.
  assert.match(hqActionSource, /const snapshot = isEcountUpload/);
  assert.match(
    hqActionSource,
    /const quantity = isEcountUpload\s*\?\s*decimalToNumber\(existing\.quantity\)/,
  );
  // 적용 단가는 입력값을 그대로 반영한다(본사 단가 보정 허용).
  assert.match(hqActionSource, /unitPrice:\s*purchase\.unitPrice/);
  assert.match(hqActionSource, /amount:\s*getPurchaseAmount\(/);
  assert.match(hqActionSource, /action:\s*"ledger\.hq\.purchases\.saved"/);
  // WO(2026-06-24) 검토 #4: 적용 단가 보정 감사 로그가 원본/적용 단가를 구분해 남는다.
  assert.match(
    hqActionSource,
    /action:\s*"ledger\.hq\.ecount_unit_price\.overridden"/,
  );
  assert.match(hqActionSource, /writeAuditLog\(/);
  assert.match(hqActionSource, /syncLedgerInventoryPurchasedQuantitiesInTx/);
  const hqInventorySyncIndex = hqActionSource.indexOf(
    "await syncLedgerInventoryPurchasedQuantitiesInTx",
  );
  const hqAdjustmentReconcileIndex = hqActionSource.indexOf(
    "await reconcileLedgerInventoryAdjustments",
  );
  assert.ok(
    hqActionSource.indexOf("tx.ledgerPurchaseItem.createMany") <
      hqInventorySyncIndex,
    "HQ purchase save should create purchase rows before syncing inventory purchased quantity",
  );
  assert.ok(
    hqInventorySyncIndex < hqAdjustmentReconcileIndex,
    "HQ purchase save should sync inventory purchased quantity before reconciling adjustments",
  );
  // WO-02(2026-06-22): HQ 매입 수정도 조정 정합화 이후 FIFO lot snapshot을 최신화한다.
  assert.match(hqActionSource, /from\s+"[^"]*fifo-lots"/);
  assert.match(hqActionSource, /refreshLedgerInventoryFifoLots\(/);
  assert.ok(
    hqAdjustmentReconcileIndex <
      hqActionSource.indexOf("await refreshLedgerInventoryFifoLots"),
    "HQ purchase save should refresh FIFO lots after reconciling adjustments",
  );

  // WO(2026-06-24): 정책 전환으로 일일 장부용 ECount "출고/입고 원장" 업로드가 지원 기능이 됐다.
  // 새 supply 플로우는 ecount-supply-* 파일에 구현되며 previewEcountSupplyUpload/commitEcountSupplyImport를 노출한다.
  // (구버전 파일명 ecount-purchase-actions.ts/ecount-purchase-matching.ts는 여전히 존재하지 않는다.)
  const supplyActionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "ecount-supply-actions.ts",
  );
  assert.match(
    supplyActionSource,
    /export\s+async\s+function\s+previewEcountSupplyUpload/,
    "daily-ledger ECount supply upload preview must exist",
  );

  const supplyCommitSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "ecount-supply-commit.ts",
  );
  assert.match(
    supplyCommitSource,
    /export\s+async\s+function\s+commitEcountSupplyImport/,
    "daily-ledger ECount supply commit must exist",
  );

  assert.equal(
    existsSync(
      path.join(
        root,
        "src",
        "features",
        "ledger",
        "ecount-purchase-actions.ts",
      ),
    ),
    false,
    "legacy ecount-purchase-actions.ts filename remains absent",
  );
  assert.equal(
    existsSync(
      path.join(
        root,
        "src",
        "features",
        "ledger",
        "ecount-purchase-matching.ts",
      ),
    ),
    false,
  );

  // 회의록은 일일 장부용 이카운트 출고/입고 업로드가 지원 기능임을 설명한다.
  const meetingChangeSource = readProjectFile("docs", "meeting", "change.md");
  assert.match(meetingChangeSource, /이카운트[\s\S]*출고\/입고/);
  assert.match(meetingChangeSource, /EcountImportBatch/);
});

test("ledger purchase UI and routing are wired for the purchase step", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "page.tsx",
  );
  assert.match(
    pageSource,
    /type\s+StoreEntryStep\s*=\s*"sales"\s*\|\s*"cost"\s*\|\s*"purchase"\s*\|\s*"work"/,
  );
  assert.match(pageSource, /step === "purchase"/);
  assert.match(pageSource, /PurchaseStepClient/);
  assert.match(pageSource, /getActiveProductOptions/);
  // WO(2026-06-24): 매입 기준 select 제거로 purchase step 페이지는 매입 기준 옵션 prop을 더 이상 주입하지 않는다.
  assert.doesNotMatch(pageSource, /getActivePurchaseStandardOptions/);

  const componentSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "purchase-step-client.tsx",
  );
  assert.match(componentSource, /saveLedgerPurchases/);
  assert.doesNotMatch(componentSource, /previewEcountPurchaseUpload/);
  assert.doesNotMatch(componentSource, /accept="\.xlsx"/);
  assert.doesNotMatch(componentSource, /엑셀 불러오기/);
  assert.doesNotMatch(componentSource, /saveImportedPurchases/);
  assert.doesNotMatch(componentSource, /hasUnmappedEcountLine/);
  assert.doesNotMatch(componentSource, /ecountUploadEnabled/);
  assert.match(componentSource, /sourceType\s*===\s*"ECOUNT_UPLOAD"/);
  assert.match(componentSource, /sourceType:\s*line\.sourceType/);
  assert.match(componentSource, /inputMode="decimal"/);
  assert.match(componentSource, /focusFirstError/);
  assert.doesNotMatch(componentSource, /sanitizeAmount/);
  assert.match(componentSource, /getDraftPurchaseTotal/);
  assert.match(componentSource, /clearRowErrors/);
  assert.match(componentSource, /referenceUnitPrice/);
  // 간소화(2026-07-02): "품목명:" 요약 박스는 제거되고 원문명/구분/규격은 접이식 상세로 이동.
  assert.match(componentSource, /원문명/);
  // WO(2026-06-24): 매입 기준 select 제거 → 헬퍼 문구에서 "매입 기준" 표현이 사라지고
  // 품목 선택은 defaultUnitPrice만 채운다.
  assert.doesNotMatch(componentSource, /applyStandard/);
  assert.doesNotMatch(componentSource, /매입 기준/);
  assert.match(componentSource, /defaultUnitPrice/);
  assert.match(
    componentSource,
    /선택 가능한 active 품목이 없어도 수동 입력할 수\s+있습니다\./,
  );
  assert.match(componentSource, /저장됐습니다\./);
  assert.match(componentSource, /매입 합계/);
  assert.match(componentSource, /min-h-11/);
  // WO(2026-06-25): 매입 행에 "오늘 팔 가격(예상)" 입력과 안내 문구가 있고, 저장 payload에
  // plannedUnitPrice를 담는다. 본사 탭은 showSalesPricePlan으로 끌 수 있다.
  assert.match(componentSource, /오늘 팔 가격\(예상\)/);
  assert.match(componentSource, /7단계 추정 매출에 쓰는 판매 예정가입니다\./);
  assert.match(componentSource, /showSalesPricePlan/);
  assert.match(componentSource, /plannedUnitPrice/);

  const hqDetailSource = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );
  assert.match(
    hqDetailSource,
    /<TabsContent value="purchases"[\s\S]*<PurchaseStepClient[\s\S]*saveAction=\{saveHqLedgerPurchases\}/s,
  );
  assert.doesNotMatch(hqDetailSource, /ecountUploadEnabled/);
  // WO(2026-06-25): 본사 검토 장부 탭에서는 판매 예정가 입력을 끈다(지점장 전용).
  assert.match(
    hqDetailSource,
    /<TabsContent value="purchases"[\s\S]*<PurchaseStepClient[\s\S]*showSalesPricePlan=\{false\}/s,
  );
});
