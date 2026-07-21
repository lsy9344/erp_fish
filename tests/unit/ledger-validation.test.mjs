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

function getExportedAsyncFunctionSource(source, functionName) {
  const start = source.indexOf(`export async function ${functionName}`);
  const next = source.indexOf("\nexport async function ", start + 1);

  assert.ok(start >= 0, `${functionName} should exist`);

  return source.slice(start, next >= 0 ? next : source.length);
}

test("validation helper preserves dotted field paths for nested step errors", async () => {
  const ledgerSchemaPath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "schemas.ts",
  );
  const inventorySchemaPath = assertProjectFile(
    "src",
    "features",
    "inventory",
    "schemas.ts",
  );
  const lossesSchemaPath = assertProjectFile(
    "src",
    "features",
    "losses",
    "schemas.ts",
  );
  const {
    ledgerExpenseSchema,
    ledgerPurchaseSchema,
    ledgerSalesPaymentSchema,
    toFieldErrors,
  } = await import(pathToFileURL(ledgerSchemaPath).href);
  const { ledgerInventorySchema, ledgerInventoryAdjustmentSchema } =
    await import(pathToFileURL(inventorySchemaPath).href);
  const { ledgerLossesSchema } = await import(
    pathToFileURL(lossesSchemaPath).href
  );

  const context = {
    storeId: "store-gangnam",
    ledgerId: "ledger-1",
    closingDate: "2026-06-11",
    version: 1,
  };

  const salesNaN = ledgerSalesPaymentSchema.safeParse({
    ...context,
    authorDisplayName: "작성자",
    totalSalesAmount: Number.NaN,
    cashAmount: 0,
    cardAmount: 0,
    otherPaymentAmount: 0,
  });
  assert.equal(salesNaN.success, false);
  assert.deepEqual(toFieldErrors(salesNaN.error), {
    totalSalesAmount: ["총매출은 0원 이상의 정수여야 합니다."],
  });

  const expenseInvalid = ledgerExpenseSchema.safeParse({
    ...context,
    expenses: [{ ledgerInputCodeId: "", amount: "1,000", memo: "" }],
  });
  assert.equal(expenseInvalid.success, false);
  assert.deepEqual(toFieldErrors(expenseInvalid.error), {
    "expenses.0.ledgerInputCodeId": ["지출 항목을 선택해 주세요."],
    "expenses.0.amount": ["지출 금액은 0원 이상의 정수여야 합니다."],
  });

  const purchaseInvalid = ledgerPurchaseSchema.safeParse({
    ...context,
    purchases: [
      {
        productId: "",
        purchaseStandardId: "",
        productName: "",
        productCategory: "",
        productSpec: "",
        unitPrice: "2147483647",
        quantity: "2",
      },
    ],
  });
  assert.equal(purchaseInvalid.success, false);
  assert.deepEqual(toFieldErrors(purchaseInvalid.error), {
    "purchases.0.productName": ["품목명을 입력해 주세요."],
    "purchases.0.productCategory": ["구분을 입력해 주세요."],
    "purchases.0.productSpec": ["규격을 입력해 주세요."],
    "purchases.0.quantity": ["매입금액은 저장 가능한 범위 이하여야 합니다."],
  });

  const inventoryInvalid = ledgerInventorySchema.safeParse({
    ...context,
    items: [
      {
        productId: "product-1",
        currentQuantity: 10_000_000_000,
        quantity: "1.555",
      },
    ],
  });
  assert.equal(inventoryInvalid.success, false);
  assert.deepEqual(toFieldErrors(inventoryInvalid.error), {
    "items.0.currentQuantity": [
      "재고 수량은 0 이상이고 소수점 첫째 자리까지 입력할 수 있습니다.",
    ],
    "items.0.quantity": [
      "재고 수량은 0 이상이고 소수점 첫째 자리까지 입력할 수 있습니다.",
    ],
  });

  const adjustmentInvalid = ledgerInventoryAdjustmentSchema.safeParse({
    ...context,
    productId: "product-1",
    actualQuantity: Infinity,
    reason: "",
  });
  assert.equal(adjustmentInvalid.success, false);
  assert.deepEqual(toFieldErrors(adjustmentInvalid.error), {
    actualQuantity: [
      "실제 재고 수량은 0 이상이고 소수점 첫째 자리까지 입력할 수 있습니다.",
    ],
    reason: ["바꾼 이유를 입력해 주세요."],
  });

  const lossesInvalid = ledgerLossesSchema.safeParse({
    ...context,
    losses: [
      {
        productId: "product-1",
        ledgerInputCodeId: "loss-code-1",
        quantity: "0",
        recoveredAmount: "0",
        reason: "폐기 처리",
      },
    ],
  });
  assert.equal(lossesInvalid.success, false);
  assert.deepEqual(toFieldErrors(lossesInvalid.error), {
    "losses.0.quantity": [
      "박스단위 수량 또는 떨이로 실제 판매한 금액 중 하나는 0보다 커야 합니다.",
    ],
  });
});

test("stored decimal quantity resolution requires matching identity and consumes each row once", async () => {
  const validationPath = assertProjectFile("src", "lib", "validation.ts");
  const inventoryCalculationPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "inventory.ts",
  );
  const {
    consumeStoredPurchaseQuantity,
    consumeStoredLossQuantity,
    getLossQuantityIdentity,
    getPurchaseQuantityIdentity,
    validatePurchaseAmount,
  } = await import(pathToFileURL(validationPath).href);
  const { calculateInventoryAmount } = await import(
    pathToFileURL(inventoryCalculationPath).href
  );
  const storedPurchase = {
    id: "purchase-1",
    productId: "product-1",
    purchaseStandardId: "standard-1",
    sourceType: "MANUAL",
    productName: "광어",
    productCategory: "생물",
    productSpec: "1kg",
    referenceInfo: "거래처 A",
    unitPrice: 10_000,
    quantity: 2.28,
  };
  const storedPurchases = new Map([
    [
      "purchase-1",
      {
        quantity: storedPurchase.quantity,
        identity: getPurchaseQuantityIdentity(storedPurchase),
      },
    ],
  ]);
  const unrelatedPurchaseEdit = { ...storedPurchase, unitPrice: 11_000 };
  const clientShapedPurchase = {
    ...unrelatedPurchaseEdit,
    purchaseStandardId: storedPurchase.purchaseStandardId,
    quantity: null,
  };

  const validEditIds = new Set();
  assert.equal(
    consumeStoredPurchaseQuantity(
      clientShapedPurchase.id,
      clientShapedPurchase.quantity,
      clientShapedPurchase,
      storedPurchases,
      validEditIds,
    ),
    2.28,
    "the shared store/HQ client payload preserves a standard-linked legacy quantity",
  );
  assert.equal(
    consumeStoredPurchaseQuantity(
      "purchase-1",
      null,
      unrelatedPurchaseEdit,
      storedPurchases,
      validEditIds,
    ),
    null,
    "the same stored row cannot be reused twice",
  );

  assert.equal(
    consumeStoredPurchaseQuantity(
      "purchase-1",
      null,
      { ...unrelatedPurchaseEdit, productId: "product-2" },
      storedPurchases,
      new Set(),
    ),
    null,
    "a legacy sentinel cannot be paired with changed identity fields",
  );
  assert.equal(
    consumeStoredPurchaseQuantity(
      "foreign-purchase",
      null,
      unrelatedPurchaseEdit,
      storedPurchases,
      new Set(),
    ),
    null,
    "a missing or foreign stored row stays rejected",
  );

  const explicitEditIds = new Set();
  assert.equal(
    consumeStoredPurchaseQuantity(
      "purchase-1",
      1.5,
      { ...unrelatedPurchaseEdit, productId: "product-2" },
      storedPurchases,
      explicitEditIds,
    ),
    1.5,
    "an explicit valid quantity does not need legacy identity recovery",
  );
  assert.equal(
    consumeStoredPurchaseQuantity(
      "purchase-1",
      1.6,
      { ...unrelatedPurchaseEdit, productId: "product-2" },
      storedPurchases,
      explicitEditIds,
    ),
    null,
    "duplicate existing IDs are rejected even when both quantities are explicit",
  );
  assert.equal(
    consumeStoredPurchaseQuantity(
      "new-purchase",
      1.2,
      { ...unrelatedPurchaseEdit, id: "new-purchase" },
      storedPurchases,
      new Set(),
    ),
    1.2,
    "a new row with an explicit quantity remains valid",
  );

  const storedLoss = {
    id: "loss-1",
    productId: "product-1",
    ledgerInputCodeId: "loss-type-1",
    quantity: 2.28,
    recoveredAmount: 0,
    reason: "기존 사유",
  };
  const storedLosses = new Map([
    [
      storedLoss.id,
      {
        quantity: storedLoss.quantity,
        identity: getLossQuantityIdentity(storedLoss),
      },
    ],
  ]);
  assert.equal(
    consumeStoredLossQuantity(
      storedLoss.id,
      null,
      { ...storedLoss, recoveredAmount: 1_000, reason: "수정 사유" },
      storedLosses,
      new Set(),
    ),
    2.28,
    "loss recovery preserves a legacy quantity across unrelated edits",
  );
  assert.equal(
    consumeStoredLossQuantity(
      storedLoss.id,
      null,
      { ...storedLoss, ledgerInputCodeId: "loss-type-2" },
      storedLosses,
      new Set(),
    ),
    null,
    "loss recovery rejects changed product/type identity",
  );

  const overflowAmountResult = validatePurchaseAmount(
    4,
    calculateInventoryAmount(2.28, 2_147_483_647),
  );
  assert.deepEqual(overflowAmountResult, {
    ok: false,
    fieldErrors: {
      "purchases.4.quantity": ["매입금액은 저장 가능한 범위 이하여야 합니다."],
    },
  });
  assert.deepEqual(
    validatePurchaseAmount(4, calculateInventoryAmount(1.2, 10_000)),
    { ok: true, amount: 12_000 },
  );
});

test("store save actions authorize store access before detailed field validation", () => {
  const ledgerActionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  const inventoryActionSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "actions.ts",
  );
  const lossesActionSource = readProjectFile(
    "src",
    "features",
    "losses",
    "actions.ts",
  );
  const actionChecks = [
    [ledgerActionSource, "saveLedgerSalesPayment", "parseLedgerSalesInput"],
    [ledgerActionSource, "saveLedgerExpenses", "parseLedgerExpenseInput"],
    [ledgerActionSource, "saveLedgerPurchases", "parseLedgerPurchaseInput"],
    [ledgerActionSource, "saveLedgerWorkInfo", "parseLedgerWorkInfoInput"],
    [ledgerActionSource, "submitLedgerForReview", "parseLedgerSubmitInput"],
    [
      inventoryActionSource,
      "saveLedgerInventoryItems",
      "parseLedgerInventoryInput",
    ],
    // 정책 반전(2026-06-28): saveLedgerInventoryAdjustment는 본사 전용으로 이관됐고 권한 확인
    // 후 FORBIDDEN으로 거부만 한다. 상세 검증 단계가 없어 이 목록에서 제외한다(아래 별도 검증).
    [lossesActionSource, "saveLedgerLosses", "parseLedgerLossesInput"],
  ];

  for (const [source, functionName, detailedParseName] of actionChecks) {
    const functionSource = getExportedAsyncFunctionSource(source, functionName);
    const accessParseIndex = functionSource.indexOf("StoreAccessInput(input)");
    const authIndex = functionSource.indexOf(
      "requireStoreManagerLedgerEditAccess(access.data.storeId)",
    );
    const detailedParseIndex = functionSource.indexOf(
      `${detailedParseName}(input)`,
    );

    assert.ok(
      accessParseIndex >= 0,
      `${functionName} should minimally parse storeId first`,
    );
    assert.ok(
      authIndex > accessParseIndex,
      `${functionName} should call requireStoreManagerLedgerEditAccess after storeId parse`,
    );
    assert.ok(
      detailedParseIndex > authIndex,
      `${functionName} should run detailed validation after authorization`,
    );
  }

  // saveLedgerInventoryAdjustment: storeId 파싱 → 권한 확인 → FORBIDDEN 거부 순서.
  const adjustmentSource = getExportedAsyncFunctionSource(
    inventoryActionSource,
    "saveLedgerInventoryAdjustment",
  );
  const adjAccessIndex = adjustmentSource.indexOf("StoreAccessInput(input)");
  const adjAuthIndex = adjustmentSource.indexOf(
    "requireStoreManagerLedgerEditAccess(access.data.storeId)",
  );
  const adjForbiddenIndex = adjustmentSource.indexOf('"FORBIDDEN"');
  assert.ok(adjAccessIndex >= 0, "adjustment should parse storeId first");
  assert.ok(
    adjAuthIndex > adjAccessIndex,
    "adjustment should authorize after storeId parse",
  );
  assert.ok(
    adjForbiddenIndex > adjAuthIndex,
    "adjustment should reject with FORBIDDEN after authorization",
  );
});

test("step clients keep field errors connected to accessible descriptions and focus", () => {
  // 단계 순서 변경(2026-07-02): 작성자 표시명 입력은 1단계 매입 화면으로 옮겨졌다.
  // 매입 화면이 서버 작성자 오류를 첫 매입 행보다 먼저 포커스하는지 검증한다.
  const purchaseSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "purchase-step-client.tsx",
  );
  const purchaseFocusSource = purchaseSource.slice(
    purchaseSource.indexOf("function focusFirstError"),
    purchaseSource.indexOf("async function saveCurrentDraft"),
  );

  assert.match(purchaseFocusSource, /errors\.authorDisplayName\?\.length/);
  assert.match(
    purchaseFocusSource,
    /authorDisplayNameInputRef\.current\?\.focus/,
  );
  assert.ok(
    purchaseFocusSource.indexOf("errors.authorDisplayName?.length") <
      purchaseFocusSource.indexOf("purchases.${index}"),
    "purchase step should focus author display name before purchase rows",
  );

  const componentFiles = [
    [
      "src",
      "features",
      "ledger",
      "components",
      "sales-payment-step-client.tsx",
    ],
    ["src", "features", "ledger", "components", "expense-step-client.tsx"],
    ["src", "features", "ledger", "components", "purchase-step-client.tsx"],
    ["src", "features", "inventory", "components", "inventory-step-client.tsx"],
    ["src", "features", "losses", "components", "loss-step-client.tsx"],
    ["src", "features", "ledger", "components", "workstep-client.tsx"],
  ];

  for (const segments of componentFiles) {
    const source = readProjectFile(...segments);
    const fileName = segments.at(-1);

    assert.match(source, /fieldErrors/);
    assert.match(source, /aria-invalid=\{Boolean\(/);
    assert.match(source, /aria-describedby=\{/);
    assert.match(source, /FieldError|role="alert"/);
    assert.match(
      source,
      /focusFirstError|workerCountError/,
      `${fileName} should focus the first visible server field error`,
    );
  }
});

test("review summary keeps required input errors separate from calculation states", () => {
  const reviewValidationSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "review-validation.ts",
  );
  const reviewSummarySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "review-summary-client.tsx",
  );

  assert.match(reviewValidationSource, /id:\s*"sales"/);
  assert.match(reviewValidationSource, /id:\s*"expenses"/);
  assert.match(reviewValidationSource, /id:\s*"purchases"/);
  assert.match(reviewValidationSource, /id:\s*"inventory"/);
  assert.match(reviewValidationSource, /id:\s*"work"/);
  assert.match(
    reviewValidationSource,
    /id:\s*"losses"[\s\S]*status:\s*"review"/,
  );
  assert.doesNotMatch(
    reviewValidationSource,
    /data-insufficient|policy-unconfirmed|calculation-unavailable/,
  );

  assert.match(reviewSummarySource, /review-metrics-heading/);
  assert.match(reviewSummarySource, /review-missing-heading/);
  assert.match(reviewSummarySource, /review-warnings-heading/);
  assert.match(reviewSummarySource, /formatMetric\(metric\)/);
  assert.match(reviewSummarySource, /metric\.status !== "ok"/);
  assert.match(reviewSummarySource, /currentReviewData\.missingItems\.map/);
  assert.match(reviewSummarySource, /currentReviewData\.warnings\.map/);
  assert.match(reviewSummarySource, /currentReviewData\.signals\.map/);
  assert.doesNotMatch(
    reviewSummarySource,
    /disabled=\{[^}]*missingItems|disabled=\{[^}]*warnings|disabled=\{[^}]*signals/,
  );
});
