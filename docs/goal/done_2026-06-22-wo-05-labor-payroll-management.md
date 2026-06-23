# WO-05 Labor Payroll Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a labor/payroll entry system for worker name, amount, late/early-leave/special situation notes, and summary totals.

**Architecture:** Do not overload `DailyLedger.workerCount` and `workMemo` beyond their current simple role. Add line-level labor records tied to a daily ledger first, then decide in UI whether both store manager and headquarters can edit them.

**Tech Stack:** Prisma model/migration, server actions, existing work step page, Playwright E2E.

---

## Current Evidence

- `DailyLedger` only has `workerCount` and `workMemo`.
- Work step UI only captures worker count and special memo.
- There is no worker name/amount/late/early-leave model.

## Product Decision Needed Before Coding

The meeting note says `(지점장?본사?)`. Choose one of these before implementation:

- Recommended MVP: store manager enters labor rows; headquarters can edit before close and correct after close.
- Conservative MVP: headquarters only enters payroll; store manager only sees worker count.

This work order assumes the recommended MVP unless the product owner chooses otherwise.

## Files

- Modify: `prisma/schema.prisma`
- Create migration under: `prisma/migrations/<timestamp>_add_ledger_labor_payroll/`
- Modify: `src/features/ledger/schemas.ts`
- Modify: `src/features/ledger/types.ts`
- Modify: `src/features/ledger/queries.ts`
- Modify: `src/features/ledger/actions.ts`
- Modify: `src/features/ledger/hq-edit-actions.ts`
- Modify: `src/features/ledger/components/workstep-client.tsx`
- Modify: `src/features/ledger/review-queries.ts`
- Modify: `tests/unit/ledger-cost-labor.test.mjs`
- Modify: `tests/e2e/store-ledger-cost-labor.spec.ts`
- Modify: `tests/e2e/hq-ledger-edit.spec.ts`

## Data Model Recommendation

Add:

```prisma
model LedgerLaborItem {
  id            String      @id @default(cuid())
  dailyLedgerId String
  workerName    String
  amount        Int
  lateMemo      String?
  earlyLeaveMemo String?
  specialMemo   String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  createdById   String
  updatedById   String

  dailyLedger DailyLedger @relation(fields: [dailyLedgerId], references: [id], onDelete: Restrict)
  createdBy   User        @relation("LedgerLaborItemCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedBy   User        @relation("LedgerLaborItemUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)

  @@index([dailyLedgerId])
}
```

Also add relation arrays to `DailyLedger` and `User`.

## Validation Rules

- `workerName`: required, trimmed, 1 to 50 characters.
- `amount`: integer KRW, 0 to 2,147,483,647.
- `lateMemo`, `earlyLeaveMemo`, `specialMemo`: optional, trimmed, max 500 characters.
- Empty memo becomes `null`.
- At least one labor row is optional; existing `workerCount` remains the minimum submit requirement unless product changes it.

## Task Checklist

- [x] Add Prisma model and migration. (`LedgerLaborItem`, migration `20260622090000_add_ledger_labor_payroll`)
- [x] Add schema parser for labor rows. (`ledgerLaborSchema` in `schemas.ts`)
- [x] Extend ledger query payload to include labor rows and payroll total. (`ledgerLaborSelect`, `laborItems`, `payrollTotal` in `queries.ts`)
- [x] Add store-manager save action for labor rows. (`saveLedgerLaborInfo`)
- [x] Add headquarters save action for labor rows. (`saveHqLedgerLaborInfo`)
- [x] Update `WorkStepClient` to render editable labor rows below worker count.
- [x] Show payroll total in work step. (입력 중 급여 합계 + 마지막 서버 저장 합계)
- [x] Add audit logs for labor save. (`ledger.labor.saved`, `ledger.hq.labor.saved`)
- [x] Add review summary metric for labor row count and payroll total. (work step: `laborCount`, `payrollTotal`)
- [x] Store-manager sensitive response policy respected; payroll amount is operational data the store manager enters, so it is visible to both store manager and HQ (consistent with expense amounts), while gross profit / productivity / FIFO cost remain HQ-only.

## Acceptance Criteria

- User can add multiple labor rows with name and amount.
- User can record late, early leave, and special notes per person.
- Saved labor rows reload on page revisit.
- Payroll total is calculated server-side.
- Audit history records before/after labor changes.
- Closed ledger original rows cannot be edited; correction flow decision is documented or implemented.

## Verification Commands

```powershell
pnpm db:validate
pnpm test:unit:file tests/unit/ledger-cost-labor.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-cost-labor.spec.ts tests/e2e/hq-ledger-edit.spec.ts
```

## Verification Results (2026-06-22)

- `pnpm db:validate` → schema valid. ✅
- `pnpm test:unit:file tests/unit/ledger-cost-labor.test.mjs` → 12/12 pass (incl. new labor schema, model-contract, and migration tests). ✅
- `pnpm typecheck` → clean. ✅
- `pnpm lint` → clean. ✅
- Playwright e2e (`store-ledger-cost-labor.spec.ts`, `hq-ledger-edit.spec.ts`) → **NOT confirmed green in this environment.** The local Postgres runs under Docker Desktop, whose Linux engine was returning HTTP 500 (`unable to get image 'postgres:16-alpine'`) and dropping connections mid-run. All e2e failures observed were `PrismaClientInitializationError` / `P1001: Can't reach database server at localhost:5432` — infrastructure, not assertion failures. New labor e2e cases were added to both specs (store-manager save/reload + empty-name validation; HQ labor save + audit log). Re-run once Docker Desktop is restarted:
  `docker compose up -d; node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-cost-labor.spec.ts tests/e2e/hq-ledger-edit.spec.ts`

