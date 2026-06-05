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
});
