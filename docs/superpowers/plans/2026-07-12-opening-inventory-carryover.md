# Opening Inventory Carryover Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve every grounded opening/prior-ledger carryover row through inventory saves, clearly warn when a re-upload cannot overwrite an existing ledger, and safely repair the affected 2026-07-11 production ledgers.

**Architecture:** Keep the existing month-opening snapshot model and `10일 마감 → 11일 전일재고` semantics. Fix the shared persistence policy once, add a read-only ledger-conflict summary to upload results, and use a guarded/idempotent repair command driven by the first inventory-save audit snapshot. Do not merge monthly snapshots into every later ledger read.

**Tech Stack:** Next.js 15 server actions, TypeScript, Prisma/PostgreSQL, Node test runner, Playwright, pnpm, GitHub Actions, Vercel CLI.

## Global Constraints

- Do not create historical `DailyLedger` rows during upload.
- Do not overwrite a saved `currentQuantity`, `quantity`, ledger status, or other user-entered ledger fields during repair.
- Only `OPENING_SNAPSHOT`, `PREVIOUS_CLOSED_LEDGER`, and `PREVIOUS_SAVED_LEDGER` seed rows count as grounded carryover.
- A `MANUAL` seed row remains non-persistent until the user enters a value.
- Production repair must support dry-run, require `--yes` plus `ALLOW_REMOTE_INVENTORY_REPAIR=yes`, abort on closed/holiday ledgers or evidence mismatch, and run in one transaction.
- No new runtime dependency or schema migration.
- Keep changes surgical; do not refactor unrelated inventory, audit, CI, or deployment code.

---

## File Map

- `src/features/inventory/inventory-persist-policy.ts`: authoritative decision for whether a seed/existing inventory line is written.
- `tests/unit/ledger-inventory.test.mjs`: policy-level red/green regression coverage.
- `tests/e2e/store-ledger-inventory.spec.ts`: real save/reload regression with one edited and one untouched opening row.
- `src/features/inventory/opening-import.ts`: exact next-ledger date derivation from uploaded inventory date.
- `src/features/inventory/opening-import-actions.ts`: upload summary and existing-ledger conflict detection.
- `src/features/ledger/components/ecount-supply-upload-client.tsx`: operator-facing non-overwrite warning.
- `src/features/inventory/opening-carryover-repair.ts`: pure, deterministic repair planner.
- `scripts/repair-opening-inventory-carryover.mjs`: guarded Prisma transaction applying a plan and refreshing derived data.
- `tests/unit/inventory-opening-repair.test.mjs`: repair plan create/update/skip/error/idempotency tests.
- `src/features/audit/audit-format.ts`: readable label for the repair audit action.
- Four existing unit test files: align stale assertions with already-merged production behavior so the baseline gate is meaningful.

---

### Task 1: Restore a Green Unit-Test Baseline

**Files:**

- Modify: `tests/unit/ci-release-gates.test.mjs:68-72`
- Modify: `tests/unit/ecount-supply-remediation.test.mjs:98-111`
- Modify: `tests/unit/master-data-history.test.mjs:85-100`
- Modify: `tests/unit/master-data-purchase-standards.test.mjs:128-137`

**Interfaces:**

- Consumes: already-merged `main` behavior (no scheduled CI trigger, decimal quantities, inventory-opening audit target).
- Produces: the unchanged production behavior expressed by accurate unit assertions.

- [ ] **Step 1: Confirm the four known failures**

Run:

```powershell
node --experimental-strip-types --test tests/unit/ci-release-gates.test.mjs tests/unit/ecount-supply-remediation.test.mjs tests/unit/master-data-history.test.mjs tests/unit/master-data-purchase-standards.test.mjs
```

Expected: 4 failing tests: scheduled fast-check assertion, raw ECOUNT decimal conversion assertion, missing `InventoryOpeningSnapshot` option, and `quantity Int` schema assertion.

- [ ] **Step 2: Align assertions with current production contracts**

Use these exact expectations:

```js
// ci-release-gates.test.mjs
assert.doesNotMatch(workflow, /^\s+schedule:/m);
assert.doesNotMatch(fastChecksJob, /^\s+if:/m);

// ecount-supply-remediation.test.mjs
assert.match(
  source,
  /const quantity = isEcountUpload\s*\?\s*decimalToNumber\(existing\.quantity\)/,
);

// master-data-history.test.mjs expected values
("EcountImportBatch",
  "InventoryOpeningSnapshot",
  "StoreExternalAlias",
  // master-data-purchase-standards.test.mjs
  assert.match(
    ledgerPurchaseModel,
    /quantity\s+Decimal\s+@db\.Decimal\(12,\s*2\)/,
  ));
```

- [ ] **Step 3: Run the four files again**

Run the Step 1 command.

Expected: all tests in the four files pass, 0 failures.

- [ ] **Step 4: Commit the baseline correction**

```powershell
git add tests/unit/ci-release-gates.test.mjs tests/unit/ecount-supply-remediation.test.mjs tests/unit/master-data-history.test.mjs tests/unit/master-data-purchase-standards.test.mjs
git commit -m "test: align gates with merged inventory changes"
```

---

### Task 2: Persist Grounded Carryover Rows

**Files:**

- Modify: `tests/unit/ledger-inventory.test.mjs:1470-1520`
- Modify: `src/features/inventory/inventory-persist-policy.ts:20-44`
- Modify: `tests/e2e/store-ledger-inventory.spec.ts:277-340`

**Interfaces:**

- Consumes: `shouldPersistInventoryLine(item, currentQuantity, quantity, options)`.
- Produces: the same signature, with optional `item.carryoverSource`, and `true` for grounded carryover sources even when quantities are unchanged.

- [ ] **Step 1: Add failing policy tests**

Add cases equivalent to:

```js
for (const carryoverSource of [
  "OPENING_SNAPSHOT",
  "PREVIOUS_CLOSED_LEDGER",
  "PREVIOUS_SAVED_LEDGER",
]) {
  assert.equal(
    shouldPersistInventoryLine(
      {
        id: "product-1",
        productId: "product-1",
        currentQuantity: 7,
        quantity: 7,
        carryoverSource,
      },
      7,
      7,
    ),
    true,
  );
}

assert.equal(
  shouldPersistInventoryLine(
    {
      id: "product-1",
      productId: "product-1",
      currentQuantity: 0,
      quantity: 0,
      carryoverSource: "MANUAL",
    },
    0,
    0,
  ),
  false,
);
```

- [ ] **Step 2: Verify the policy test fails**

Run:

```powershell
node --experimental-strip-types --test tests/unit/ledger-inventory.test.mjs
```

Expected: grounded carryover cases fail because unchanged seed rows currently return `false`.

- [ ] **Step 3: Implement the smallest shared policy change**

Add `carryoverSource?: string` to the item type and implement:

```ts
const groundedCarryoverSources = new Set([
  "OPENING_SNAPSHOT",
  "PREVIOUS_CLOSED_LEDGER",
  "PREVIOUS_SAVED_LEDGER",
]);

const hasGroundedCarryover =
  item.id === item.productId &&
  groundedCarryoverSources.has(item.carryoverSource ?? "");

return (
  item.id !== item.productId ||
  hasGroundedCarryover ||
  requiredSeedEntryWasEntered ||
  currentQuantity !== item.currentQuantity ||
  quantity !== item.quantity
);
```

Both store and headquarters actions already pass the complete `item` object; do not add duplicate caller logic.

- [ ] **Step 4: Verify the unit test passes**

Run the Step 2 command.

Expected: all `ledger-inventory` unit tests pass.

- [ ] **Step 5: Extend the real save/reload E2E**

In `월초 스냅샷 기준 전일재고를 프리필하고 저장 후 수정 행을 유지한다`, seed a second product with a quantity of `5`, leave its input unchanged, save the first product as today, reload, and assert both UI and DB:

```ts
await expect(
  page.getByLabel(`${untouchedProduct.name} 당일재고`, { exact: true }),
).toHaveValue("5");

const untouchedRow = await prisma.ledgerInventoryItem.findUnique({
  where: {
    dailyLedgerId_productId: {
      dailyLedgerId: ledger.id,
      productId: untouchedProduct.id,
    },
  },
});
expect(untouchedRow?.carryoverSource).toBe("OPENING_SNAPSHOT");
expect(untouchedRow?.previousQuantity.toString()).toBe("5");
```

- [ ] **Step 6: Run the focused E2E**

Run:

```powershell
pnpm test:playwright -- tests/e2e/store-ledger-inventory.spec.ts --grep "월초 스냅샷 기준"
```

Expected: 1 test passes and the untouched row remains after reload.

- [ ] **Step 7: Commit the persistence fix**

```powershell
git add src/features/inventory/inventory-persist-policy.ts tests/unit/ledger-inventory.test.mjs tests/e2e/store-ledger-inventory.spec.ts
git commit -m "fix: preserve grounded inventory carryover rows"
```

---

### Task 3: Warn When an Upload Cannot Overwrite a Saved Ledger

**Files:**

- Modify: `src/features/inventory/opening-import.ts:413-423,554-558`
- Modify: `src/features/inventory/opening-import-actions.ts:23-34,225-304`
- Modify: `src/features/ledger/components/ecount-supply-upload-client.tsx:124-153,246-285`
- Modify: `tests/unit/inventory-opening-import.test.mjs:179-293`

**Interfaces:**

- Produces: `getNextInventoryLedgerDate(isoDate: string): string`.
- Extends: `InventoryOpeningUploadResult` with `existingLedgerCount: number` and `existingLedgerStoreNames: string[]`.

- [ ] **Step 1: Add failing date and wiring assertions**

Add:

```js
assert.equal(getNextInventoryLedgerDate("2026-07-10"), "2026-07-11");
assert.equal(getNextInventoryLedgerDate("2026-07-31"), "2026-08-01");
assert.match(actionSource, /existingLedgerCount/);
assert.match(
  actionSource,
  /ledgerInventoryItems:\s*\{\s*some:\s*\{\s*\}\s*\}/s,
);
assert.match(clientSource, /작성된 장부는 자동으로 덮어쓰지 않았습니다/);
```

- [ ] **Step 2: Run the focused unit test and confirm failure**

```powershell
node --experimental-strip-types --test tests/unit/inventory-opening-import.test.mjs
```

Expected: missing exported date helper/result fields/copy failures.

- [ ] **Step 3: Export exact next-day derivation**

```ts
export function getNextInventoryLedgerDate(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new InventoryOpeningImportError("엑셀 날짜 값을 확인해 주세요.");
  }
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function nextDayYearMonth(isoDate: string) {
  return getNextInventoryLedgerDate(isoDate).slice(0, 7);
}
```

- [ ] **Step 4: Detect existing next-day ledgers inside the upload transaction**

Build unique `(storeId, nextDate)` targets from matched rows, then query only ledgers already containing inventory rows:

```ts
const ledgerTargets = [
  ...new Map(
    matchedRows.map((row) => {
      const nextDate = getNextInventoryLedgerDate(row.inventoryDate);
      return [
        `${row.storeId}\u001f${nextDate}`,
        {
          storeId: row.storeId,
          closingDate: new Date(`${nextDate}T00:00:00.000Z`),
        },
      ];
    }),
  ).values(),
];

const existingLedgers = await tx.dailyLedger.findMany({
  where: {
    OR: ledgerTargets,
    ledgerInventoryItems: { some: {} },
  },
  select: { store: { select: { name: true } } },
});
```

Set the two result fields from unique store names. Do not update ledger rows.

- [ ] **Step 5: Render accurate operator feedback**

When `existingLedgerCount > 0`, render a `role="status"` message beneath the result grid:

```tsx
<p className="text-amber-700" role="status">
  {inventoryResult.existingLedgerStoreNames.join(", ")}의 기존 재고 장부가 이미
  작성되어 스냅샷만 갱신했습니다. 작성된 장부는 자동으로 덮어쓰지 않았습니다.
</p>
```

Use an informational toast rather than the unconditional success toast for this branch.

- [ ] **Step 6: Run focused tests and commit**

```powershell
node --experimental-strip-types --test tests/unit/inventory-opening-import.test.mjs
git add src/features/inventory/opening-import.ts src/features/inventory/opening-import-actions.ts src/features/ledger/components/ecount-supply-upload-client.tsx tests/unit/inventory-opening-import.test.mjs
git commit -m "fix: disclose existing ledger upload conflicts"
```

Expected: focused test passes; commit contains no DB writes beyond the existing snapshot upsert.

---

### Task 4: Add a Guarded, Idempotent Production Repair

**Files:**

- Create: `src/features/inventory/opening-carryover-repair.ts`
- Create: `scripts/repair-opening-inventory-carryover.mjs`
- Create: `tests/unit/inventory-opening-repair.test.mjs`
- Modify: `src/features/inventory/adjustment-reconciliation.ts:1-10` (relative imports only, so Node can load it)
- Modify: `src/features/audit/audit-format.ts` (repair action label)
- Modify: `package.json` (script alias)

**Interfaces:**

- Produces: `planOpeningCarryoverRepair(input): { creates; updates; skips }`.
- Produces command: `pnpm db:repair:opening-inventory -- --date=2026-07-11 [--dry-run|--yes]`.

- [ ] **Step 1: Write failing pure planner tests**

Cover these exact cases:

```ts
// missing current row -> creates[0]
// current MANUAL row -> updates[0] preserving currentQuantity/quantity
// correct OPENING_SNAPSHOT row -> skips[0]
// missing snapshot or mismatched snapshot quantity -> throws EVIDENCE_MISMATCH
// running planner against already repaired rows -> creates=0, updates=0
```

The update assertion must prove only basis fields change:

```js
assert.deepEqual(plan.updates[0], {
  id: "current-item",
  previousQuantity: 8,
  carryoverSource: "OPENING_SNAPSHOT",
  carryoverStatus: "OPENING_CARRYOVER",
  carryoverLedgerId: null,
  previousQuantityDetail: auditItem.previousQuantityDetail,
});
```

- [ ] **Step 2: Run the test and confirm the module is missing**

```powershell
node --experimental-strip-types --test tests/unit/inventory-opening-repair.test.mjs
```

Expected: FAIL because `opening-carryover-repair.ts` does not exist.

- [ ] **Step 3: Implement the pure planner**

Use product ID maps and reject all ambiguous evidence:

```ts
export function planOpeningCarryoverRepair({
  auditItems,
  currentItems,
  snapshots,
}) {
  const openingItems = auditItems.filter(
    (item) => item.carryoverSource === "OPENING_SNAPSHOT",
  );
  // Validate one snapshot per opening item and equal sourceSnapshotId/quantity.
  // Missing current -> create; MANUAL/wrong basis -> update; exact basis -> skip.
  // Any other current source -> throw new Error("EVIDENCE_MISMATCH").
  return { creates, updates, skips };
}
```

Keep the planner free of Prisma and environment access.

- [ ] **Step 4: Implement the guarded DB command**

The command must:

1. Load `.env`/`.env.local` with `scripts/_loadenv.mjs`.
2. Require `--date=YYYY-MM-DD` and either `--dry-run` or both `--yes` and `ALLOW_REMOTE_INVENTORY_REPAIR=yes` for remote hosts.
3. Find all ledgers for that exact date and reject `HEADQUARTERS_CLOSED`/`HOLIDAY`.
4. Load each ledger's first `ledger.inventory.saved` audit `before.items`, current items, and same-month snapshots.
5. Print per-store create/update/skip counts on dry-run without writing.
6. On `--yes`, apply all plans in one Prisma transaction, preserving existing `currentQuantity`, `quantity`, status, and unrelated fields.
7. Upsert `LedgerInventoryCarryoverDetail`, call `syncLedgerInventoryPurchasedQuantitiesInTx`, `reconcileLedgerInventoryAdjustments`, and `refreshLedgerInventoryFifoLots`.
8. Write `inventory_opening_snapshot.carryover_repaired` audit rows with count summaries and reason `과거재고 이월 누락 복구`.
9. Re-query and abort unless a second plan is empty (idempotency proof).

Use the first inventory-save audit actor as `createdById`/`updatedById` for restored rows. Change the three `~` imports at the top of `adjustment-reconciliation.ts` to equivalent relative imports only; no behavior change.

- [ ] **Step 5: Add command and audit labels**

```json
"db:repair:opening-inventory": "node --experimental-strip-types scripts/repair-opening-inventory-carryover.mjs"
```

```ts
"inventory_opening_snapshot.carryover_repaired": "과거재고 이월 누락 복구",
```

- [ ] **Step 6: Run repair and related unit tests**

```powershell
node --experimental-strip-types --test tests/unit/inventory-opening-repair.test.mjs tests/unit/ledger-inventory.test.mjs tests/unit/master-data-history.test.mjs
pnpm typecheck
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit the repair tooling**

```powershell
git add src/features/inventory/opening-carryover-repair.ts src/features/inventory/adjustment-reconciliation.ts src/features/audit/audit-format.ts scripts/repair-opening-inventory-carryover.mjs tests/unit/inventory-opening-repair.test.mjs package.json
git commit -m "fix: add audited opening inventory repair"
```

---

### Task 5: Verify, Push, Deploy, Repair, and Monitor

**Files:**

- Verify all changed files and deployment artifacts; no planned source creation.

**Interfaces:**

- Consumes: commits from Tasks 1-4 and linked Vercel project `erp-fish`.
- Produces: pushed branch, production deployment URL, repaired production rows, and post-deploy evidence.

- [ ] **Step 1: Run the complete local quality gate**

```powershell
pnpm db:validate
pnpm format:check
pnpm format:check:ci-docs
pnpm typecheck
pnpm lint
pnpm build
pnpm test:unit
git diff --check
git status --short
```

Expected: every command exits 0 and the worktree is clean. If a failure is unrelated but blocks deployment, fix only the first evidenced cause, rerun its focused test, then rerun this gate.

- [ ] **Step 2: Run the focused browser regression against an isolated test DB**

```powershell
pnpm test:playwright -- tests/e2e/store-ledger-inventory.spec.ts --grep "월초 스냅샷 기준"
```

Expected: 1 test passes. Never point Playwright at the production Neon database.

- [ ] **Step 3: Review and publish the branch**

```powershell
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git push -u origin codex/fix-opening-inventory-carryover
```

Expected: push succeeds and GitHub CI starts for the branch.

- [ ] **Step 4: Wait for and resolve GitHub fast checks**

Inspect the pushed branch checks. If any check fails, fetch its logs, fix the first root cause with a focused test, commit, push, and wait again until required checks pass.

- [ ] **Step 5: Link the worktree to the existing Vercel project and deploy production**

Copy only the ignored project link (`.vercel/project.json`) from the original checkout or run `vercel link --yes`, then:

```powershell
vercel deploy --prod --yes
```

Expected: deployment reaches `Ready`. Capture the URL from the deploy command as `$deploymentUrl`; on failure run `vercel inspect $deploymentUrl --logs`, fix the first build/runtime cause, rerun the full local gate, commit/push, and deploy again.

- [ ] **Step 6: Dry-run the production repair**

With the worktree's ignored `.env.local` pointing at the configured Neon production database:

```powershell
$env:ALLOW_REMOTE_INVENTORY_REPAIR='yes'
pnpm db:repair:opening-inventory -- --date=2026-07-11 --dry-run
```

Expected: exactly the audited July 11 ledgers are listed; create/update/skip totals match the pre-repair evidence. No rows change.

- [ ] **Step 7: Execute and verify the production repair**

```powershell
$env:ALLOW_REMOTE_INVENTORY_REPAIR='yes'
pnpm db:repair:opening-inventory -- --date=2026-07-11 --yes
pnpm db:repair:opening-inventory -- --date=2026-07-11 --dry-run
```

Expected: the live run commits once; the second dry-run reports `create=0 update=0` for every store. Snapshot total remains 71, user-entered current quantities and ledger statuses are unchanged, and repair audit rows exist.

- [ ] **Step 8: Perform production smoke checks**

Verify the deployed URL returns HTTP 200 for `/login`, then use an authorized store account to confirm:

- July 11 carryover basis is present for all repaired opening products.
- A save/reload no longer removes untouched carryover rows.
- Re-uploading the same file reports existing-ledger non-overwrite accurately.

Do not alter production data during smoke beyond the explicitly authorized repair; use read-only UI checks where possible.

- [ ] **Step 9: Final deployment commit if diagnostics changed code**

If deployment fixes were required:

```powershell
git add -u
git commit -m "fix: resolve production deployment error"
git push
vercel deploy --prod --yes
```

Repeat local verification and deployment inspection until the final deployment is `Ready` and the branch is clean.
