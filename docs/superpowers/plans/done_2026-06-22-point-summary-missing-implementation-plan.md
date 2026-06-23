# 2026-06-22 Point Summary Missing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compare `docs/meeting/point_summary.md` and `docs/meeting/change.md` against the current code and the 2026-06-22 work orders, then finish the missing product work without reopening already completed slices.

**Architecture:** Keep the existing Next.js App Router shape: pages under `src/app`, feature logic under `src/features`, shared calculations under `src/server/calculations`, Prisma models and migrations under `prisma`, and tests under `tests/unit`, `tests/e2e`, or `tests/api`. Treat store-manager screens as low-information operational screens and headquarters screens as the only place for broad financial, FIFO, and cross-store data.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma, PostgreSQL-compatible Prisma models, Playwright E2E, Node test runner unit tests, Recharts for report charts.

---

## Source Documents Compared

- Meeting summary: `docs/meeting/point_summary.md`
- Earlier requirement summary: `docs/meeting/change.md`
- Work order index: `docs/goal/2026-06-22-meeting-follow-up-agent-index.md`
- Work orders checked:
  - `docs/goal/2026-06-22-wo-01-store-manager-review-summary.md`
  - `docs/goal/2026-06-22-wo-03-fifo-inventory-valuation-history.md`
  - `docs/goal/done_2026-06-22-wo-04-dashboard-margin-signal-display.md`
  - `docs/goal/done_2026-06-22-wo-05-labor-payroll-management.md`
  - `docs/goal/2026-06-22-wo-06-preopen-sales-price-plan.md`
  - `docs/goal/2026-06-22-wo-07-headquarters-expense-system.md`
  - `docs/goal/2026-06-22-wo-08-data-visibility-and-reports.md`
  - `docs/goal/2026-06-22-wo-09-terms-comments-and-code-aliases.md`
- Missing document found during review:
  - `docs/goal/2026-06-22-wo-02-ecount-ledger-purchase-import.md`

## Current Status Matrix

| Area | Current status | Evidence | Remaining work |
| --- | --- | --- | --- |
| Dashboard margin display | Mostly implemented | `src/features/dashboard/types.ts`, `src/features/dashboard/queries.ts`, `src/features/dashboard/components/hq-dashboard-table.tsx`, `tests/unit/hq-dashboard.test.mjs` | Keep as verified dependency; no new feature task unless regression appears. |
| Dashboard resizing | Partial | `src/features/dashboard/components/hq-dashboard-table.tsx` supports column resizing | Meeting asks all dashboard components to resize; current code only resizes table columns. |
| Store-manager review summary | Missing from desired behavior | `src/features/ledger/review-types.ts`, `src/features/ledger/response-shaping.ts` still include `paymentDifference` and omit top-level `workerCount` | Complete WO-01. |
| Store-manager date visibility | Partial | `src/app/app/store-entry/page.tsx` accepts a query date | Restrict store-manager operational entry to today unless HQ enters historical views. |
| ECount ledger purchase import | Missing | Parser exists in `src/features/ledger/ecount-purchase-import.ts`; live upload writes purchase standards in `src/features/master-data/purchase-standard-import-actions.ts`; no ledger uploader | Create WO-02 document and implement ledger upload preview/commit. |
| FIFO inventory valuation | Partial | FIFO model/calculation exists in `prisma/schema.prisma` and `src/features/inventory/fifo-lots.ts`; dialog exists through inventory UI | Add HQ-grade history view with one-month filter and legacy-origin warning. |
| Pre-open sales price plan | Mostly implemented | `src/features/sales-plan/*`, `src/app/app/store-entry/sales-plan/page.tsx`, `tests/unit/sales-price-plan.test.mjs`, `tests/e2e/store-sales-price-plan.spec.ts` | Keep loss context read-only; planned-vs-actual dashboard math remains gated until product-level sales exists. |
| Labor/payroll entry | Mostly implemented | `LedgerLaborItem`, `src/features/ledger/components/workstep-client.tsx`, `tests/unit/ledger-cost-labor.test.mjs` | Add employee master/입사일 and monthly cross-store payroll rollup if meeting requirement is interpreted beyond ledger-level rows. |
| HQ-only expenses | Missing | No `HeadquartersExpense` model or route | Complete WO-07. |
| All-store inventory report | Missing | No `src/app/app/reports/inventory/page.tsx` or inventory-position query | Complete WO-08 inventory position slice. |
| Frozen/live product charts | Missing | Recharts exists, product categories exist, no frozen/live sales and margin chart | Add report chart slice after report query contract is stable. |
| LINE 8am notification | Missing by policy/history | No notification provider, scheduled route, delivery log, or LINE client | Add explicit notification feature only after recipient/channel/env decisions are written. |
| Terms and aliases | Partial | `src/features/inventory/terms.ts`, loss alias editor and loss aliases exist | Generalize aliases to expense items and centralize ledger/loss wording. |

## Execution Order

1. Fix store-manager leakage and today-only access first, because it protects data before new screens are added.
2. Create the missing WO-02 document, then implement ECount ledger purchase import because FIFO and inventory reports depend on correct purchase rows.
3. Finish FIFO/HQ inventory visibility and all-store inventory reporting.
4. Add HQ-only expenses and monthly P&L inputs.
5. Add frozen/live charts after report data shape is settled.
6. Finish terms/aliases after new labels are known.
7. Add LINE notifications last, because it depends on stable report and alert data.

## Task 1: Store-Manager Review Summary and Anti-Fraud Screen Contract

**Files:**
- Modify: `src/features/ledger/review-types.ts`
- Modify: `src/features/ledger/response-shaping.ts`
- Inspect/modify: `src/features/ledger/components/review-summary-client.tsx`
- Modify: `tests/unit/ledger-review.test.mjs`
- Modify: `tests/unit/sensitive-response-shaping.test.mjs`
- Modify: `tests/e2e/store-ledger-review.spec.ts`

- [ ] **Step 1: Update the store-manager summary type**

Change `StoreManagerLedgerReviewSummary` so it includes exactly these summary keys:

```ts
export type StoreManagerLedgerReviewSummary = Pick<
  LedgerReviewSummary,
  "totalSales" | "grossMarginRate" | "workerCount" | "inventoryAmount"
>;
```

- [ ] **Step 2: Update response shaping**

In `toStoreManagerLedgerReviewStepData()`, return this summary shape:

```ts
summary: {
  totalSales: data.summary.totalSales,
  grossMarginRate: data.summary.grossMarginRate,
  workerCount: data.summary.workerCount,
  inventoryAmount: data.summary.inventoryAmount,
},
```

Also remove `paymentDifference` from the store-manager allowed metric IDs in `response-shaping.ts`.

- [ ] **Step 3: Update tests**

Add assertions:

```js
assert.equal(Object.hasOwn(safeReview.summary, "totalSales"), true);
assert.equal(Object.hasOwn(safeReview.summary, "grossMarginRate"), true);
assert.equal(Object.hasOwn(safeReview.summary, "workerCount"), true);
assert.equal(Object.hasOwn(safeReview.summary, "inventoryAmount"), true);
assert.equal(Object.hasOwn(safeReview.summary, "paymentDifference"), false);
assert.equal(Object.hasOwn(safeReview.summary, "salesDifference"), false);
```

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm test:unit:file tests/unit/ledger-review.test.mjs tests/unit/sensitive-response-shaping.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-review.spec.ts
```

Expected: unit and E2E tests pass, and the store-manager review screen does not show payment/sales difference money.

## Task 2: Store-Manager Today-Only Operational Access

**Files:**
- Modify: `src/features/ledger/date.ts`
- Modify: `src/app/app/store-entry/page.tsx`
- Modify: `src/app/app/store-entry/inventory/page.tsx`
- Modify: `src/app/app/store-entry/losses/page.tsx`
- Modify: `src/app/app/store-entry/sales-plan/page.tsx`
- Add/modify: `tests/unit/auth-guard.test.mjs`
- Add/modify: `tests/e2e/auth.spec.ts`

- [ ] **Step 1: Add a store-manager date guard**

Create a helper in `src/features/ledger/date.ts`:

```ts
export function isTodayKstDateParam(dateParam: string, today = getTodayKstInput()) {
  return dateParam === today;
}
```

- [ ] **Step 2: Enforce the guard in store-manager pages**

Before loading data in each store-manager route, reject non-today dates:

```ts
if (!isTodayKstDateParam(closingDate)) {
  redirect("/app/unauthorized");
}
```

- [ ] **Step 3: Preserve HQ historical access**

Do not apply this guard to:

```text
src/app/app/ledgers/[ledgerId]/page.tsx
src/app/app/dashboard/page.tsx
src/app/app/reports/*
```

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm test:unit:file tests/unit/auth-guard.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/auth.spec.ts tests/e2e/store-ledger-sales.spec.ts
```

Expected: store manager cannot open yesterday/tomorrow operational entry by query string; HQ report and ledger detail history still work.

## Task 3: Missing WO-02 Document and ECount Ledger Purchase Import

**Files:**
- Create: `docs/goal/2026-06-22-wo-02-ecount-ledger-purchase-import.md`
- Create: `src/features/ledger/ecount-purchase-actions.ts`
- Create: `src/features/ledger/components/ecount-purchase-upload-client.tsx`
- Modify: `src/app/app/ledgers/[ledgerId]/page.tsx`
- Modify: `src/features/ledger/hq-edit-actions.ts`
- Modify: `src/features/ledger/purchase-edit-policy.ts`
- Modify: `tests/unit/ecount-purchase-import.test.mjs`
- Modify: `tests/unit/ledger-purchase.test.mjs`
- Add: `tests/e2e/hq-ecount-ledger-purchase-import.spec.ts`

- [ ] **Step 1: Write the missing work order**

Create `docs/goal/2026-06-22-wo-02-ecount-ledger-purchase-import.md` with this goal:

```markdown
# WO-02 ECount Ledger Purchase Import Implementation Plan

**Goal:** Let headquarters upload an ECount xlsx file into a selected daily ledger and create locked `LedgerPurchaseItem` rows with `sourceType = ECOUNT_UPLOAD`.
```

- [ ] **Step 2: Add HQ preview action**

Use `parseEcountPurchaseWorkbook()` from `src/features/ledger/ecount-purchase-import.ts` and return preview rows without writing:

```ts
export async function previewEcountLedgerPurchases(ledgerId: string, formData: FormData) {
  // require HQ ledger edit access
  // load ledger store/date
  // parse workbook with store/date validation
  // return parsed purchase rows
}
```

- [ ] **Step 3: Add HQ commit action**

Create rows in `LedgerPurchaseItem` with:

```ts
sourceType: "ECOUNT_UPLOAD",
productId: previewLine.productId,
purchaseStandardId: previewLine.purchaseStandardId,
productName: previewLine.productName,
productCategory: previewLine.productCategory,
productSpec: previewLine.productSpec,
unitPrice: parsedUnitPrice,
quantity: parsedQuantity,
amount: parsedUnitPrice * parsedQuantity,
referenceInfo: previewLine.referenceInfo,
```

After saving, refresh FIFO lots by calling the existing inventory refresh path used after purchase changes.

- [ ] **Step 4: Fix HQ override policy**

Keep store-manager edit blocking for `ECOUNT_UPLOAD` rows. Allow HQ edit actions to change unit price or quantity when HQ provides an edit reason, because the meeting requires headquarters manual overwrite.

- [ ] **Step 5: Verify**

Run:

```powershell
pnpm test:unit:file tests/unit/ecount-purchase-import.test.mjs tests/unit/ledger-purchase.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/hq-ecount-ledger-purchase-import.spec.ts tests/e2e/store-ledger-purchase.spec.ts
```

Expected: HQ can import ECount rows into a ledger; store managers can view but cannot edit/delete uploaded rows.

## Task 4: HQ FIFO Valuation History Completion

**Files:**
- Create: `src/features/inventory/fifo-history-queries.ts`
- Create: `src/features/inventory/components/fifo-history-dialog.tsx`
- Modify: `src/app/app/ledgers/[ledgerId]/page.tsx`
- Modify: `src/features/inventory/components/inventory-step-client.tsx`
- Modify: `tests/unit/ledger-inventory.test.mjs`
- Modify: `tests/e2e/hq-ledger-edit.spec.ts`

- [ ] **Step 1: Add HQ query**

Return a product-level FIFO history shape:

```ts
export type InventoryFifoHistoryRow = {
  productId: string;
  productName: string;
  sourceLabel: "기초 재고" | "전일 이월" | "오늘 매입" | "출처 불명 기초 재고";
  sourceDateLabel: string;
  unitPrice: number;
  originalQuantity: number;
  consumedQuantity: number;
  remainingQuantity: number;
  originalAmount: number;
  consumedAmount: number;
  remainingAmount: number;
  isLegacyOpening: boolean;
};
```

- [ ] **Step 2: Add one-month filter**

Default the dialog to the ledger month:

```ts
const defaultFrom = startOfKstMonth(ledger.closingDate);
const defaultTo = ledger.closingDate;
```

- [ ] **Step 3: Add legacy warning**

When any row has `isLegacyOpening === true`, show:

```text
출처 불명 기초 재고가 포함되어 있습니다. 이 수량은 과거 매입일을 정확히 알 수 없어 참고용 근거로 표시됩니다.
```

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm test:unit:file tests/unit/ledger-inventory.test.mjs tests/unit/sensitive-response-shaping.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/hq-ledger-edit.spec.ts tests/e2e/store-ledger-inventory.spec.ts
```

Expected: HQ can inspect FIFO money basis; store-manager routes do not expose unit price unless already approved by the current inventory policy.

## Task 5: HQ-Only Expense System

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260622110000_add_headquarters_expenses/migration.sql`
- Create: `src/features/headquarters-expenses/schemas.ts`
- Create: `src/features/headquarters-expenses/queries.ts`
- Create: `src/features/headquarters-expenses/actions.ts`
- Create: `src/features/headquarters-expenses/components/headquarters-expense-client.tsx`
- Create: `src/app/app/headquarters-expenses/page.tsx`
- Modify: `src/components/app-sidebar.tsx`
- Modify: `src/features/reports/queries.ts`
- Modify: `src/features/reports/types.ts`
- Modify: `tests/unit/hq-reports.test.mjs`
- Add: `tests/unit/headquarters-expenses.test.mjs`
- Add: `tests/e2e/headquarters-expenses.spec.ts`

- [ ] **Step 1: Add model**

Add:

```prisma
model HeadquartersExpense {
  id            String   @id @default(cuid())
  expenseDate   DateTime
  storeId       String?
  category      String
  amount        Int
  memo          String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  createdById   String
  updatedById   String

  store     Store? @relation(fields: [storeId], references: [id], onDelete: SetNull)
  createdBy User   @relation("HeadquartersExpenseCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  updatedBy User   @relation("HeadquartersExpenseUpdatedBy", fields: [updatedById], references: [id], onDelete: Restrict)

  @@index([expenseDate])
  @@index([storeId, expenseDate])
}
```

- [ ] **Step 2: Add HQ-only route and action**

Use the existing HQ authorization helper before reading or writing. Store-manager access must redirect or return an authorization error before field validation.

- [ ] **Step 3: Add monthly report integration**

Add a separate monthly value:

```ts
headquartersExpenseTotal: number;
storeAttributedHeadquartersExpenseTotal: number;
```

Do not merge these into `LedgerExpense` totals.

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm db:validate
pnpm test:unit:file tests/unit/headquarters-expenses.test.mjs tests/unit/hq-reports.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/headquarters-expenses.spec.ts tests/e2e/permission-profiles.spec.ts
```

Expected: HQ can create/edit HQ expenses; store managers cannot access route or action; monthly report shows HQ expenses as a separate line.

## Task 6: All-Store Inventory Position Report

**Files:**
- Create: `src/features/reports/inventory-position-types.ts`
- Create: `src/features/reports/inventory-position-queries.ts`
- Create: `src/features/reports/components/inventory-position-report-table.tsx`
- Create: `src/app/app/reports/inventory/page.tsx`
- Modify: `src/features/reports/export.ts`
- Modify: `src/app/api/reports/export/route.ts`
- Modify: `src/components/app-sidebar.tsx`
- Add: `tests/unit/hq-inventory-position-report.test.mjs`
- Modify: `tests/api/report-export.spec.ts`
- Modify: `tests/e2e/hq-reports.spec.ts`

- [ ] **Step 1: Add row contract**

Use:

```ts
export type InventoryPositionRow = {
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
  productCategory: string;
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

- [ ] **Step 2: Query authorized stores only**

Use the existing headquarters store-scope helper and do not create missing ledgers. Missing rows must show `미입력`, not zero.

- [ ] **Step 3: Add CSV export**

Add report key:

```ts
type ReportExportKind = "daily" | "comparison" | "monthly" | "inventory-position";
```

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm test:unit:file tests/unit/hq-inventory-position-report.test.mjs tests/unit/hq-reports.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/hq-reports.spec.ts
node scripts/run-playwright-clean.mjs tests/api/report-export.spec.ts
```

Expected: HQ can view and export all authorized stores' inventory by product; unauthorized stores never appear.

## Task 7: Frozen vs Live Product Sales and Margin Charts

**Files:**
- Modify: `src/features/reports/types.ts`
- Modify: `src/features/reports/queries.ts`
- Create: `src/features/reports/components/product-category-margin-chart.tsx`
- Modify: `src/app/app/reports/daily/page.tsx`
- Modify: `src/app/app/reports/monthly/page.tsx`
- Modify: `tests/unit/hq-reports.test.mjs`
- Modify: `tests/e2e/hq-reports.spec.ts`

- [ ] **Step 1: Add category summary type**

Use:

```ts
export type ProductCategoryPerformance = {
  category: "냉동" | "생물" | "기타";
  salesAmount: number;
  grossMarginRate: number | null;
  statusLabel: "확정" | "추정" | "계산 불가";
};
```

- [ ] **Step 2: Keep estimated labels**

Because current product-level sales are estimated from inventory/purchase/loss context, any category sales amount that is not based on real product-level sales must show `추정`.

- [ ] **Step 3: Render chart with Recharts**

Use `ChartContainer` from `src/components/ui/chart.tsx` and render a compact bar chart with two groups: `냉동`, `생물`.

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm test:unit:file tests/unit/hq-reports.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/hq-reports.spec.ts
```

Expected: daily/monthly report shows frozen/live group sales and margin chart, with estimated labels where data is not exact.

## Task 8: Labor Payroll Master Data and Cross-Store Monthly Rollup

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260622111000_add_employee_payroll_rollup/migration.sql`
- Create: `src/features/labor/employees-schemas.ts`
- Create: `src/features/labor/employees-queries.ts`
- Create: `src/features/labor/employees-actions.ts`
- Create: `src/features/labor/components/employee-management-client.tsx`
- Create: `src/app/app/labor/employees/page.tsx`
- Modify: `src/features/ledger/schemas.ts`
- Modify: `src/features/ledger/components/workstep-client.tsx`
- Modify: `tests/unit/ledger-cost-labor.test.mjs`
- Add: `tests/unit/labor-employees.test.mjs`
- Add: `tests/e2e/labor-employees.spec.ts`

- [ ] **Step 1: Add employee master**

Add:

```prisma
model Employee {
  id        String   @id @default(cuid())
  name      String
  hireDate  DateTime
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([isActive])
}
```

- [ ] **Step 2: Link ledger labor rows optionally**

Add `employeeId String?` to `LedgerLaborItem` so existing free-text rows still work, but HQ can consolidate payroll by employee.

- [ ] **Step 3: Add monthly rollup query**

Return:

```ts
export type EmployeeMonthlyPayrollRow = {
  employeeId: string;
  employeeName: string;
  hireDate: string;
  month: string;
  workedStoreCount: number;
  workedDayCount: number;
  payrollTotal: number;
  memoCount: number;
};
```

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm db:validate
pnpm test:unit:file tests/unit/labor-employees.test.mjs tests/unit/ledger-cost-labor.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/labor-employees.spec.ts tests/e2e/store-ledger-cost-labor.spec.ts
```

Expected: HQ can manage employees with hire dates and see monthly cross-store payroll totals; existing ledger labor rows still save.

## Task 9: Terms, Expense Aliases, and Simpler Validation Text

**Files:**
- Create: `src/features/ledger/terms.ts`
- Create: `src/features/losses/terms.ts`
- Create: `src/features/master-data/code-alias-terms.ts`
- Create: `src/features/master-data/components/input-code-alias-editor.tsx`
- Modify: `src/features/master-data/components/loss-type-alias-editor.tsx`
- Modify: `src/features/master-data/code-queries.ts`
- Modify: `src/features/ledger/actions.ts`
- Modify: `src/features/ledger/hq-edit-actions.ts`
- Modify: `src/features/losses/quantity-error.ts`
- Modify: `tests/unit/code-store-alias.test.mjs`
- Modify: `tests/unit/ledger-losses.test.mjs`
- Modify: `tests/e2e/store-ledger-cost-labor.spec.ts`
- Modify: `tests/e2e/store-ledger-losses.spec.ts`

- [ ] **Step 1: Add terms modules**

Use simple constants:

```ts
export const ledgerTerms = {
  expenseItem: "비용 항목",
  workerCount: "근무인원",
  payrollAmount: "급여 금액",
  reviewSummary: "검토 요약",
} as const;
```

- [ ] **Step 2: Generalize alias editor**

Create `InputCodeAliasEditor` that accepts:

```ts
type InputCodeAliasEditorProps = {
  group: "LOSS_TYPE" | "EXPENSE_ITEM";
  title: string;
  codes: Array<{ id: string; name: string; displayName: string }>;
};
```

- [ ] **Step 3: Apply aliases to expense item options**

Update the code option query so store-scoped `EXPENSE_ITEM` aliases override display names for store-manager expense entry only. HQ code management must still show canonical names.

- [ ] **Step 4: Simplify loss quantity error**

Change the current long message to:

```text
{품목명} 손실 수량이 재고보다 많습니다. 입력 수량 {입력수량}개, 손실 가능 수량 {가능수량}개입니다. 전일재고 {전일재고}개 + 오늘매입 {오늘매입}개를 확인해 주세요.
```

- [ ] **Step 5: Verify**

Run:

```powershell
pnpm test:unit:file tests/unit/code-store-alias.test.mjs tests/unit/ledger-losses.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-cost-labor.spec.ts tests/e2e/store-ledger-losses.spec.ts
```

Expected: loss and expense aliases apply per store; canonical HQ code names remain unchanged; validation wording is short and concrete.

## Task 10: LINE 8am Executive Summary Notification

**Files:**
- Modify: `.env.example`
- Create: `src/features/notifications/line-client.ts`
- Create: `src/features/notifications/morning-summary.ts`
- Create: `src/features/notifications/delivery-log-schemas.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260622112000_add_notification_delivery_log/migration.sql`
- Create: `src/app/api/internal/notifications/morning-summary/route.ts`
- Add: `tests/unit/morning-summary-notification.test.mjs`
- Add: `tests/api/morning-summary-notification.spec.ts`

- [ ] **Step 1: Add explicit env keys**

Add to `.env.example`:

```env
LINE_CHANNEL_ACCESS_TOKEN=
LINE_MORNING_SUMMARY_RECIPIENT_IDS=
INTERNAL_CRON_SECRET=
```

- [ ] **Step 2: Add delivery log model**

Add:

```prisma
model NotificationDeliveryLog {
  id          String   @id @default(cuid())
  provider    String
  templateKey String
  recipientId String
  sentAt      DateTime @default(now())
  status      String
  error       String?

  @@index([templateKey, sentAt])
  @@index([recipientId, sentAt])
}
```

- [ ] **Step 3: Build summary payload**

The message must include:

```text
전날 장기 적자 매장
전날 결산 미입력 지점
한 달 이상 장기 체화 재고
목표 마진율 미달 지점
```

- [ ] **Step 4: Add secured internal route**

The route must require:

```http
Authorization: Bearer ${INTERNAL_CRON_SECRET}
```

The scheduler itself can be Vercel Cron, external cron, or server cron, but the product route must be provider-agnostic and testable.

- [ ] **Step 5: Verify**

Run:

```powershell
pnpm db:validate
pnpm test:unit:file tests/unit/morning-summary-notification.test.mjs
node scripts/run-playwright-clean.mjs tests/api/morning-summary-notification.spec.ts
```

Expected: internal route rejects missing secret, formats the Korean summary, sends through LINE client, and records delivery status.

## Final Verification

After all tasks are complete, run:

```powershell
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:api
pnpm test:e2e:core
git diff --check
```

Expected: all commands pass. If Docker/Postgres is unavailable, record the exact infrastructure error and rerun E2E after `docker compose up -d` succeeds.

## Self-Review Notes

- `WO-04` and `WO-05` are already mostly reflected in code and should not be reworked unless tests fail.
- `WO-06` is mostly reflected in code, including route, model, actions, loss context, and tests. The remaining dashboard/loss calculation is intentionally gated because true product-level sales data is still not present.
- `WO-02` is the only numbered work order named by the index that is missing as a file.
- The biggest product gaps from `point_summary.md` are HQ-only expense/P&L, all-store inventory, frozen/live charts, LINE notifications, and strict store-manager information control.
