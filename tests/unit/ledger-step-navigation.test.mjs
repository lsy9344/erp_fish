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

test("ledger-backed store entry steps share saved status for every step", () => {
  const querySource = readProjectFile(
    "src",
    "features",
    "ledger",
    "queries.ts",
  );
  const typeSource = readProjectFile("src", "features", "ledger", "types.ts");

  assert.match(
    querySource,
    /_count:\s*\{\s*select:\s*\{\s*ledgerInventoryItems:\s*true,\s*ledgerLossItems:\s*true,\s*\},\s*\}/s,
    "ledger select should include saved inventory and loss row counts",
  );
  assert.match(
    querySource,
    /stepCompletion:\s*getStoreEntryStepCompletion\(\{\s*\.\.\.ledger,\s*inventoryItemCount:\s*ledger\._count\.ledgerInventoryItems,\s*lossItemCount:\s*ledger\._count\.ledgerLossItems,\s*\}\)/s,
    "ledger step data should include completion state for inventory and losses",
  );
  assert.match(typeSource, /StoreEntryStepCompletion/);
  assert.match(typeSource, /stepCompletion:\s*StoreEntryStepCompletion/);

  const navigationSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "store-entry-step-navigation.tsx",
  );
  assert.match(navigationSource, /"use client"/);
  assert.match(
    navigationSource,
    /aria-current=\{isCurrent \? "step" : undefined\}/,
  );
  assert.match(navigationSource, /onNavigateAttempt/);
  assert.match(navigationSource, /저장됨/);

  const saveStatusSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "ledger-save-status.tsx",
  );
  assert.match(saveStatusSource, /장부 저장 상태/);
  assert.match(saveStatusSource, /마지막 저장/);
  assert.match(saveStatusSource, /작성자 표시명/);
  assert.match(saveStatusSource, /저장되지 않았을 수 있는 항목/);
  assert.match(saveStatusSource, /timeZone:\s*"Asia\/Seoul"/);
  assert.match(saveStatusSource, /onRetry/);
  assert.match(saveStatusSource, /다시 시도/);

  const unsavedDialogSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "unsaved-change-dialog.tsx",
  );
  assert.match(unsavedDialogSource, /저장하지 않은 변경이 있습니다/);
  assert.match(
    unsavedDialogSource,
    /aria-labelledby="unsaved-change-dialog-title"/,
  );
  assert.match(unsavedDialogSource, /계속 편집/);
  assert.match(unsavedDialogSource, /취소/);
  assert.match(unsavedDialogSource, /저장/);

  const guardSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "use-unsaved-step-guard.ts",
  );
  assert.match(guardSource, /beforeunload/);
  assert.match(guardSource, /lastTriggerRef\.current\?\.focus\(\)/);
  assert.match(guardSource, /window\.location\.href = pendingHref/);

  for (const component of [
    "sales-payment-step-client.tsx",
    "expense-step-client.tsx",
    "purchase-step-client.tsx",
    "workstep-client.tsx",
  ]) {
    const source = readProjectFile(
      "src",
      "features",
      "ledger",
      "components",
      component,
    );

    assert.match(source, /StoreEntryStepNavigation/);
    assert.match(source, /currentStep=\{currentStep\}/);
    assert.match(source, /stepCompletion=\{ledger\.stepCompletion\}/);
    assert.match(source, /LedgerSaveStatus/);
    assert.match(source, /authorDisplayName=\{ledger\.authorDisplayName\}/);
    assert.match(source, /UnsavedChangeDialog/);
    assert.match(source, /useUnsavedStepGuard/);
    assert.match(source, /onNavigateAttempt=\{guard\.requestNavigation\}/);
    assert.match(
      source,
      /guard\.requestNavigation\(nextStepHref, event\.currentTarget\)/,
    );
    assert.doesNotMatch(
      source,
      /<li className="text-muted-foreground rounded-md border px-3 py-2 text-sm">\s*4단계: 재고\s*<\/li>/s,
      `${component} should not hard-code an unsaved inventory step`,
    );
    assert.doesNotMatch(
      source,
      /<li className="text-muted-foreground rounded-md border px-3 py-2 text-sm">\s*5단계: 손실\/폐기\s*<\/li>/s,
      `${component} should not hard-code an unsaved losses step`,
    );
  }

  for (const [component, dataName] of [
    [
      path.join(
        "src",
        "features",
        "inventory",
        "components",
        "inventory-step-client.tsx",
      ),
      "data",
    ],
    [
      path.join(
        "src",
        "features",
        "losses",
        "components",
        "loss-step-client.tsx",
      ),
      "data",
    ],
  ]) {
    const source = readProjectFile(component);

    assert.match(source, /StoreEntryStepNavigation/);
    assert.match(source, /LedgerSaveStatus/);
    assert.match(
      source,
      new RegExp(`authorDisplayName=\\{${dataName}\\.authorDisplayName\\}`),
    );
    assert.match(source, /UnsavedChangeDialog/);
    assert.match(source, /useUnsavedStepGuard/);
    assert.match(source, /onNavigateAttempt=\{guard\.requestNavigation\}/);
    assert.match(
      source,
      /guard\.requestNavigation\(nextStepHref, event\.currentTarget\)/,
    );
  }

  const reviewSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "review-summary-client.tsx",
  );
  assert.match(reviewSource, /StoreEntryStepNavigation/);
  assert.match(reviewSource, /LedgerSaveStatus/);
  assert.match(
    reviewSource,
    /authorDisplayName=\{currentReviewData\.authorDisplayName\}/,
  );
  assert.match(reviewSource, /unsavedFields=\{\["검토 제출 상태"\]\}/);
});
