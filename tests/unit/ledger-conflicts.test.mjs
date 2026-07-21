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

test("ActionResult exposes structured LEDGER_CONFLICT payload", () => {
  const source = readProjectFile("src", "lib", "action-result.ts");

  assert.match(source, /export type LedgerConflictPayload/);
  assert.match(source, /clientToken:\s*string \| number/);
  assert.match(source, /serverToken:\s*string \| number/);
  assert.match(source, /clientValues:\s*Record<string, ActionConflictValue>/);
  assert.match(source, /serverValues:\s*Record<string, ActionConflictValue>/);
  assert.match(source, /lastModifiedBy:\s*string \| null/);
  assert.match(source, /lastModifiedAt:\s*string/);
  assert.match(source, /reloadRequired:\s*boolean/);
  assert.match(source, /conflict\?:\s*LedgerConflictPayload/);
  assert.match(source, /isLedgerConflictResult/);
});

test("server actions return common structured conflict contract", () => {
  const ledgerConflictSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "conflicts.ts",
  );
  assert.match(ledgerConflictSource, /ledgerConflictErrorFromMeta/);
  assert.match(
    ledgerConflictSource,
    /code:\s*"LEDGER_CONFLICT"|LEDGER_CONFLICT/,
  );
  assert.match(ledgerConflictSource, /updatedBy:\s*\{\s*select:/s);
  assert.match(ledgerConflictSource, /role:\s*true/);
  assert.match(
    ledgerConflictSource,
    /meta\?\.updatedBy\?\.role === "HEADQUARTERS"/,
    "conflicts should identify HQ-originated edits for the 본사 수정 중 badge",
  );
  assert.match(ledgerConflictSource, /hqEditing:\s*input\.hqEditing \?\?/);

  for (const segments of [
    ["src", "features", "ledger", "actions.ts"],
    ["src", "features", "ledger", "hq-edit-actions.ts"],
    ["src", "features", "inventory", "actions.ts"],
    ["src", "features", "inventory", "hq-edit-actions.ts"],
    ["src", "features", "losses", "actions.ts"],
    ["src", "features", "losses", "hq-edit-actions.ts"],
    ["src", "features", "ledger", "hq-close-actions.ts"],
  ]) {
    const source = readProjectFile(...segments);

    assert.match(
      source,
      /ledgerConflictErrorFromMeta/,
      `${segments.join("/")} should use the shared conflict result builder`,
    );
    assert.match(
      source,
      /clientValues/,
      `${segments.join("/")} should include attempted client values`,
    );
    assert.match(
      source,
      /serverValues/,
      `${segments.join("/")} should include latest server values`,
    );
    assert.match(
      source,
      /reloadRequired:\s*true/,
      `${segments.join("/")} should force latest-ledger reload guidance`,
    );
  }
});

test("closed and holiday ledgers remain business errors, not conflicts or generic saves", () => {
  const ledgerActionSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "actions.ts",
  );
  assert.match(ledgerActionSource, /OriginalLedgerBlockedError/);
  assert.match(ledgerActionSource, /getLedgerEditBlockReason/);
  assert.match(ledgerActionSource, /isLedgerEditable/);
  assert.match(
    ledgerActionSource,
    /error instanceof OriginalLedgerBlockedError[\s\S]*actionError\(error\.code,\s*error\.message\)/,
    "store ledger saves should return the business error instead of falling through to generic save failure",
  );

  const inventoryActionSource = readProjectFile(
    "src",
    "features",
    "inventory",
    "actions.ts",
  );
  assert.match(inventoryActionSource, /OriginalInventoryBlockedError/);
  assert.match(
    inventoryActionSource,
    /getLedgerEditBlockReason\(status,\s*"inventory-adjustment"\)/,
  );
  assert.match(inventoryActionSource, /!isLedgerEditable\(before\.status\)/);
  assert.match(
    inventoryActionSource,
    /error instanceof OriginalInventoryBlockedError[\s\S]*actionError\(error\.code,\s*error\.message\)/,
  );

  const lossActionSource = readProjectFile(
    "src",
    "features",
    "losses",
    "actions.ts",
  );
  assert.match(lossActionSource, /originalLossBlockedError/);
  assert.match(
    lossActionSource,
    /getLedgerEditBlockReason\(status,\s*"loss-entry"\)/,
  );
  assert.match(lossActionSource, /!isLedgerEditable\(before\.status\)/);
});

test("conflict UI is wired into every editable ledger surface", () => {
  const dialogSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "save-conflict-dialog.tsx",
  );

  assert.match(dialogSource, /SaveConflictDialog/);
  assert.match(dialogSource, /내 입력값/);
  assert.match(dialogSource, /서버 최신값/);
  assert.match(dialogSource, /마지막 수정자/);
  assert.match(dialogSource, /수정 시각/);
  assert.match(dialogSource, /본사 수정 중/);
  assert.match(dialogSource, /최신값 다시 불러오기/);
  assert.match(dialogSource, /계속 편집/);
  assert.match(dialogSource, /border-amber-500/);
  assert.match(dialogSource, /sm:grid-cols/);

  for (const segments of [
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
    ["src", "features", "ledger", "components", "review-summary-client.tsx"],
    ["src", "features", "ledger", "components", "hq-ledger-close-dialog.tsx"],
  ]) {
    const source = readProjectFile(...segments);

    assert.match(source, /SaveConflictDialog/);
    assert.match(source, /useSaveConflictDialog/);
    assert.match(source, /captureConflict\(result\)/);
  }
});

test("unsaved-change guard covers store shell tabs and HQ tab state", () => {
  const shellSource = readProjectFile(
    "src",
    "components",
    "store-manager-shell.tsx",
  );
  const navigationSource = readProjectFile(
    "src",
    "components",
    "store-manager-navigation.tsx",
  );
  const guardSource = readProjectFile(
    "src",
    "features",
    "ledger",
    "components",
    "use-unsaved-step-guard.ts",
  );
  const hqPageSource = readProjectFile(
    "src",
    "app",
    "app",
    "ledgers",
    "[ledgerId]",
    "page.tsx",
  );

  assert.match(shellSource, /StoreManagerNavigation/);
  assert.match(navigationSource, /data-unsaved-guard-nav="store-shell"/);
  assert.match(guardSource, /a\[data-unsaved-guard-nav\]/);
  assert.match(guardSource, /document\.addEventListener\("click"/);
  assert.match(guardSource, /requestNavigation\(link\.href,\s*link\)/);
  assert.match(
    hqPageSource,
    /<TabsContent\s+value="sales"[\s\S]*?forceMount\s*>/,
  );
  assert.match(
    hqPageSource,
    /<TabsContent\s+value="inventory"[\s\S]*?forceMount\s*>/,
  );
});
