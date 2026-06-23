# WO-07 Headquarters-only Expense System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a headquarters-only expense system that is separate from branch daily ledger expenses and hidden from store managers.

**Architecture:** Current `LedgerExpense` is tied to `DailyLedger` and branch operations. Headquarters expenses should have their own model, route, permissions, and reporting integration so they can feed P&L without appearing in store-entry screens.

**Tech Stack:** Prisma, headquarters App Router pages, server actions, report calculations.

---

## Current Evidence

- Existing expenses live in `LedgerExpense` and require `dailyLedgerId`.
- Store manager route includes cost/expense step.
- Headquarters ledger detail can edit daily ledger expenses, but there is no separate HQ-only expense ledger.

## Desired Behavior

- Headquarters can enter expenses not tied to a branch daily ledger.
- Store managers cannot see these expenses.
- HQ expenses can be filtered by date/month/category.
- HQ expenses can be included in P&L/reporting as a separate line.

## Product Decision Needed Before Coding

Choose scope:

- Global HQ expense only.
- HQ expense optionally linked to a store for attribution but still hidden from store managers.

Recommended MVP:

- Allow optional `storeId`.
- Always require headquarters permission.
- Report both total HQ expense and store-attributed HQ expense separately.

## Files

- Modify: `prisma/schema.prisma`
- Create migration under: `prisma/migrations/<timestamp>_add_headquarters_expenses/`
- Create: `src/features/headquarters-expenses/schemas.ts`
- Create: `src/features/headquarters-expenses/queries.ts`
- Create: `src/features/headquarters-expenses/actions.ts`
- Create: `src/features/headquarters-expenses/components/headquarters-expense-client.tsx`
- Create: `src/app/app/headquarters-expenses/page.tsx`
- Modify: `src/components/app-sidebar.tsx`
- Modify: `src/features/reports/queries.ts`
- Modify: `src/features/reports/types.ts`
- Modify: `src/features/reports/components/monthly-closing-anomaly-report.tsx`
- Add: `tests/unit/headquarters-expenses.test.mjs`
- Add: `tests/e2e/headquarters-expenses.spec.ts`
- Modify: `tests/unit/hq-reports.test.mjs`

## Data Model Recommendation

```prisma
model HeadquartersExpense {
  id          String   @id @default(cuid())
  expenseDate DateTime
  storeId     String?
  category    String
  amount      Int
  memo        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdById String
  updatedById String

  store     Store? @relation(fields: [storeId], references: [id], onDelete: SetNull)
  createdBy User   @relation("HeadquartersExpenseCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedBy User   @relation("HeadquartersExpenseUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)

  @@index([expenseDate])
  @@index([storeId, expenseDate])
}
```

## Validation Rules

- `expenseDate`: valid business date.
- `category`: required, trimmed, max 80 characters.
- `amount`: integer KRW, 0 to 2,147,483,647.
- `memo`: optional, max 500 characters.
- `storeId`: optional; if present, must be within headquarters user's store scope.

## Task Checklist

- [ ] Add model and migration.
- [ ] Add headquarters-only query and action with permission checks.
- [ ] Add sidebar item visible only to users with management/report permission.
- [ ] Build list/create/edit/deactivate or delete behavior. Recommended: no hard delete; use correction/edit audit unless product asks for delete.
- [ ] Write audit logs for create/update.
- [ ] Add monthly report integration as `본사 지출`.
- [ ] Ensure store-manager routes and responses do not include HQ expenses.
- [ ] Add E2E for access denial from store-manager session.

## Acceptance Criteria

- Headquarters can create and edit HQ expenses.
- Store manager cannot access the page or server action.
- Monthly report includes HQ expense total as a separate value.
- Branch ledger expense totals remain unchanged.
- Audit history records HQ expense changes.

## Verification Commands

```powershell
pnpm db:validate
pnpm test:unit:file tests/unit/headquarters-expenses.test.mjs tests/unit/hq-reports.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/headquarters-expenses.spec.ts tests/e2e/permission-profiles.spec.ts
```

