import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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

test("HQ ledger edit actions use ledgerId and headquarters authorization", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-edit-actions.ts",
  );

  for (const exportName of [
    "saveHqLedgerSalesPayment",
    "saveHqLedgerExpenses",
    "saveHqLedgerPurchases",
    "saveHqLedgerWorkInfo",
  ]) {
    assert.match(
      source,
      new RegExp(`export\\s+async\\s+function\\s+${exportName}\\b`),
      `${exportName} should be exported`,
    );
  }

  assert.match(source, /requireHeadquartersUser\(/);
  assert.match(source, /ledgerId/);
  assert.match(source, /status:\s*{\s*in:\s*\[\s*"IN_PROGRESS",\s*"IN_REVIEW"\s*\]/s);
  assert.match(source, /updatedById:\s*actor\.user\.id/);
  assert.match(source, /writeAuditLog\(/);
  assert.match(source, /ledger\.hq\.sales_payment\.updated/);
  assert.match(source, /ledger\.hq\.expenses\.saved/);
  assert.match(source, /ledger\.hq\.purchases\.saved/);
  assert.match(source, /ledger\.hq\.work_info\.saved/);
  assert.match(source, /revalidatePath\(`\/app\/ledgers\/\$\{ledgerId\}`\)/);
  assert.match(source, /revalidatePath\("\/app\/dashboard"\)/);
  assert.doesNotMatch(source, /requireStoreAccess\(/);
  assert.doesNotMatch(source, /getTodayStoreLedger/);
});

test("HQ inventory and loss actions use ledgerId and HQ audit labels", () => {
  const inventorySource = readProjectFile(
    "src",
    "features",
    "inventory",
    "hq-edit-actions.ts",
  );
  const lossesSource = readProjectFile(
    "src",
    "features",
    "losses",
    "hq-edit-actions.ts",
  );

  for (const source of [inventorySource, lossesSource]) {
    assert.match(source, /"use server"/);
    assert.match(source, /requireHeadquartersUser\(/);
    assert.match(source, /ledgerId/);
    assert.match(source, /status:\s*{\s*in:\s*\[\s*"IN_PROGRESS",\s*"IN_REVIEW"\s*\]/s);
    assert.match(source, /updatedById:\s*actor\.user\.id/);
    assert.match(source, /writeAuditLog\(/);
    assert.match(source, /revalidatePath\(`\/app\/ledgers\/\$\{ledgerId\}`\)/);
    assert.match(source, /revalidatePath\("\/app\/dashboard"\)/);
    assert.doesNotMatch(source, /requireStoreAccess\(/);
    assert.doesNotMatch(source, /getTodayStoreLedger/);
  }

  assert.match(inventorySource, /saveHqLedgerInventoryItems/);
  assert.match(inventorySource, /saveHqLedgerInventoryAdjustment/);
  assert.match(inventorySource, /ledger\.hq\.inventory\.saved/);
  assert.match(inventorySource, /ledger\.hq\.inventory_adjustment\.saved/);
  assert.match(lossesSource, /saveHqLedgerLosses/);
  assert.match(lossesSource, /ledger\.hq\.losses\.saved/);
});

test("HQ detail page renders editable sections with HQ actions", () => {
  const source = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );

  for (const componentName of [
    "SalesPaymentStepClient",
    "ExpenseStepClient",
    "PurchaseStepClient",
    "InventoryStepClient",
    "LossStepClient",
    "WorkStepClient",
  ]) {
    assert.match(source, new RegExp(componentName));
  }

  assert.match(source, /Tabs/);
  assert.match(source, /saveHqLedgerSalesPayment/);
  assert.match(source, /saveHqLedgerExpenses/);
  assert.match(source, /saveHqLedgerPurchases/);
  assert.match(source, /saveHqLedgerInventoryItems/);
  assert.match(source, /saveHqLedgerInventoryAdjustment/);
  assert.match(source, /saveHqLedgerLosses/);
  assert.match(source, /saveHqLedgerWorkInfo/);
  assert.match(source, /getLedgerCostStepDataById/);
  assert.match(source, /getInventoryStepDataByLedgerId/);
  assert.match(source, /getLossStepDataByLedgerId/);
  assert.match(source, /본사 마감된 장부/);
  assert.match(source, /정정 기록/);
  assert.doesNotMatch(source, /getTodayStoreLedger/);
});

test("shared entry clients can accept injected HQ save actions", () => {
  const clientFiles = [
    ["src", "features", "ledger", "components", "sales-payment-step-client.tsx"],
    ["src", "features", "ledger", "components", "expense-step-client.tsx"],
    ["src", "features", "ledger", "components", "purchase-step-client.tsx"],
    ["src", "features", "ledger", "components", "workstep-client.tsx"],
    ["src", "features", "inventory", "components", "inventory-step-client.tsx"],
    ["src", "features", "losses", "components", "loss-step-client.tsx"],
  ];

  for (const segments of clientFiles) {
    const source = readProjectFile(...segments);

    assert.match(source, /saveAction|saveItemsAction/);
    assert.match(source, /ledgerId:\s*(ledger|data)\.id/);
  }
});

test("audit history labels distinguish headquarters edits", () => {
  const source = readProjectFile("src", "features", "audit", "audit-format.ts");

  for (const actionName of [
    "ledger.hq.sales_payment.updated",
    "ledger.hq.expenses.saved",
    "ledger.hq.purchases.saved",
    "ledger.hq.inventory.saved",
    "ledger.hq.inventory_adjustment.saved",
    "ledger.hq.losses.saved",
    "ledger.hq.work_info.saved",
  ]) {
    assert.match(source, new RegExp(actionName.replaceAll(".", "\\.")));
  }
});
