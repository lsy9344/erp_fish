# WO-03 FIFO Inventory Valuation History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let headquarters inspect how inventory amount was calculated by FIFO and see which lots were consumed or left.

**Architecture:** FIFO calculation and persistence already exist in `src/features/inventory/fifo-lots.ts` and `LedgerInventoryFifoLot`. This work exposes that data safely in headquarters views, while keeping store-manager sensitive response shaping intact unless a separate approval changes it.

**Tech Stack:** Prisma queries, Next.js App Router, existing Dialog components, Playwright E2E.

---

## Current Evidence

- `LedgerInventoryFifoLot` stores source type, source ledger/purchase IDs, unit price, original/consumed/remaining quantities and amounts.
- `refreshLedgerInventoryFifoLots()` calculates `inventoryAmount` from FIFO remaining amount.
- Inventory page currently says FIFO and confirmed inventory amount are not calculated in that screen.
- Store-manager response shaping intentionally blocks FIFO cost/lot basis.

## Desired Behavior

- Headquarters ledger detail can open FIFO history for each inventory item.
- FIFO history shows:
  - lot source: opening, previous carryover, purchase, legacy opening.
  - original quantity and amount.
  - consumed quantity and amount.
  - remaining quantity and amount.
  - unit price.
  - linked purchase row or previous ledger date when available.
- The screen clearly explains "oldest stock is treated as sold first".
- Store-manager pages do not expose unit price/FIFO lot details unless a separate permission decision is made.

## Files

- Modify: `src/features/dashboard/queries.ts` or create feature-specific query under `src/features/inventory/fifo-history-queries.ts`
- Modify: `src/app/app/ledgers/[ledgerId]/page.tsx`
- Create: `src/features/inventory/components/fifo-history-dialog.tsx`
- Modify: `src/server/calculations/ledger.ts` only if status wording must change.
- Modify: `tests/unit/ledger-inventory.test.mjs`
- Modify: `tests/unit/hq-dashboard.test.mjs` if ledger detail query shape changes.
- Add/modify: `tests/e2e/hq-ledger-edit.spec.ts` or a focused ledger detail E2E.

## Query Shape

Recommended view type:

```ts
export type InventoryFifoLotHistoryItem = {
  id: string;
  productId: string;
  productName: string;
  sourceType: "OPENING" | "PREVIOUS_CARRYOVER" | "PURCHASE" | "LEGACY_OPENING";
  sourceLabel: string;
  sourceReference: string;
  unitPrice: number;
  originalQuantity: number;
  consumedQuantity: number;
  remainingQuantity: number;
  originalAmount: number;
  consumedAmount: number;
  remainingAmount: number;
  sortOrder: number;
};
```

## Task Checklist

- [ ] Add a query that loads FIFO lots for a headquarters-authorized ledger.
- [ ] Join purchase rows and source ledgers when possible to build human-readable `sourceReference`.
- [ ] Add a dialog component with a compact table and mobile card fallback.
- [ ] Add a "FIFO 이력" or "재고금액 계산 보기" button in headquarters ledger inventory rows.
- [ ] Show totals at the bottom:
  - consumed amount total.
  - remaining amount total.
  - current inventory amount.
- [ ] Add a warning row when `LEGACY_OPENING` is present, because old origin is not fully traceable.
- [ ] Keep store-manager inventory response tests blocking `unitPrice`, `inventoryAmount`, `FIFO`, and lot details.
- [ ] Update wording that currently says FIFO is not calculated if that wording appears in headquarters context.

## Acceptance Criteria

- Headquarters can see FIFO lot history per inventory item.
- History explains which stock was treated as sold and which remained.
- FIFO totals match stored `inventoryAmount`.
- Legacy opening lots are clearly marked as less traceable.
- Store-manager pages still do not leak FIFO lot details.

## Verification Commands

```powershell
pnpm test:unit:file tests/unit/ledger-inventory.test.mjs tests/unit/hq-dashboard.test.mjs tests/unit/sensitive-response-shaping.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/hq-ledger-edit.spec.ts tests/e2e/store-ledger-inventory.spec.ts
```

