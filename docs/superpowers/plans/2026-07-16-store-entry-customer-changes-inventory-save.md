# Store Entry Customer Changes and Inventory Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved store-entry wording/UI changes, show only approved recent purchase prices, and make only overstock require an inventory adjustment reason while preserving user drafts on errors.

**Architecture:** Reuse the existing role flags and DTO shaping boundaries. Add one narrow purchase-price display value to inventory lines, and replace the purchase-only sale exception with one normalized shared inventory relation used by client validation, server guards, reconciliation, and review signals.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma, shadcn/ui, Node test runner, Playwright.

---

## File map

- `src/features/ledger/terms.ts`: store-entry display wording only; internal `expense` identifiers stay unchanged.
- `src/features/ledger/components/{store-entry-step-navigation,expense-step-client,workstep-client,purchase-step-client,save-conflict-dialog}.tsx`: store/HQ UI role branches.
- `src/features/ledger/{schemas,actions,hq-edit-actions,review-queries,review-validation}.ts`: user-visible validation and review copy.
- `src/app/app/ledgers/[ledgerId]/page.tsx`: HQ ledger tab wording.
- `src/app/app/reports/{daily,product-review,monthly}/page.tsx` and `src/features/reports/components/monthly-closing-anomaly-report.tsx`: remove the three render sites only.
- `src/features/reports/components/product-category-margin-chart.tsx`: delete after its final three callers are removed.
- `src/features/inventory/purchase-price.ts`: pure selection and weighted-average helper.
- `src/features/inventory/{types,queries}.ts`: add and populate the approved nested display price.
- `src/features/inventory/components/inventory-step-client.tsx`: render price, emphasize the one previous-stock button, preserve drafts, and focus the right product field.
- `src/features/inventory/inventory-persist-policy.ts`: normalized `NORMAL`/`OVERSTOCK`/`UNAVAILABLE` shared relation.
- `src/features/inventory/{adjustment-save-guard,adjustment-reconciliation}.ts`: consume the shared relation and remove stale shortage adjustments.
- `src/features/ledger/review-signals.ts`: emit adjustment review only for overstock.
- `tests/unit/{ledger-cost-labor,ledger-purchase,ledger-review,ledger-validation,ledger-inventory,hq-reports}.test.mjs`: focused behavior contracts.
- `tests/e2e/{store-ledger-cost-labor,store-ledger-purchase,store-ledger-inventory,store-ledger-inventory-adjustment,store-ledger-review,hq-ledger-edit,hq-reports}.spec.ts`: role and draft-preservation flows.

### Task 1: Store-entry wording and role-specific surface

**Files:**

- Modify: `src/features/ledger/terms.ts`
- Modify: `src/features/ledger/components/store-entry-step-navigation.tsx`
- Modify: `src/features/ledger/components/expense-step-client.tsx`
- Modify: `src/features/ledger/components/workstep-client.tsx`
- Modify: `src/features/ledger/components/purchase-step-client.tsx`
- Modify: `src/features/ledger/components/save-conflict-dialog.tsx`
- Modify: `src/features/ledger/schemas.ts`
- Modify: `src/features/ledger/actions.ts`
- Modify: `src/features/ledger/hq-edit-actions.ts`
- Modify: `src/features/ledger/review-queries.ts`
- Modify: `src/features/ledger/review-validation.ts`
- Modify: `src/features/master-data/code-alias-terms.ts`
- Modify: `src/app/app/ledgers/[ledgerId]/page.tsx`
- Modify: `src/app/app/reports/daily/page.tsx`
- Modify: `src/app/app/reports/product-review/page.tsx`
- Modify: `src/features/reports/components/monthly-closing-anomaly-report.tsx`
- Delete: `src/features/reports/components/product-category-margin-chart.tsx`
- Test: `tests/unit/ledger-cost-labor.test.mjs`
- Test: `tests/unit/ledger-purchase.test.mjs`
- Test: `tests/unit/ledger-review.test.mjs`
- Test: `tests/unit/ledger-validation.test.mjs`
- Test: `tests/unit/hq-reports.test.mjs`

- [ ] **Step 1: Write failing display-contract tests**

  Assert store-entry sources contain `4단계: 지출`, `지출 항목`, `지출 금액`, `입력 중 지출 합계`, `마지막 서버 저장 지출 합계`, `지출 단계로 이동`, and `5단계: 근무인원/이름`, while internal `expense` keys remain unchanged. Assert store work UI has `근무자 저장` and no store-visible salary summary/reference block, while the HQ branch still contains amount, totals, and `급여 저장`. Assert store purchase hides `<details>` while HQ keeps it. Assert all three report render sites omit `ProductCategoryMarginChart` and the deleted component has no caller.

- [ ] **Step 2: Run focused tests and verify RED**

  Run: `pnpm test:unit:file tests/unit/ledger-cost-labor.test.mjs tests/unit/ledger-purchase.test.mjs tests/unit/ledger-review.test.mjs tests/unit/ledger-validation.test.mjs tests/unit/hq-reports.test.mjs`

  Expected: failures show the old `비용`, `근무/인건비`, store salary copy, purchase details, and category chart render contracts.

- [ ] **Step 3: Implement the minimum role-aware UI changes**

  Use the existing flags; do not add a new permission system:

  ```tsx
  const isHeadquartersView = showSensitiveAccountingMetrics;

  {
    isHeadquartersView ? "급여 / 인건비" : "근무자";
  }
  {
    isHeadquartersView ? "급여 저장" : "근무자 저장";
  }
  {
    isHeadquartersView ? <LaborTotalsAndHeadcountHint /> : null;
  }
  {
    !showSalesPricePlan ? <details>{/* existing HQ fields */}</details> : null;
  }
  ```

  Merge the two work forms under one existing card wrapper without merging their save actions. Change only user-visible ledger-entry/review strings; keep Prisma/schema field names and code-group identifiers. Remove the three category-chart calls and then delete the now-unused chart component. Use the existing default `Button` variant for the previous-stock button so its built-in hover/focus states provide the emphasis.

- [ ] **Step 4: Run focused tests and verify GREEN**

  Run the same command from Step 2.

  Expected: all focused tests pass; HQ salary behavior and report calculations remain covered.

### Task 2: Approved purchase-price display on inventory rows

**Files:**

- Create: `src/features/inventory/purchase-price.ts`
- Modify: `src/features/inventory/types.ts`
- Modify: `src/features/inventory/queries.ts`
- Modify: `src/features/inventory/components/inventory-step-client.tsx`
- Test: `tests/unit/ledger-inventory.test.mjs`

- [ ] **Step 1: Write failing pure helper tests**

  Import `resolveInventoryPurchasePrices` and cover:

  ```ts
  assert.deepEqual(resolveInventoryPurchasePrices(targetDate, rows).get("p1"), {
    kind: "TODAY",
    businessDate: "2026-07-16",
    unitPrice: 12_000,
  });
  ```

  Add cases for the most recent prior business date, same-day weighted average `Math.round(sum(amount) / sum(quantity))`, and no/zero-quantity history returning `null`.

- [ ] **Step 2: Run the test and verify RED**

  Run: `pnpm test:unit:file tests/unit/ledger-inventory.test.mjs`

  Expected: import or contract failure because the helper and DTO field do not exist.

- [ ] **Step 3: Implement the pure helper and narrow DTO field**

  ```ts
  export type InventoryPurchasePrice = {
    kind: "TODAY" | "RECENT";
    businessDate: string;
    unitPrice: number;
  };

  export type InventoryPurchasePriceRow = {
    productId: string | null;
    businessDate: string;
    quantity: number;
    amount: number;
  };
  ```

  Select only dates on or before the target. For each product, keep the latest business date and aggregate every row on that date. Return `null` when no positive total quantity exists. Add `purchasePrice: InventoryPurchasePrice | null` to inventory lines and manual options; do not expose top-level FIFO/default/raw `unitPrice`.

- [ ] **Step 4: Query the store-scoped history once and render it**

  In `getInventoryStepDataForLedgerInTx`, query `LedgerPurchaseItem` through `DailyLedger` with the target `storeId`, `closingDate <= target`, and the item/manual-option product IDs. Select `DailyLedger.closingDate`, `productId`, `quantity`, and `amount`, then attach the helper result to both existing rows and manual options. Render exactly:

  ```tsx
  {
    item.purchasePrice
      ? `${item.purchasePrice.kind === "TODAY" ? "당일" : "최근"} 매입단가 · ${item.purchasePrice.businessDate} · ${formatKrw(item.purchasePrice.unitPrice)}/1박스`
      : "매입 이력 없음";
  }
  ```

  `ponytail:` ceiling: this reads eligible purchase history once; replace with a DB aggregate/window query only if measured history volume makes it slow.

- [ ] **Step 5: Run focused tests and verify GREEN**

  Run: `pnpm test:unit:file tests/unit/ledger-inventory.test.mjs`

  Expected: helper, DTO shaping, top-level sensitive-price blocking, and UI copy pass.

### Task 3: Shared overstock-only adjustment policy

**Files:**

- Modify: `src/features/inventory/inventory-persist-policy.ts`
- Modify: `src/features/inventory/adjustment-save-guard.ts`
- Modify: `src/features/inventory/adjustment-reconciliation.ts`
- Modify: `src/features/inventory/components/inventory-step-client.tsx`
- Modify: `src/features/ledger/review-signals.ts`
- Test: `tests/unit/ledger-inventory.test.mjs`
- Test: `tests/unit/ledger-review.test.mjs`

- [ ] **Step 1: Replace old-policy tests with failing approved-policy cases**

  Test one shared function with carryover-only sale, purchase sale, loss-mixed sale, exact equality, floating boundary, and real overstock:

  ```ts
  assert.equal(
    getInventoryQuantityRelation({
      previousQuantity: 10,
      purchasedQuantity: 0,
      lossQuantity: 0,
      currentQuantity: 4,
    }),
    "NORMAL",
  );
  assert.equal(
    getInventoryQuantityRelation({
      previousQuantity: 10,
      purchasedQuantity: 2,
      lossQuantity: 1,
      currentQuantity: 11.01,
    }),
    "OVERSTOCK",
  );
  ```

  Update guard expectations so only overstock without a reason returns an error, keyed to `items.N.adjustmentReason`. Update review tests so shortage rows do not emit adjustment signals.

- [ ] **Step 2: Run tests and verify RED**

  Run: `pnpm test:unit:file tests/unit/ledger-inventory.test.mjs tests/unit/ledger-review.test.mjs`

  Expected: carryover/loss-mixed shortage still incorrectly requires a reason and emits a review signal.

- [ ] **Step 3: Implement and reuse one normalized relation**

  ```ts
  export function getInventoryQuantityRelation(
    item,
  ): "NORMAL" | "OVERSTOCK" | "UNAVAILABLE" {
    const systemQuantity = calculateSystemInventoryQuantity(item);
    const currentQuantity =
      item.currentQuantity === null
        ? null
        : roundToTwoDecimals(item.currentQuantity);
    if (systemQuantity === null || currentQuantity === null)
      return "UNAVAILABLE";
    return currentQuantity > systemQuantity ? "OVERSTOCK" : "NORMAL";
  }
  ```

  Replace every `isPurchaseDrivenSale` use in client validation/badges, server guard, adjustment creation/reconciliation, and review signals. A `NORMAL` row must never create a new adjustment; reconciliation must delete a stale shortage adjustment. Keep manual-first-entry, required current quantity, range, and loss-review guards unchanged.

- [ ] **Step 4: Run tests and verify GREEN**

  Run the command from Step 2.

  Expected: only overstock requires a reason and all decimal boundary tests pass.

### Task 4: Error focus and draft preservation

**Files:**

- Modify: `src/features/inventory/components/inventory-step-client.tsx`
- Modify: `src/features/inventory/adjustment-save-guard.ts`
- Test: `tests/unit/ledger-inventory.test.mjs`
- Test: `tests/e2e/store-ledger-inventory.spec.ts`
- Test: `tests/e2e/store-ledger-inventory-adjustment.spec.ts`

- [ ] **Step 1: Write failing focus/draft contracts**

  Add a unit source/behavior contract that server reason errors use `items.N.adjustmentReason`. Add E2E coverage that enters several quantities/reasons, triggers an overstock validation error, and asserts every draft value remains. Assert the first invalid reason input becomes focused. Add a conflict flow assertion that `계속 편집` retains the draft and only `최신값 다시 불러오기` reloads it.

- [ ] **Step 2: Run focused tests and verify RED**

  Run: `pnpm test:unit:file tests/unit/ledger-inventory.test.mjs`

  Run: `node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-inventory.spec.ts tests/e2e/store-ledger-inventory-adjustment.spec.ts`

  Expected: reason-key/focus mapping or pagination assertions fail; existing values must not be reset to server data.

- [ ] **Step 3: Implement product-aware error focus without rebuilding state**

  Capture the submitted `productId` order before awaiting the action. Translate `items.N.currentQuantity` and `items.N.adjustmentReason` to the matching current product, switch its category/page, then focus `currentQuantityRefs` or `reasonRefs`. On every failed action and conflict keep `items` untouched. Continue using the existing conflict dialog, whose explicit reload action is the only draft-discard path.

- [ ] **Step 4: Run focused tests and verify GREEN**

  Run the commands from Step 2.

  Expected: values survive client validation, server validation, and conflict keep-editing; the correct field is focused.

### Task 5: Final verification

**Files:** All changed files above.

- [ ] **Step 1: Run static and unit checks**

  Run: `pnpm typecheck`

  Run: `pnpm lint`

  Run: `pnpm test:unit`

  Expected: zero errors and all tests pass.

- [ ] **Step 2: Run targeted E2E regressions**

  Run: `node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-cost-labor.spec.ts tests/e2e/store-ledger-purchase.spec.ts tests/e2e/store-ledger-inventory.spec.ts tests/e2e/store-ledger-inventory-adjustment.spec.ts tests/e2e/store-ledger-review.spec.ts tests/e2e/hq-ledger-edit.spec.ts tests/e2e/hq-reports.spec.ts`

  Expected: requested store changes pass, HQ salary remains available, and the three report cards are absent.

- [ ] **Step 3: Inspect the final diff**

  Run: `git diff --check`

  Run: `git status --short`

  Confirm every changed line maps to this design, the original workspace's uncommitted opening-import files were not modified, and no dependency/schema migration was added.
