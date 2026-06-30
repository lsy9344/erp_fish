# 월별 손익·리포트 보완 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 월별 손익계산서 화면, xlsx 컬럼/기간 집계, 리포트 필터/재고 집계, 월별 조정사유·메모 분리를 최종 사양에 맞춘다.

**Architecture:** 월별 손익은 `HeadquartersExpense` 기반 조정값과 장부 집계값을 분리해서 계산하고, 화면과 xlsx가 같은 view model을 쓰게 한다. 품목매출은 월 마지막 날 대표값이 아니라 조회 기간 합산으로 만들고, 필터는 URL query로 유지한다.

**Tech Stack:** Next.js App Router, React Server Components, Prisma, Playwright, Node test runner, xlsx export helper.

---

## Scope

포함:

- 기존 최종 누락 5번: 월별 손익계산서 화면 완성
- 기존 최종 누락 6번: xlsx 확정 컬럼과 기간 집계 보정
- 기존 최종 누락 7번: 리포트 필터와 재고 집계 뷰 보강
- 기존 최종 누락 9번: 월별 손익의 `조정사유`와 `메모` 분리

제외:

- WO-17 전체 셀 반영 검증표
- 지점장 매입 단가/금액 노출
- 장기재고/냉동·생물 기준
- 본사 홈 마진율 반전 표시. 2026-06-30 지시로 삭제됨.
- 지점장 인건비 UX. 누락 항목으로는 유지하되 이 계획에서는 별도 작업으로 분리한다.

## File Map

- Modify: `src/app/app/reports/monthly/page.tsx`  
  월별 손익계산서 화면 진입점.
- Modify: `src/features/reports/monthly-profit-loss.ts`  
  월별 손익 계산, view model, xlsx row 생성.
- Modify: `src/features/reports/components/monthly-closing-anomaly-report.tsx` 또는 신규 `src/features/reports/components/monthly-profit-loss-table.tsx`  
  월별 손익 표 렌더링.
- Modify: `src/features/headquarters-expenses/schemas.ts`  
  `adjustmentReason`과 `memo` 입력 분리.
- Modify: `src/features/headquarters-expenses/actions.ts`  
  본사 조정값 저장/감사 로그.
- Modify: `prisma/schema.prisma`  
  별도 필드가 필요하면 `HeadquartersExpense.adjustmentReason` 추가.
- Modify: `src/app/api/reports/export/route.ts`  
  월별 xlsx 5개 시트 데이터 소스 정리.
- Modify: `src/features/reports/export.ts`  
  확정 컬럼 순서와 sheet row 생성.
- Modify: `src/app/app/reports/comparison/page.tsx`  
  기간조회 필터 확장.
- Modify: `src/app/app/reports/product-review/page.tsx`  
  품목 검토 필터 확장.
- Modify: `src/app/app/reports/sales-review/page.tsx`  
  매출 검토 필터 확장.
- Modify: `src/app/app/reports/inventory/page.tsx`  
  재고 지점별/품목별 집계 뷰 추가.
- Modify: `src/features/reports/inventory-position-types.ts`  
  재고 집계 타입 추가.
- Modify: `src/features/reports/inventory-position-queries.ts`  
  재고 집계 쿼리 추가.
- Test: `tests/unit/monthly-profit-loss.test.mjs`
- Test: `tests/api/report-export.spec.ts`
- Test: `tests/unit/hq-reports.test.mjs`
- Test: `tests/e2e/hq-reports.spec.ts`

## Task 1: 월별 손익계산서 화면과 조정사유·메모 분리

**Files:**

- Modify: `prisma/schema.prisma`
- Modify: `src/features/headquarters-expenses/schemas.ts`
- Modify: `src/features/headquarters-expenses/actions.ts`
- Modify: `src/features/reports/monthly-profit-loss.ts`
- Create or Modify: `src/features/reports/components/monthly-profit-loss-table.tsx`
- Modify: `src/app/app/reports/monthly/page.tsx`
- Test: `tests/unit/monthly-profit-loss.test.mjs`

- [ ] **Step 1: Write failing unit test for separated adjustment reason and memo**

Add a test that proves `본사조정`, `조정사유`, `메모` are separate values in monthly P&L rows.

```js
test("monthly P&L keeps adjustmentReason and memo separate", async () => {
  const source = readProjectFile("src", "features", "reports", "monthly-profit-loss.ts");

  assert.match(source, /adjustmentReason/);
  assert.match(source, /memo/);
  assert.doesNotMatch(
    source,
    /adjustmentReason:\s*joinOrNull\(bucket\?\.memos\)|memo:\s*joinOrNull\(bucket\?\.adjustmentReasons\)/,
  );
});
```

Run:

```powershell
pnpm test:unit -- tests/unit/monthly-profit-loss.test.mjs
```

Expected: FAIL until the monthly P&L builder separates the fields.

- [ ] **Step 2: Add the data shape**

If existing `HeadquartersExpense.memo` cannot safely carry both meanings, add an optional field:

```prisma
model HeadquartersExpense {
  id               String   @id @default(cuid())
  storeId          String?
  month            String
  category         String
  amount           Int
  adjustmentReason String?
  memo             String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

Run:

```powershell
pnpm prisma validate
pnpm prisma migrate dev --name split_monthly_pnl_adjustment_reason
pnpm prisma generate
```

Expected: schema validates and generated client includes `adjustmentReason`.

- [ ] **Step 3: Update input schema and action**

In `src/features/headquarters-expenses/schemas.ts`, accept `adjustmentReason` separately from `memo`:

```ts
adjustmentReason: z.string().trim().max(500).optional(),
memo: z.string().trim().max(500).optional(),
```

In `src/features/headquarters-expenses/actions.ts`, persist both fields. For non-`본사조정` categories, save `adjustmentReason` as `null`.

- [ ] **Step 4: Update monthly P&L builder**

In `src/features/reports/monthly-profit-loss.ts`, collect adjustment reasons only from `expense.adjustmentReason`, and collect memos only from `expense.memo`.

```ts
if (expense.category === MONTHLY_PNL_HQ_ADJUSTMENT_CATEGORY) {
  bucket.hqAdjustmentAmount += expense.amount;
  if (expense.adjustmentReason) {
    bucket.adjustmentReasons.push(expense.adjustmentReason);
  }
}

if (expense.memo) {
  bucket.memos.push(expense.memo);
}
```

- [ ] **Step 5: Render the actual monthly P&L table**

Create or update a table component that shows:

`지점`, `매출`, `매입원가`, `매출이익`, `이익률`, `인건비`, `월세`, `관리비`, `공과금`, `세금/수수료`, `포장/소모품`, `배송/운반`, `수선/유지보수`, `기타비용`, `본사조정`, `남은금액`, `조정사유`, `메모`.

- [ ] **Step 6: Verify**

Run:

```powershell
pnpm test:unit -- tests/unit/monthly-profit-loss.test.mjs
pnpm typecheck
```

Expected: tests pass and typecheck exits 0.

## Task 2: xlsx 확정 컬럼과 기간 집계 보정

**Files:**

- Modify: `src/app/api/reports/export/route.ts`
- Modify: `src/features/reports/export.ts`
- Modify: `src/features/reports/queries.ts`
- Test: `tests/api/report-export.spec.ts`
- Test: `tests/unit/monthly-profit-loss.test.mjs`

- [ ] **Step 1: Write failing export contract tests**

Check that the monthly xlsx bundle has these sheets and columns:

- `요약`
- `기간조회_RAW`
- `월별손익`
- `재고현황`
- `품목매출`

The `품목매출` sheet must include:

`조회 시작일`, `조회 종료일`, `지점`, `품목명`, `규격`, `품목구분`, `냉동/생물`, `추정판매수량`, `추정매출`, `추정매입원가`, `추정매출이익`, `추정이익률`, `손실수량`, `손실금액`, `재고수량`.

Run:

```powershell
pnpm test:api -- tests/api/report-export.spec.ts
```

Expected: FAIL until the export columns and source query are corrected.

- [ ] **Step 2: Replace last-day 대표값 with period aggregation**

In `src/app/api/reports/export/route.ts`, remove the monthly `품목매출` dependency on `getHqDailyMeetingReport({ dateQuery: endDate })`. Use a period product-sales query that accepts `startDate`, `endDate`, `storeId`, `product`, `spec`, and `category`.

- [ ] **Step 3: Align export columns**

In `src/features/reports/export.ts`, define sheet builders with the confirmed Korean labels from `implementation-work-order-2026-06-27.md`.

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm test:api -- tests/api/report-export.spec.ts
pnpm test:unit -- tests/unit/monthly-profit-loss.test.mjs
```

Expected: both commands pass.

## Task 3: 리포트 필터와 재고 집계 뷰 보강

**Files:**

- Modify: `src/app/app/reports/comparison/page.tsx`
- Modify: `src/app/app/reports/product-review/page.tsx`
- Modify: `src/app/app/reports/sales-review/page.tsx`
- Modify: `src/app/app/reports/inventory/page.tsx`
- Modify: `src/features/reports/inventory-position-types.ts`
- Modify: `src/features/reports/inventory-position-queries.ts`
- Test: `tests/unit/hq-reports.test.mjs`
- Test: `tests/e2e/hq-reports.spec.ts`

- [ ] **Step 1: Add filter contract tests**

Write tests that prove report pages preserve these query params:

```txt
startDate
endDate
storeId
product
spec
category
```

For inventory, also assert the page has separate sections for:

```txt
전체 요약
지점별 집계
품목별 집계
상세 행
```

- [ ] **Step 2: Extend query parsing**

Each report page should parse product, spec, and category from `searchParams`, pass them to its query function, and keep them when links/forms submit.

- [ ] **Step 3: Add inventory aggregate types**

In `src/features/reports/inventory-position-types.ts`, add:

```ts
export type InventoryPositionStoreAggregate = {
  storeId: string;
  storeName: string;
  productCount: number;
  totalQuantity: number;
  totalAmount: number;
};

export type InventoryPositionProductAggregate = {
  productId: string | null;
  productName: string;
  productSpec: string;
  productCategory: string;
  storeCount: number;
  totalQuantity: number;
  totalAmount: number;
};
```

- [ ] **Step 4: Build aggregates from existing rows**

In `src/features/reports/inventory-position-queries.ts`, aggregate from the existing `rows` result so the first implementation does not add another DB query.

- [ ] **Step 5: Verify**

Run:

```powershell
pnpm test:unit -- tests/unit/hq-reports.test.mjs
pnpm test:e2e:core:hq
```

Expected: report filters and inventory aggregate UI pass.

## Final Verification

Run:

```powershell
pnpm test:unit
pnpm test:api -- tests/api/report-export.spec.ts
pnpm typecheck
pnpm lint
```

Expected: all commands exit 0.

## Notes

- `품목묭도`/`모두 적용`은 다시 만들지 않는다.
- 본사 홈 마진율 반전 표시는 다시 만들지 않는다.
- 지점장 인건비 UX는 유지된 누락 항목이지만 이 문서 범위가 아니다.
