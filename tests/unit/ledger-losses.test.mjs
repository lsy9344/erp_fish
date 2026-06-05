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
    /model\s+LedgerLossItem\s*{[^}]*dailyLedgerId\s+String[^}]*productId\s+String[^}]*ledgerInputCodeId\s+String[^}]*productName\s+String[^}]*productCategory\s+String[^}]*productSpec\s+String[^}]*unitPrice\s+Int[^}]*lossTypeName\s+String[^}]*quantity\s+Int[^}]*amount\s+Int[^}]*reason\s+String[^}]*createdById\s+String[^}]*updatedById\s+String[^}]*@@index\(\[dailyLedgerId\]\)[^}]*@@index\(\[productId\]\)[^}]*@@index\(\[ledgerInputCodeId\]\)/s,
  );

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
    "migration should store loss snapshots, quantity, amount, and reason",
  );
});

test("ledger loss schema validates rows and requires Korean reason message", async () => {
  const schemaPath = assertProjectFile(
    "src",
    "features",
    "losses",
    "schemas.ts",
  );
  const { ledgerLossesSchema } = await import(pathToFileURL(schemaPath).href);

  const payload = {
    storeId: "store-gangnam",
    ledgerUpdatedAt: "2026-05-30T00:00:00.000Z",
    losses: [
      {
        id: "",
        productId: "product-1",
        ledgerInputCodeId: "loss-code-1",
        quantity: "2",
        amount: "3000",
        reason: "폐기 처리",
      },
    ],
  };

  assert.equal(ledgerLossesSchema.safeParse(payload).success, true);
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
      losses: [{ ...payload.losses[0], quantity: "1.5" }],
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
    "포크오징어 / M2 손실 수량을 저장할 수 없습니다. 입력한 총 손실 수량 2이(가) 현재 차감 가능 수량 0보다 큽니다. 재고 흐름: 전일재고 0 + 오늘매입 0.",
  );

  assert.equal(
    getLossQuantityErrorMessage({
      productName: "포크오징어",
      productSpec: "M2",
      previousQuantity: null,
      purchasedQuantity: null,
      requestedLossQuantity: 2,
    }),
    "포크오징어 / M2 재고 흐름을 확인할 수 없습니다. 재고 단계에서 해당 품목의 전일재고 또는 오늘매입을 확인해 주세요.",
  );
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

  const actionSource = readProjectFile(
    "src",
    "features",
    "losses",
    "actions.ts",
  );
  assert.match(actionSource, /"use server"/);
  assert.match(actionSource, /export\s+async\s+function\s+saveLedgerLosses/);
  assert.match(actionSource, /ledgerLossesSchema\.safeParse/);
  assert.match(actionSource, /requireStoreAccess\(/);
  assert.match(actionSource, /db\.\$transaction/);
  assert.match(actionSource, /tx\.ledgerLossItem\.update\(/);
  assert.match(actionSource, /tx\.ledgerLossItem\.create\(/);
  assert.doesNotMatch(actionSource, /tx\.ledgerLossItem\.createMany/);
  assert.match(actionSource, /ledgerUpdatedAt/);
  assert.match(actionSource, /LEDGER_CONFLICT/);
  assert.match(actionSource, /calculateSystemInventoryQuantity/);
  assert.match(actionSource, /getLossQuantityErrorMessage/);
  assert.match(actionSource, /existing\.productName/);
  assert.match(actionSource, /reconcileLedgerInventoryAdjustments\(/);
  assert.match(actionSource, /action:\s*"ledger\.losses\.saved"/);
  assert.match(actionSource, /writeAuditLog\(/);
  assert.match(actionSource, /revalidatePath\("\/app\/store-entry\/losses"\)/);
  assert.match(
    actionSource,
    /revalidatePath\("\/app\/store-entry\/inventory"\)/,
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
  assert.match(componentSource, /inputMode="numeric"/);
  assert.match(componentSource, /min-h-11/);
  assert.match(componentSource, /기준 초과/);
  assert.match(componentSource, /총 손실 수량/);
  assert.match(componentSource, /총 손실액/);
  assert.match(componentSource, /손실액\(원\)/);
  assert.match(
    componentSource,
    /판매금액이 아니라 손해 본 금액을 입력합니다\./,
  );
  assert.match(componentSource, /clientKey/);
  assert.match(componentSource, /id:\s*""/);
  assert.match(componentSource, /key={item\.clientKey}/);
  assert.match(componentSource, /id:\s*item\.id\s*\|\|\s*undefined/);
  assert.match(componentSource, /<form[\s\S]*손실 항목[\s\S]*type="submit"/);

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
});

test("ledger loss review fixes keep thresholds, stale guards, and loss-only inventory flow", () => {
  const schemaSource = readProjectFile(
    "src",
    "features",
    "losses",
    "schemas.ts",
  );
  assert.match(schemaSource, /ledgerUpdatedAt/);

  const lossQuerySource = readProjectFile(
    "src",
    "features",
    "losses",
    "queries.ts",
  );
  assert.match(lossQuerySource, /quantity:\s*0/);
  assert.match(lossQuerySource, /amount:\s*0/);

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
