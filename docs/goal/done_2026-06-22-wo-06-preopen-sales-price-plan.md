# WO-06 Pre-open Sales Price Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a page where store managers set expected selling prices before opening, then compare them with actual ledger results and connect them to loss handling.

**Architecture:** This is a new operational planning entity, not a replacement for purchases, inventory, or losses. Store planned selling price per store/date/product before business starts, then use it as comparison context in loss and dashboard calculations.

**Tech Stack:** Prisma, Next.js App Router, server actions, existing product options, dashboard signals.

---

## Current Evidence

- There is no planned/desired/expected sale price model or route.
- `hopedSalePriceLossAmount` remains a policy gate.
- Tests currently assert hoped-sale-price implementation should not exist in calculation source.

## Desired Behavior

- Store manager opens a pre-open page for today's business date.
- Store manager enters expected selling price per product.
- After closing ledger input, system can compare planned price with actual sales/inventory/loss context.
- Loss entry can reference planned price when calculating expected loss impact if policy allows.
- Headquarters dashboard can show sales difference caused by planned-vs-actual price once calculation policy is implemented.

## Product Decision Needed Before Coding

Define the actual sales basis:

- Current system stores total daily sales, not product-level actual sale price.
- Without product-level actual sale price, planned-vs-actual by product can only be estimated.

Recommended MVP:

- Store planned selling price per product.
- Use it for loss valuation and dashboard warnings only when there is enough product-level quantity context.
- Show all planned-vs-actual values as `추정` unless real product-level sales are added later.

## Files

- Modify: `prisma/schema.prisma`
- Create migration under: `prisma/migrations/<timestamp>_add_sales_price_plan/`
- Create: `src/features/sales-plan/schemas.ts`
- Create: `src/features/sales-plan/queries.ts`
- Create: `src/features/sales-plan/actions.ts`
- Create: `src/features/sales-plan/components/sales-price-plan-client.tsx`
- Create: `src/app/app/store-entry/sales-plan/page.tsx`
- Modify: `src/components/store-manager-navigation.tsx`
- Modify: `src/features/losses/queries.ts` if planned price is shown in loss context.
- Modify: `src/server/calculations/policy-gates.ts` only after policy is approved.
- Modify: `tests/unit/calculation-policy-gates.test.mjs`
- Add: `tests/unit/sales-price-plan.test.mjs`
- Add: `tests/e2e/store-sales-price-plan.spec.ts`

## Data Model Recommendation

```prisma
model StoreSalesPricePlan {
  id          String   @id @default(cuid())
  storeId     String
  businessDate DateTime
  productId   String
  plannedUnitPrice Int
  memo        String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdById String
  updatedById String

  store     Store   @relation(fields: [storeId], references: [id], onDelete: Restrict)
  product   Product @relation(fields: [productId], references: [id], onDelete: Restrict)
  createdBy User    @relation("StoreSalesPricePlanCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedBy User    @relation("StoreSalesPricePlanUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)

  @@unique([storeId, businessDate, productId])
  @@index([storeId, businessDate])
}
```

## Task Checklist

- [ ] Add model and migration.
- [ ] Add store manager route `/app/store-entry/sales-plan`.
- [ ] Add navigation item, preferably before `장부` or after `장부` with label `판매가 계획`.
- [ ] Build query that loads active products and existing planned prices for store/date.
- [ ] Build save action with store-manager access check.
- [ ] Validate price as non-negative integer KRW.
- [ ] Save one row per product with upsert.
- [ ] Show saved status and updated time.
- [ ] Add optional memo per product or one page-level memo.
- [ ] Integrate planned price into loss page as read-only context if policy owner approves.
- [ ] Keep dashboard planned-vs-actual signal behind a clear calculation policy until actual formula is approved.

## Acceptance Criteria

- Store manager can enter planned selling price before opening.
- Saved planned prices reload by store/date.
- Headquarters cannot accidentally see another unauthorized store's plan.
- Loss page can display planned price context without changing existing loss save behavior.
- Any planned-vs-actual money value is labeled as estimated unless true product sales exist.

## Verification Commands

```powershell
pnpm db:validate
pnpm test:unit:file tests/unit/sales-price-plan.test.mjs tests/unit/calculation-policy-gates.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/store-sales-price-plan.spec.ts tests/e2e/store-ledger-losses.spec.ts
```

