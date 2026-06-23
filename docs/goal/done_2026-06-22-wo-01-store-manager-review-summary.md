# WO-01 Store Manager Review Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the store-manager review page show only `총 매출`, `마진률`, `근무인원`, and `재고금액` in the calculation summary.

**Architecture:** This is a response-shaping and UI contract fix. The authoritative calculation can keep all metrics internally, but the store-manager shaped response and rendered summary must match the meeting requirement.

**Tech Stack:** TypeScript, Next.js App Router, existing Node unit tests and Playwright E2E tests.

---

## Current Evidence

- `src/features/ledger/review-types.ts` defines `StoreManagerLedgerReviewSummary` as `totalSales | paymentDifference | grossMarginRate | inventoryAmount`.
- `src/features/ledger/response-shaping.ts` copies `paymentDifference` into the store-manager summary.
- `src/features/ledger/response-shaping.ts` allows `workerCount` in step metrics but not in top-level summary.
- Existing tests currently encode the old behavior. Update the tests, not the requirement.

## Desired Behavior

- Store-manager top-level calculation summary includes:
  - `totalSales` labeled as total sales.
  - `grossMarginRate` labeled as margin rate/profit rate.
  - `workerCount` labeled as worker count.
  - `inventoryAmount` labeled as inventory amount.
- Store-manager top-level calculation summary excludes:
  - `paymentDifference`.
  - `salesDifference`.
  - cost of goods sold, gross profit, operating profit, productivity, FIFO lot details.
- Existing step summaries can still show non-sensitive step status/counts if they do not contradict the summary requirement.

## Files

- Modify: `src/features/ledger/review-types.ts`
- Modify: `src/features/ledger/response-shaping.ts`
- Inspect/possibly modify: `src/features/ledger/components/review-summary-client.tsx`
- Modify: `tests/unit/ledger-review.test.mjs`
- Modify: `tests/unit/sensitive-response-shaping.test.mjs`
- Modify if needed: `tests/e2e/store-ledger-review.spec.ts`

## Task Checklist

- [ ] Update `StoreManagerLedgerReviewSummary` to pick `totalSales`, `grossMarginRate`, `workerCount`, and `inventoryAmount`.
- [ ] Update `toStoreManagerLedgerReviewStepData()` summary shaping to copy `workerCount` and remove `paymentDifference`.
- [ ] Confirm `review-summary-client.tsx` renders summary generically from returned metrics or add the missing display row for `workerCount`.
- [ ] Update unit tests that currently assert `paymentDifference` is present.
- [ ] Add a regression assertion that `paymentDifference` is absent from store-manager shaped summary.
- [ ] Add a regression assertion that `workerCount` is present.
- [ ] Update E2E review page expectations if they check the old calculation summary.

## Suggested Unit Test Assertions

Use the existing test files and adapt their current fixtures. The important assertions are:

```js
assert.equal(Object.hasOwn(safeReview.summary, "totalSales"), true);
assert.equal(Object.hasOwn(safeReview.summary, "grossMarginRate"), true);
assert.equal(Object.hasOwn(safeReview.summary, "workerCount"), true);
assert.equal(Object.hasOwn(safeReview.summary, "inventoryAmount"), true);
assert.equal(Object.hasOwn(safeReview.summary, "paymentDifference"), false);
assert.equal(Object.hasOwn(safeReview.summary, "salesDifference"), false);
```

## Acceptance Criteria

- Store-manager review calculation summary shows exactly the requested four high-level values.
- No store-manager response contains top-level `paymentDifference` in the review summary.
- Store-manager response still blocks sensitive accounting values and FIFO lot basis.
- Headquarters ledger detail remains unaffected.

## Verification Commands

Run only after implementation:

```powershell
pnpm test:unit:file tests/unit/ledger-review.test.mjs tests/unit/sensitive-response-shaping.test.mjs
pnpm test:e2e:core -- --grep "검토 화면"
```

If the project runner does not accept `--grep` through `test:e2e:core`, run the specific file:

```powershell
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-review.spec.ts
```

