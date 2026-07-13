# Main CI Hydration Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove locale-dependent hydration rebuilds and the ECOUNT test ledger key collision that make the `main` Playwright shards fail.

**Architecture:** A shared formatter will derive Seoul date/time parts with UTC getters after applying the fixed KST offset, so Node and Chromium render identical Korean text. Only the three client render paths implicated by the failed route are migrated. The ECOUNT fixture will claim the existing canonical daily-ledger key with an upsert and mark it for the existing cleanup.

**Tech Stack:** TypeScript, React 19, Next.js 15, Node test runner, Playwright, Prisma, PostgreSQL

---

### Task 1: Deterministic KST date-time formatting

**Files:**

- Create: `tests/unit/date-time-format.test.mjs`
- Modify: `src/lib/format.ts`
- Modify: `src/features/ledger/components/ledger-save-status.tsx`
- Modify: `src/features/ledger/components/ecount-supply-upload-client.tsx`
- Modify: `src/features/corrections/components/correction-panel.tsx`

- [ ] **Step 1: Write the failing formatter test**

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  formatKstDateTime,
  formatShortKstDateTime,
} from "../../src/lib/format.ts";

test("KST date-time formatting is deterministic across day periods", () => {
  assert.equal(
    formatKstDateTime("2026-07-12T15:05:00.000Z"),
    "2026. 7. 13. 오전 12:05",
  );
  assert.equal(
    formatKstDateTime("2026-07-13T00:07:00.000Z"),
    "2026. 7. 13. 오전 9:07",
  );
  assert.equal(
    formatKstDateTime("2026-07-13T03:35:00.000Z"),
    "2026. 7. 13. 오후 12:35",
  );
  assert.equal(
    formatShortKstDateTime("2026-07-13T03:35:00.000Z"),
    "26. 7. 13. 오후 12:35",
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
pnpm test:unit:file tests/unit/date-time-format.test.mjs
```

Expected: FAIL because `formatKstDateTime` and `formatShortKstDateTime` are not exported.

- [ ] **Step 3: Implement the smallest deterministic formatter**

Add to `src/lib/format.ts`:

```ts
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function getKstDateTimeParts(value: string | Date) {
  const input =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(input.getTime())) {
    throw new RangeError("Invalid time value");
  }

  const kst = new Date(input.getTime() + KST_OFFSET_MS);
  const hours = kst.getUTCHours();

  return {
    year: String(kst.getUTCFullYear()),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    dayPeriod: hours < 12 ? "오전" : "오후",
    hour: hours % 12 || 12,
    minute: String(kst.getUTCMinutes()).padStart(2, "0"),
  };
}

function formatKstDateTimeWithYear(
  value: string | Date,
  yearStyle: "numeric" | "2-digit",
) {
  const parts = getKstDateTimeParts(value);
  const year = yearStyle === "2-digit" ? parts.year.slice(-2) : parts.year;

  return `${year}. ${parts.month}. ${parts.day}. ${parts.dayPeriod} ${parts.hour}:${parts.minute}`;
}

export function formatKstDateTime(value: string | Date) {
  return formatKstDateTimeWithYear(value, "numeric");
}

export function formatShortKstDateTime(value: string | Date) {
  return formatKstDateTimeWithYear(value, "2-digit");
}
```

- [ ] **Step 4: Run the formatter test and verify GREEN**

Run:

```powershell
pnpm test:unit:file tests/unit/date-time-format.test.mjs
```

Expected: 1 test passes, 0 fail.

- [ ] **Step 5: Replace the three locale-dependent render functions**

In `ledger-save-status.tsx`, delete `formatSavedAt`, import the shared helper,
and render it directly:

```tsx
import { formatKstDateTime } from "~/lib/format";

마지막 저장: {formatKstDateTime(lastSavedAt)}
```

In `ecount-supply-upload-client.tsx`, delete `formatDateTime`, add the helper to
the existing `~/lib/format` import, and update the table cell:

```tsx
import { formatQuantityValue, formatShortKstDateTime } from "~/lib/format";

<TableCell>{formatShortKstDateTime(batch.createdAt)}</TableCell>;
```

In `correction-panel.tsx`, delete `formatCreatedAt`, import the short-year
helper, and update the record cell:

```tsx
import { formatShortKstDateTime } from "~/lib/format";

<TableCell>{formatShortKstDateTime(record.createdAt)}</TableCell>;
```

- [ ] **Step 6: Verify the unit suite and static checks**

Run:

```powershell
pnpm test:unit
pnpm check
```

Expected: all unit tests pass with the existing single skip; lint and typecheck exit 0.

- [ ] **Step 7: Commit Task 1**

```powershell
git add -- tests/unit/date-time-format.test.mjs src/lib/format.ts src/features/ledger/components/ledger-save-status.tsx src/features/ledger/components/ecount-supply-upload-client.tsx src/features/corrections/components/correction-panel.tsx
git commit -m "fix: stabilize hydrated KST timestamps"
```

### Task 2: Idempotent ECOUNT conflict fixture

**Files:**

- Modify: `tests/e2e/ecount-supply-imports.spec.ts`

- [ ] **Step 1: Reproduce the existing ledger collision**

Run:

```powershell
$env:CI='true'
pnpm test:playwright -- tests/e2e/auth.spec.ts tests/e2e/ecount-supply-imports.spec.ts --grep "390px 모바일 지점장 화면|작성된 대상일 장부"
$exitCode=$LASTEXITCODE
Remove-Item Env:CI
exit $exitCode
```

Expected before the fixture change: the ECOUNT test fails at
`seedTargetInventoryLedger()` with the `storeId_closingDate` unique constraint.

- [ ] **Step 2: Make the fixture own the canonical ledger key**

Replace `prisma.dailyLedger.create()` in `seedTargetInventoryLedger()` with:

```ts
const ledger = await prisma.dailyLedger.upsert({
  where: {
    storeId_closingDate: {
      storeId: input.storeId,
      closingDate,
    },
  },
  create: {
    storeId: input.storeId,
    closingDate,
    workMemo: `${CONFLICT_INVENTORY_LEDGER_MARKER} ${input.product.id}`,
    createdById: actor.id,
    updatedById: actor.id,
  },
  update: {
    workMemo: `${CONFLICT_INVENTORY_LEDGER_MARKER} ${input.product.id}`,
    createdById: actor.id,
    updatedById: actor.id,
  },
});
```

- [ ] **Step 3: Run the collision sequence and verify GREEN**

Run:

```powershell
$env:CI='true'
pnpm test:playwright -- tests/e2e/auth.spec.ts tests/e2e/ecount-supply-imports.spec.ts --grep "390px 모바일 지점장 화면|작성된 대상일 장부"
$exitCode=$LASTEXITCODE
Remove-Item Env:CI
exit $exitCode
```

Expected: both selected tests pass after any allowed retry, with no unique-key failure.

- [ ] **Step 4: Run the complete affected E2E specs in CI mode**

Run:

```powershell
$env:CI='true'
pnpm test:playwright -- tests/e2e/ecount-supply-imports.spec.ts tests/e2e/hq-ledger-corrections.spec.ts --reporter=line
$exitCode=$LASTEXITCODE
Remove-Item Env:CI
exit $exitCode
```

Expected: both spec files pass, including inventory upload and decimal correction assertions.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- tests/e2e/ecount-supply-imports.spec.ts
git commit -m "test: isolate inventory upload ledger fixture"
```

### Task 3: Release verification and main integration

**Files:**

- Verify all files changed in Tasks 1 and 2
- No new production files

- [ ] **Step 1: Run formatting and repository integrity checks**

Run:

```powershell
pnpm format:check
pnpm format:check:ci-docs
pnpm db:validate
git diff --check main...HEAD
```

Expected: every command exits 0.

- [ ] **Step 2: Run full code verification**

Run:

```powershell
pnpm test:unit
pnpm check
pnpm build
```

Expected: unit tests have 0 failures; lint, typecheck, and production build exit 0.

- [ ] **Step 3: Review the final diff**

Run:

```powershell
git diff --stat main...HEAD
git diff main...HEAD -- src/lib/format.ts src/features/ledger/components/ledger-save-status.tsx src/features/ledger/components/ecount-supply-upload-client.tsx src/features/corrections/components/correction-panel.tsx tests/unit/date-time-format.test.mjs tests/e2e/ecount-supply-imports.spec.ts
```

Expected: only the approved formatter, three callers, regression test, and fixture changes are present alongside the approved design and plan docs.

- [ ] **Step 4: Merge and push**

From the clean `main` worktree:

```powershell
git pull --ff-only origin main
git merge --ff-only codex/fix-main-ci-hydration
git push origin main
```

Expected: `origin/main` advances to the fix branch tip.

- [ ] **Step 5: Monitor GitHub Actions**

Run:

```powershell
gh run list --branch main --workflow CI --limit 1
gh run watch <new-run-id> --exit-status
```

Expected: the new `main` CI run completes successfully.
