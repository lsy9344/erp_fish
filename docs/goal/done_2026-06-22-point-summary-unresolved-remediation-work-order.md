# Point Summary Unresolved Remediation Work Order

> **Status:** ready-for-dev
> **Source:** `docs/meeting/point_summary.md` 해결 여부 재검토 결과
> **작성일:** 2026-06-22

## Goal

`docs/meeting/point_summary.md`의 미팅 요구사항 중 아직 완전히 해결되지 않은 항목을 제품 기능과 배포 가능한 DB 상태까지 맞춘다.

이번 작업은 새 요구를 확장하는 작업이 아니다. 이미 일부 구현된 2026-06-22 작업 흔적을 정리하고, 미완료 상태인 기능을 실제 동작, 테스트, 마이그레이션까지 닫는 것이 목적이다.

## Architecture

기존 구조를 유지한다. 화면은 Next.js App Router(`src/app`), 기능 로직은 `src/features`, 계산은 `src/server/calculations`, DB 모델과 배포 변경은 `prisma/schema.prisma` 및 `prisma/migrations`에 둔다.

지점장 화면은 낮은 정보량 운영 화면으로 유지한다. 본사만 단가, FIFO 근거, 장기 리포트, 알림 설정, 직원 통합 집계를 본다.

## Tech Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Prisma 6
- PostgreSQL-compatible schema
- Node test runner unit tests
- Playwright API/E2E tests
- Recharts

## Out of Scope

- 지점장이 매출 차액, 원가, 영업이익, 인당 생산성, FIFO 원가 상세를 보는 기능은 만들지 않는다.
- 품목별 실제 POS 매출 입력 모델은 이번 작업에서 만들지 않는다. 냉동/생물 차트는 현재 재고 흐름 기반 추정값으로 표시하고 `추정` 라벨을 반드시 붙인다.
- 유지보수 비용, 서버비, 긴급 대응 범위는 제품 코드가 아니라 계약/운영 문서 범위다. 이번 작업에서는 배포 문서 링크 또는 주석 수준으로만 정리한다.

## Current Findings

### 1. 재고 오차 허용 범위가 아직 0이 아니다

현재 `inventoryDifferenceQuantity` 기준값 이하이면 재고 이상 신호가 발생하지 않는다.

근거:

- `src/server/calculations/anomaly.ts`에서 `Math.abs(largestAdjustment.differenceQuantity) <= thresholds.inventoryDifferenceQuantity`이면 빈 배열을 반환한다.
- `src/features/dashboard/components/anomaly-threshold-settings-client.tsx`가 `재고 차이 기준` 입력값을 화면에 노출한다.
- `tests/e2e/anomaly-thresholds.spec.ts`는 `inventoryDifferenceQuantity: 7` 저장을 기대한다.

### 2. FIFO 이력은 화면만 있고 자동 갱신 흐름이 없다

`refreshLedgerInventoryFifoLots()`는 정의되어 있지만 호출처가 없다. 따라서 매입/손실/재고 저장 후 FIFO lot snapshot과 `inventoryAmount`가 자동으로 최신화된다는 보장이 없다.

근거:

- `src/features/inventory/fifo-lots.ts`에 `refreshLedgerInventoryFifoLots()`가 있다.
- `rg "refreshLedgerInventoryFifoLots\\(" src tests` 결과 호출처가 함수 선언뿐이다.
- `src/features/inventory/queries.ts`는 이미 저장된 lot만 읽어 화면에 붙인다.

### 3. 냉동/생물 차트는 컴포넌트만 있고 리포트에 연결되지 않았다

`ProductCategoryPerformance` 타입과 `ProductCategoryMarginChart` 컴포넌트는 있지만, 쿼리와 페이지에서 사용되지 않는다.

근거:

- `src/features/reports/types.ts`에 `ProductCategoryPerformance` 타입이 있다.
- `src/features/reports/components/product-category-margin-chart.tsx`가 존재한다.
- `rg "ProductCategoryMarginChart" src/app src/features` 결과 컴포넌트 파일 외 사용처가 없다.

### 4. 지점장 검토 화면에 주요 판매 품목 리스트가 없다

현재 품목 상위/하위 리스트는 본사 월간 리포트의 추정 매출 순위다. 지점장 당일 검토 화면에는 `가장 많이 판매된 주요 품목` 영역이 없다.

근거:

- `src/features/reports/components/monthly-closing-anomaly-report.tsx`에는 `매출 상위5 / 하위5 품목 (추정)`이 있다.
- `src/features/ledger/components/review-summary-client.tsx`에는 지점장용 주요 판매 품목 영역이 없다.

### 5. HR 순환 근무 통합은 모델 일부만 있고 업무 흐름이 닫히지 않았다

`Employee` 모델과 `getEmployeeMonthlyPayroll()`는 있지만, 장부 급여 입력 화면은 `employeeId`를 저장하지 않는다. 직원별 월간 롤업은 실제 데이터가 연결되지 않는다.

근거:

- `prisma/schema.prisma`에는 `LedgerLaborItem.employeeId`와 `Employee`가 있다.
- `src/features/labor/employees-queries.ts`는 `employeeId: { not: null }`인 급여 행만 집계한다.
- `src/features/ledger/components/workstep-client.tsx`의 급여 저장 payload에는 `employeeId`가 없다.

### 6. Prisma schema와 마이그레이션이 불일치한다

`schema.prisma`에는 `Employee`, `LedgerLaborItem.employeeId`, `NotificationDeliveryLog`가 있지만, 대응 마이그레이션 파일이 없다.

확인 명령:

```powershell
rg -n "Employee|employeeId|NotificationDeliveryLog|notification" prisma\migrations -g migration.sql
```

현재 결과: 일치 항목 없음.

### 7. LINE 알림은 route만 있고 핵심 데이터와 테스트가 부족하다

LINE 전송 route, env, client는 있지만 장기 체화 재고는 빈 배열이고, 알림 API 테스트가 없다. 매일 오전 8시 스케줄도 문서/설정에 고정되어 있지 않다.

근거:

- `src/features/notifications/morning-summary.ts`가 `longTermStagnantProducts: []`를 반환한다.
- `src/app/api/internal/notifications/morning-summary/route.ts`는 `INTERNAL_CRON_SECRET` 인증과 LINE 전송을 수행한다.
- `tests/unit/morning-summary-notification.test.mjs`와 `tests/api/morning-summary-notification.spec.ts`가 없다.

### 8. 대시보드 가변성은 테이블 컬럼 리사이즈만 해결됐다

대시보드 테이블 컬럼 리사이즈는 있다. 하지만 미팅 요구의 `모든 대시보드 컴포넌트 크기 조절`은 요약 카드와 주요 섹션까지 포함한다.

근거:

- `src/features/dashboard/components/hq-dashboard-table.tsx`에는 컬럼 리사이저가 있다.
- `src/app/app/dashboard/page.tsx`의 요약 카드는 `lg:grid-cols-5` 고정 그리드다.

### 9. 현재 검증에서 `ledger-purchase` 단위 테스트 1개가 실패한다

실행 명령:

```powershell
pnpm test:unit:file tests/unit/ledger-purchase.test.mjs
```

현재 실패:

- `tests/unit/ledger-purchase.test.mjs:439`
- 테스트가 HQ 매입 수정 경로에서도 `getStoreEcountPurchaseEditErrors` 사용을 기대한다.
- 현재 제품 요구는 본사 `ECOUNT_UPLOAD` 오버라이트 허용이므로, 테스트 기대를 새 정책에 맞게 바꿔야 한다.

## Required Changes

### Task 1. 재고 불일치 기준을 0으로 고정

**Files:**

- Modify: `src/server/calculations/anomaly.ts`
- Modify: `src/features/dashboard/threshold-schemas.ts`
- Modify: `src/features/dashboard/threshold-queries.ts`
- Modify: `src/features/dashboard/threshold-actions.ts`
- Modify: `src/features/dashboard/components/anomaly-threshold-settings-client.tsx`
- Modify: `tests/unit/anomaly-thresholds.test.mjs`
- Modify: `tests/e2e/anomaly-thresholds.spec.ts`
- Modify: `tests/unit/hq-dashboard.test.mjs`

**Steps:**

- [ ] Remove `inventoryDifferenceQuantity` from the editable threshold form schema.
- [ ] Keep DB column temporarily for backward compatibility, but always normalize it to `0` in server calculation inputs.
- [ ] Change inventory signal logic so any non-zero `differenceQuantity` produces a `critical` signal.
- [ ] Remove `재고 차이 기준` from the settings screen.
- [ ] Update E2E tests so saving anomaly settings only controls margin rate and active status.
- [ ] Add a unit test proving `differenceQuantity = 1` creates `inventory-difference-exceeded`.

**Implementation detail:**

In `src/server/calculations/anomaly.ts`, replace the threshold comparison:

```ts
if (!largestAdjustment || largestAdjustment.differenceQuantity === 0) {
  return [];
}
```

Use this detail text:

```ts
detail: `${largestAdjustment.productName} 재고 차이 ${formatQuantity(
  Math.abs(largestAdjustment.differenceQuantity),
)}, 차이금액 ${formatKrw(
  Math.abs(largestAdjustment.differenceAmount),
)}, 사유 ${largestAdjustment.reason}`,
```

**Verification:**

```powershell
pnpm test:unit:file tests/unit/anomaly-thresholds.test.mjs tests/unit/hq-dashboard.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/anomaly-thresholds.spec.ts tests/e2e/hq-dashboard.spec.ts
```

Expected:

- `재고 차이 기준` 입력이 사라진다.
- 재고 차이 1개도 이상 신호가 된다.
- 기존 마진률 기준 설정은 계속 동작한다.

### Task 2. FIFO lot snapshot을 저장 흐름에 연결

**Files:**

- Modify: `src/features/ledger/actions.ts`
- Modify: `src/features/ledger/hq-edit-actions.ts`
- Modify: `src/features/ledger/ecount-purchase-actions.ts`
- Modify: `src/features/losses/actions.ts`
- Modify: `src/features/losses/hq-edit-actions.ts`
- Modify: `src/features/inventory/actions.ts`
- Modify: `src/features/inventory/hq-edit-actions.ts`
- Modify: `tests/unit/ledger-inventory.test.mjs`
- Modify: `tests/unit/ledger-purchase.test.mjs`
- Modify: `tests/unit/ledger-losses.test.mjs`
- Modify: `tests/unit/ecount-ledger-purchase-actions.test.mjs`

**Steps:**

- [ ] Import `refreshLedgerInventoryFifoLots` in each server action that changes purchase, loss, or inventory closing quantity.
- [ ] After purchase/loss/inventory rows are saved and after adjustment reconciliation, call `refreshLedgerInventoryFifoLots(tx, ledgerId)`.
- [ ] Keep the call inside the existing transaction.
- [ ] For ECOUNT commit, call both `syncLedgerInventoryPurchasedQuantitiesInTx` and `refreshLedgerInventoryFifoLots`.
- [ ] Add tests that scan each save action for `refreshLedgerInventoryFifoLots`.
- [ ] Add a calculation test proving oldest lot is consumed first after purchase and loss changes.

**Implementation detail:**

Use this order in purchase save paths:

```ts
await syncLedgerInventoryPurchasedQuantitiesInTx(tx, ledgerId, actor.user.id);
await reconcileLedgerInventoryAdjustments(tx, ledgerId, actor.user.id);
await refreshLedgerInventoryFifoLots(tx, ledgerId);
```

Use this order in ECOUNT commit:

```ts
await syncLedgerInventoryPurchasedQuantitiesInTx(tx, ledgerId, user.id);
await refreshLedgerInventoryFifoLots(tx, ledgerId);
```

**Verification:**

```powershell
pnpm test:unit:file tests/unit/ledger-inventory.test.mjs tests/unit/ledger-purchase.test.mjs tests/unit/ledger-losses.test.mjs tests/unit/ecount-ledger-purchase-actions.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-inventory.spec.ts tests/e2e/hq-ledger-edit.spec.ts
```

Expected:

- FIFO lot rows are regenerated after purchase/loss/inventory changes.
- Inventory amount reflects FIFO remaining lots.
- Existing store-manager sensitive response tests still pass.

### Task 3. 냉동/생물 매출·마진 차트를 실제 리포트에 연결

**Files:**

- Modify: `src/features/reports/types.ts`
- Modify: `src/features/reports/queries.ts`
- Modify: `src/app/app/reports/daily/page.tsx`
- Modify: `src/app/app/reports/monthly/page.tsx`
- Modify: `src/features/reports/components/product-category-margin-chart.tsx`
- Modify: `tests/unit/hq-reports.test.mjs`
- Modify: `tests/e2e/hq-reports.spec.ts`

**Steps:**

- [ ] Add `categoryPerformance: ProductCategoryPerformance[]` to daily and monthly report data types.
- [ ] Compute category performance from inventory rows using `soldQuantity = previousQuantity + purchasedQuantity - currentQuantity`.
- [ ] Use `salesAmount = soldQuantity * unitPrice`.
- [ ] Use `grossMarginRate = null` until category-level true COGS is reliable.
- [ ] Set `statusLabel: "추정"` for category rows created from inventory flow.
- [ ] Render `ProductCategoryMarginChart` on daily and monthly report pages.
- [ ] Show a short note: `품목별 POS 매출이 없어 재고 흐름 기반 추정값입니다.`

**Implementation detail:**

Add a helper in `src/features/reports/queries.ts`:

```ts
function buildProductCategoryPerformance(
  ledgers: Array<{
    ledgerInventoryItems: Array<{
      productCategory: string;
      previousQuantity: number;
      purchasedQuantity: number;
      currentQuantity: number | null;
      unitPrice: number;
    }>;
  }>,
): ProductCategoryPerformance[] {
  const byCategory = new Map<"냉동" | "생물" | "기타", number>();

  for (const ledger of ledgers) {
    for (const item of ledger.ledgerInventoryItems) {
      if (item.currentQuantity === null) continue;

      const category =
        item.productCategory === "냉동" || item.productCategory === "생물"
          ? item.productCategory
          : "기타";
      const soldQuantity =
        item.previousQuantity + item.purchasedQuantity - item.currentQuantity;

      if (!Number.isFinite(soldQuantity) || soldQuantity <= 0) continue;

      byCategory.set(
        category,
        (byCategory.get(category) ?? 0) + soldQuantity * item.unitPrice,
      );
    }
  }

  return (["냉동", "생물"] as const).map((category) => ({
    category,
    salesAmount: byCategory.get(category) ?? 0,
    grossMarginRate: null,
    statusLabel: "추정",
  }));
}
```

**Verification:**

```powershell
pnpm test:unit:file tests/unit/hq-reports.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/hq-reports.spec.ts
```

Expected:

- Daily report and monthly report show 냉동/생물 chart.
- Chart text clearly says `추정`.
- No report claims category margin is 확정 when it is not.

### Task 4. 지점장 검토 화면에 당일 주요 판매 품목 추가

**Files:**

- Modify: `src/features/ledger/review-types.ts`
- Modify: `src/features/ledger/review-queries.ts`
- Modify: `src/features/ledger/response-shaping.ts`
- Modify: `src/features/ledger/components/review-summary-client.tsx`
- Modify: `tests/unit/ledger-review.test.mjs`
- Modify: `tests/unit/sensitive-response-shaping.test.mjs`
- Modify: `tests/e2e/store-ledger-review.spec.ts`

**Steps:**

- [ ] Add a safe `topSoldItems` field to store-manager review data.
- [ ] Derive sold quantity from inventory flow only.
- [ ] Expose only product name, sold quantity, and estimated sales amount.
- [ ] Do not expose unit price or FIFO lot detail in this summary.
- [ ] Render a compact card titled `오늘 많이 팔린 품목`.
- [ ] Label estimated sales as `추정 매출`.

**Type contract:**

```ts
export type StoreManagerTopSoldItem = {
  productId: string;
  productName: string;
  soldQuantity: number;
  estimatedSalesAmount: number;
};
```

**Derivation rule:**

```ts
const soldQuantity =
  item.previousQuantity + item.purchasedQuantity - (item.currentQuantity ?? 0);
```

Skip rows where:

```ts
item.currentQuantity === null || soldQuantity <= 0
```

**Verification:**

```powershell
pnpm test:unit:file tests/unit/ledger-review.test.mjs tests/unit/sensitive-response-shaping.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-review.spec.ts
```

Expected:

- Store manager review screen shows top sold items.
- Store manager response does not include `unitPrice`, `salesDifference`, `paymentDifference`, `grossProfit`, or FIFO lot detail in this card.

### Task 5. HR 직원 연결과 월간 급여 롤업 완성

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260622130000_add_employee_payroll_rollup/migration.sql`
- Modify: `src/features/ledger/schemas.ts`
- Modify: `src/features/ledger/types.ts`
- Modify: `src/features/ledger/queries.ts`
- Modify: `src/features/ledger/actions.ts`
- Modify: `src/features/ledger/hq-edit-actions.ts`
- Modify: `src/features/ledger/components/workstep-client.tsx`
- Modify: `src/features/labor/employees-queries.ts`
- Modify: `src/features/labor/components/employee-management-client.tsx`
- Modify: `src/app/app/labor/employees/page.tsx`
- Add: `tests/unit/labor-employees.test.mjs`
- Modify: `tests/unit/ledger-cost-labor.test.mjs`
- Add: `tests/e2e/labor-employees.spec.ts`

**Steps:**

- [ ] Add the missing migration for `Employee`, `LedgerLaborItem.employeeId`, and index/FK.
- [ ] Add `employeeId?: string | null` to ledger labor schema.
- [ ] Load active employee options for the work step.
- [ ] Let HQ or store manager select an employee, while still allowing free-text `workerName`.
- [ ] Save `employeeId` when selected.
- [ ] Render monthly payroll rollup on `src/app/app/labor/employees/page.tsx`.
- [ ] Keep free-text rows visible but exclude them from employee rollup unless `employeeId` is set.

**Migration shape:**

```sql
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hireDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Employee_isActive_idx" ON "Employee"("isActive");

ALTER TABLE "LedgerLaborItem" ADD COLUMN "employeeId" TEXT;
CREATE INDEX "LedgerLaborItem_employeeId_idx" ON "LedgerLaborItem"("employeeId");

ALTER TABLE "LedgerLaborItem"
ADD CONSTRAINT "LedgerLaborItem_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

**Verification:**

```powershell
pnpm db:validate
pnpm test:unit:file tests/unit/labor-employees.test.mjs tests/unit/ledger-cost-labor.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/labor-employees.spec.ts tests/e2e/store-ledger-cost-labor.spec.ts
```

Expected:

- Employee table exists after migration.
- Labor rows can store `employeeId`.
- Monthly employee rollup shows worked store count, worked day count, payroll total, and memo count.
- Existing free-text payroll entry still works.

### Task 6. LINE 오전 요약 알림을 배포 가능한 상태로 완성

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260622131000_add_notification_delivery_log/migration.sql`
- Modify: `.env.example`
- Modify: `src/features/notifications/morning-summary.ts`
- Modify: `src/app/api/internal/notifications/morning-summary/route.ts`
- Add: `tests/unit/morning-summary-notification.test.mjs`
- Add: `tests/api/morning-summary-notification.spec.ts`
- Modify: `docs/production-deployment.md`

**Steps:**

- [ ] Add missing migration for `NotificationDeliveryLog`.
- [ ] Keep `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_MORNING_SUMMARY_RECIPIENT_IDS`, `INTERNAL_CRON_SECRET` in `.env.example`.
- [ ] Compute `longTermStagnantProducts` from inventory rows whose FIFO/source age is 30 days or older.
- [ ] Compute `missingEntryStores` from active stores without submitted ledger for `reportDate`.
- [ ] Compute `belowTargetMarginStores` using active anomaly threshold margin rate.
- [ ] Compute `longTermDeficitStores` using the last 30 days of closed or submitted ledgers.
- [ ] Add API tests for unauthorized request, missing env, successful send, and delivery log creation.
- [ ] Document an 8 AM scheduler example in `docs/production-deployment.md`.

**Migration shape:**

```sql
CREATE TABLE "NotificationDeliveryLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "error" TEXT,
    CONSTRAINT "NotificationDeliveryLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationDeliveryLog_templateKey_sentAt_idx"
ON "NotificationDeliveryLog"("templateKey", "sentAt");

CREATE INDEX "NotificationDeliveryLog_recipientId_sentAt_idx"
ON "NotificationDeliveryLog"("recipientId", "sentAt");
```

**Message sections must remain:**

```text
전날 장기 적자 매장
전날 결산 미입력 지점
한 달 이상 장기 체화 재고
목표 마진율 미달 지점
```

**Verification:**

```powershell
pnpm db:validate
pnpm test:unit:file tests/unit/morning-summary-notification.test.mjs
node scripts/run-playwright-clean.mjs tests/api/morning-summary-notification.spec.ts
```

Expected:

- Missing or wrong `Authorization` returns 401.
- Successful request sends to every configured LINE recipient.
- Delivery status is written to `NotificationDeliveryLog`.
- Payload includes real long-term stagnant inventory rows when data exists.

### Task 7. 대시보드 컴포넌트 가변성 범위 보정

**Files:**

- Modify: `src/app/app/dashboard/page.tsx`
- Modify: `src/features/dashboard/components/hq-dashboard-table.tsx`
- Add: `src/features/dashboard/components/dashboard-layout-controls.tsx`
- Modify: `tests/unit/hq-dashboard.test.mjs`
- Modify: `tests/e2e/hq-dashboard.spec.ts`

**Steps:**

- [ ] Keep existing table column resizing.
- [ ] Add a simple dashboard density control: `기본`, `넓게`, `압축`.
- [ ] Store density in URL query param `density`.
- [ ] Apply density to summary card grid and table container width.
- [ ] Do not implement arbitrary drag-and-drop layout persistence in this pass.
- [ ] Add E2E test that changing density changes dashboard card layout class or container width.

**URL contract:**

```text
/app/dashboard?density=default
/app/dashboard?density=wide
/app/dashboard?density=compact
```

**Verification:**

```powershell
pnpm test:unit:file tests/unit/hq-dashboard.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/hq-dashboard.spec.ts
```

Expected:

- User can change dashboard layout density.
- Existing column resizing still works.
- URL preserves selected density.

### Task 8. ECOUNT/HQ purchase policy tests align with final policy

**Files:**

- Modify: `tests/unit/ledger-purchase.test.mjs`
- Modify: `tests/unit/ledger-purchase-edit-policy.test.mjs`
- Modify: `src/features/ledger/hq-edit-actions.ts`
- Modify: `src/features/ledger/purchase-edit-policy.ts`

**Steps:**

- [ ] Keep `getStoreEcountPurchaseEditErrors` only for store-manager save path.
- [ ] Add a test proving `src/features/ledger/actions.ts` still calls `getStoreEcountPurchaseEditErrors`.
- [ ] Remove the assertion that `src/features/ledger/hq-edit-actions.ts` calls `getStoreEcountPurchaseEditErrors`.
- [ ] Add a test proving HQ purchase save keeps `sourceType: purchase.sourceType` and writes `unitPrice`/`quantity` from the HQ input.
- [ ] Keep audit log assertions for HQ purchase save.

**Verification:**

```powershell
pnpm test:unit:file tests/unit/ledger-purchase.test.mjs tests/unit/ledger-purchase-edit-policy.test.mjs
```

Expected:

- Store manager cannot edit `ECOUNT_UPLOAD`.
- Headquarters can overwrite `ECOUNT_UPLOAD` rows with edit reason.
- `pnpm test:unit:file tests/unit/ledger-purchase.test.mjs` passes.

## Acceptance Criteria

- 재고 차이 1개도 본사 이상 신호로 표시된다.
- 재고 차이 허용 기준 입력은 더 이상 화면에 없다.
- FIFO lot snapshot은 매입, 손실, 재고 저장 후 자동으로 갱신된다.
- 본사 리포트는 냉동/생물 매출 차트를 보여주고 추정값임을 명시한다.
- 지점장 검토 화면은 오늘 많이 팔린 품목을 보여주되 단가/FIFO/차액 민감값은 숨긴다.
- 직원 급여 행은 선택적으로 `employeeId`와 연결되고 월간 직원별 롤업에 반영된다.
- `Employee`, `LedgerLaborItem.employeeId`, `NotificationDeliveryLog`는 schema와 migration이 일치한다.
- LINE 오전 요약은 장기 적자, 결산 미입력, 장기 체화 재고, 목표 마진율 미달을 실제 데이터로 구성한다.
- API route는 `INTERNAL_CRON_SECRET` 없이 호출할 수 없다.
- `ledger-purchase` 단위 테스트 실패가 해소된다.

## Final Verification Commands

```powershell
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:api
pnpm test:e2e:core
git diff --check
```

Expected:

- All commands pass.
- If Playwright cannot start because PostgreSQL or Docker is unavailable, record the exact infrastructure error and rerun after the database is available.

## Implementation Order

1. Fix schema/migration consistency first: Employee and NotificationDeliveryLog migrations.
2. Fix the failing purchase policy test so the baseline is green.
3. Implement zero inventory difference signal.
4. Connect FIFO refresh to write paths.
5. Add store-manager top sold items.
6. Finish HR employee linkage and monthly payroll rollup.
7. Connect frozen/live category report chart.
8. Complete LINE notification payload and tests.
9. Add dashboard density control if time remains.

## Notes for Implementer

- Do not weaken store-manager data hiding while adding top sold items.
- Do not use product-level sales wording as if it were exact. Use `추정` whenever the value comes from inventory flow.
- Do not remove old columns from production DB without a migration plan. First make behavior correct, then schedule cleanup separately if needed.
- Keep changes surgical. Each task should be independently testable and committable.
