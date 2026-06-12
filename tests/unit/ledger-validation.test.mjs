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
    authorDisplayName: "",
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
    "expenses.0.ledgerInputCodeId": ["비용 항목을 선택해 주세요."],
    "expenses.0.amount": ["비용 금액은 0원 이상의 정수여야 합니다."],
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
        currentQuantity: 2_147_483_648,
        quantity: "1.5",
      },
    ],
  });
  assert.equal(inventoryInvalid.success, false);
  assert.deepEqual(toFieldErrors(inventoryInvalid.error), {
    "items.0.currentQuantity": ["재고 수량은 0 이상의 정수여야 합니다."],
    "items.0.quantity": ["재고 수량은 0 이상의 정수여야 합니다."],
  });

  const adjustmentInvalid = ledgerInventoryAdjustmentSchema.safeParse({
    ...context,
    productId: "product-1",
    actualQuantity: Infinity,
    reason: "",
  });
  assert.equal(adjustmentInvalid.success, false);
  assert.deepEqual(toFieldErrors(adjustmentInvalid.error), {
    actualQuantity: ["실제 재고 수량은 0 이상의 정수여야 합니다."],
    reason: ["조정 사유를 입력해 주세요."],
  });

  const lossesInvalid = ledgerLossesSchema.safeParse({
    ...context,
    losses: [
      {
        productId: "product-1",
        ledgerInputCodeId: "loss-code-1",
        quantity: "0",
        amount: "0",
        reason: "폐기 처리",
      },
    ],
  });
  assert.equal(lossesInvalid.success, false);
  assert.deepEqual(toFieldErrors(lossesInvalid.error), {
    "losses.0.quantity": ["수량 또는 손실액 중 하나는 0보다 커야 합니다."],
  });
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
    [
      inventoryActionSource,
      "saveLedgerInventoryAdjustment",
      "parseLedgerInventoryAdjustmentInput",
    ],
    [lossesActionSource, "saveLedgerLosses", "parseLedgerLossesInput"],
  ];

  for (const [source, functionName, detailedParseName] of actionChecks) {
    const functionSource = getExportedAsyncFunctionSource(source, functionName);
    const accessParseIndex = functionSource.indexOf("StoreAccessInput(input)");
    const authIndex = functionSource.indexOf(
      "requireStoreAccess(access.data.storeId)",
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
      `${functionName} should call requireStoreAccess after storeId parse`,
    );
    assert.ok(
      detailedParseIndex > authIndex,
      `${functionName} should run detailed validation after authorization`,
    );
  }
});

test("step clients keep field errors connected to accessible descriptions and focus", () => {
  const salesSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "sales-payment-step-client.tsx",
  );
  const salesFocusSource = salesSource.slice(
    salesSource.indexOf("function focusFirstError"),
    salesSource.indexOf("async function saveCurrentDraft"),
  );

  assert.match(salesFocusSource, /errors\.authorDisplayName\?\.length/);
  assert.match(salesFocusSource, /authorDisplayNameInputRef\.current\?\.focus/);
  assert.ok(
    salesFocusSource.indexOf("errors.authorDisplayName?.length") <
      salesFocusSource.indexOf("errors.totalSalesAmount?.length"),
    "sales step should focus author display name before later amount fields",
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
