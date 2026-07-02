# Meeting 0627 Incomplete Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2026-06-27 회의 기준으로 남은 미완료/검수 항목을 실제 코드와 맞춰 고치고, 검수 문서에 증거를 남긴다.

**Architecture:** 코드 수정은 계산의 원천이 있는 곳에서 한 번만 한다. 월별 손익은 본사 지출 입력값과 월별 builder를 같이 바꾸고, 월별 xlsx `품목매출`은 월 마지막 날 일별 대표값 대신 날짜 범위 쿼리로 만든다. 냉동/생물 기준, 장부 셀 매핑, 고객 검수 체크리스트는 코드 구현 완료와 사람 검수를 분리해서 기록한다.

**Tech Stack:** Next.js App Router, React Server Components, Prisma, ExcelJS, Node test runner, Playwright, Markdown verification docs.

---

## 검토 결과

- `docs/meeting_0627/incomplete-review-2026-06-30.md`가 남은 항목으로 잡은 5개 묶음은 현재 코드 기준으로도 유효하다.
- `src/features/reports/monthly-profit-loss.ts:262-276`은 `본사조정`의 `memo`를 `adjustmentReason`에도 넣고, 같은 `memo` 배열에도 다시 넣는다. `prisma/schema.prisma:798-805`, `src/features/headquarters-expenses/schemas.ts:77-91`, `src/features/headquarters-expenses/actions.ts:21-28`에는 `adjustmentReason` 필드가 없다.
- `src/app/api/reports/export/route.ts:298-319`은 월별 xlsx `품목매출` 시트에 월 마지막 날 `getHqDailyMeetingReport({ dateQuery: endDate })`의 `productProfitability`를 사용한다. 그래서 월 전체 합산이 아니다.
- `src/features/reports/export.ts:458-499`의 `buildProductSalesSheet`는 품목, 규격, 구분, 추정 판매수량, 추정 매출, 추정 이익률, 기준, 상태만 내보내며, 확정 컬럼인 조회 시작일/종료일, 지점, 추정 원가/이익, 손실, 재고수량이 없다.
- 냉동/생물 코드는 이미 `docs/meeting_0627/냉동_생물_자료.xlsx` 기준을 주석으로 달고 `src/features/ledger/ecount-supply-mapping.ts`에서 `냉)` 또는 `냉동` 접두만 냉동으로 본다. 다만 `client-review-checklist-2026-06-28.md`에는 `냉동/활어` 표현이 남아 있다.
- `docs/meeting_0627/ledger-cell-mapping-review-2026-06-28.md`에는 `앱 확인 필요`가 6회 남아 있다. 대상은 `C15`, `AG36/AG63/AG76`, `AI36/AI63/AI76`, `C22/C23/C24`, `C36`이다.
- `docs/meeting_0627/client-review-checklist-2026-06-28.md`는 40개 체크박스가 모두 미체크다.

## File Map

- Modify: `prisma/schema.prisma` - `HeadquartersExpense.adjustmentReason` 추가.
- Create: `prisma/migrations/20260630153000_add_headquarters_expense_adjustment_reason/migration.sql` - nullable 컬럼 추가.
- Modify: `src/features/headquarters-expenses/schemas.ts` - `adjustmentReason` 입력 검증.
- Modify: `src/features/headquarters-expenses/actions.ts` - 저장, 수정, 감사 로그에 `adjustmentReason` 반영.
- Modify: `src/features/headquarters-expenses/queries.ts` - 본사 지출 목록 조회에 `adjustmentReason` 포함.
- Modify: `src/features/headquarters-expenses/components/headquarters-expense-client.tsx` - 조정사유 입력/표시 추가.
- Modify: `src/features/reports/monthly-profit-loss.ts` - `adjustmentReason`과 `memo` 분리 계산.
- Modify: `src/features/reports/types.ts` - 기간 품목매출 export 타입 추가.
- Modify: `src/features/reports/queries.ts` - 기간 품목매출 집계 쿼리 추가.
- Modify: `src/features/reports/export.ts` - `품목매출` 시트 확정 컬럼으로 변경.
- Modify: `src/app/api/reports/export/route.ts` - 월별 xlsx가 기간 품목매출 쿼리를 쓰게 변경.
- Modify: `docs/meeting_0627/ledger-cell-mapping-review-2026-06-28.md` - 빈 셀 검증값과 조치 기록.
- Modify: `docs/meeting_0627/client-review-checklist-2026-06-28.md` - 증거 확인된 항목만 체크.
- Create: `docs/meeting_0627/client-review-evidence-2026-06-30.md` - 체크 근거 기록.
- Test: `tests/unit/headquarters-expenses.test.mjs`
- Test: `tests/unit/monthly-profit-loss.test.mjs`
- Test: `tests/unit/hq-reports.test.mjs`
- Test: `tests/unit/ecount-supply-import.test.mjs`
- Test: `tests/api/report-export.spec.ts`
- Test: `tests/e2e/meeting-0627-acceptance.spec.ts`

## Task 1: 월별 손익 `조정사유`와 `메모` 분리

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260630153000_add_headquarters_expense_adjustment_reason/migration.sql`
- Modify: `src/features/headquarters-expenses/schemas.ts`
- Modify: `src/features/headquarters-expenses/actions.ts`
- Modify: `src/features/headquarters-expenses/queries.ts`
- Modify: `src/features/headquarters-expenses/components/headquarters-expense-client.tsx`
- Modify: `src/features/reports/monthly-profit-loss.ts`
- Test: `tests/unit/headquarters-expenses.test.mjs`
- Test: `tests/unit/monthly-profit-loss.test.mjs`

- [ ] **Step 1: Write failing schema and source tests**

Add this assertion to `tests/unit/headquarters-expenses.test.mjs` inside the create schema valid test:

```js
const adjustmentReason = headquartersExpenseCreateSchema.safeParse({
  expenseDate: "2026-06-22",
  storeId: "",
  category: "본사조정",
  amount: "10000",
  adjustmentReason: "월말 정산 차이",
  memo: "대표 확인 완료",
});

assert.equal(adjustmentReason.success, true);
assert.equal(adjustmentReason.data.adjustmentReason, "월말 정산 차이");
assert.equal(adjustmentReason.data.memo, "대표 확인 완료");
```

Add this assertion to the invalid schema test:

```js
assert.equal(
  headquartersExpenseCreateSchema.safeParse({
    ...base,
    adjustmentReason: "사".repeat(501),
  }).success,
  false,
);
```

Add this test to `tests/unit/monthly-profit-loss.test.mjs`:

```js
test("monthly P&L reads adjustmentReason separately from memo", () => {
  const source = readProjectFile(
    "src",
    "features",
    "reports",
    "monthly-profit-loss.ts",
  );

  assert.match(source, /adjustmentReason:\s*true/);
  assert.match(source, /expense\.adjustmentReason/);
  assert.doesNotMatch(source, /bucket\.adjustmentReasons\.push\(expense\.memo\)/);
});
```

Run:

```powershell
pnpm test:unit:file tests/unit/headquarters-expenses.test.mjs tests/unit/monthly-profit-loss.test.mjs
```

Expected: FAIL because `adjustmentReason` is not yet in the schema, query select, or monthly builder.

- [ ] **Step 2: Add the database field**

In `prisma/schema.prisma`, change `HeadquartersExpense` to include:

```prisma
  adjustmentReason String?
  memo             String?
```

Create `prisma/migrations/20260630153000_add_headquarters_expense_adjustment_reason/migration.sql` with this content:

```sql
ALTER TABLE "HeadquartersExpense" ADD COLUMN "adjustmentReason" TEXT;
```

Run:

```powershell
pnpm db:migrate:dev
pnpm db:validate
pnpm db:generate
```

Expected: Prisma schema validates and generated client includes `adjustmentReason`.

- [ ] **Step 3: Parse `adjustmentReason` in the headquarters expense schema**

In `src/features/headquarters-expenses/schemas.ts`, replace `parseOptionalMemo` with this reusable parser:

```ts
const adjustmentReasonError = "조정사유는 0~500자 사이여야 합니다.";
const memoError = "메모는 0~500자 사이여야 합니다.";

function parseOptionalText(
  value: unknown,
  context: z.RefinementCtx,
  message: string,
) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const text = value.trim();

    if (text === "") {
      return null;
    }

    if (text.length <= 500) {
      return text;
    }
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message,
  });

  return z.NEVER;
}
```

Then change `headquartersExpenseFields` to include both fields:

```ts
  adjustmentReason: z.unknown().transform((value, context) =>
    parseOptionalText(value, context, adjustmentReasonError),
  ),
  memo: z
    .unknown()
    .transform((value, context) =>
      parseOptionalText(value, context, memoError),
    ),
```

Run:

```powershell
pnpm test:unit:file tests/unit/headquarters-expenses.test.mjs
```

Expected: the new schema assertions pass.

- [ ] **Step 4: Persist and expose `adjustmentReason`**

In `src/features/headquarters-expenses/actions.ts`, add `adjustmentReason: true` to `headquartersExpenseSelect`.

In create and update data, use this exact rule:

```ts
const adjustmentReason =
  data.category === "본사조정" ? data.adjustmentReason : null;
```

Store it in both `create` and `update` calls:

```ts
adjustmentReason,
memo: data.memo,
```

Add it to `toExpenseAuditValue`:

```ts
adjustmentReason: expense.adjustmentReason,
```

In `src/features/headquarters-expenses/queries.ts`, add `adjustmentReason: true` to `headquartersExpenseSelect`, add `adjustmentReason: string | null` to `HeadquartersExpenseListItem`, and map it in `toHeadquartersExpenseListItem`.

Run:

```powershell
pnpm typecheck
```

Expected: typecheck passes with the new selected field.

- [ ] **Step 5: Add the input and table display**

In `src/features/headquarters-expenses/components/headquarters-expense-client.tsx`, extend `FormValues`:

```ts
  adjustmentReason: string;
```

Set empty and edit values:

```ts
adjustmentReason: "",
```

```ts
adjustmentReason: expense.adjustmentReason ?? "",
```

Include it in the save payload:

```ts
adjustmentReason: formValues.adjustmentReason,
```

Render a textarea before `메모(선택)`:

```tsx
<Field
  className="sm:col-span-2"
  data-invalid={Boolean(adjustmentReasonError)}
>
  <FieldLabel htmlFor="expense-adjustment-reason">
    조정사유(본사조정일 때)
  </FieldLabel>
  <textarea
    id="expense-adjustment-reason"
    value={formValues.adjustmentReason}
    onChange={(event) =>
      setFieldValue("adjustmentReason", event.currentTarget.value)
    }
    className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-20 rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
    aria-invalid={Boolean(adjustmentReasonError)}
  />
  {adjustmentReasonError ? (
    <FieldError>{adjustmentReasonError}</FieldError>
  ) : null}
</Field>
```

Add a `조정사유` column in the list table before `메모`, and increase the empty row `colSpan` from `7` to `8`.

Run:

```powershell
pnpm typecheck
```

Expected: the client compiles and shows separate 조정사유/메모 fields.

- [ ] **Step 6: Update monthly P&L builder**

In `src/features/reports/monthly-profit-loss.ts`, update the headquarters expense select:

```ts
select: {
  storeId: true,
  category: true,
  amount: true,
  adjustmentReason: true,
  memo: true,
},
```

Replace the current `본사조정` block with:

```ts
if (expense.category === MONTHLY_PNL_HQ_ADJUSTMENT_CATEGORY) {
  bucket.hqAdjustmentAmount += expense.amount;
  if (expense.adjustmentReason) {
    bucket.adjustmentReasons.push(expense.adjustmentReason);
  }
} else if (fixedCostSet.has(expense.category)) {
  bucket.fixedCosts[
    expense.category as (typeof MONTHLY_PNL_FIXED_COST_CATEGORIES)[number]
  ] += expense.amount;
} else {
  bucket.otherExpenseAmount += expense.amount;
}

if (expense.memo) {
  bucket.memos.push(expense.memo);
}
```

Run:

```powershell
pnpm test:unit:file tests/unit/monthly-profit-loss.test.mjs
pnpm typecheck
```

Expected: monthly P&L tests and typecheck pass.

- [ ] **Step 7: Commit**

```powershell
git add prisma src/features/headquarters-expenses src/features/reports/monthly-profit-loss.ts tests/unit/headquarters-expenses.test.mjs tests/unit/monthly-profit-loss.test.mjs
git commit -m "fix: split monthly pnl adjustment reason from memo"
```

## Task 2: 월별 xlsx `품목매출`을 기간 합산으로 변경

**Files:**

- Modify: `src/features/reports/types.ts`
- Modify: `src/features/reports/queries.ts`
- Modify: `src/features/reports/export.ts`
- Modify: `src/app/api/reports/export/route.ts`
- Test: `tests/unit/monthly-profit-loss.test.mjs`
- Test: `tests/api/report-export.spec.ts`

- [ ] **Step 1: Write failing tests for the current last-day bug**

Add this test to `tests/unit/monthly-profit-loss.test.mjs`:

```js
test("monthly xlsx product sales uses a period query, not the last daily meeting report", () => {
  const route = readProjectFile(
    "src",
    "app",
    "api",
    "reports",
    "export",
    "route.ts",
  );

  assert.match(route, /getHqProductSalesReportForRange/);
  assert.doesNotMatch(
    route,
    /getHqDailyMeetingReport\(\{\s*dateQuery:\s*endDate/,
  );
  assert.doesNotMatch(route, /마지막 날의 일별 회의 리포트/);
});
```

Add this header assertion to the monthly xlsx API test in `tests/api/report-export.spec.ts` after loading the workbook:

```ts
const productSales = workbook.getWorksheet("품목매출");
expect(productSales).toBeTruthy();
const productSalesHeader = productSales?.getRow(1).values as unknown[];
const productSalesLabels = productSalesHeader.filter(
  (value) => typeof value === "string",
);
for (const label of [
  "조회 시작일",
  "조회 종료일",
  "지점",
  "품목명",
  "규격",
  "품목구분",
  "냉동/생물",
  "추정판매수량",
  "추정매출",
  "추정매입원가",
  "추정매출이익",
  "추정이익률",
  "손실수량",
  "손실금액",
  "재고수량",
]) {
  expect(productSalesLabels).toContain(label);
}
```

Run:

```powershell
pnpm test:unit:file tests/unit/monthly-profit-loss.test.mjs
pnpm test:api -- tests/api/report-export.spec.ts
```

Expected: FAIL because the route still calls `getHqDailyMeetingReport({ dateQuery: endDate })` and the sheet does not have the confirmed columns.

- [ ] **Step 2: Add the period product-sales types**

In `src/features/reports/types.ts`, add:

```ts
export type ProductSalesPeriodItem = {
  startDateInput: string;
  endDateInput: string;
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
  productSpec: string;
  productCategory: "냉동" | "생물";
  soldQuantity: number;
  estimatedSalesAmount: number;
  estimatedCogsAmount: number;
  estimatedGrossProfit: number;
  estimatedGrossMarginRate: number | null;
  salesBasis: "planned" | "cost";
  statusLabel: "추정" | "판매가 미반영" | "계산 불가";
  lossQuantity: number;
  lossAmount: number;
  currentQuantity: number | null;
};

export type ProductSalesPeriodReportData = {
  startDateInput: string;
  endDateInput: string;
  selectedStoreId: string | null;
  selectedStoreName: string | null;
  scopedStoreIds: string[];
  items: ProductSalesPeriodItem[];
};
```

Add these two imports in `src/features/reports/queries.ts`:

```ts
  ProductSalesPeriodItem,
  ProductSalesPeriodReportData,
```

Run:

```powershell
pnpm typecheck
```

Expected: typecheck passes after imports are used in the next step.

- [ ] **Step 3: Add a real date-range product-sales query**

In `src/features/reports/queries.ts`, add this function after `getHqDailyMeetingReport`:

```ts
export async function getHqProductSalesReportForRange({
  startDate,
  endDate,
  storeId,
}: {
  startDate?: unknown;
  endDate?: unknown;
  storeId?: unknown;
} = {}): Promise<ProductSalesPeriodReportData> {
  const { getHeadquartersStoreScope, requireReportAccess } =
    await import("../../server/authz.ts");
  await requireReportAccess();
  const storeScope = await getHeadquartersStoreScope();
  const range = getStoreComparisonReportDateRange({ startDate, endDate });
  const stores = storeScope.stores;
  const normalizedStoreId =
    typeof storeId === "string" && storeId.length > 0 ? storeId : null;
  const matchedStore = normalizedStoreId
    ? stores.find((store) => store.id === normalizedStoreId)
    : null;
  const selectedStores = normalizedStoreId
    ? matchedStore
      ? [matchedStore]
      : []
    : stores;
  const storeNameById = new Map(selectedStores.map((store) => [store.id, store.name]));
  const storeIds = selectedStores.map((store) => store.id);

  if (storeIds.length === 0) {
    return {
      startDateInput: range.startDateInput,
      endDateInput: range.endDateInput,
      selectedStoreId: matchedStore?.id ?? null,
      selectedStoreName: matchedStore?.name ?? null,
      scopedStoreIds: [],
      items: [],
    };
  }

  const { db } = await import("../../server/db.ts");
  const ledgers = await db.dailyLedger.findMany({
    where: {
      storeId: { in: storeIds },
      closingDate: { gte: range.startDate, lte: range.endDate },
    },
    orderBy: [{ storeId: "asc" }, { closingDate: "asc" }, { id: "asc" }],
    select: {
      id: true,
      storeId: true,
      closingDate: true,
      ledgerInventoryItems: {
        select: {
          productId: true,
          productName: true,
          productSpec: true,
          productCategory: true,
          previousQuantity: true,
          purchasedQuantity: true,
          currentQuantity: true,
          quantity: true,
          unitPrice: true,
          fifoLots: { select: { consumedAmount: true } },
        },
      },
      ledgerLossItems: {
        select: {
          productId: true,
          quantity: true,
          amount: true,
        },
      },
    },
  });

  const { getPlannedUnitPriceLookup } = await import("../sales-plan/queries.ts");
  const plannedUnitPriceLookup = await getPlannedUnitPriceLookup(
    ledgers.map((ledger) => ({
      storeId: ledger.storeId,
      businessDate: ledger.closingDate,
    })),
  );

  type ProductSalesBucket = Omit<
    ProductSalesPeriodItem,
    | "startDateInput"
    | "endDateInput"
    | "estimatedGrossProfit"
    | "estimatedGrossMarginRate"
    | "statusLabel"
  > & {
    usedCostFallback: boolean;
    latestClosingDate: Date | null;
  };

  const byStoreProduct = new Map<string, ProductSalesBucket>();

  for (const ledger of ledgers) {
    const lossQuantityByProductId = aggregateLossQuantityByProductId(
      ledger.ledgerLossItems,
    );
    const lossAmountByProductId = new Map<string, number>();
    for (const lossItem of ledger.ledgerLossItems) {
      if (!lossItem.productId) continue;
      lossAmountByProductId.set(
        lossItem.productId,
        (lossAmountByProductId.get(lossItem.productId) ?? 0) + lossItem.amount,
      );
    }

    for (const item of ledger.ledgerInventoryItems) {
      if (item.productCategory !== "냉동" && item.productCategory !== "생물") {
        continue;
      }

      const enrichedItem = {
        ...item,
        lossQuantity: item.productId
          ? (lossQuantityByProductId.get(item.productId) ?? 0)
          : 0,
        plannedUnitPrice: item.productId
          ? plannedUnitPriceLookup(
              ledger.storeId,
              ledger.closingDate,
              item.productId,
            )
          : null,
      };
      const soldQuantity = getItemSoldQuantity(enrichedItem);
      if (soldQuantity === null || soldQuantity <= 0) continue;

      const productKey =
        item.productId ??
        `name:${item.productName}:${item.productSpec}:${item.productCategory}`;
      const key = `${ledger.storeId}|${productKey}`;
      const { unitPrice: salesUnitPrice, usedPlannedPrice } =
        getItemSalesUnitPrice(enrichedItem);
      const existing = byStoreProduct.get(key);
      const bucket =
        existing ??
        {
          storeId: ledger.storeId,
          storeName: storeNameById.get(ledger.storeId) ?? ledger.storeId,
          productId: item.productId ?? productKey,
          productName: item.productName ?? "이름 없음",
          productSpec: item.productSpec ?? "",
          productCategory: item.productCategory,
          soldQuantity: 0,
          estimatedSalesAmount: 0,
          estimatedCogsAmount: 0,
          salesBasis: "planned",
          usedCostFallback: false,
          lossQuantity: 0,
          lossAmount: 0,
          currentQuantity: null,
          latestClosingDate: null,
        };

      bucket.soldQuantity += soldQuantity;
      bucket.estimatedSalesAmount += soldQuantity * salesUnitPrice;
      bucket.estimatedCogsAmount += getItemCogs(enrichedItem, soldQuantity);
      bucket.lossQuantity += enrichedItem.lossQuantity;
      bucket.lossAmount += item.productId
        ? (lossAmountByProductId.get(item.productId) ?? 0)
        : 0;
      if (!usedPlannedPrice) {
        bucket.usedCostFallback = true;
        bucket.salesBasis = "cost";
      }
      if (
        bucket.latestClosingDate === null ||
        ledger.closingDate >= bucket.latestClosingDate
      ) {
        bucket.latestClosingDate = ledger.closingDate;
        bucket.currentQuantity = item.currentQuantity;
      }

      byStoreProduct.set(key, bucket);
    }
  }

  const items = [...byStoreProduct.values()]
    .map((bucket): ProductSalesPeriodItem => {
      const estimatedGrossProfit =
        bucket.estimatedSalesAmount - bucket.estimatedCogsAmount;
      const estimatedGrossMarginRate =
        bucket.estimatedSalesAmount > 0
          ? estimatedGrossProfit / bucket.estimatedSalesAmount
          : null;

      return {
        startDateInput: range.startDateInput,
        endDateInput: range.endDateInput,
        storeId: bucket.storeId,
        storeName: bucket.storeName,
        productId: bucket.productId,
        productName: bucket.productName,
        productSpec: bucket.productSpec,
        productCategory: bucket.productCategory,
        soldQuantity: bucket.soldQuantity,
        estimatedSalesAmount: bucket.estimatedSalesAmount,
        estimatedCogsAmount: bucket.estimatedCogsAmount,
        estimatedGrossProfit,
        estimatedGrossMarginRate,
        salesBasis: bucket.salesBasis,
        statusLabel:
          bucket.estimatedSalesAmount <= 0
            ? "계산 불가"
            : bucket.usedCostFallback
              ? "판매가 미반영"
              : "추정",
        lossQuantity: bucket.lossQuantity,
        lossAmount: bucket.lossAmount,
        currentQuantity: bucket.currentQuantity,
      };
    })
    .sort((a, b) =>
      a.storeName.localeCompare(b.storeName, "ko") ||
      b.estimatedSalesAmount - a.estimatedSalesAmount,
    );

  return {
    startDateInput: range.startDateInput,
    endDateInput: range.endDateInput,
    selectedStoreId: matchedStore?.id ?? null,
    selectedStoreName: matchedStore?.name ?? null,
    scopedStoreIds: storeIds,
    items,
  };
}
```

Run:

```powershell
pnpm typecheck
```

Expected: typecheck passes.

- [ ] **Step 4: Update the `품목매출` sheet builder**

In `src/features/reports/export.ts`, import the new type:

```ts
import type { ProductSalesPeriodReportData } from "./types";
```

Replace `buildProductSalesSheet` with this version:

```ts
export function buildProductSalesSheet(
  report: ProductSalesPeriodReportData,
): ReportExportSheet {
  const columns: ReportExportColumn[] = [
    { key: "startDateInput", label: "조회 시작일" },
    { key: "endDateInput", label: "조회 종료일" },
    { key: "storeName", label: "지점" },
    { key: "productName", label: "품목명" },
    { key: "productSpec", label: "규격" },
    { key: "productCategory", label: "품목구분" },
    { key: "productGroup", label: "냉동/생물" },
    { key: "soldQuantity", label: "추정판매수량" },
    { key: "estimatedSalesAmount", label: "추정매출" },
    { key: "estimatedCogsAmount", label: "추정매입원가" },
    { key: "estimatedGrossProfit", label: "추정매출이익" },
    { key: "estimatedGrossMarginRate", label: "추정이익률" },
    { key: "lossQuantity", label: "손실수량" },
    { key: "lossAmount", label: "손실금액" },
    { key: "currentQuantity", label: "재고수량" },
    { key: "salesBasis", label: "기준" },
    { key: "statusLabel", label: "상태" },
  ];

  const rows: ReportExportRow[] = report.items.map((item) => ({
    startDateInput: item.startDateInput,
    endDateInput: item.endDateInput,
    storeName: item.storeName,
    productName: item.productName,
    productSpec: item.productSpec,
    productCategory: item.productCategory,
    productGroup: item.productCategory,
    soldQuantity: item.soldQuantity,
    estimatedSalesAmount: item.estimatedSalesAmount,
    estimatedCogsAmount: item.estimatedCogsAmount,
    estimatedGrossProfit: item.estimatedGrossProfit,
    estimatedGrossMarginRate:
      item.estimatedGrossMarginRate === null
        ? "계산 불가"
        : `${(item.estimatedGrossMarginRate * 100).toFixed(1)}%`,
    lossQuantity: item.lossQuantity,
    lossAmount: item.lossAmount,
    currentQuantity: item.currentQuantity ?? "계산 불가",
    salesBasis:
      item.salesBasis === "planned" ? "판매가 계획" : "매입단가(폴백)",
    statusLabel: item.statusLabel,
  }));

  return { name: "품목매출", columns, rows };
}
```

Run:

```powershell
pnpm typecheck
```

Expected: typecheck passes.

- [ ] **Step 5: Wire the monthly xlsx route to the period query**

In `src/app/api/reports/export/route.ts`, import the new query:

```ts
  getHqProductSalesReportForRange,
```

Change the comment at lines 296-299 to:

```ts
// WO-15(2026-06-29, fixed 2026-06-30): 월별 xlsx 5시트 번들. summary는 호출부에서 만든
// 월별 KPI(요약)를 쓰고, 품목매출은 월 마지막 날 대표값이 아니라 월 시작일-종료일 기간 합산을 쓴다.
```

Replace the `dailyMeeting` promise with `productSales`:

```ts
const [comparison, inventory, productSales, pnl] = await Promise.all([
  getHqStoreComparisonReport({
    startDate,
    endDate,
    storeId: request.storeId,
  }),
  getHqInventoryPositionReport({
    date: endDate,
    storeId: request.storeId,
    category: null,
    product: null,
  }),
  getHqProductSalesReportForRange({
    startDate,
    endDate,
    storeId: request.storeId,
  }),
  buildAllMonthsProfitAndLoss({ storeId: request.storeId }),
]);
```

Replace the sheet call:

```ts
buildProductSalesSheet(productSales),
```

Run:

```powershell
pnpm test:unit:file tests/unit/monthly-profit-loss.test.mjs
pnpm test:api -- tests/api/report-export.spec.ts
```

Expected: tests pass and the route no longer depends on the month-end daily report for `품목매출`.

- [ ] **Step 6: Commit**

```powershell
git add src/features/reports/types.ts src/features/reports/queries.ts src/features/reports/export.ts src/app/api/reports/export/route.ts tests/unit/monthly-profit-loss.test.mjs tests/api/report-export.spec.ts
git commit -m "fix: aggregate monthly product sales export by period"
```

## Task 3: 냉동/생물 기준과 용어 검수

**Files:**

- Modify: `docs/meeting_0627/client-review-checklist-2026-06-28.md`
- Modify: `docs/meeting_0627/incomplete-review-2026-06-30.md`
- Modify: `docs/meeting_0627/implementation-work-order-2026-06-27.md`
- Test: `tests/unit/ecount-supply-import.test.mjs`
- Test: `tests/unit/ecount-supply-remediation.test.mjs`
- Test: `tests/unit/long-stock-thresholds.test.mjs`

- [ ] **Step 1: Lock the current canonical term**

Use `냉동/생물` as the current canonical term because these files already use it in running code:

```txt
src/features/master-data/product-schemas.ts
src/features/ledger/ecount-supply-mapping.ts
src/features/reports/queries.ts
src/features/reports/components/monthly-closing-anomaly-report.tsx
src/app/app/reports/daily/page.tsx
```

Replace the two remaining `냉동/활어` checklist phrases:

```markdown
- [ ] 신규 품목은 본사 확인 후 등록되며, 냉동/생물 분류는 기준표 기준의 기본값을 보되 본사가 수동 확정한다. 기준이 애매한 품목은 `기준 미정`으로 둔다.
```

```markdown
- [ ] 냉동/생물 기준 품목표. WO-13 자동 분류와 장기재고 기준 연결에 필요.
```

Run:

```powershell
rg -n "냉동/활어" docs/meeting_0627 src tests
```

Expected: no matches remain in current 6/27 execution docs or code. Historical original transcripts may still contain spoken terms if they are not execution docs.

- [ ] **Step 2: Keep `냉)` prefix classification covered**

Run the existing classification tests:

```powershell
pnpm test:unit:file tests/unit/ecount-supply-import.test.mjs tests/unit/ecount-supply-remediation.test.mjs
```

Expected: tests pass for these facts:

```txt
냉)부세 -> 냉동
냉)동태 -> 냉동
냉동삼치 -> 냉동
광어 -> 생물
생물동태 -> 생물
활우럭 -> 생물
```

- [ ] **Step 3: Verify unresolved categories do not create long-stock alerts**

Run:

```powershell
pnpm test:unit:file tests/unit/long-stock-thresholds.test.mjs tests/unit/morning-summary-notification.test.mjs
```

Expected: tests pass and code keeps this rule from `src/features/notifications/morning-summary.ts:285-292`: if a product category has no long-stock threshold, it is skipped from LINE alert candidates.

- [ ] **Step 4: Document the distinction between `기준 미정` and `기준 확인 필요`**

Update `docs/meeting_0627/incomplete-review-2026-06-30.md` under the 냉동/생물 section:

```markdown
- 품목 분류 자체가 애매한 신규 품목은 `기준 미정`으로 둔다.
- 장기재고 기준일이 없는 품목군은 `기준 확인 필요`로 표시하고 LINE 알림 대상에서 제외한다.
```

Run:

```powershell
rg -n "기준 미정|기준 확인 필요" docs/meeting_0627/client-review-checklist-2026-06-28.md docs/meeting_0627/incomplete-review-2026-06-30.md src/features/notifications/morning-summary.ts
```

Expected: both terms appear with separate meanings.

- [ ] **Step 5: Commit**

```powershell
git add docs/meeting_0627/client-review-checklist-2026-06-28.md docs/meeting_0627/incomplete-review-2026-06-30.md docs/meeting_0627/implementation-work-order-2026-06-27.md tests/unit/ecount-supply-import.test.mjs tests/unit/ecount-supply-remediation.test.mjs tests/unit/long-stock-thresholds.test.mjs
git commit -m "docs: align frozen live terminology and review rules"
```

## Task 4: 장부 셀 매핑 검증표 완료

**Files:**

- Modify: `docs/meeting_0627/ledger-cell-mapping-review-2026-06-28.md`
- Test: `tests/unit/hq-dashboard.test.mjs`
- Test: `tests/e2e/meeting-0627-acceptance.spec.ts`

- [ ] **Step 1: Extract source workbook values**

Run this command from the repo root:

```powershell
node --input-type=module -e "import ExcelJS from 'exceljs'; const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile('docs/reference_from_customer/장부-202605현대 (1).xlsx'); const sheet = workbook.getWorksheet('26'); const cells = ['C15','AG36','AG63','AG76','AI36','AI63','AI76','C22','C23','C24','C36']; for (const address of cells) { const cell = sheet.getCell(address); const value = cell.result ?? cell.value; const formula = cell.formula ?? ''; console.log(`${address}\tvalue=${JSON.stringify(value)}\tformula=${formula}`); }"
```

Expected: one line per cell with the workbook value and formula.

- [ ] **Step 2: Update the mapping table with source values**

In `docs/meeting_0627/ledger-cell-mapping-review-2026-06-28.md`, replace `_원본 확인_` and `_원본 값_` for these rows:

```txt
C15
AG36/AG63/AG76
AI36/AI63/AI76
C22/C23/C24
C36
```

Use the exact values printed in Step 1. For grouped rows, write all three values in the same table cell, separated by `<br>`.

Run:

```powershell
rg -n "_원본 확인_|_원본 값_" docs/meeting_0627/ledger-cell-mapping-review-2026-06-28.md
```

Expected: no matches remain for the listed rows.

- [ ] **Step 3: Check app display targets with a headquarters account**

Start the app:

```powershell
pnpm dev
```

Open these pages with `hq@example.com`:

```txt
/app/dashboard
/app/reports/daily
/app/reports/monthly
/app/reports/inventory
```

For each mapping row, record one of these statuses in the table:

```txt
확인됨
차이 확인
제외
```

Use these exact exclusion reasons when a cell is not directly shown:

```txt
고객 화면 직접 노출값이 아니라 상위 계산의 원천 셀로만 사용
현행 앱은 기간 집계값으로 대체 표시
```

- [ ] **Step 4: Add or update automated coverage for visible dashboard values**

If the dashboard already shows the value, add the cell reference to existing comments in `tests/unit/hq-dashboard.test.mjs` and `tests/e2e/meeting-0627-acceptance.spec.ts`.

Use this assertion style in the e2e test:

```ts
await expect(page.getByText("장부 매출")).toBeVisible();
await expect(page.getByText("분석 매출")).toBeVisible();
await expect(page.getByText("장부 이익률")).toBeVisible();
await expect(page.getByText("분석 이익률")).toBeVisible();
```

Run:

```powershell
pnpm test:unit:file tests/unit/hq-dashboard.test.mjs
pnpm test:e2e:meeting-0627
```

Expected: tests pass and the mapping table no longer has unchecked app-display rows without a status.

- [ ] **Step 5: Commit**

```powershell
git add docs/meeting_0627/ledger-cell-mapping-review-2026-06-28.md tests/unit/hq-dashboard.test.mjs tests/e2e/meeting-0627-acceptance.spec.ts
git commit -m "docs: complete ledger cell mapping review"
```

## Task 5: 고객 검수 체크리스트 실행

**Files:**

- Modify: `docs/meeting_0627/client-review-checklist-2026-06-28.md`
- Create: `docs/meeting_0627/client-review-evidence-2026-06-30.md`

- [ ] **Step 1: Create the evidence document**

Create `docs/meeting_0627/client-review-evidence-2026-06-30.md` with this header:

```markdown
# 의뢰자 검수 증거 기록 (2026-06-30)

기준 체크리스트: `docs/meeting_0627/client-review-checklist-2026-06-28.md`

## 자동 검증

| 항목 | 명령 | 결과 | 근거 |
| --- | --- | --- | --- |

## 수동 검증

| 항목 | 계정 | 화면/API | 결과 | 근거 |
| --- | --- | --- | --- | --- |
```

- [ ] **Step 2: Run automated verification commands**

Run:

```powershell
pnpm test:unit:file tests/unit/sensitive-response-shaping.test.mjs tests/unit/ledger-review.test.mjs tests/unit/ecount-supply-import.test.mjs tests/unit/ecount-supply-remediation.test.mjs tests/unit/monthly-profit-loss.test.mjs tests/unit/long-stock-thresholds.test.mjs tests/unit/morning-summary-notification.test.mjs tests/unit/master-data-history.test.mjs
pnpm test:api -- tests/api/report-export.spec.ts
pnpm test:e2e:meeting-0627
```

Record each PASS command in the evidence document under `자동 검증`.

- [ ] **Step 3: Run manual account checks**

With `hq@example.com`, verify:

```txt
본사 홈 장부 매출/장부 이익률/분석 매출/분석 이익률
Ecount 상태 한글 라벨
월간 리포트 Excel 5시트
장기재고 기준일 메뉴
변경 이력 한글 필드명과 장부 상세 링크
화면 표시명 도원에스디
```

With a store manager account from seeded data, verify:

```txt
급여액/인건비 합계/개인별 급여 미노출
원가/마진/매출 차이 금액 네트워크 응답 미포함
전날 재고 보기 금액/단가/원가/마진 미노출
전날 장부 수정 링크 없음
```

Record the route or API response inspected for each row in the evidence document under `수동 검증`.

- [ ] **Step 4: Check only evidence-backed checklist rows**

In `docs/meeting_0627/client-review-checklist-2026-06-28.md`, change `- [ ]` to `- [x]` only when the evidence document has a matching PASS row.

Run:

```powershell
$unchecked = (Select-String -Path "docs\meeting_0627\client-review-checklist-2026-06-28.md" -Pattern "^- \[ \]" | Measure-Object).Count; $checked = (Select-String -Path "docs\meeting_0627\client-review-checklist-2026-06-28.md" -Pattern "^- \[[xX]\]" | Measure-Object).Count; "checked=$checked unchecked=$unchecked"
```

Expected: `checked` is greater than `0`. Any remaining unchecked row has no matching evidence row yet.

- [ ] **Step 5: Commit**

```powershell
git add docs/meeting_0627/client-review-checklist-2026-06-28.md docs/meeting_0627/client-review-evidence-2026-06-30.md
git commit -m "docs: record client review evidence"
```

## Final Verification

Run:

```powershell
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test:unit:file tests/unit/headquarters-expenses.test.mjs tests/unit/monthly-profit-loss.test.mjs tests/unit/hq-reports.test.mjs tests/unit/ecount-supply-import.test.mjs tests/unit/ecount-supply-remediation.test.mjs tests/unit/long-stock-thresholds.test.mjs tests/unit/morning-summary-notification.test.mjs tests/unit/hq-dashboard.test.mjs
pnpm test:api -- tests/api/report-export.spec.ts
pnpm test:e2e:meeting-0627
```

Expected:

- 월별 손익은 `adjustmentReason`과 `memo`를 서로 다른 값으로 저장하고 export한다.
- 월별 xlsx `품목매출`은 월 시작일-종료일 기간 합산이다.
- 냉동/생물 용어가 실행 문서와 코드에서 일관된다.
- 장부 셀 매핑표에 `앱 확인 필요`가 남아 있지 않다.
- 고객 검수 체크리스트는 증거가 있는 항목만 체크되어 있다.
