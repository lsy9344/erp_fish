# Investigation: Requested Change 18 - Inventory By Item Across Branches

## Hand-off Brief

1. **What happened.** Requested change 18 asks for an all-branch inventory view by item; the document maps it to `/app/reports/inventory`.
2. **Where the case stands.** Concluded; the inventory report exists and covers the main intent, but it is not a strict "one item x every branch including missing/zero rows" matrix.
3. **What's needed next.** If the stakeholder means every branch must appear for a selected item, add product-first grouping plus missing/zero rows per store.

## Case Info

| Field            | Value |
| ---------------- | ----- |
| Ticket           | N/A |
| Date opened      | 2026-06-29 |
| Status           | Concluded |
| System           | Windows, project `erp_fish` |
| Evidence sources | `docs/meeting/requested-changes-briefing-2026-06-22.md`, source code, tests if available |

## Problem Statement

User request: Review whether item 18 in `docs/meeting/requested-changes-briefing-2026-06-22.md` is implemented: "품목별로 모든 지점에 몇 개 남았는지 보고 싶다".

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| Requested changes briefing | Available | Document path provided by user. |
| Source code | Available | Inventory report page, query, table, and export paths found. |
| Tests | Available | Unit test passed; E2E coverage exists in source. |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Locate item 18 in the briefing | High | Done | Stronghold established at `docs/meeting/requested-changes-briefing-2026-06-22.md:54`. |
| 2 | Find matching UI/API/model implementation | High | Done | `/app/reports/inventory` page, query, table, and export found. |
| 3 | Check tests or runnable verification | Medium | Done | `pnpm test:unit:file tests/unit/hq-inventory-position-report.test.mjs` passed. |

## Timeline of Events

| Time | Event | Source | Confidence |
| ---- | ----- | ------ | ---------- |
| 2026-06-29 | Investigation opened from user request. | Conversation | Confirmed |
| 2026-06-29 | Related unit test file executed and passed. | Terminal output | Confirmed |

## Confirmed Findings

### Finding 1: The briefing explicitly maps item 18 to the inventory report.

**Evidence:** `docs/meeting/requested-changes-briefing-2026-06-22.md:54`, `docs/meeting/requested-changes-briefing-2026-06-22.md:120`

**Detail:** Item 18 says `/app/reports/inventory` is the place for item and branch remaining-stock history, and the briefing later calls it the full inventory report for checking which branch has how many of each item.

### Finding 2: The report defaults to all authorized active stores and supports narrowing to one store.

**Evidence:** `src/features/reports/inventory-position-queries.ts:295`, `src/features/reports/inventory-position-queries.ts:305`, `src/features/reports/inventory-position-queries.ts:322`, `src/features/reports/inventory-position-queries.ts:326`

**Detail:** The query reads `getHeadquartersStoreScope()`, uses all scoped stores when no `storeId` is supplied, then queries ledgers for those store IDs.

### Finding 3: Rows are produced per store and per inventory item, with the current remaining quantity.

**Evidence:** `src/features/reports/inventory-position-queries.ts:409`, `src/features/reports/inventory-position-queries.ts:425`, `src/features/reports/inventory-position-queries.ts:427`, `src/features/reports/inventory-position-queries.ts:433`, `src/features/reports/inventory-position-queries.ts:442`

**Detail:** The query loops each selected store's `ledgerInventoryItems`, applies category/product filters, and pushes an inventory row with store, item, loss, FIFO history, and current quantity data.

### Finding 4: The page and table expose the requested view to headquarters users.

**Evidence:** `src/app/app/reports/inventory/page.tsx:116`, `src/app/app/reports/inventory/page.tsx:117`, `src/app/app/reports/inventory/page.tsx:172`, `src/app/app/reports/inventory/page.tsx:206`, `src/features/reports/components/inventory-position-report-table.tsx:68`, `src/features/reports/components/inventory-position-report-table.tsx:69`, `src/features/reports/components/inventory-position-report-table.tsx:75`, `src/features/reports/components/inventory-position-report-table.tsx:90`, `src/features/reports/components/inventory-position-report-table.tsx:91`, `src/features/reports/components/inventory-position-report-table.tsx:111`

**Detail:** The page title is "전 지점 재고 현황", the description says "지점·품목별 남은 재고", the store filter defaults to "전체 활성 지점", the product search exists, and the table renders 지점/품목/남은 재고.

### Finding 5: CSV export includes the same inventory dimensions.

**Evidence:** `src/features/reports/export.ts:88`, `src/features/reports/export.ts:96`, `src/features/reports/export.ts:260`, `src/features/reports/export.ts:273`, `src/features/reports/export.ts:274`, `src/app/api/reports/export/route.ts:270`

**Detail:** The inventory export columns include 지점, 품목, and 남은 재고; the export path loads `getHqInventoryPositionReport()`.

### Finding 6: Focused unit tests pass, and E2E coverage exists for the main user path.

**Evidence:** `tests/unit/hq-inventory-position-report.test.mjs:21`, `tests/unit/hq-inventory-position-report.test.mjs:95`, `tests/e2e/hq-reports.spec.ts:1047`, `tests/e2e/hq-reports.spec.ts:1053`, `tests/e2e/hq-reports.spec.ts:1064`, `tests/e2e/hq-reports.spec.ts:1146`

**Detail:** The unit test verifies the WO-08 report boundaries, and the E2E spec covers navigating to the inventory report, viewing remaining stock, mobile display, CSV export, and manager access denial. The unit test command passed locally.

### Finding 7: The current implementation does not guarantee a row for every branch when viewing one item.

**Evidence:** `src/features/reports/inventory-position-queries.ts:389`, `src/features/reports/inventory-position-queries.ts:391`, `src/features/reports/inventory-position-queries.ts:409`, `src/features/reports/inventory-position-queries.ts:416`, `src/features/reports/inventory-position-queries.ts:425`, `src/features/reports/inventory-position-queries.ts:271`

**Detail:** Missing-ledger rows are only added when no category/product filter is active. Product-filtered output is produced by looping existing `ledgerInventoryItems`, so stores without that product row, or stores with no ledger while a product filter is active, are not shown. Rows are also sorted store-first.

## Deduced Conclusions

### Deduction 1: Item 18 is mostly implemented, with a strict all-branch caveat.

**Based on:** Findings 1-7.

**Reasoning:** The documented route exists, the page is protected by report access, the query includes all authorized active stores by default, each displayed row carries both store and product identity plus remaining stock, the table/CSV expose those fields, and tests cover the main route. However, the rows are not generated as a complete product-by-store grid.

**Conclusion:** Implemented if the requirement means "a headquarters inventory report where item/store remaining stock can be checked and filtered." Partially implemented if the requirement strictly means "select one item and always see every branch, including 0/missing rows, grouped under that item."

## Hypothesized Paths

### Hypothesis 1: Item 18 may be implemented as an item stock view grouped by product and branch.

**Status:** Partially confirmed

**Theory:** The system may already expose item-level stock quantities per branch through an inventory screen, endpoint, query, or export.

**Supporting indicators:** The project appears to be an ERP system where inventory and branch concepts are expected.

**Would confirm:** Source/UI evidence showing each item with quantities for all branches, or an equivalent API/query.

**Would refute:** Source/UI evidence only showing stock for one selected branch, aggregate stock without branch breakdown, or no item-level inventory view.

**Resolution:** Confirmed as a store/item row report with product search, not as a complete product-first pivot/grouped layout. Sorting and missing-row evidence: `src/features/reports/inventory-position-queries.ts:271`, `src/features/reports/inventory-position-queries.ts:389`.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Full live browser run | Would confirm current seeded runtime UI exactly | E2E source exists; only focused unit test was run in this investigation. |

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Error origin | N/A |
| Trigger | Headquarters user opens `/app/reports/inventory` or CSV export |
| Condition | No store filter means all authorized active stores are selected |
| Related files | `src/app/app/reports/inventory/page.tsx`, `src/features/reports/inventory-position-queries.ts`, `src/features/reports/components/inventory-position-report-table.tsx`, `src/features/reports/export.ts`, `src/app/api/reports/export/route.ts` |

## Conclusion

**Confidence:** High

Item 18 is mostly implemented. The implementation is a headquarters-only "전 지점 재고 현황" report at `/app/reports/inventory` with date/store/category/product filters, all-active-store default scope, per-store/per-product remaining stock rows, FIFO history dialogs, and CSV export. It is not a strict product-first, all-branches-including-zero/missing matrix.

## Recommended Next Steps

### Fix direction

No fix is required if a filterable store/item table satisfies the request. If the stakeholder specifically wants "pick one item, then see every branch grouped under that item", generate rows from selected stores x selected product, fill absent item rows as 0 or 미입력, and sort/group product-first.

### Diagnostic

Already ran: `pnpm test:unit:file tests/unit/hq-inventory-position-report.test.mjs` (passed).

## Reproduction Plan

Open `/app/reports/inventory`, leave 지점 as "전체 활성 지점", enter a 품목 search if needed, and check the 지점/품목/남은 재고 columns or CSV output.

## Side Findings
