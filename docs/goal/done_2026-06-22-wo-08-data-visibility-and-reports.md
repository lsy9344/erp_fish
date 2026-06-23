# WO-08 Data Visibility and Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give headquarters a clearer way to see remaining inventory across all stores, inspect broad operational data, and prepare P&L-related reporting.

**Architecture:** Build on existing report/query patterns instead of creating a generic database browser. Start with a dedicated all-store remaining inventory report, then extend monthly P&L with explicit data inputs and gaps.

**Tech Stack:** Existing reports feature, Prisma queries, export route, Playwright E2E.

---

## Current Evidence

- Monthly report has loss/inventory flow and top/bottom product ranking.
- Store comparison report has average inventory and inventory ratio.
- Top/bottom product ranking is estimated because product-level sales are not recorded.
- No dedicated all-store remaining inventory screen was found.

## Desired Behavior

- Headquarters can see all remaining inventory by store/product/date in one screen.
- Data can be filtered by date, store, category, and product.
- Report clearly separates actual values from estimated values.
- P&L report lists required inputs and marks unavailable values clearly.

## Files

- Create: `src/features/reports/inventory-position-types.ts`
- Create: `src/features/reports/inventory-position-queries.ts`
- Create: `src/features/reports/components/inventory-position-report-table.tsx`
- Create: `src/app/app/reports/inventory/page.tsx`
- Modify: `src/app/app/reports/daily/page.tsx`
- Modify: `src/app/app/reports/comparison/page.tsx`
- Modify: `src/app/app/reports/monthly/page.tsx`
- Modify: `src/features/reports/export.ts`
- Modify: `src/app/api/reports/export/route.ts`
- Modify: `src/components/app-sidebar.tsx` only if a top-level report link needs adjustment.
- Add: `tests/unit/hq-inventory-position-report.test.mjs`
- Add/modify: `tests/e2e/hq-reports.spec.ts`
- Modify: `tests/api/report-export.spec.ts`

## Inventory Position Query Contract

Recommended row:

```ts
export type InventoryPositionRow = {
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
  productCategory: "냉동" | "생물";
  productSpec: string;
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number;
  currentQuantity: number | null;
  systemQuantity: number | null;
  differenceQuantity: number | null;
  inventoryAmount: number | null;
  statusLabel: "입력됨" | "미입력" | "계산 불가";
};
```

## P&L Data Inputs to Document in UI

- Sales: `DailyLedger.totalSalesAmount`.
- Purchase cost / COGS: currently depends on inventory/FIFO policy.
- Branch daily expenses: `LedgerExpense`.
- Headquarters expenses: requires WO-07.
- Labor/payroll: requires WO-05 for detailed payroll; current `workerCount` is not enough.
- Inventory value: currently exists but FIFO policy and visibility need WO-03.
- Product-level sales: not directly recorded; current top/bottom product sales are estimated.

## Task Checklist

- [ ] Add inventory position query using authorized headquarters store scope.
- [ ] Return only active stores unless filter says otherwise.
- [ ] Include latest ledger for selected date without creating missing ledgers.
- [ ] Build table and mobile cards.
- [ ] Add report navigation link between daily/comparison/monthly.
- [ ] Add CSV export for inventory position.
- [ ] Add P&L readiness section to monthly report that lists actual vs missing inputs.
- [ ] Mark top/bottom product sales as estimated anywhere they appear.
- [ ] Add tests for no-data state, unauthorized store scope, and CSV export.

## Acceptance Criteria

- Headquarters can view remaining inventory for all authorized stores on a selected date.
- Missing ledger rows show `미입력`, not zero.
- Export includes the same rows and does not leak forbidden raw keys.
- Monthly report clearly says which P&L inputs are actual and which are unavailable/estimated.
- Product top/bottom ranking remains labeled as estimated until product-level sales are implemented.

## Verification Commands

```powershell
pnpm test:unit:file tests/unit/hq-inventory-position-report.test.mjs tests/unit/hq-reports.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/hq-reports.spec.ts
node scripts/run-playwright-clean.mjs tests/api/report-export.spec.ts
```

