# WO-04 Dashboard Margin and Signal Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the headquarters dashboard so margin status is easier to read and margin shortfall money is visible without hiding inside a tooltip.

**Architecture:** Keep anomaly calculation in `src/server/calculations/anomaly.ts`. UI should render already-calculated signal details and should not duplicate margin math in React.

**Tech Stack:** TypeScript, React table UI, existing dashboard query/tests.

---

## Current Evidence

- Dashboard table has `마진율` column.
- `evaluateMarginRateSignal()` includes percent-point shortfall and amount in `signal.detail`.
- `DashboardSignalSummary` defaults `showDetails = false`, so money detail is usually only in title/accessibility text.
- Dashboard no longer has a `매출 차이` column, which matches the removal request.

## Desired Behavior

- Dashboard displays margin as an easy "current / target" style, for example `18.5 / 20.0%`.
- Dashboard visibly shows shortfall money when margin is below threshold.
- Dashboard does not re-add a `매출 차이` column.
- Dashboard keeps row click behavior and column resizing.

## Files

- Modify: `src/features/dashboard/types.ts`
- Modify: `src/features/dashboard/queries.ts`
- Modify: `src/features/dashboard/components/hq-dashboard-table.tsx`
- Modify: `src/features/dashboard/components/dashboard-signal-summary.tsx` if details should be visible in dashboard rows.
- Modify: `tests/unit/hq-dashboard.test.mjs`
- Modify: `tests/e2e/hq-dashboard.spec.ts`

## Data Shape Recommendation

Add optional display metadata to dashboard row:

```ts
marginTargetRate: LedgerReviewMetric | null;
marginShortfallAmount: LedgerReviewMetric | null;
```

Alternative: derive display from threshold settings in the query and return:

```ts
marginDisplay: {
  currentLabel: string;
  targetLabel: string | null;
  shortfallAmountLabel: string | null;
};
```

Prefer the second option if only UI labels are needed, because it avoids leaking extra raw fields.

## Task Checklist

- [ ] Extend dashboard row type with margin display metadata.
- [ ] In dashboard query, use normalized anomaly threshold settings to build target margin display.
- [ ] Reuse existing margin anomaly calculation detail for shortfall money where possible.
- [ ] Render the `마진율` column as `현재 / 기준` when threshold is active.
- [ ] Render visible shortfall money in the signal cell or a dedicated compact line under margin.
- [ ] Ensure empty threshold state still shows current margin or calculation status cleanly.
- [ ] Confirm dashboard columns do not include `매출 차이`.
- [ ] Update tests that assert dashboard shape and visible text.

## Acceptance Criteria

- A row with 18% margin and 20% threshold shows `18.0 / 20.0%` or equivalent simple wording.
- If margin is below threshold, the money shortfall is visible in the table/card without requiring hover.
- If margin is above threshold, no warning money line is shown.
- `매출 차이` is not present as a dashboard column or signal label.

## Verification Commands

```powershell
pnpm test:unit:file tests/unit/hq-dashboard.test.mjs tests/unit/anomaly-sales-signals.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/hq-dashboard.spec.ts
```

