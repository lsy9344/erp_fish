# Main CI hydration failure fix

## Goal

Make the failing `main` Playwright shards deterministic without weakening the
inventory decimal assertions or hiding React hydration errors.

## Confirmed causes

1. Date-time text rendered by Node uses Korean day periods (`오전`/`오후`),
   while the CI Chromium build renders the same `Intl.DateTimeFormat` call as
   `AM`/`PM`. React detects different server and client text and rebuilds the
   client subtree. This clears the selected correction target and inventory
   upload file.
2. The ECOUNT conflict fixture calls `dailyLedger.create()` for the same
   `(storeId, closingDate)` that an earlier authentication test may create.
   The unique key collision repeats on every Playwright retry.

## Considered approaches

### 1. Wait for hydration in the tests

This can reduce timing failures, but it leaves the product hydration mismatch
in place and can still lose real user input. Rejected.

### 2. Suppress hydration warnings

This hides the warning while the server and browser continue to display
different text. Rejected.

### 3. Deterministic KST formatting and an idempotent fixture

Use a small shared formatter that derives KST date/time parts without relying
on environment-specific locale day-period output. Use it in the two confirmed
failure paths and the correction panel on the same ledger route. Change the
test ledger fixture to upsert the canonical key and mark it for existing
cleanup. Selected.

## Design

- Add full-year and short-year KST date-time formatting functions to
  `src/lib/format.ts`. They preserve the current Korean display shape while
  producing the same string in Node and Chromium.
- Replace render-time `Intl.DateTimeFormat` calls in:
  - `ledger-save-status.tsx`
  - `ecount-supply-upload-client.tsx`
  - `correction-panel.tsx`
- Keep unrelated date-only and dashboard formats unchanged.
- In `ecount-supply-imports.spec.ts`, upsert the target daily ledger by
  `storeId_closingDate`; both create and update paths set the test marker and
  actor fields so the existing cleanup owns the row.

## Verification

- Unit tests cover morning, afternoon, midnight, full-year, and short-year
  output and must fail before the formatter exists.
- The two originally failing E2E specs run with `CI=true` so retries and CI
  timeouts match GitHub Actions.
- Run unit tests, formatting, lint, typecheck, build, and the affected E2E
  suites before merging.
- Push `main` and monitor the resulting GitHub Actions run until all required
  jobs finish.

## Non-goals

- No inventory quantity policy changes.
- No UI redesign.
- No broad date-format refactor outside the confirmed failure paths.
