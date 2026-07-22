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

test("ledger loss model and migration persist snapshots and relations", () => {
  const schema = readProjectFile("prisma", "schema.prisma");

  assert.match(
    schema,
    /model\s+DailyLedger\s*{[^}]*ledgerLossItems\s+LedgerLossItem\[\]/s,
  );
  assert.match(
    schema,
    /model\s+Product\s*{[^}]*ledgerLossItems\s+LedgerLossItem\[\]/s,
  );
  assert.match(
    schema,
    /model\s+LedgerInputCode\s*{[^}]*ledgerLossItems\s+LedgerLossItem\[\]/s,
  );
  assert.match(
    schema,
    /model\s+User\s*{[^}]*createdLedgerLossItems\s+LedgerLossItem\[\]\s+@relation\("LedgerLossItemCreatedBy"\)[^}]*updatedLedgerLossItems\s+LedgerLossItem\[\]\s+@relation\("LedgerLossItemUpdatedBy"\)/s,
  );
  assert.match(
    schema,
    /model\s+LedgerLossItem\s*{[^}]*dailyLedgerId\s+String[^}]*productId\s+String[^}]*ledgerInputCodeId\s+String[^}]*productName\s+String[^}]*productCategory\s+String[^}]*productSpec\s+String[^}]*unitPrice\s+Int[^}]*lossTypeName\s+String[^}]*quantity\s+Decimal\s+@db\.Decimal\(12,\s*2\)[^}]*amount\s+Int[^}]*reason\s+String[^}]*createdById\s+String[^}]*updatedById\s+String[^}]*@@index\(\[dailyLedgerId\]\)[^}]*@@index\(\[productId\]\)[^}]*@@index\(\[ledgerInputCodeId\]\)/s,
  );
  assert.match(schema, /recoveredAmount\s+Int/);

  const migrationName = migrationDirNames().find((name) =>
    name.includes("add_ledger_loss_items"),
  );
  assert.ok(migrationName, "ledger loss migration should exist");

  const migration = readFileSync(
    assertProjectFile("prisma", "migrations", migrationName, "migration.sql"),
    "utf8",
  );
  assert.ok(
    migration.includes('CREATE TABLE "LedgerLossItem"'),
    "migration should create LedgerLossItem",
  );
  assert.ok(
    migration.includes('"lossTypeName" TEXT NOT NULL') &&
      migration.includes('"quantity" INTEGER NOT NULL') &&
      migration.includes('"amount" INTEGER NOT NULL') &&
      migration.includes('"reason" TEXT NOT NULL'),
    "migration should store loss snapshots, quantity, loss amount, and reason",
  );

  const recoveredAmountMigration = migrationDirNames().find((name) =>
    name.includes("add_ledger_loss_recovered_amount"),
  );
  assert.ok(
    recoveredAmountMigration,
    "ledger loss recovered amount migration should exist",
  );
  const recoveredAmountSql = readFileSync(
    assertProjectFile(
      "prisma",
      "migrations",
      recoveredAmountMigration,
      "migration.sql",
    ),
    "utf8",
  );
  assert.ok(
    recoveredAmountSql.includes('"recoveredAmount" INTEGER'),
    "migration should add recoveredAmount column",
  );
});

test("ledger loss schema validates recovered sales rows and requires Korean reason message", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "losses",
    "schemas.ts",
  );
  const { ledgerLossesSchema } = await import(pathToFileURL(schemaPath).href);

  const payload = {
    storeId: "store-gangnam",
    ledgerId: "ledger-1",
    closingDate: "2026-06-11",
    version: 1,
    losses: [
      {
        id: "",
        productId: "product-1",
        ledgerInputCodeId: "loss-code-1",
        quantity: "2",
        recoveredAmount: "3000",
        reason: "폐기 처리",
      },
    ],
  };

  assert.equal(ledgerLossesSchema.safeParse(payload).success, true);
  const decimalQuantity = ledgerLossesSchema.parse({
    ...payload,
    losses: [{ ...payload.losses[0], quantity: "1.25" }],
  });
  assert.equal(decimalQuantity.losses[0].quantity, 1.25);

  const minimumQuantity = ledgerLossesSchema.parse({
    ...payload,
    losses: [{ ...payload.losses[0], quantity: "0.01" }],
  });
  assert.equal(minimumQuantity.losses[0].quantity, 0.01);

  const unchangedLegacyQuantity = ledgerLossesSchema.parse({
    ...payload,
    losses: [{ ...payload.losses[0], id: "loss-1", quantity: null }],
  });
  assert.equal(unchangedLegacyQuantity.losses[0].quantity, null);

  assert.equal(
    ledgerLossesSchema.safeParse({
      ...payload,
      losses: [{ ...payload.losses[0], id: "", quantity: null }],
    }).success,
    false,
  );

  for (const quantity of [
    "-1",
    ".5",
    "1.",
    "1.234",
    "1,000",
    "1e2",
    " ",
    "9999999999.991",
    "10000000000",
  ]) {
    assert.equal(
      ledgerLossesSchema.safeParse({
        ...payload,
        losses: [{ ...payload.losses[0], quantity }],
      }).success,
      false,
      `${quantity} must not be accepted as a loss quantity`,
    );
  }

  const maximumQuantity = ledgerLossesSchema.parse({
    ...payload,
    losses: [{ ...payload.losses[0], quantity: "9999999999.99" }],
  });
  assert.equal(maximumQuantity.losses[0].quantity, 9_999_999_999.99);

  assert.equal(
    ledgerLossesSchema.safeParse({
      ...payload,
      losses: [{ ...payload.losses[0], reason: " " }],
    }).success,
    false,
  );
  assert.equal(
    ledgerLossesSchema.safeParse({
      ...payload,
      losses: [{ ...payload.losses[0], quantity: "1.234" }],
    }).success,
    false,
  );

  assert.equal(
    ledgerLossesSchema.safeParse({
      ...payload,
      losses: [{ ...payload.losses[0], id: "loss-1", recoveredAmount: "" }],
    }).success,
    false,
  );

  const invalidReason = ledgerLossesSchema.safeParse({
    ...payload,
    losses: [{ ...payload.losses[0], reason: "" }],
  });

  assert.equal(invalidReason.success, false);
  assert.equal(
    invalidReason.error.issues[0].message,
    "사유/특이사항을 입력해 주세요.",
  );

  const invalidQuantity = ledgerLossesSchema.safeParse({
    ...payload,
    losses: [{ ...payload.losses[0], quantity: "1.234" }],
  });
  assert.equal(invalidQuantity.success, false);
  assert.equal(
    invalidQuantity.error.issues[0].message,
    "박스단위 수량은 0 이상이고 소수점 둘째 자리까지 입력할 수 있습니다.",
  );

  const invalidRecoveredAmount = ledgerLossesSchema.safeParse({
    ...payload,
    losses: [{ ...payload.losses[0], recoveredAmount: "" }],
  });
  assert.equal(invalidRecoveredAmount.success, false);
  assert.equal(
    invalidRecoveredAmount.error.issues[0].message,
    "떨이로 실제 판매한 금액은 0원 이상의 정수여야 합니다.",
  );

  assert.equal(
    ledgerLossesSchema.safeParse({
      ...payload,
      losses: [{ ...payload.losses[0], recoveredAmount: "1.25" }],
    }).success,
    false,
  );

  const emptyLoss = ledgerLossesSchema.safeParse({
    ...payload,
    losses: [{ ...payload.losses[0], quantity: "0", recoveredAmount: "0" }],
  });
  assert.equal(emptyLoss.success, false);
  assert.equal(
    emptyLoss.error.issues[0].message,
    "박스단위 수량 또는 떨이로 실제 판매한 금액 중 하나는 0보다 커야 합니다.",
  );
});

test("loss quantity draft parser accepts only two-decimal DB-safe input", async () => {
  const decimalPath = assertProjectFile("src", "lib", "decimal.ts");
  const { parseLossQuantityDraft, toLossQuantitySaveInput } = await import(
    pathToFileURL(decimalPath).href
  );

  for (const [input, expected] of [
    ["0", 0],
    ["1", 1],
    ["1.2", 1.2],
    ["1.25", 1.25],
    ["0.01", 0.01],
    ["9999999999.99", 9_999_999_999.99],
  ]) {
    assert.equal(parseLossQuantityDraft(input), expected);
  }

  for (const input of [
    "-1",
    ".5",
    "1.",
    "1.234",
    "1,000",
    "1e2",
    " ",
    "9999999999.991",
    "10000000000",
  ]) {
    assert.equal(parseLossQuantityDraft(input), null);
  }

  assert.equal(toLossQuantitySaveInput("1.25"), "1.25");
  assert.equal(toLossQuantitySaveInput("1.26"), "1.26");
  assert.equal(toLossQuantitySaveInput(" 1.25 "), "1.25");
});

test("headquarters and store loss quantity validators accept 1.25 then 1.26", async () => {
  const validationPath = assertProjectFile("src", "lib", "validation.ts");
  const {
    isNonNegativeTwoDecimalInRange,
    parseRequiredNonNegativeTwoDecimal,
  } = await import(pathToFileURL(validationPath).href);

  assert.equal(isNonNegativeTwoDecimalInRange(1.25), true);
  assert.equal(isNonNegativeTwoDecimalInRange(1.26), true);

  const issues = [];
  const context = {
    addIssue(issue) {
      issues.push(issue);
    },
  };

  assert.equal(
    parseRequiredNonNegativeTwoDecimal("1.25", context, "invalid"),
    1.25,
  );
  assert.equal(
    parseRequiredNonNegativeTwoDecimal("1.26", context, "invalid"),
    1.26,
  );
  assert.equal(issues.length, 0);

  const hqActionSource = readProjectFile(
    "src",
    "features",
    "losses",
    "hq-edit-actions.ts",
  );
  assert.match(hqActionSource, /parseRequiredNonNegativeTwoDecimal/);
  assert.match(
    hqActionSource,
    /isNonNegativeTwoDecimalInRange\(loss\.quantity\)/,
  );
});

test("existing loss rows remain editable when availability excludes exhausted products", async () => {
  const helperPath = assertProjectFile(
    "src",
    "features",
    "losses",
    "availability.ts",
  );
  const { getAvailableLossProductIds, canSelectLossProduct } = await import(
    pathToFileURL(helperPath).href
  );
  const actionSource = readProjectFile(
    "src",
    "features",
    "losses",
    "actions.ts",
  );
  const available = getAvailableLossProductIds([
    {
      productId: "still-available",
      previousQuantity: 2,
      purchasedQuantity: 0,
      lossQuantity: 0.5,
    },
    {
      productId: "exhausted-existing",
      previousQuantity: 1,
      purchasedQuantity: 0,
      lossQuantity: 1,
    },
  ]);

  assert.deepEqual([...available], ["still-available"]);
  assert.equal(
    canSelectLossProduct({
      productId: "exhausted-existing",
      existingProductId: "exhausted-existing",
      availableProductIds: available,
    }),
    true,
  );
  assert.equal(
    canSelectLossProduct({
      productId: "exhausted-existing",
      existingProductId: undefined,
      availableProductIds: available,
    }),
    false,
  );
  assert.equal(
    canSelectLossProduct({
      productId: "still-available",
      existingProductId: undefined,
      availableProductIds: available,
    }),
    true,
  );
  assert.equal(
    canSelectLossProduct({
      productId: "inactive-other",
      existingProductId: "exhausted-existing",
      availableProductIds: available,
    }),
    false,
  );
  assert.match(actionSource, /canSelectLossProduct\(/);
});

test("loss availability lines assemble from quantity maps without full inventory rows", async () => {
  const helperPath = assertProjectFile(
    "src",
    "features",
    "losses",
    "availability.ts",
  );
  const { buildLossInventoryAvailabilityLines, getAvailableLossProductIds } =
    await import(pathToFileURL(helperPath).href);

  const withExisting = buildLossInventoryAvailabilityLines({
    existingItems: [
      {
        productId: "persisted",
        previousQuantity: 2,
        purchasedQuantity: 1,
      },
    ],
    purchaseQuantities: new Map([
      ["persisted", 3],
      ["purchase-only", 0.5],
    ]),
    lossQuantities: new Map([["persisted", 1]]),
  });

  assert.deepEqual(withExisting, [
    {
      productId: "persisted",
      previousQuantity: 2,
      purchasedQuantity: 3,
      lossQuantity: 1,
    },
    {
      productId: "purchase-only",
      previousQuantity: 0,
      purchasedQuantity: 0.5,
      lossQuantity: 0,
    },
  ]);

  const withoutExisting = buildLossInventoryAvailabilityLines({
    existingItems: [],
    purchaseQuantities: new Map([["purchase-only", 1]]),
    lossQuantities: new Map(),
    previousQuantities: new Map([["carryover", 2]]),
  });

  assert.deepEqual(
    getAvailableLossProductIds(withoutExisting),
    new Set(["purchase-only", "carryover"]),
  );
});

test("planned sale price loss amount uses target price minus recovered sales", async () => {
  const amountPath = assertProjectFile(
    "src",
    "features",
    "losses",
    "amount.ts",
  );
  const { calculatePlannedPriceLossAmount } = await import(
    pathToFileURL(amountPath).href
  );

  assert.equal(
    calculatePlannedPriceLossAmount({
      plannedUnitPrice: 205000,
      quantity: 2.28,
      recoveredAmount: 0,
    }),
    467400,
  );
  assert.equal(
    calculatePlannedPriceLossAmount({
      plannedUnitPrice: 15000,
      quantity: 1,
      recoveredAmount: 20000,
    }),
    0,
  );
});

test("planned sale price loss snapshot follows current plan availability", async () => {
  const amountPath = assertProjectFile(
    "src",
    "features",
    "losses",
    "amount.ts",
  );
  const { toPlannedPriceLossSnapshot } = await import(
    pathToFileURL(amountPath).href
  );

  assert.deepEqual(
    toPlannedPriceLossSnapshot({
      plannedUnitPrice: 35000,
      quantity: 2,
      recoveredAmount: 50000,
    }),
    {
      unitPrice: 35000,
      amount: 20000,
      usedPlannedPrice: true,
    },
  );

  assert.deepEqual(
    toPlannedPriceLossSnapshot({
      plannedUnitPrice: null,
      quantity: 2,
      recoveredAmount: 50000,
    }),
    {
      unitPrice: 0,
      amount: 0,
      usedPlannedPrice: false,
    },
  );
});

test("ledger loss calculations aggregate totals and threshold candidates", async () => {
  const calcPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "inventory.ts",
  );
  const {
    calculateSystemInventoryQuantity,
    summarizeLossItems,
    getLossSignalCandidates,
  } = await import(pathToFileURL(calcPath).href);

  assert.equal(
    calculateSystemInventoryQuantity({
      previousQuantity: 10,
      purchasedQuantity: 4,
      lossQuantity: 3,
    }),
    11,
  );
  assert.deepEqual(
    summarizeLossItems([
      { productId: "a", productName: "광어", quantity: 2, amount: 5000 },
      { productId: "a", productName: "광어", quantity: 1, amount: 2000 },
      { productId: "b", productName: "우럭", quantity: 4, amount: 6000 },
    ]),
    {
      totalQuantity: 7,
      totalAmount: 13000,
      byProduct: [
        { productId: "a", productName: "광어", quantity: 3, amount: 7000 },
        { productId: "b", productName: "우럭", quantity: 4, amount: 6000 },
      ],
    },
  );
  assert.deepEqual(
    getLossSignalCandidates(
      [
        { productId: "a", productName: "광어", quantity: 3, amount: 7000 },
        { productId: "b", productName: "우럭", quantity: 1, amount: 1000 },
      ],
      { quantity: 2, amount: 5000 },
    ),
    [
      {
        productId: "a",
        productName: "광어",
        quantity: 3,
        amount: 7000,
        exceededQuantity: true,
        exceededAmount: true,
      },
    ],
  );
});

test("ledger loss quantity errors explain product and inventory flow", async () => {
  const helperPath = assertProjectFile(
    "src",
    "features",
    "losses",
    "quantity-error.ts",
  );
  const { getLossQuantityErrorMessage } = await import(
    pathToFileURL(helperPath).href
  );

  assert.equal(
    getLossQuantityErrorMessage({
      productName: "포크오징어",
      productSpec: "M2",
      previousQuantity: 0,
      purchasedQuantity: 0,
      requestedLossQuantity: 2,
    }),
    "포크오징어 / M2 박스단위 손실 수량이 재고보다 많습니다. 입력 박스단위 수량 2개, 손실 가능 수량 0개입니다. 전일재고 0개 + 오늘매입 0개를 확인해 주세요.",
  );

  assert.equal(
    getLossQuantityErrorMessage({
      productName: "포크오징어",
      productSpec: "M2",
      previousQuantity: null,
      purchasedQuantity: null,
      requestedLossQuantity: 2,
    }),
    "포크오징어 / M2 재고 흐름을 확인할 수 없습니다. 1단계 매입에서 해당 품목의 오늘매입 저장 여부를 확인해 주세요.",
  );
});

test("ledger loss availability includes only products with positive stock after stored losses", async () => {
  const helperPath = assertProjectFile(
    "src",
    "features",
    "losses",
    "availability.ts",
  );
  const { getAvailableLossProductIds } = await import(
    pathToFileURL(helperPath).href
  );

  const ids = getAvailableLossProductIds([
    {
      productId: "carryover",
      previousQuantity: 2,
      purchasedQuantity: 0,
      lossQuantity: 1.25,
    },
    {
      productId: "purchase",
      previousQuantity: 0,
      purchasedQuantity: 0.01,
      lossQuantity: 0,
    },
    {
      productId: "exhausted",
      previousQuantity: 1,
      purchasedQuantity: 0,
      lossQuantity: 1,
    },
    {
      productId: "invalid",
      previousQuantity: 0,
      purchasedQuantity: 0,
      lossQuantity: 1,
    },
  ]);

  assert.deepEqual([...ids], ["carryover", "purchase"]);
});

test("ledger loss query action and UI contracts are wired", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "losses",
    "queries.ts",
  );
  assert.match(querySource, /export\s+async\s+function\s+getLossStepData/);
  assert.match(querySource, /isActive:\s*true/);
  assert.match(querySource, /LOSS_TYPE/);
  assert.match(querySource, /ledgerLossItem/);
  assert.match(querySource, /summarizeLossItems/);
  assert.match(querySource, /getLossSignalCandidates/);
  assert.match(querySource, /getAvailableLossProductIds/);
  assert.match(querySource, /getLossInventoryAvailabilityLinesInTx/);
  assert.match(querySource, /availableProductIds\.has\(option\.id\)/);
  assert.doesNotMatch(querySource, /getInventoryStepDataInTx/);
  assert.match(
    querySource,
    /const lossLedgerSelect = \{[\s\S]*carryoverSalesAmount:\s*true,[\s\S]*cashAmount:\s*true,[\s\S]*cardAmount:\s*true,[\s\S]*otherPaymentAmount:\s*true,/,
    "loss-step completion must receive carryover and every payment field",
  );

  const actionSource = readProjectFile(
    "src",
    "features",
    "losses",
    "actions.ts",
  );
  assert.match(actionSource, /"use server"/);
  assert.match(actionSource, /export\s+async\s+function\s+saveLedgerLosses/);
  assert.match(actionSource, /ledgerLossesSchema\.safeParse/);
  assert.match(actionSource, /requireStoreManagerLedgerEditAccess\(/);
  assert.match(actionSource, /db\.\$transaction/);
  assert.match(actionSource, /tx\.ledgerLossItem\.update\(/);
  assert.match(actionSource, /tx\.ledgerLossItem\.create\(/);
  assert.doesNotMatch(actionSource, /tx\.ledgerLossItem\.createMany/);
  assert.match(actionSource, /version:\s*parsed\.data\.version/);
  assert.match(actionSource, /ledgerConflictErrorFromMeta/);
  assert.match(actionSource, /section:\s*"losses"/);
  assert.match(actionSource, /clientValues:\s*toLossClientValues/);
  assert.match(actionSource, /serverValues:\s*toLossConflictValues/);
  assert.match(actionSource, /calculateSystemInventoryQuantity/);
  assert.match(actionSource, /getLossQuantityErrorMessage/);
  assert.match(actionSource, /calculatePlannedPriceLossAmount/);
  assert.match(actionSource, /consumeStoredLossQuantity/);
  assert.match(actionSource, /getLossQuantityIdentity/);
  assert.match(actionSource, /canSelectLossProduct\(/);
  assert.match(actionSource, /getLossInventoryAvailabilityLinesInTx/);
  assert.doesNotMatch(actionSource, /getInventoryStepDataInTx/);
  assert.match(actionSource, /현재 보유 재고가 있는 품목을 선택해 주세요/);
  assert.match(actionSource, /storeSalesPricePlan\.findMany/);
  assert.match(actionSource, /recoveredAmount:\s*loss\.recoveredAmount/);
  assert.match(
    actionSource,
    /normalized\.amount\s*=\s*calculatePlannedPriceLossAmount/,
  );
  assert.match(actionSource, /existing\.productName/);
  assert.match(actionSource, /reconcileLedgerInventoryAdjustments\(/);
  // WO-02(2026-06-22): 손실 저장은 조정 정합화 이후 FIFO lot snapshot을 최신화한다.
  assert.match(actionSource, /from\s+"[^"]*fifo-lots"/);
  assert.match(actionSource, /refreshLedgerInventoryFifoLots\(/);
  assert.ok(
    actionSource.indexOf("await reconcileLedgerInventoryAdjustments") <
      actionSource.indexOf("await refreshLedgerInventoryFifoLots"),
    "loss save should refresh FIFO lots after reconciling adjustments",
  );
  assert.match(actionSource, /action:\s*"ledger\.losses\.saved"/);
  assert.match(actionSource, /writeAuditLog\(/);
  assert.match(actionSource, /revalidateLossPaths\(\)/);
  assert.match(
    actionSource,
    /revalidateStoreEntryPaths\(\["losses",\s*"inventory",\s*"root"\]\)/,
  );

  const componentSource = readProjectFile(
    "src",
    "features",
    "losses",
    "components",
    "loss-step-client.tsx",
  );
  assert.match(componentSource, /손실\/폐기\/떨이 입력/);
  assert.match(componentSource, /saveLedgerLosses/);
  assert.match(componentSource, /inputMode="decimal"/);
  assert.match(componentSource, /parseLossQuantityDraft/);
  assert.match(componentSource, /toLossQuantitySaveInput/);
  assert.match(
    componentSource,
    /parseLossQuantityDraft\(quantityValue\)\s*===\s*null/,
  );
  assert.match(componentSource, /setFieldErrors\(quantityErrors\)/);
  assert.match(
    componentSource,
    /\{item\.productName \|\| item\.productId\} \/\{" "\}[\s\S]*\{item\.productSpec \|\| "-"\}/,
  );
  assert.match(componentSource, /min-h-11/);
  assert.match(componentSource, /기준 초과/);
  // WO-09: 사용자 화면 라벨/문구는 lossTerms 사전을 통해 렌더링한다.
  assert.match(componentSource, /lossTerms/);
  assert.match(componentSource, /lossTerms\.totalLossQuantity/);
  assert.match(componentSource, /lossTerms\.totalLossAmount/);
  assert.match(componentSource, /lossTerms\.quantityHelp/);
  assert.match(componentSource, /lossTerms\.recoveredAmount/);
  assert.match(componentSource, /lossTerms\.recoveredAmountHelp/);
  const lossTermsSource = readProjectFile(
    "src",
    "features",
    "losses",
    "terms.ts",
  );
  assert.match(lossTermsSource, /quantity:\s*"박스단위 수량"/);
  assert.match(
    lossTermsSource,
    /quantityHelp:\s*"한 박스 100마리 중 10마리를 폐기하면 0\.1, 한 박스 10바구니 중 2바구니를 폐기하면 0\.2로 입력하세요\. 소수점 둘째 자리까지 입력할 수 있습니다\."/,
  );
  assert.match(lossTermsSource, /totalLossQuantity:\s*"총 박스단위 손실 수량"/);
  assert.match(lossTermsSource, /totalLossAmount:\s*"총 손실액"/);
  assert.match(lossTermsSource, /recoveredAmount:\s*"떨이로 실제 판매한 금액"/);
  assert.match(
    lossTermsSource,
    /recoveredAmountHelp:\s*"손실 수량과 떨이 판매액을 먼저 저장하세요\. 3단계 재고에서 판매한 가격을 저장하면 손실액이 자동 확정됩니다\."/,
  );
  assert.match(componentSource, /clientKey/);
  assert.match(componentSource, /id:\s*""/);
  assert.match(componentSource, /key={item\.clientKey}/);
  assert.match(componentSource, /id:\s*item\.id\s*\|\|\s*undefined/);
  assert.match(componentSource, /<form[\s\S]*손실 항목[\s\S]*type="submit"/);

  const hqActionSource = readProjectFile(
    "src",
    "features",
    "losses",
    "hq-edit-actions.ts",
  );
  assert.match(hqActionSource, /consumeStoredLossQuantity/);
  assert.match(hqActionSource, /getLossQuantityIdentity/);
  assert.match(hqActionSource, /parseRequiredNonNegativeTwoDecimal/);
  assert.match(
    hqActionSource,
    /recoveredAmount:[\s\S]*parseRequiredInteger\(value, context, recoveredAmountError\)/,
  );
  assert.match(
    hqActionSource,
    /isNonNegativeTwoDecimalInRange\(loss\.quantity\)/,
  );
  assert.match(hqActionSource, /isValidInteger\(loss\.recoveredAmount\)/);

  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "store-entry",
    "losses",
    "page.tsx",
  );
  assert.match(pageSource, /LossStepClient/);
  assert.match(pageSource, /getLossStepData/);
  assert.doesNotMatch(pageSource, /손실 입력 준비/);

  const plannedPriceSyncSource = readProjectFile(
    "src",
    "features",
    "losses",
    "planned-price-sync.ts",
  );
  assert.match(plannedPriceSyncSource, /editableLedgerStatuses/);
  assert.match(plannedPriceSyncSource, /status:\s*\{\s*in:\s*\[/);
});

test("ledger loss review fixes keep thresholds, stale guards, safe amount display, and loss-only inventory flow", () => {
  const schemaSource = readProjectFile(
    "src",
    "features",
    "losses",
    "schemas.ts",
  );
  assert.match(schemaSource, /versionSchema/);
  assert.match(schemaSource, /recoveredAmountError/);
  assert.doesNotMatch(schemaSource, /parseOptionalInteger/);

  const lossQuerySource = readProjectFile(
    "src",
    "features",
    "losses",
    "queries.ts",
  );
  assert.match(lossQuerySource, /quantity:\s*0/);
  assert.match(lossQuerySource, /amount:\s*0/);
  assert.match(
    lossQuerySource,
    /lossItems:\s*data\.lossItems\.map\(\(\{\s*unitPrice,\s*amount,\s*\.\.\.item\s*}\)/,
  );
  assert.doesNotMatch(lossQuerySource, /recoveredAmount,\s*\.\.\.item/);

  const inventoryQuerySource = readProjectFile(
    "src",
    "features",
    "inventory",
    "queries.ts",
  );
  assert.match(inventoryQuerySource, /productName:\s*string/);
  assert.match(inventoryQuerySource, /base:\s*ProductInventoryBase/);
  assert.match(inventoryQuerySource, /mergeActivityBases/);
  assert.match(inventoryQuerySource, /loss\.base/);

  const reconciliationSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "adjustment-reconciliation.ts",
  );
  assert.match(reconciliationSource, /beforeQuantity === null/);
  assert.doesNotMatch(
    reconciliationSource,
    /if \(!nextAdjustment \|\| nextAdjustment\.differenceQuantity === 0\)/,
  );
});
