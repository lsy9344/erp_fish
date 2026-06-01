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
  assert.match(
    source,
    /status:\s*{\s*in:\s*\[\s*"IN_PROGRESS",\s*"IN_REVIEW"\s*\]/s,
  );
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
    assert.match(
      source,
      /status:\s*{\s*in:\s*\[\s*"IN_PROGRESS",\s*"IN_REVIEW"\s*\]/s,
    );
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
  assert.match(source, /CorrectionPanel/);
  assert.match(source, /getCorrectionRecordsForLedger/);
  assert.match(source, /getLatestCorrectionValueMap/);
  assert.match(source, /createCorrectionRecord/);
  assert.match(source, /ledger\.status\s*===\s*"HEADQUARTERS_CLOSED"/);
  assert.match(source, /원본/);
  assert.match(source, /정정 반영/);
  assert.match(source, /appliedCorrection/);
  assert.match(source, /getLatestCorrectionValueMap\(correctionRecords\)/);
  assert.doesNotMatch(source, /getLatestCorrectionValuesForLedger/);
  assert.doesNotMatch(source, /getTodayStoreLedger/);
});

test("shared entry clients can accept injected HQ save actions", () => {
  const clientFiles = [
    [
      "src",
      "features",
      "ledger",
      "components",
      "sales-payment-step-client.tsx",
    ],
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
    "ledger.hq.closed",
    "correction.created",
  ]) {
    assert.match(source, new RegExp(actionName.replaceAll(".", "\\.")));
  }

  assert.match(source, /"CorrectionRecord"/);
  assert.match(source, /정정 기록/);
});

test("audit history can resolve correction record targets", () => {
  const formatSource = readProjectFile(
    "src",
    "features",
    "audit",
    "audit-format.ts",
  );
  const querySource = readProjectFile(
    "src",
    "features",
    "audit",
    "audit-queries.ts",
  );

  assert.match(formatSource, /"CorrectionRecord"/);
  assert.match(querySource, /db\.correctionRecord\.findMany/);
  assert.match(querySource, /targetKey\("CorrectionRecord"/);
});

test("correction panel focuses the first field with validation errors", () => {
  const source = readProjectFile(
    "src",
    "features",
    "corrections",
    "components",
    "correction-panel.tsx",
  );

  assert.match(source, /correctedValueInputRef/);
  assert.match(
    source,
    /errors\["correctedValue\.value"\]\?\.length[\s\S]*correctedValueInputRef\.current\?\.focus\(\)[\s\S]*return/,
  );
  assert.match(source, /errors\.reason\?\.length/);
  assert.match(source, /reasonInputRef\.current\?\.focus\(\)/);
});

test("correction panel timeline distinguishes original, previous, and corrected values", () => {
  const source = readProjectFile(
    "src",
    "features",
    "corrections",
    "components",
    "correction-panel.tsx",
  );

  assert.match(source, /원본값/);
  assert.match(source, /이전 반영값/);
  assert.match(source, /정정값/);
  assert.match(source, /record\.originalValue/);
  assert.match(source, /record\.previousAppliedValue/);
  assert.match(source, /record\.correctedValue/);
  assert.match(source, /if\s*\(isSaving\)\s*\{\s*return;\s*\}/s);
  assert.match(source, /overflow-x-auto/);
  assert.doesNotMatch(source, /label:\s*selectedTarget\.label/);
});

test("HQ close action has idempotent close handling and same-tx audit path", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-close-actions.ts",
  );

  assert.match(source, /export\s+async\s+function\s+closeHqLedger/);
  assert.match(
    source,
    /"ledger\.hq\.closed"/,
    "close action should write a dedicated audit action",
  );
  assert.match(
    source,
    /status:\s*\{\s*in:\s*\[\.\.\.editableLedgerStatuses\]\s*\}/s,
    "close action must check editable states during update",
  );
  assert.match(source, /alreadyClosedError/);
  assert.match(source, /updatedAt/);
  assert.match(source, /writeAuditLog\(/);
  assert.match(
    source,
    /before:\s*toLedgerAuditPayload\(before\)/,
    "before payload should be captured",
  );
  assert.match(
    source,
    /after:\s*toLedgerAuditPayload\(after\)/,
    "after payload should be captured",
  );
  assert.match(
    source,
    /revalidateHqLedgerPathsBestEffort/,
    "cache revalidation should not turn a committed close into a false failure",
  );
});

test("HQ close schema and payload include close metadata", () => {
  const schema = readProjectFile("prisma", "schema.prisma");
  const ledgerTypes = readProjectFile("src", "features", "ledger", "types.ts");
  const ledgerQueries = readProjectFile(
    "src",
    "features",
    "ledger",
    "queries.ts",
  );

  assert.match(schema, /closedBy\s+User\?\s+@relation\("LedgerClosedBy"/);
  assert.match(
    schema,
    /closedDailyLedgers\s+DailyLedger\[\]\s+@relation\("LedgerClosedBy"\)/,
    "User must expose the opposite LedgerClosedBy relation",
  );
  assert.match(ledgerTypes, /closedById:\s*string\s*\|\s*null/);
  assert.match(ledgerTypes, /closedAt:\s*string\s*\|\s*null/);
  assert.match(
    ledgerQueries,
    /closedById:\s*ledger\.closedById\s*\?\?\s*null/,
    "audit and step payloads should carry the closer id",
  );
  assert.match(
    ledgerQueries,
    /closedAt:\s*ledger\.closedAt\?\.toISOString\(\)\s*\?\?\s*null/,
    "audit and step payloads should carry the close timestamp",
  );
});

test("HQ close dialog follows cross-tab ledger updatedAt sync", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "hq-ledger-close-dialog.tsx",
  );

  assert.match(
    source,
    /useLedgerUpdatedAtSync\(ledgerId,\s*setCurrentLedgerUpdatedAt\)/,
  );
  assert.match(source, /ledgerUpdatedAt:\s*currentLedgerUpdatedAt/);
});

test("HQ edit actions block HEADQUARTERS_CLOSED in all editable paths", () => {
  const ledgerSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-edit-actions.ts",
  );
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

  for (const source of [ledgerSource, inventorySource, lossesSource]) {
    assert.match(source, /HEADQUARTERS_CLOSED/);
    assert.match(
      source,
      /notEditableError\([^)]*\)/,
      "closed branch should be routed through notEditableError",
    );
  }
});
