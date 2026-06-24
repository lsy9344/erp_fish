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

  assert.match(source, /requireLedgerHqEditAccess\(/);
  assert.match(source, /ledgerId/);
  assert.match(
    source,
    /status:\s*{\s*in:\s*\[\s*\.\.\.editableLedgerStatuses\s*\]/s,
  );
  assert.match(source, /updatedById:\s*actor\.user\.id/);
  assert.match(source, /writeAuditLog\(/);
  assert.match(source, /ledger\.hq\.sales_payment\.updated/);
  assert.match(source, /ledger\.hq\.expenses\.saved/);
  assert.match(source, /ledger\.hq\.purchases\.saved/);
  assert.match(source, /ledger\.hq\.work_info\.saved/);
  assert.match(source, /revalidateLedgerDetailPath\(ledgerId\)/);
  assert.match(source, /revalidateDashboardAndReports\(\)/);
  assert.match(
    source,
    /requireHeadquartersStoreScope\(parsed\.data\.storeId\)/,
  );
  assert.doesNotMatch(source, /getTodayStoreLedger/);
});

test("HQ ledger edit actions require and audit headquarters edit reasons", () => {
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
    assert.match(source, /hqEditReasonSchema/);
    assert.match(source, /본사 수정 사유를 입력해 주세요/);
    assert.match(
      source,
      /\.max\(500,\s*"본사 수정 사유는 500자 이하여야 합니다\."\)/,
    );
    assert.match(source, /reason:\s*parsed\.data\.reason/);
  }

  for (const actionName of [
    "ledger.hq.sales_payment.updated",
    "ledger.hq.expenses.saved",
    "ledger.hq.purchases.saved",
    "ledger.hq.work_info.saved",
  ]) {
    assert.match(
      ledgerSource,
      new RegExp(
        `action:\\s*"${actionName.replaceAll(".", "\\.")}"[\\s\\S]*reason:\\s*parsed\\.data\\.reason`,
      ),
    );
  }

  for (const actionName of [
    "ledger.hq.inventory.saved",
    "ledger.hq.inventory_adjustment.saved",
  ]) {
    assert.match(
      inventorySource,
      new RegExp(
        `action:\\s*"${actionName.replaceAll(".", "\\.")}"[\\s\\S]*reason:\\s*parsed\\.data\\.reason`,
      ),
    );
  }

  assert.match(
    lossesSource,
    /action:\s*"ledger\.hq\.losses\.saved"[\s\S]*reason:\s*parsed\.data\.reason/,
  );
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
    assert.match(source, /requireLedgerHqEditAccess\(/);
    assert.match(source, /ledgerId/);
    assert.match(
      source,
      /status:\s*{\s*in:\s*\[\s*\.\.\.editableLedgerStatuses\s*\]/s,
    );
    assert.match(source, /updatedById:\s*actor\.user\.id/);
    assert.match(source, /writeAuditLog\(/);
    assert.match(source, /revalidateLedgerDetailPath\(ledgerId\)/);
    assert.match(source, /revalidateDashboardAndReports\(\)/);
    assert.match(
      source,
      /requireHeadquartersStoreScope\(parsed\.data\.storeId\)/,
    );
    assert.doesNotMatch(source, /getTodayStoreLedger/);
  }

  assert.match(inventorySource, /saveHqLedgerInventoryItems/);
  assert.match(inventorySource, /saveHqLedgerInventoryAdjustment/);
  assert.match(inventorySource, /ledger\.hq\.inventory\.saved/);
  assert.match(inventorySource, /ledger\.hq\.inventory_adjustment\.saved/);
  assert.match(lossesSource, /saveHqLedgerLosses/);
  assert.match(lossesSource, /ledger\.hq\.losses\.saved/);
});

test("HQ original edit actions reject closed or holiday ledgers before writing audit logs", () => {
  const sources = [
    [
      "ledger",
      readProjectFile("src", "features", "ledger", "hq-edit-actions.ts"),
      "ensureTargetLedger",
    ],
    [
      "inventory",
      readProjectFile("src", "features", "inventory", "hq-edit-actions.ts"),
      "ensureTargetInventory",
    ],
    [
      "losses",
      readProjectFile("src", "features", "losses", "hq-edit-actions.ts"),
      "ensureTargetLossData",
    ],
  ];

  for (const [label, source, ensureHelper] of sources) {
    assert.match(
      source,
      /getLedgerEditBlockReason/,
      `${label} should use the shared ledger status policy for block reasons`,
    );
    assert.match(
      source,
      /isLedgerEditable/,
      `${label} should use the shared ledger status policy for editability`,
    );
    assert.match(
      source,
      new RegExp(`function\\s+${ensureHelper}[\\s\\S]*notEditableError`),
      `${label} should centralize editable status checks`,
    );
    assert.match(
      source,
      new RegExp(
        `${ensureHelper}\\([\\s\\S]*?if\\s*\\(![^\\n]+\\.ok\\)\\s*{[\\s\\S]*?return\\s+[^;]+;[\\s\\S]*?}[\\s\\S]*?writeAuditLog\\(`,
      ),
      `${label} should return closed/not-editable errors before audit writes`,
    );
    assert.match(
      source,
      /status:\s*{\s*in:\s*\[\s*\.\.\.editableLedgerStatuses\s*\]/s,
      `${label} should condition writes on editable statuses`,
    );
  }
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
  assert.match(source, /showSensitiveAccountingMetrics/);
  assert.match(source, /getLedgerCostStepDataById/);
  assert.match(source, /getInventoryStepDataByLedgerId/);
  assert.match(source, /getLossStepDataByLedgerId/);
  assert.match(source, /본사 마감된 장부/);
  assert.match(source, /정정 기록/);
  assert.match(source, /CorrectionPanel/);
  assert.match(source, /getCorrectionRecordsForLedger/);
  assert.match(source, /getLatestCorrectionValueMap/);
  assert.match(source, /createCorrectionRecord/);
  assert.match(
    source,
    /const canShowCorrectionPanel\s*=\s*ledger\.status\s*===\s*"HEADQUARTERS_CLOSED"\s*&&\s*canCreateCorrection/,
  );
  assert.match(
    source,
    /const correctionTargetOptions\s*=\s*canShowCorrectionPanel\s*\?\s*getCorrectionTargetOptions\(\{\s*ledger,\s*inventoryData,\s*lossData/s,
  );
  assert.match(source, /\{canShowCorrectionPanel\s*\?\s*\(\s*<CorrectionPanel/);
  assert.doesNotMatch(source, /targetType:\s*"PURCHASE_ROW"/);
  assert.match(source, /targetType:\s*"INVENTORY_ROW"/);
  assert.match(
    source,
    /\.filter\(\(item\)\s*=>\s*item\.id\s*!==\s*item\.productId\)/,
  );
  assert.match(source, /fieldKey:\s*"currentQuantity"/);
  assert.doesNotMatch(source, /fieldKey:\s*"inventoryAmount"/);
  assert.match(source, /targetType:\s*"LOSS_ROW"/);
  assert.match(source, /fieldKey:\s*"quantity"/);
  assert.match(source, /targetType:\s*"CALCULATED_METRIC"/);
  assert.match(source, /fieldKey:\s*"grossMarginRate"/);
  assert.match(source, /fieldKey:\s*"salesDifference"/);
  assert.match(source, /ledger\.status\s*===\s*"HEADQUARTERS_CLOSED"/);
  assert.match(source, /원본/);
  assert.match(source, /정정 반영/);
  assert.match(source, /appliedCorrection/);
  assert.match(source, /getLatestCorrectionValueMap\(correctionRecords\)/);
  assert.doesNotMatch(source, /getLatestCorrectionValuesForLedger/);
  assert.doesNotMatch(source, /getTodayStoreLedger/);
});

test("HQ detail page enables headquarters edit reason input on every editable tab", () => {
  const source = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );

  assert.equal(
    source.match(/hqEditReasonRequired/g)?.length,
    6,
    "each HQ editable tab should require a headquarters edit reason",
  );
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

test("shared entry clients render and submit headquarters edit reason when enabled", () => {
  const reasonFieldSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "hq-edit-reason-field.tsx",
  );
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

  assert.match(reasonFieldSource, /본사 수정 사유/);
  assert.match(reasonFieldSource, /감사 로그/);
  assert.match(reasonFieldSource, /maxLength=\{500\}/);

  for (const segments of clientFiles) {
    const source = readProjectFile(...segments);

    assert.match(source, /hqEditReasonRequired/);
    assert.match(source, /HqEditReasonField/);
    assert.match(source, /reason:\s*hqEditReason/);
    assert.match(source, /hqEditReasonInputRef\.current\?\.focus\(\)/);
  }
});

test("HQ inventory adjustment shows the shared reason field error before saving", () => {
  const source = readProjectFile(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );

  assert.match(source, /if\s*\(hqEditReasonRequired\)\s*{/);
  assert.match(
    source,
    /setFieldErrors\(\{\s*reason:\s*\["본사 수정 사유를 입력해 주세요\."\]/s,
  );
  assert.match(source, /setFormError\("본사 수정 사유를 입력해 주세요\."\)/);
  assert.match(source, /hqEditReasonInputRef\.current\?\.focus\(\)/);
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
  assert.match(source, /export\s+async\s+function\s+bulkCloseHqLedgers/);
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
    /before:\s*toCloseAuditPayload\(before,\s*preflight,\s*exceptionReason\)/,
    "before payload should include close preflight context",
  );
  assert.match(
    source,
    /after:\s*toCloseAuditPayload\(after,\s*preflight,\s*exceptionReason\)/,
    "after payload should include close preflight context",
  );
  assert.match(
    source,
    /revalidateHqLedgerPathsBestEffort/,
    "cache revalidation should not turn a committed close into a false failure",
  );
});

test("HQ bulk close supports simplified dashboard close without preflight", () => {
  const actionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-close-actions.ts",
  );
  const dashboardPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "dashboard",
    "page.tsx",
  );

  assert.match(actionSource, /bulkCloseLedgerInputSchema/);
  assert.match(actionSource, /simplified:\s*true/);
  assert.match(actionSource, /ledgerIds:\s*z\s*\.\s*array/);
  assert.match(
    actionSource,
    /status:\s*\{\s*in:\s*\[\.\.\.editableLedgerStatuses\]\s*\}/s,
  );
  assert.match(actionSource, /action:\s*"ledger\.hq\.bulk_closed"/);

  const bulkCloseSource = actionSource.slice(
    actionSource.indexOf("export async function bulkCloseHqLedgers"),
  );
  assert.doesNotMatch(bulkCloseSource, /buildHqLedgerClosePreflightInTx/);
  assert.match(dashboardPageSource, /HqDashboardBulkClosePanel/);
  assert.match(dashboardPageSource, /bulkCloseHqLedgers/);
});

test("HQ close preflight server contract is exported and permission-gated", () => {
  const actionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-close-actions.ts",
  );
  const preflightSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-close-preflight.ts",
  );

  assert.match(
    actionSource,
    /export\s+async\s+function\s+runHqLedgerClosePreflight/,
  );
  assert.match(
    actionSource,
    /requireLedgerHqCloseAccess\(\)[\s\S]*requireHeadquartersLedgerScope\(ledgerId\)[\s\S]*buildHqLedgerClosePreflightInTx/s,
    "preflight action should authorize before loading detailed ledger data",
  );
  assert.match(preflightSource, /export\s+type\s+HqLedgerClosePreflightResult/);
  assert.match(preflightSource, /ledgerId:\s*string/);
  assert.match(preflightSource, /storeName:\s*string/);
  assert.match(preflightSource, /closingDate:\s*string/);
  assert.match(preflightSource, /ledgerUpdatedAt:\s*string/);
  assert.match(preflightSource, /executedBy:/);
  assert.match(preflightSource, /executedAt:\s*string/);
  assert.match(preflightSource, /canClose:\s*boolean/);
  assert.match(preflightSource, /items:\s*HqLedgerClosePreflightItem\[\]/);
  assert.match(
    preflightSource,
    /severity:\s*"blocking"\s*\|\s*"warning"\s*\|\s*"exception-allowed"\s*\|\s*"info"/,
  );
});

test("HQ close actions avoid detailed preflight data before permission and scope gates", () => {
  const actionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-close-actions.ts",
  );
  const preflightStart = actionSource.indexOf(
    "export async function runHqLedgerClosePreflight",
  );
  const closeStart = actionSource.indexOf(
    "export async function closeHqLedger",
  );
  const preflightActionSource = actionSource.slice(preflightStart, closeStart);
  const closeActionSource = actionSource.slice(closeStart);

  assert.ok(preflightStart >= 0, "preflight action should exist");
  assert.ok(
    closeStart > preflightStart,
    "close action should follow preflight",
  );

  for (const [label, source] of [
    ["preflight", preflightActionSource],
    ["close", closeActionSource],
  ]) {
    const permissionIndex = source.indexOf(
      "await requireLedgerHqCloseAccess()",
    );
    const scopeIndex = source.indexOf("await requireHeadquartersLedgerScope");
    const buildIndex = source.indexOf("buildHqLedgerClosePreflightInTx");
    const beforePermission = source.slice(0, permissionIndex);
    const beforeScope = source.slice(0, scopeIndex);

    assert.ok(permissionIndex > 0, `${label} should require close permission`);
    assert.ok(
      scopeIndex > permissionIndex,
      `${label} should require scope after permission`,
    );
    assert.ok(
      buildIndex === -1 || buildIndex > scopeIndex,
      `${label} should not build detailed preflight data before scope`,
    );
    assert.doesNotMatch(
      beforePermission,
      /storeName|summary|items|findUnique|buildHqLedgerClosePreflightInTx/,
      `${label} should not load or shape closeability detail before permission`,
    );
    assert.doesNotMatch(
      beforeScope,
      /storeName|summary|items|buildHqLedgerClosePreflightInTx/,
      `${label} should not expose closeability detail before ledger scope`,
    );
  }

  assert.match(
    actionSource,
    /function\s+preflightBlockedError\([\s\S]*?actionError\([\s\S]*?"LEDGER_CLOSE_PREFLIGHT_BLOCKED"[\s\S]*?undefined[\s\S]*?\)/,
    "blocked close response should not echo detailed preflight rows in action metadata",
  );
});

test("HQ close preflight reuses review, calculation, correction, and carryover contracts", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-close-preflight.ts",
  );

  assert.match(source, /getLedgerReviewMissingItems/);
  assert.match(source, /getLedgerReviewStepHref/);
  assert.match(source, /calculateLedgerReviewSummary/);
  assert.match(source, /applyCorrectionValuesToLedgerReviewInput/);
  assert.match(source, /hasUnappliedCorrections/);
  assert.match(source, /policy-unconfirmed/);
  assert.match(source, /기준 확인 필요/);
  assert.match(source, /권한/);
  assert.match(source, /이미 마감 여부/);
  assert.match(source, /carryoverStatus/);
  assert.match(source, /DATA_INSUFFICIENT/);
  assert.match(source, /CARRYOVER_EMPTY/);
  assert.match(source, /amountStatus/);
  assert.match(source, /LedgerInventoryAdjustment\.amountStatus/);
  assert.match(source, /purchaseStandardId/);
  assert.match(source, /exception-allowed/);
  assert.match(source, /getDashboardSignals/);
});

test("HQ close preflight required-input checks use correction-applied required values", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-close-preflight.ts",
  );

  assert.match(
    source,
    /const missingItems = getLedgerReviewMissingItems\(\{[\s\S]*totalSalesAmount:\s*correctionOverlay\.reviewInput\.totalSalesAmount[\s\S]*paymentTotal:\s*calculatePaymentTotal\(\s*correctionOverlay\.reviewInput\.cashAmount,\s*correctionOverlay\.reviewInput\.cardAmount,\s*correctionOverlay\.reviewInput\.otherPaymentAmount,\s*\)[\s\S]*workerCount:\s*correctionOverlay\.reviewInput\.workerCount[\s\S]*\}\);/s,
  );
  assert.doesNotMatch(
    source,
    /const missingItems = getLedgerReviewMissingItems\(\{[\s\S]*totalSalesAmount:\s*ledger\.totalSalesAmount[\s\S]*workerCount:\s*ledger\.workerCount[\s\S]*\}\);/s,
  );
});

test("HQ close action reruns preflight inside the close transaction before audit", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-close-actions.ts",
  );

  assert.match(source, /LEDGER_CLOSE_PREFLIGHT_BLOCKED/);
  assert.match(
    source,
    /before\.updatedAt\.getTime\(\)\s*!==\s*expectedUpdatedAt\.getTime\(\)[\s\S]*?closeConflictError\(tx,\s*parsed\.data\)[\s\S]*?buildHqLedgerClosePreflightInTx/s,
    "close should preserve stale-token LEDGER_CONFLICT before rebuilding detailed preflight rows",
  );
  assert.match(
    source,
    /buildHqLedgerClosePreflightInTx\([\s\S]*?preflight\.summary\.blockingCount\s*>\s*0[\s\S]*?preflightBlockedError\(\)[\s\S]*?updateMany/s,
    "close should reject newly blocking preflight results before status update",
  );
  assert.match(
    source,
    /preflight:\s*\{[\s\S]*summary:\s*preflight\.summary[\s\S]*executedBy:\s*preflight\.executedBy[\s\S]*executedAt:\s*preflight\.executedAt[\s\S]*ledgerUpdatedAt:\s*preflight\.ledgerUpdatedAt/s,
    "close audit payload should include the preflight summary and token used",
  );
});

test("HQ close action supports reason-gated individual exception close", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-close-actions.ts",
  );

  assert.match(source, /exceptionReason:\s*z/);
  assert.match(
    source,
    /\.max\(500,\s*"마감 예외 사유는 500자 이하여야 합니다\."\)/,
  );
  assert.match(
    source,
    /preflight\.summary\.blockingCount\s*>\s*0[\s\S]*preflightBlockedError\(\)/,
    "blocking preflight items must still stop close without audit",
  );
  assert.match(
    source,
    /preflight\.summary\.exceptionAllowedCount\s*>\s*0[\s\S]*!exceptionReason[\s\S]*exceptionReasonRequiredError\(\)/,
    "exception-allowed preflight items require a reason before status update",
  );
  assert.match(
    source,
    /fieldErrors\?: FieldErrors|reason:\s*\["마감 예외 사유를 입력해 주세요\."\]/,
  );
  assert.match(
    source,
    /reason:\s*exceptionReason/,
    "successful exception close should persist the reason on AuditLog.reason",
  );
});

test("HQ close audit payload includes closer, token, summary, exception items, and reason", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "hq-close-actions.ts",
  );

  assert.match(source, /closedById:\s*actor\.user\.id/);
  assert.match(source, /closedAt/);
  assert.match(source, /ledgerUpdatedAt:\s*preflight\.ledgerUpdatedAt/);
  assert.match(source, /summary:\s*preflight\.summary/);
  assert.match(source, /items:\s*preflight\.items\.map/);
  assert.match(
    source,
    /exceptionAllowedCount:\s*preflight\.summary\.exceptionAllowedCount/,
  );
  assert.match(source, /exceptionReason:\s*exceptionReason\s*\?\?\s*null/);
  assert.match(
    source,
    /before:\s*toCloseAuditPayload\(before,\s*preflight,\s*exceptionReason\)/,
  );
  assert.match(
    source,
    /after:\s*toCloseAuditPayload\(after,\s*preflight,\s*exceptionReason\)/,
  );
});

test("HQ close dialog opens with a ClosePreflight table before enabling confirm", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "hq-ledger-close-dialog.tsx",
  );

  assert.match(source, /runHqLedgerClosePreflight/);
  assert.match(source, /preflight/);
  assert.match(source, /Table/);
  assert.match(source, /조건명/);
  assert.match(source, /상태/);
  assert.match(source, /필요한 조치/);
  assert.match(source, /차단/);
  assert.match(source, /경고/);
  assert.match(source, /사유 필요/);
  assert.match(source, /정보/);
  assert.match(source, /preflight\?\.canClose/);
  assert.match(source, /preflight\.ledgerUpdatedAt/);
  assert.match(source, /재점검/);
  assert.match(source, /overflow-x-auto/);
  assert.match(source, /isHydrated/);
  assert.match(source, /setIsHydrated\(true\)/);
  assert.match(source, /disabled=\{!isHydrated\}/);
});

test("HQ close dialog requires exception reason for exception-only preflight results", () => {
  const source = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "hq-ledger-close-dialog.tsx",
  );

  assert.match(source, /requiresExceptionReason/);
  assert.match(source, /preflight\.summary\.exceptionAllowedCount\s*>\s*0/);
  assert.match(source, /preflight\.summary\.blockingCount\s*===\s*0/);
  assert.match(source, /마감 예외 사유/);
  assert.match(source, /maxLength=\{500\}/);
  assert.match(source, /exceptionReason\.trim\(\)\.length\s*>\s*0/);
  assert.match(
    source,
    /exceptionReason:\s*requiresExceptionReason\s*\?\s*exceptionReason\s*:\s*undefined/,
  );
  assert.match(source, /isPreflightStale/);
  assert.match(source, /사유 입력 필요/);
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

test("HQ ledger detail displays human-readable headquarters close metadata", () => {
  const pageSource = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );
  const querySource = readProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );

  assert.match(querySource, /closedBy:\s*\{\s*select:\s*\{/s);
  assert.match(querySource, /closedAt:\s*true/);
  assert.match(
    pageSource,
    /detail\.closedBy\?\.name\s*\?\?\s*detail\.closedBy\?\.email/,
  );
  assert.match(pageSource, /본사 마감 정보/);
  assert.match(pageSource, /closedAt/);
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
  assert.match(source, /ledgerUpdatedAt:\s*preflight\.ledgerUpdatedAt/);
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
    assert.match(source, /getLedgerEditBlockReason/);
    assert.match(
      source,
      /notEditableError\([^)]*\)/,
      "closed branch should be routed through notEditableError",
    );
  }
});
