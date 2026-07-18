# rev 2·3 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 검토에서 확인된 결제 문구, 대시보드 클리핑, 리포트 반응형·접근성, 표시 조건과 검증 기록 문제를 기존 계산·DB 정책 변경 없이 보완한다.

**Architecture:** 기존 서버 metric과 Recharts `chartData`를 단일 데이터 원천으로 유지한다. UI는 기존 shadcn 컴포넌트와 semantic token만 사용하고, 좁은 화면에서는 차트 영역만 스크롤되게 한다. 새 공용 추상화나 의존성은 추가하지 않는다.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Recharts 3.8, Node test runner, Playwright.

---

## 변경 파일 지도

| 책임                  | 파일                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 결제·지출 검토 문구   | `src/features/ledger/review-queries.ts`                                                                                                                                                                             |
| 지출 합계 통화 표시   | `src/features/ledger/components/sales-payment-step-client.tsx`                                                                                                                                                      |
| 대시보드 마진 줄바꿈  | `src/features/dashboard/components/hq-dashboard-table.tsx`                                                                                                                                                          |
| 차트 반응형·접근성    | `src/features/reports/components/store-daily-performance-chart.tsx`                                                                                                                                                 |
| 품목 요약·검색 표제   | `src/features/reports/components/product-profitability-report.tsx`                                                                                                                                                  |
| 운영 데이터 검증 기록 | `docs/rev/2026-07-17_rev2_rev3_운영데이터_검증기록.md`                                                                                                                                                              |
| 회귀 테스트           | `tests/unit/ledger-review.test.mjs`, `tests/unit/hq-dashboard.test.mjs`, `tests/unit/hq-reports.test.mjs`, `tests/e2e/store-ledger-sales.spec.ts`, `tests/e2e/hq-dashboard.spec.ts`, `tests/e2e/hq-reports.spec.ts` |

## Task 1: 결제·지출 의미와 통화 표시 통일

> **폐기됨(2026-07-18):** 아래 `결제·지출 합계 불일치` 문구 지시는 후속 확정 정책으로 대체됐다. 현재 문구는 `마감 정산 불일치`, 공식 설명은 `총매출과 현금·카드·기타·지출 합계`를 사용한다. 서버 내부 `paymentDifferenceAmount`는 유지하되 지점장 DTO와 응답에서는 key 자체를 제거한다. 이 Task의 과거 문구를 다시 구현하지 않는다.

**Files:**

- Modify: `tests/unit/ledger-review.test.mjs`
- Modify: `tests/e2e/store-ledger-sales.spec.ts`
- Modify: `src/features/ledger/review-queries.ts:84-90,367-385`
- Modify: `src/features/ledger/components/sales-payment-step-client.tsx:414-424`

- [ ] **Step 1: 새 문구와 원 단위 표시를 기대하는 실패 테스트 작성**

`tests/unit/ledger-review.test.mjs`의 source 계약에 다음 기대를 추가한다.

```js
assert.match(querySource, /결제·지출 합계 불일치/);
assert.match(querySource, /총매출과 결제 합계 \+ 지출 합계가 다릅니다/);
assert.match(querySource, /총매출, 결제 합계, 지출 합계를 확인했습니다/);
assert.match(querySource, /총매출 - 결제 합계 - 지출 합계/);
```

`tests/e2e/store-ledger-sales.spec.ts`의 지출 합계 assertion은 다음 값을 기대한다.

```ts
await expect(page.getByLabel("4단계 지출 합계")).toHaveValue("2,000원");
```

- [ ] **Step 2: 변경 전 테스트가 실패하는지 확인**

Run:

```powershell
pnpm test:unit:file tests/unit/ledger-review.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-sales.spec.ts --grep "매출/결제 금액"
```

Expected: 기존 문구와 `2,000` 표시 때문에 FAIL.

- [ ] **Step 3: 문구와 통화 표시를 최소 수정**

`review-queries.ts`에서 경고·정상 설명·metric 라벨을 다음으로 바꾼다.

```ts
label: "결제·지출 합계 불일치",
detail:
  "총매출과 결제 합계 + 지출 합계가 다릅니다. 제출을 막지는 않습니다.",

savedDetail: "총매출, 결제 합계, 지출 합계를 확인했습니다.",

"총매출 - 결제 합계 - 지출 합계",
```

`sales-payment-step-client.tsx`의 읽기 전용 input은 기존 formatter를 재사용한다.

```tsx
<Input
  id="expense-total"
  value={formatKrw(ledger.expenseTotal)}
  readOnly
  aria-readonly="true"
  className="min-h-11 tabular-nums"
/>
```

- [ ] **Step 4: 집중 테스트 통과 확인**

Run: Step 2의 두 명령.

Expected: 실패 0개.

- [ ] **Step 5: 커밋**

```powershell
git add src/features/ledger/review-queries.ts src/features/ledger/components/sales-payment-step-client.tsx tests/unit/ledger-review.test.mjs tests/e2e/store-ledger-sales.spec.ts
git commit -m "fix: align payment review with expenses"
```

## Task 2: 대시보드 마진 셀 클리핑 제거

**Files:**

- Modify: `tests/unit/hq-dashboard.test.mjs`
- Modify: `tests/e2e/hq-dashboard.spec.ts`
- Modify: `src/features/dashboard/components/hq-dashboard-table.tsx:623-635,779-794`

- [ ] **Step 1: 마진 셀 줄바꿈 계약과 실제 클리핑 검사를 추가**

단위 source 테스트에 마진 열 예외를 고정한다.

```js
assert.match(
  table,
  /columnId === "signals" \|\| columnId === "grossMarginRate"/,
);
assert.doesNotMatch(table, /shortfallAmountLabel[\s\S]*whitespace-nowrap/);
```

`hq-dashboard.spec.ts`의 마진 테스트에 셀 크기 검사를 추가한다.

```ts
const marginCell = row.getByTestId(`hq-dashboard-margin-${storeId}`);
await expect
  .poll(() =>
    marginCell.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  )
  .toBe(true);
```

- [ ] **Step 2: 변경 전 테스트가 실패하는지 확인**

Run:

```powershell
pnpm test:unit:file tests/unit/hq-dashboard.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/hq-dashboard.spec.ts --grep "마진은 실제"
```

Expected: 마진 열 예외와 test id가 없어 FAIL.

- [ ] **Step 3: 마진 셀만 줄바꿈 허용**

데스크톱 마진 `TableCell`에 안정적인 테스트 id를 추가한다.

```tsx
<TableCell
  data-testid={`hq-dashboard-margin-${row.storeId}`}
  className={getColumnCellClassName("grossMarginRate")}
>
  <MarginCell row={row} />
</TableCell>
```

공통 셀 함수는 신호·마진 열만 줄바꿈한다.

```ts
const wraps = columnId === "signals" || columnId === "grossMarginRate";

return cn(
  "min-w-0 align-top",
  wraps ? "whitespace-normal break-words" : "overflow-hidden text-ellipsis",
  columnId === "store" && "font-medium",
  getColumnConfigClassName(column),
);
```

미달 금액 span의 `whitespace-nowrap`은 제거한다.

- [ ] **Step 4: 집중 테스트 통과 확인**

Run: Step 2의 두 명령.

Expected: 실패 0개, margin cell `scrollWidth <= clientWidth + 1`.

- [ ] **Step 5: 커밋**

```powershell
git add src/features/dashboard/components/hq-dashboard-table.tsx tests/unit/hq-dashboard.test.mjs tests/e2e/hq-dashboard.spec.ts
git commit -m "fix: keep dashboard margin details visible"
```

## Task 3: 리포트 차트 반응형·접근성과 품목 표시 조건 보완

**Files:**

- Modify: `tests/unit/hq-reports.test.mjs`
- Modify: `tests/e2e/hq-reports.spec.ts`
- Modify: `src/features/reports/components/store-daily-performance-chart.tsx:87-259`
- Modify: `src/features/reports/components/product-profitability-report.tsx:87-270`

- [ ] **Step 1: 실패하는 source·E2E 계약 추가**

단위 테스트는 다음 계약을 확인한다.

```js
assert.match(componentSource, /\{showChart \? \(/);
assert.match(chartSource, /title="지점별 장부 입력 매출·마진율"/);
assert.match(chartSource, /desc="막대는 장부 입력 매출/);
assert.match(chartSource, /<table className="sr-only"/);
assert.match(chartSource, /data-testid="store-performance-chart-scroll"/);
```

일별 차트 E2E에 390px 유효 폭과 동등 데이터 검사를 추가한다.

```ts
await page.setViewportSize({ width: 390, height: 844 });
const scroller = section.getByTestId("store-performance-chart-scroll");
await expect(scroller).toBeVisible();
expect(
  await scroller.evaluate(
    (element) => element.scrollWidth > element.clientWidth,
  ),
).toBe(true);

const bar = section.getByTestId(`store-performance-bar-${STORE_IDS.closed}`);
expect((await bar.boundingBox())?.width ?? 0).toBeGreaterThan(80);
await expect(
  section.getByRole("table", { name: "지점별 매출과 마진 데이터" }),
).toContainText("실제");
await expect(
  section.getByRole("table", { name: "지점별 매출과 마진 데이터" }),
).toContainText("예상");
```

품목 검토 E2E는 표 보기에서 요약이 사라지고 판매순위 표제가 보이는지 확인한다.

```ts
await profitabilitySection.getByRole("button", { name: "표 보기" }).click();
await expect(profitabilitySection.getByText("추정 판매액 합계")).toHaveCount(0);

await expect(page.getByText("판매수량 상위 10개")).toBeVisible();
await expect(page.getByLabel("품목 검색")).toHaveAttribute("type", "search");
```

- [ ] **Step 2: 변경 전 테스트가 실패하는지 확인**

Run:

```powershell
pnpm test:unit:file tests/unit/hq-reports.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/hq-reports.spec.ts --grep "지점별 장부 매출|품목 판매순위|품목 검토 페이지"
```

Expected: 접근성 표, 로컬 스크롤, `showChart` 조건, 표제가 없어 FAIL.

- [ ] **Step 3: 차트 최소 폭과 접근성 설명 추가**

차트 부분만 로컬 스크롤되게 한다.

```tsx
<div
  data-testid="store-performance-chart-scroll"
  className="w-full overflow-x-auto"
>
  <ChartContainer
    config={chartConfig}
    className="min-w-[560px]"
    style={{ height: chartHeight }}
  >
    <BarChart
      accessibilityLayer
      title="지점별 장부 입력 매출·마진율"
      desc="막대는 장부 입력 매출이며 실제 마진, 예상 마진과 1.5%p 이상 차이를 함께 표시합니다."
      data={chartData}
      layout="vertical"
      maxBarSize={36}
      margin={{ top: 4, right: 190, left: 4, bottom: 4 }}
    >
  </ChartContainer>
</div>
```

위 여는 태그 안으로 현재 `CartesianGrid`, `XAxis`, `YAxis`, `ChartTooltip`, `Bar` 자식 노드를 그대로 이동하고 기존 `</BarChart>`를 `</ChartContainer>` 앞에 둔다.

같은 `chartData`로 스크린리더 전용 표를 추가한다.

```tsx
function formatActualMargin(value: number | null) {
  return value === null ? "데이터 부족" : actualPercentFormatter.format(value);
}

function formatExpectedMargin(value: number | null) {
  return value === null
    ? "데이터 부족"
    : expectedPercentFormatter.format(value);
}

<table className="sr-only" aria-label="지점별 매출과 마진 데이터">
  <thead>
    <tr>
      <th>지점</th>
      <th>매출액</th>
      <th>실제 마진</th>
      <th>예상 마진</th>
      <th>마진 차이 경고</th>
    </tr>
  </thead>
  <tbody>
    {chartData.map((row) => (
      <tr key={row.storeId}>
        <td>{row.storeName}</td>
        <td>{krwFormatter.format(row.salesAmount)}</td>
        <td>{formatActualMargin(row.grossMarginRate)}</td>
        <td>{formatExpectedMargin(row.expectedGrossMarginRate)}</td>
        <td>
          {hasSignificantGrossMarginGap(
            row.grossMarginRate,
            row.expectedGrossMarginRate,
          )
            ? "1.5%p 이상"
            : "기준 이내"}
        </td>
      </tr>
    ))}
  </tbody>
</table>;
```

현재 `formatMarginComparison()`의 실제·예상 formatter를 작은 함수로 재사용하고 새 계산은 추가하지 않는다.

- [ ] **Step 4: 품목 요약과 검색 헤더 최소 수정**

조건만 다음처럼 교체하고 `dl` 내부 네 항목은 변경하지 않는다.

```diff
-      {tableVariant === "profitability" ? (
+      {showChart ? (
```

검색 영역은 다음 구조로 바꾼다.

```tsx
<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
  <p className="text-sm font-medium">판매수량 상위 10개</p>
  <Field className="w-full sm:max-w-xs">
    <FieldLabel htmlFor="product-search">품목 검색</FieldLabel>
    <Input
      id="product-search"
      type="search"
      value={searchQuery}
      placeholder="품목명 또는 규격 검색"
      onChange={(event) => setSearchQuery(event.currentTarget.value)}
    />
  </Field>
</div>
```

- [ ] **Step 5: 집중 테스트 통과 확인**

Run: Step 2의 두 명령.

Expected: 실패 0개, 390px에서 로컬 스크롤과 80px 초과 막대 폭 확인.

- [ ] **Step 6: 커밋**

```powershell
git add src/features/reports/components/store-daily-performance-chart.tsx src/features/reports/components/product-profitability-report.tsx tests/unit/hq-reports.test.mjs tests/e2e/hq-reports.spec.ts
git commit -m "fix: harden report charts and rankings"
```

## Task 4: 운영 데이터 검증 기록과 전체 회귀 확인

**Files:**

- Create: `docs/rev/2026-07-17_rev2_rev3_운영데이터_검증기록.md`
- Format: `tests/unit/ledger-purchase.test.mjs`
- Format: `tests/unit/ledger-validation.test.mjs`
- Verify only: all changed production and test files

- [ ] **Step 1: 연결 대상을 노출하지 않고 읽기 전용 조회**

현재 `DATABASE_URL`이 가리키는 DB 이름·host를 먼저 확인하되 비밀번호와 전체 URL은 출력하지 않는다. 대상이 운영 DB인지 확인된 경우에만 작업지시서 Task 2의 세 SELECT와 직전 장부 조회를 실행한다. `INSERT`, `UPDATE`, `DELETE`, migration은 실행하지 않는다.

확인할 값:

```text
지점 ID/이름
장부 ID/영업일
참소라/중 product ID와 중복 active ID 수
당일 매입 product ID/수량
당일 저장 재고 product ID/currentQuantity/quantity/carryoverSource/carryoverStatus
직전 장부 재고 product ID/currentQuantity/quantity
2026-07 월초 스냅샷 product ID/quantity
```

- [ ] **Step 2: 검증 기록 작성**

`docs/rev/2026-07-17_rev2_rev3_운영데이터_검증기록.md`에 실행 시각(KST), read-only 여부, 위 값을 표로 남기고 다음 판정을 기록한다.

```text
동일 productId의 당일 매입이 재고 근거를 제공하므로 현재 손실 저장 검증을 우회하지 않는다.
고객 데이터 수정 없음.
```

운영 DB 연결을 확인할 수 없으면 추정값을 쓰지 말고 `운영 DB 재조회 미실행`과 이유만 기록한다.

- [ ] **Step 3: 변경된 테스트 두 파일만 Prettier 적용**

```powershell
pnpm exec prettier --write tests/unit/ledger-purchase.test.mjs tests/unit/ledger-validation.test.mjs
```

- [ ] **Step 4: 정적·단위 검증**

```powershell
pnpm typecheck
pnpm lint
pnpm test:unit
$changedFiles = @(git diff --name-only 184eded..HEAD -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.md'); & pnpm exec prettier --check @changedFiles
git diff --check
```

Expected: TypeScript·ESLint·Prettier·whitespace 실패 0개, 단위 테스트 567개 이상 모두 PASS.

- [ ] **Step 5: 관련 E2E 전체 검증**

```powershell
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-purchase.spec.ts tests/e2e/store-ledger-inventory.spec.ts tests/e2e/store-ledger-inventory-adjustment.spec.ts tests/e2e/store-ledger-losses.spec.ts tests/e2e/store-ledger-sales.spec.ts tests/e2e/store-ledger-review.spec.ts
node scripts/run-playwright-clean.mjs tests/e2e/hq-dashboard.spec.ts tests/e2e/hq-reports.spec.ts
```

Expected: 실패 0개.

- [ ] **Step 6: 금지 범위와 작업 트리 확인**

```powershell
git diff --exit-code 184eded..HEAD -- prisma/schema.prisma prisma/migrations package.json pnpm-lock.yaml
git status --short
```

Expected: Prisma·migration·dependency 변경 없음. 커밋 전에는 Task 4 문서·포맷 변경만 표시.

- [ ] **Step 7: 커밋**

```powershell
git add docs/rev/2026-07-17_rev2_rev3_운영데이터_검증기록.md tests/unit/ledger-purchase.test.mjs tests/unit/ledger-validation.test.mjs
git commit -m "docs: record rev2 rev3 verification evidence"
```

- [ ] **Step 8: 최종 상태 확인**

```powershell
git status --short --branch
git log --oneline -6
```

Expected: 작업 트리 clean, 보완 커밋 4개가 `184eded` 뒤에 존재.
