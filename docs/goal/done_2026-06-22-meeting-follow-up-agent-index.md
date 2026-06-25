# Meeting Follow-up Agent Work Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` before implementing any linked work order. Each work order is intended to be handled independently by one agent unless it explicitly says otherwise.

**Goal:** Turn the latest meeting/audit gaps into executable, one-at-a-time agent work orders.

**Architecture:** Existing ERP Fish patterns should be preserved: Next.js App Router pages under `src/app`, feature logic under `src/features`, shared calculations under `src/server/calculations`, Prisma schema/migrations under `prisma`, and tests under `tests/unit`, `tests/e2e`, or `tests/api`. Prefer small feature-scoped changes over broad rewrites.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma, PostgreSQL-compatible Prisma models, Playwright E2E, Node test runner unit tests.

---

## Current Audit Summary

This index is based on a static review of the current codebase on 2026-06-22. It does not claim runtime test results.

### Already mostly reflected

- `전일재고` history popup exists on the inventory page. Evidence: `src/features/inventory/components/inventory-step-client.tsx` has `전일재고 이력 보기` and Dialog logic; `tests/e2e/store-ledger-inventory.spec.ts` checks the dialog.
- Purchase entry can default from purchase standards while allowing user-edited `unitPrice`. Evidence: `src/features/ledger/components/purchase-step-client.tsx`.
- Anomaly thresholds were simplified to `marginRate` and `inventoryDifferenceQuantity`. Evidence: `src/features/dashboard/threshold-schemas.ts` and `src/features/dashboard/components/anomaly-threshold-settings-client.tsx`.
- The old standalone `설정` menu label is not present in the headquarters sidebar. Evidence: `src/components/app-sidebar.tsx`.
- Monthly report has top/bottom 5 product ranking, but it is estimated by `판매량 × 단가`, not true product-level sales. Evidence: `src/features/reports/queries.ts`.

### Not fully reflected

- Ecount Excel import creates/updates purchase standards, not actual ledger purchase rows.
- FIFO lot data is stored and calculated, but the user cannot inspect FIFO valuation history in a normal screen.
- Store-manager review summary still exposes `paymentDifference` and omits `workerCount` from summary.
- Dashboard margin display has margin percentage and signals, but not the requested `20/100` style plus visible money shortfall.
- Labor/payroll management only stores worker count and memo.
- Pre-open expected selling price plan does not exist.
- Headquarters-only expenses are not separate from daily ledger expenses.
- Full-data visibility and P&L/reporting need a clearer route and data model boundaries.
- Easy wording/comment/code-name editing exists only in limited places.

## Recommended Execution Order

1. `2026-06-22-wo-01-store-manager-review-summary.md`
2. `2026-06-22-wo-02-ecount-ledger-purchase-import.md`
3. `2026-06-22-wo-03-fifo-inventory-valuation-history.md`
4. `2026-06-22-wo-04-dashboard-margin-signal-display.md`
5. `2026-06-22-wo-05-labor-payroll-management.md`
6. `2026-06-22-wo-06-preopen-sales-price-plan.md`
7. `2026-06-22-wo-07-headquarters-expense-system.md`
8. `2026-06-22-wo-08-data-visibility-and-reports.md`
9. `2026-06-22-wo-09-terms-comments-and-code-aliases.md`

Reasoning:

- Work order 1 is small and removes a confirmed mismatch.
- Work orders 2 and 3 affect purchase/inventory cost foundations.
- Work order 4 depends on margin calculation semantics being stable.
- Work orders 5 through 8 add new data areas.
- Work order 9 is broad cleanup and should happen after new labels/data surfaces settle.

## Shared Implementation Rules

- Do not expose sensitive FIFO lot, cost, margin, or amount details to store-manager responses unless the work order explicitly allows it.
- Keep headquarters-only workflows behind existing authorization helpers such as `requireSettingsAccess`, `requireReportAccess`, or headquarters ledger scope helpers.
- Add or update unit tests before changing behavior when the current project has matching source-contract tests.
- Add E2E coverage when a new user-facing route, dialog, upload flow, or table column is introduced.
- Keep Korean user-facing text simple and concrete.

## Work Order Links

- [WO-01 Store manager review summary](2026-06-22-wo-01-store-manager-review-summary.md)
- [WO-02 Ecount ledger purchase import](2026-06-22-wo-02-ecount-ledger-purchase-import.md)
- [WO-03 FIFO inventory valuation history](2026-06-22-wo-03-fifo-inventory-valuation-history.md)
- [WO-04 Dashboard margin and signal display](2026-06-22-wo-04-dashboard-margin-signal-display.md)
- [WO-05 Labor payroll management](2026-06-22-wo-05-labor-payroll-management.md)
- [WO-06 Pre-open sales price plan](2026-06-22-wo-06-preopen-sales-price-plan.md)
- [WO-07 Headquarters-only expense system](2026-06-22-wo-07-headquarters-expense-system.md)
- [WO-08 Data visibility and reports](2026-06-22-wo-08-data-visibility-and-reports.md)
- [WO-09 Terms, comments, and code aliases](2026-06-22-wo-09-terms-comments-and-code-aliases.md)

