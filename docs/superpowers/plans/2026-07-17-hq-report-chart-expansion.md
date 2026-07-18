# HQ Report Chart Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 본사 관리자와 총책임자가 월별 전사 흐름, 지점 순위, 손실 원인, 손익, 마감 상태와 오늘의 조치 대상을 한 화면에서 확인하는 `/app/reports/overview`를 만든다.

**Architecture:** 새 데이터베이스 모델 없이 기존 정정 반영 장부 계산, 월 손익, 일별 이상 신호를 재사용한다. 새 `overview.ts`가 서버 조회와 순수 DTO 조립을 담당하고, 서버 페이지는 권한·필터·내보내기 링크만 준비하며, 하나의 클라이언트 컴포넌트가 같은 DTO를 차트와 표로 표현한다.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma, React 19, Recharts 3.8, 기존 shadcn/ui, Node `node:test`, Playwright

---

## 확정된 최소 범위

- 1차 범위만 구현한다: 매출 추세, 손실 유형 도넛, 지점 순위, 월 손익 워터폴, 월간 마감 상태, 오늘의 조치 목록.
- 조치 목록은 `month`를 사용하지 않고 항상 오늘 기준이며 `storeId`만 적용한다. 제목에 `오늘 기준`을 고정 표시한다.
- 새 `report=overview` export API는 만들지 않는다. 선택 월과 지점이 보존되는 기존 `report=comparison&format=xlsx` 링크를 사용한다.
- 전체 집계 점은 단일 장부 링크가 아니다. 매출 추세는 일별 리포트, 지점 순위는 기간 비교, 손실·손익은 월간 상세로 연결한다.
- Recharts SVG를 억지로 링크로 만들지 않는다. `accessibilityLayer`, 한 문장 요약, 같은 DTO의 표와 인접 상세 링크를 기본 접근 경로로 사용한다.
- 품목별 실제 POS 매출이 없으므로 품목 매출 차트는 추가하지 않는다. 손실 금액은 `판매가 계획 기준`을 항상 표시한다.
- `이익률 급락`과 `손실 증가`는 비교 임계값 정책이 없으므로 새 규칙을 만들지 않는다. 1차 조치 목록은 기존 관제판의 이익률 기준 미달, 손실·재고·정정·마감 신호만 사용하고, 변화 기반 알림은 임계값이 승인된 뒤 추가한다.
- 일부 장부라도 FIFO 매출이익을 계산할 수 없으면 워터폴을 만들지 않는다. 기존 `grossProfit ?? 0` 결과를 overview에서 사용하지 않는다.
- 현재 월의 추세·마감 상태는 오늘까지만 표시한다. 월 손익은 기존 회계 정책대로 달력월에 저장된 본사 지출을 포함하며 화면에 `달력월 손익`이라고 표시한다.
- 2차 후보인 FIFO 재고 노화, 데이터 완성도 히트맵, 재고회전율은 이번 구현에서 제외한다.

## 파일 구조

| 파일                                                     | 책임                                                      |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `src/features/reports/queries.ts`                        | 기존 장부별 정정 반영 요약에 손실 계산 기준 스냅샷을 보존 |
| `src/features/reports/monthly-profit-loss.ts`            | 매출·인건비의 장부 모집단을 검토 대기·본사 마감으로 일치  |
| `src/features/reports/overview.ts`                       | overview 타입, 월·지점 범위 조회, 차트·표 공통 DTO 조립   |
| `src/features/reports/components/hq-report-overview.tsx` | 요약 띠, 5개 차트, 표 보기, 오늘의 조치 목록              |
| `src/app/app/reports/overview/page.tsx`                  | 권한, URL 필터, 본사 셸, 기존 export 링크                 |
| `src/app/app/reports/overview/loading.tsx`               | 최종 레이아웃과 같은 로딩 골격                            |
| `src/components/app-sidebar.tsx`                         | 리포트 기본 진입점을 overview로 변경                      |
| `src/server/revalidation.ts`                             | 장부·정정·기준정보 변경 시 overview 캐시 무효화           |
| `tests/unit/hq-report-overview.test.mjs`                 | 순수 집계와 overview 소스 계약 검증                       |
| `tests/unit/hq-reports.test.mjs`                         | 기존 사이드바 경로 단언 수정                              |
| `tests/unit/monthly-profit-loss.test.mjs`                | 인건비와 매출의 장부 상태 범위 일치 검증                  |
| `tests/unit/revalidation.test.mjs`                       | overview 재검증 경로 포함 여부 검증                       |
| `tests/e2e/hq-reports.spec.ts`                           | 필터, 정정, 권한, 표 보기, 모바일 검증                    |

새 패키지, Prisma migration, export API, 공용 차트 추상화 파일은 추가하지 않는다.

### Task 1: 정정 반영 장부 요약에 손실 계산 기준 보존

**Files:**

- Modify: `src/features/reports/queries.ts:79-135, 1509-1638, 3029-3092`
- Create: `tests/unit/hq-report-overview.test.mjs`

- [ ] **Step 1: 손실 계산 기준이 장부 요약에 남는지 실패 테스트 작성**

`tests/unit/hq-report-overview.test.mjs`를 만들고 Node 기본 테스트 도구만 사용한다.

```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = process.cwd();

function readProjectFile(...segments) {
  const filePath = path.join(root, ...segments);
  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);
  return readFileSync(filePath, "utf8");
}

test("ledger profit summaries retain the saved loss price basis", () => {
  const source = readProjectFile("src", "features", "reports", "queries.ts");

  assert.match(source, /usedPlannedPrice\?:\s*boolean/);
  assert.match(
    source,
    /getLedgerProfitSummariesForRange[\s\S]*usedPlannedPrice:\s*true/,
  );
  assert.match(source, /lossItems:\s*summary\.lossItems/);
  assert.match(source, /hasUnappliedCorrections:/);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run:

```powershell
pnpm test:unit:file tests/unit/hq-report-overview.test.mjs
```

Expected: `usedPlannedPrice` 또는 `lossItems` 단언이 FAIL.

- [ ] **Step 3: 기존 장부 계산 경로에서 메타데이터만 보존**

`ReportLedgerRecord.ledgerLossItems`에 선택 필드를 추가한다. 다른 기존 쿼리가 필드를 선택하지 않아도 되도록 optional로 둔다.

```ts
ledgerLossItems: {
  id: string;
  productId: string;
  productName: string;
  lossTypeName: string;
  quantity: number;
  amount: number;
  usedPlannedPrice?: boolean;
}[];
```

`LedgerProfitSummary`에 overview가 재계산 없이 사용할 필드만 추가한다.

```ts
export type LedgerProfitSummary = {
  ledgerId: string;
  storeId: string;
  closingDate: Date;
  status: DailyLedgerStatus;
  workerCount: number | null;
  totalSales: number | null;
  grossProfit: number | null;
  grossMarginRate: number | null;
  grossMarginReason: string | null;
  lossItems: Array<{
    id?: string;
    lossTypeName: string;
    quantity: number;
    amount: number;
    usedPlannedPrice: boolean;
  }>;
  hasUnappliedCorrections: boolean;
};
```

`getLedgerProfitSummariesForRange()`의 `ledgerLossItems.select`에 다음 한 줄을 추가한다.

```ts
usedPlannedPrice: true,
```

`toReportLedgerCalculationSummary()`에서 정정 후 손실 행에 저장 시점 메타데이터를 다시 붙인다.

```ts
const lossMetadataById = new Map(
  ledger.ledgerLossItems.map((item) => [
    item.id,
    {
      lossTypeName: item.lossTypeName,
      usedPlannedPrice: item.usedPlannedPrice ?? false,
    },
  ]),
);
const correctedLossItems = correctionOverlay.lossItems.map((item) => {
  const metadata = lossMetadataById.get(item.id ?? "");

  return {
    ...item,
    lossTypeName: metadata?.lossTypeName ?? "유형 미지정",
    usedPlannedPrice: metadata?.usedPlannedPrice ?? false,
  };
});
```

`getLedgerProfitSummariesForRange()`의 결과에 필드를 연결한다.

```ts
result.set(ledger.id, {
  ledgerId: ledger.id,
  storeId: ledger.storeId,
  closingDate: ledger.closingDate,
  status: ledger.status,
  workerCount: summary.workerCount,
  totalSales: applied.totalSales.value,
  grossProfit: applied.grossProfit.value,
  grossMarginRate: applied.grossMarginRate.value,
  grossMarginReason:
    applied.grossMarginRate.value === null
      ? (applied.grossMarginRate.reason ??
        applied.grossMarginRate.label ??
        "계산 불가")
      : null,
  lossItems: summary.lossItems,
  hasUnappliedCorrections: summary.hasUnappliedCorrections,
});
```

- [ ] **Step 4: 집중 테스트와 기존 리포트 단위 테스트 실행**

Run:

```powershell
pnpm test:unit:file tests/unit/hq-report-overview.test.mjs
pnpm test:unit:file tests/unit/hq-reports.test.mjs
```

Expected: 신규 테스트 PASS, 기존 `hq-reports` 테스트 42개 PASS.

- [ ] **Step 5: 커밋**

```powershell
git add src/features/reports/queries.ts tests/unit/hq-report-overview.test.mjs
git commit -m "feat: preserve report loss calculation basis"
```

### Task 2: 월 손익의 인건비 모집단을 매출과 일치

**Files:**

- Modify: `src/features/reports/monthly-profit-loss.ts:198-217`
- Modify: `tests/unit/monthly-profit-loss.test.mjs`

- [ ] **Step 1: 입력 중·휴무 장부의 인건비가 월 손익에 섞이지 않는 실패 테스트 작성**

기존 테스트 파일의 소스 계약 테스트에 다음 단언을 추가한다.

```js
test("monthly P&L labor uses the same reviewed ledger population as sales", () => {
  const source = readFileSync(
    path.join(root, "src", "features", "reports", "monthly-profit-loss.ts"),
    "utf8",
  );

  assert.match(
    source,
    /ledgerLaborItem\.findMany\([\s\S]*dailyLedger:[\s\S]*status:\s*\{\s*in:\s*\["IN_REVIEW",\s*"HEADQUARTERS_CLOSED"\]/,
  );
  assert.match(source, /export const MONTHLY_PNL_COMPANY_WIDE_STORE_ID/);
});
```

- [ ] **Step 2: 상태 필터가 없어 실패하는지 확인**

Run:

```powershell
pnpm test:unit:file tests/unit/monthly-profit-loss.test.mjs
```

Expected: `ledgerLaborItem.findMany` 상태 필터 단언 FAIL.

- [ ] **Step 3: 공유 월 손익 쿼리의 관계 필터 한 곳 수정**

```ts
db.ledgerLaborItem.findMany({
  where: {
    dailyLedger: {
      storeId: { in: targetStoreIds },
      closingDate: { gte: startDate, lte: endDate },
      status: { in: ["IN_REVIEW", "HEADQUARTERS_CLOSED"] },
    },
  },
  select: { amount: true, dailyLedger: { select: { storeId: true } } },
}),
```

같은 파일의 기존 지역 상수를 export해 overview가 전사 공통 행을 이름 문자열로 판별하지 않게 한다.

```ts
export const MONTHLY_PNL_COMPANY_WIDE_STORE_ID = "__company_wide__";
```

`computeMonthProfitAndLossRows()` 안의 지역 `COMPANY_WIDE` 선언을 제거하고 기존 map key와 반환 `storeId`를 모두 `MONTHLY_PNL_COMPANY_WIDE_STORE_ID`로 바꾼다.

- [ ] **Step 4: 월 손익과 관련 리포트 회귀 실행**

Run:

```powershell
pnpm test:unit:file tests/unit/monthly-profit-loss.test.mjs
pnpm test:unit:file tests/unit/hq-reports.test.mjs
```

Expected: 두 테스트 파일 모두 PASS.

- [ ] **Step 5: 커밋**

```powershell
git add src/features/reports/monthly-profit-loss.ts tests/unit/monthly-profit-loss.test.mjs
git commit -m "fix: align monthly profit labor population"
```

### Task 3: 차트와 표가 공유하는 순수 overview DTO 작성

**Files:**

- Create: `src/features/reports/overview.ts`
- Modify: `tests/unit/hq-report-overview.test.mjs`

- [ ] **Step 1: 월 비교, 손실, 순위, 워터폴, 마감 상태 실패 테스트 작성**

테스트 파일에 TypeScript 모듈 import와 작은 fixture builder를 추가한다.

```js
import { pathToFileURL } from "node:url";

const overviewPath = path.join(
  root,
  "src",
  "features",
  "reports",
  "overview.ts",
);

function ledger(overrides = {}) {
  return {
    ledgerId: "ledger-1",
    storeId: "store-1",
    closingDate: new Date("2026-06-01T00:00:00.000Z"),
    status: "HEADQUARTERS_CLOSED",
    workerCount: 1,
    totalSales: 100_000,
    grossProfit: 30_000,
    grossMarginRate: 0.3,
    grossMarginReason: null,
    lossItems: [],
    hasUnappliedCorrections: false,
    ...overrides,
  };
}

function status(storeId, dateInput, ledgerStatus) {
  return { storeId, dateInput, status: ledgerStatus };
}
```

다음 테스트 이름과 핵심 단언을 그대로 추가한다.

```js
test("overview aligns the current month with the same previous-month day and keeps gaps null", async () => {
  const { buildHqReportOverviewForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const report = buildHqReportOverviewForTest({
    monthRange: {
      monthInput: "2026-07",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-07-02T00:00:00.000Z"),
      startDateInput: "2026-07-01",
      endDateInput: "2026-07-02",
      errorMessage: null,
      isFutureMonth: false,
    },
    stores: [{ id: "store-1", name: "강남점" }],
    selectedStoreId: null,
    currentLedgers: [
      ledger({ closingDate: new Date("2026-07-01T00:00:00.000Z") }),
    ],
    previousLedgers: [
      ledger({
        closingDate: new Date("2026-06-01T00:00:00.000Z"),
        totalSales: 80_000,
      }),
    ],
    statusRows: [
      status("store-1", "2026-07-01", "HEADQUARTERS_CLOSED"),
      status("store-1", "2026-07-02", "IN_PROGRESS"),
      status("store-1", "2026-06-01", "HEADQUARTERS_CLOSED"),
    ],
    pnlRows: [],
    todayRows: [],
    errorMessages: [],
  });

  assert.deepEqual(
    report.salesTrend.map((item) => [
      item.day,
      item.currentAmount,
      item.previousAmount,
    ]),
    [
      [1, 100_000, 80_000],
      [2, null, null],
    ],
  );
});

test("overview loss donut keeps top three plus other and excludes missing price bases", async () => {
  const { buildHqReportOverviewForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const report = buildHqReportOverviewForTest({
    monthRange: {
      monthInput: "2026-06",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2026-06-01T00:00:00.000Z"),
      startDateInput: "2026-06-01",
      endDateInput: "2026-06-01",
      errorMessage: null,
      isFutureMonth: false,
    },
    stores: [{ id: "store-1", name: "강남점" }],
    selectedStoreId: null,
    currentLedgers: [
      ledger({
        lossItems: [
          {
            id: "1",
            lossTypeName: "폐기",
            quantity: 1,
            amount: 400,
            usedPlannedPrice: true,
          },
          {
            id: "2",
            lossTypeName: "파손",
            quantity: 1,
            amount: 300,
            usedPlannedPrice: true,
          },
          {
            id: "3",
            lossTypeName: "변질",
            quantity: 1,
            amount: 200,
            usedPlannedPrice: true,
          },
          {
            id: "4",
            lossTypeName: "시식",
            quantity: 1,
            amount: 100,
            usedPlannedPrice: true,
          },
          {
            id: "5",
            lossTypeName: "기준없음",
            quantity: 1,
            amount: 0,
            usedPlannedPrice: false,
          },
        ],
      }),
    ],
    previousLedgers: [],
    statusRows: [status("store-1", "2026-06-01", "HEADQUARTERS_CLOSED")],
    pnlRows: [],
    todayRows: [],
    errorMessages: [],
  });

  assert.deepEqual(
    report.lossBreakdown.items.map((item) => item.name),
    ["폐기", "파손", "변질", "기타"],
  );
  assert.equal(report.lossBreakdown.totalAmount, 1_000);
  assert.equal(report.lossBreakdown.computableCount, 4);
  assert.equal(report.lossBreakdown.totalCount, 5);
});

test("overview closing groups always add up to store count times visible days", async () => {
  const { buildClosingStatusForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const rows = buildClosingStatusForTest({
    storeIds: ["store-1", "store-2"],
    dateInputs: ["2026-06-01", "2026-06-02"],
    statusRows: [
      status("store-1", "2026-06-01", "HEADQUARTERS_CLOSED"),
      status("store-2", "2026-06-01", "IN_REVIEW"),
      status("store-1", "2026-06-02", "HOLIDAY"),
    ],
  });

  assert.deepEqual(
    rows.map((item) => [item.key, item.count]),
    [
      ["closed", 1],
      ["progress", 1],
      ["missing", 1],
      ["holiday", 1],
    ],
  );
  assert.equal(
    rows.reduce((sum, item) => sum + item.count, 0),
    4,
  );
});

test("overview blocks the waterfall when any business ledger has no FIFO profit", async () => {
  const { buildProfitAndLossWaterfallForTest } = await import(
    pathToFileURL(overviewPath).href
  );
  const waterfall = buildProfitAndLossWaterfallForTest({
    ledgers: [ledger({ grossProfit: null, grossMarginRate: null })],
    coverageComplete: true,
    rows: [
      {
        monthInput: "2026-06",
        storeId: "store-1",
        storeName: "강남점",
        salesAmount: 100_000,
        cogsAmount: 0,
        grossProfit: null,
        grossMarginRate: null,
        laborAmount: 10_000,
        fixedCosts: { 월세: 5_000 },
        otherExpenseAmount: 0,
        hqAdjustmentAmount: 0,
        netAmount: -15_000,
        adjustmentReason: null,
        memo: null,
      },
    ],
  });

  assert.equal(waterfall.available, false);
  assert.deepEqual(waterfall.steps, []);
  assert.match(waterfall.reason, /FIFO|계산/);
});
```

같은 파일에 지점 순위 네 지표의 정렬·제외 목록, 전사 공통 비용 포함 워터폴, 오늘 조치 목록의 `storeId` 필터 테스트를 각각 하나씩 추가한다. 각 테스트는 `0` 대체가 없는지와 `detailHref`를 함께 단언한다.

- [ ] **Step 2: 새 모듈이 없어 실패하는지 확인**

Run:

```powershell
pnpm test:unit:file tests/unit/hq-report-overview.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND`로 FAIL.

- [ ] **Step 3: DTO와 순수 집계 함수의 최소 계약 작성**

`src/features/reports/overview.ts`에 type-only import와 다음 공개 계약을 둔다.

```ts
import type { DailyLedgerStatus } from "../../../generated/prisma";
import type { HqDashboardRow } from "../dashboard/types.ts";
import type { MonthlyClosingAnomalyReportMonthRange } from "./types.ts";
import type { LedgerProfitSummary } from "./queries.ts";
import {
  MONTHLY_PNL_COMPANY_WIDE_STORE_ID,
  type MonthlyProfitAndLossRow,
} from "./monthly-profit-loss.ts";

export type ReportOverviewMetricKey =
  | "sales"
  | "grossProfit"
  | "grossMarginRate"
  | "loss";
export type ReportOverviewStatusRow = {
  storeId: string;
  dateInput: string;
  status: DailyLedgerStatus;
};

export type HqReportOverviewData = {
  monthRange: MonthlyClosingAnomalyReportMonthRange;
  stores: Array<{ id: string; name: string }>;
  selectedStoreId: string | null;
  selectedStoreName: string | null;
  summary: {
    salesAmount: number | null;
    grossProfit: number | null;
    netAmount: number | null;
    lossAmount: number;
    actionCount: number;
  };
  chartSummaries: {
    salesTrend: string;
    lossBreakdown: string;
    profitAndLoss: string;
    closingStatus: string;
  };
  salesTrend: Array<{
    day: number;
    dateInput: string;
    currentAmount: number | null;
    previousAmount: number | null;
    currentStatusLabel: string;
    previousStatusLabel: string;
    detailHref: string;
  }>;
  lossBreakdown: {
    items: Array<{ name: string; amount: number; ratio: number }>;
    totalAmount: number;
    computableCount: number;
    totalCount: number;
    uncomputableCount: number;
    detailHref: string;
  };
  rankings: Record<
    ReportOverviewMetricKey,
    {
      summary: string;
      rows: Array<{
        storeId: string;
        storeName: string;
        value: number;
        detailHref: string;
      }>;
      excluded: Array<{ storeId: string; storeName: string; reason: string }>;
    }
  >;
  profitAndLoss: {
    available: boolean;
    reason: string | null;
    steps: Array<{
      key: string;
      label: string;
      start: number;
      end: number;
      offset: number;
      amount: number;
      kind: "total" | "increase" | "decrease";
    }>;
    detailHref: string;
  };
  closingStatus: Array<{
    key: "closed" | "progress" | "missing" | "holiday";
    label: string;
    count: number;
    ratio: number;
    detailHref: string;
  }>;
  closingMissingDays: Array<{
    storeId: string;
    storeName: string;
    dateInput: string;
    detailHref: string;
  }>;
  actions: Array<{
    id: string;
    storeName: string;
    label: string;
    detail: string;
    severity: "info" | "warning" | "critical";
    detailHref: string;
  }>;
  dataQuality: {
    missingCount: number;
    lossBasisLabel: string;
    profitAndLossLabel: string;
  };
  errorMessages: string[];
};
```

다음 공개 순수 함수만 만든다. 작은 내부 함수는 이 파일 안에 둔다.

```ts
export function getPreviousMonthComparisonRange(
  range: MonthlyClosingAnomalyReportMonthRange,
): {
  startDate: Date;
  endDate: Date;
  startDateInput: string;
  endDateInput: string;
};

export function buildClosingStatusForTest(input: {
  storeIds: string[];
  dateInputs: string[];
  statusRows: ReportOverviewStatusRow[];
}): HqReportOverviewData["closingStatus"];

export function buildProfitAndLossWaterfallForTest(input: {
  ledgers: LedgerProfitSummary[];
  rows: MonthlyProfitAndLossRow[];
  coverageComplete: boolean;
}): HqReportOverviewData["profitAndLoss"];

export function buildHqReportOverviewForTest(input: {
  monthRange: MonthlyClosingAnomalyReportMonthRange;
  stores: Array<{ id: string; name: string }>;
  selectedStoreId: string | null;
  currentLedgers: LedgerProfitSummary[];
  previousLedgers: LedgerProfitSummary[];
  statusRows: ReportOverviewStatusRow[];
  pnlRows: MonthlyProfitAndLossRow[];
  todayRows: HqDashboardRow[];
  errorMessages: string[];
}): HqReportOverviewData;
```

구현 규칙은 다음과 같이 코드에 직접 반영한다.

```ts
const includedStatuses = new Set<DailyLedgerStatus>([
  "IN_REVIEW",
  "HEADQUARTERS_CLOSED",
]);

const usableLossItems = currentLedgers
  .flatMap((ledger) => ledger.lossItems)
  .filter((item) => item.usedPlannedPrice);
const totalLossCount = currentLedgers.flatMap(
  (ledger) => ledger.lossItems,
).length;

const groupedLosses = new Map<string, number>();
for (const item of usableLossItems) {
  const name = item.lossTypeName.trim() || "유형 미지정";
  groupedLosses.set(name, (groupedLosses.get(name) ?? 0) + item.amount);
}
const sortedLosses = [...groupedLosses]
  .map(([name, amount]) => ({ name, amount }))
  .sort(
    (left, right) =>
      right.amount - left.amount ||
      left.name.localeCompare(right.name, "ko-KR"),
  );
const lossItems =
  sortedLosses.length <= 4
    ? sortedLosses
    : [
        ...sortedLosses.slice(0, 3),
        {
          name: "기타",
          amount: sortedLosses
            .slice(3)
            .reduce((sum, item) => sum + item.amount, 0),
        },
      ];
```

마감 상태는 `(storeId, dateInput)`별 row가 없으면 `missing`, `IN_PROGRESS`와 `IN_REVIEW`는 `progress`로 센다. 비율은 `total === 0 ? 0 : count / total` 한 곳에서만 계산한다.

매출 추세는 해당 날짜의 휴무 지점을 분모에서 제외하고, 영업 대상 지점 모두가 `IN_REVIEW` 또는 `HEADQUARTERS_CLOSED`일 때만 합계를 반환한다. 일부 미입력·입력 중이면 `currentAmount` 또는 `previousAmount`를 `null`로 둔다.

워터폴은 `storeId !== MONTHLY_PNL_COMPANY_WIDE_STORE_ID`인 모든 영업 지점에서 `grossProfit !== null`이고 `coverageComplete=true`일 때만 만든다. `buildHqReportOverviewForTest()`가 상태 행에서 영업 대상 날짜의 완전성을 계산해 전달한다. 전체 조회 단계는 `매출 → FIFO 매출원가 → 매출이익 → 인건비 → 지점 귀속 고정비·기타 → 전사 공통 비용 → 본사조정 → 순이익`이며, 특정 지점 조회에서는 전사 공통 비용 단계를 제외한다. `offset = Math.min(start, end)`, `amount = Math.abs(end - start)`를 DTO에서 계산한다.

`chartSummaries`와 지표별 `rankings[metric].summary`는 UI가 다시 계산하지 않도록 순수 빌더에서 만든다. 매출 추세에는 최고 매출일과 전월 같은 일 대비 변화, 손실에는 최대 유형과 계산 기준 커버리지, 순위에는 선택 지표의 1위 지점과 제외 수, 손익에는 순이익 또는 계산 불가 이유, 마감에는 미입력 수를 한 문장으로 담는다. `salesTrend` 각 점에는 실제값·누락·휴무·입력 중을 설명하는 현재/전월 상태 라벨을 함께 둔다. `closingMissingDays`는 같은 상태 집계에서 만들고 각 행을 해당 날짜의 일별 리포트로 연결한다.

지점 순위는 지표별로 서버 DTO에서 미리 정렬한다. 매출·매출이익·이익률은 월 범위가 완전하지 않으면 `excluded`로 보내며, 손실액은 계산 가능한 금액을 표시하되 `판매가 계획 기준` 설명을 유지한다.

조치 목록은 `todayRows`의 기존 `priority`, `signals`, `correctionState`를 사용하고 최대 7개로 제한한다. 상세 링크는 장부가 있으면 `/app/ledgers/{ledgerId}`, 없으면 `/app/reports/daily?date=today`를 사용한다.

- [ ] **Step 4: 순수 집계 테스트 실행**

Run:

```powershell
pnpm test:unit:file tests/unit/hq-report-overview.test.mjs
```

Expected: 월 비교, null 보존, 손실 상위 3+기타, 기준 커버리지, 네 마감 그룹, 네 순위 지표, 워터폴 차단, 오늘 조치 테스트 모두 PASS.

- [ ] **Step 5: 커밋**

```powershell
git add src/features/reports/overview.ts tests/unit/hq-report-overview.test.mjs
git commit -m "feat: build headquarters report overview data"
```

### Task 4: 본사 권한 범위 안에서 overview 데이터 조회

**Files:**

- Modify: `src/features/reports/overview.ts`
- Modify: `tests/unit/hq-report-overview.test.mjs`

- [ ] **Step 1: 서버 조회 경계 실패 테스트 추가**

```js
test("overview query enforces report access and headquarters store scope", () => {
  const source = readProjectFile("src", "features", "reports", "overview.ts");

  assert.match(source, /export\s+async\s+function\s+getHqReportOverview/);
  assert.match(source, /requireReportAccess\(\)/);
  assert.match(source, /getHeadquartersStoreScope\(\)/);
  assert.match(source, /getLedgerProfitSummariesForRange\(/);
  assert.match(source, /buildMonthlyProfitAndLoss\(/);
  assert.match(source, /getHqDashboardRows\(/);
  assert.doesNotMatch(
    source,
    /\.(create|createMany|update|upsert|delete|deleteMany)\(/,
  );
});
```

- [ ] **Step 2: 새 함수가 없어 실패하는지 확인**

Run:

```powershell
pnpm test:unit:file tests/unit/hq-report-overview.test.mjs
```

Expected: `getHqReportOverview` 단언 FAIL.

- [ ] **Step 3: 기존 계산을 묶는 읽기 전용 loader 구현**

`overview.ts` 하단에 다음 함수 형태로 구현한다. 서버 모듈은 기존 `queries.ts` 관례처럼 함수 안에서 동적 import한다.

```ts
export async function getHqReportOverview({
  month,
  storeId,
}: {
  month?: unknown;
  storeId?: unknown;
} = {}): Promise<HqReportOverviewData> {
  const { requireReportAccess, getHeadquartersStoreScope } =
    await import("../../server/authz.ts");
  const {
    getLedgerProfitSummariesForRange,
    getMonthlyClosingAnomalyReportMonthRange,
  } = await import("./queries.ts");
  const { getHqDashboardRows } = await import("../dashboard/queries.ts");
  const { buildMonthlyProfitAndLoss } =
    await import("./monthly-profit-loss.ts");
  const { db } = await import("../../server/db.ts");

  await requireReportAccess();
  const scope = await getHeadquartersStoreScope();
  const monthRange = getMonthlyClosingAnomalyReportMonthRange(month);
  const normalizedStoreId =
    typeof storeId === "string" && storeId.length > 0 ? storeId : null;
  const selectedStore = normalizedStoreId
    ? (scope.stores.find((store) => store.id === normalizedStoreId) ?? null)
    : null;
  const selectedStores = normalizedStoreId
    ? selectedStore
      ? [selectedStore]
      : []
    : scope.stores;
  const targetStoreIds = selectedStores.map((store) => store.id);
  const errorMessages = [
    monthRange.errorMessage,
    normalizedStoreId && !selectedStore
      ? "조회 지점이 권한 범위에 없거나 비활성입니다."
      : null,
  ].filter((message): message is string => Boolean(message));

  if (targetStoreIds.length === 0) {
    return buildHqReportOverviewForTest({
      monthRange,
      stores: scope.stores,
      selectedStoreId: selectedStore?.id ?? null,
      currentLedgers: [],
      previousLedgers: [],
      statusRows: [],
      pnlRows: [],
      todayRows: [],
      errorMessages,
    });
  }

  const previousRange = getPreviousMonthComparisonRange(monthRange);
  const [currentMap, previousMap, pnl, today, rawStatuses] = await Promise.all([
    getLedgerProfitSummariesForRange({
      storeIds: targetStoreIds,
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
    }),
    getLedgerProfitSummariesForRange({
      storeIds: targetStoreIds,
      startDate: previousRange.startDate,
      endDate: previousRange.endDate,
    }),
    buildMonthlyProfitAndLoss({
      month: monthRange.monthInput,
      storeId: selectedStore?.id ?? null,
    }),
    getHqDashboardRows({
      datePreset: "today",
      sortMode: "priority",
      filterMode: "needs-attention",
    }),
    db.dailyLedger.findMany({
      where: {
        storeId: { in: targetStoreIds },
        closingDate: {
          gte: previousRange.startDate,
          lte: monthRange.endDate,
        },
      },
      select: { storeId: true, closingDate: true, status: true },
    }),
  ]);

  return buildHqReportOverviewForTest({
    monthRange,
    stores: scope.stores,
    selectedStoreId: selectedStore?.id ?? null,
    currentLedgers: [...currentMap.values()],
    previousLedgers: [...previousMap.values()],
    statusRows: rawStatuses.map((row) => ({
      storeId: row.storeId,
      dateInput: row.closingDate.toISOString().slice(0, 10),
      status: row.status,
    })),
    pnlRows: pnl.rows,
    todayRows: selectedStore
      ? today.rows.filter((row) => row.storeId === selectedStore.id)
      : today.rows,
    errorMessages,
  });
}
```

`buildHqReportOverviewForTest()`의 `stores`는 필터 선택지용 전체 권한 지점이며, 계산에는 `selectedStoreId`가 있으면 그 지점만, 없으면 전체를 사용한다. 권한 밖 지점은 빈 결과를 반환하고 전체로 폴백하지 않는다.

- [ ] **Step 4: 단위 테스트와 타입 검사 실행**

Run:

```powershell
pnpm test:unit:file tests/unit/hq-report-overview.test.mjs
pnpm typecheck
```

Expected: 신규 단위 테스트 PASS, TypeScript 오류 0개.

- [ ] **Step 5: 커밋**

```powershell
git add src/features/reports/overview.ts tests/unit/hq-report-overview.test.mjs
git commit -m "feat: query headquarters report overview"
```

### Task 5: 같은 DTO로 고급스럽고 단순한 차트와 표 구성

**Files:**

- Create: `src/features/reports/components/hq-report-overview.tsx`
- Modify: `tests/unit/hq-report-overview.test.mjs`

- [ ] **Step 1: UI 소스 계약 실패 테스트 작성**

```js
test("overview UI uses existing chart primitives and keeps a table alternative", () => {
  const source = readProjectFile(
    "src",
    "features",
    "reports",
    "components",
    "hq-report-overview.tsx",
  );

  assert.match(source, /ChartContainer/);
  assert.match(source, /ChartTooltipContent/);
  assert.match(source, /ReviewViewToggle/);
  assert.match(source, /accessibilityLayer/g);
  assert.match(source, /실제 총매출/);
  assert.match(source, /판매가 계획 기준/);
  assert.match(source, /오늘 기준/);
  assert.match(source, /계산 가능/);
  assert.match(source, /Table/);
  assert.doesNotMatch(source, /grossProfit\s*\?\?\s*0/);
});
```

- [ ] **Step 2: 컴포넌트가 없어 실패하는지 확인**

Run:

```powershell
pnpm test:unit:file tests/unit/hq-report-overview.test.mjs
```

Expected: 컴포넌트 파일 부재로 FAIL.

- [ ] **Step 3: 하나의 클라이언트 컴포넌트 안에 내부 차트 작성**

`src/features/reports/components/hq-report-overview.tsx`는 다음 import와 공개 props만 가진다.

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { ReviewViewToggle } from "~/features/reports/components/review-view-toggle";
import type {
  HqReportOverviewData,
  ReportOverviewMetricKey,
} from "~/features/reports/overview";
import { formatKrw, formatSignedKrw } from "~/lib/format";

export function HqReportOverview({ report }: { report: HqReportOverviewData }) {
  return (
    <div className="grid gap-4">
      <OverviewSummary report={report} />
      <DataQualitySummary report={report} />
      <ReviewViewToggle
        chart={<OverviewCharts report={report} />}
        table={<OverviewTables report={report} />}
      />
      <ActionList report={report} />
    </div>
  );
}
```

내부 컴포넌트는 같은 파일에만 둔다.

- `OverviewSummary`: `salesAmount`, `grossProfit`, `netAmount`, `lossAmount`, `actionCount`를 하나의 얇은 `Card` 안 5열로 표시한다. `null`은 `계산 불가`로 표시한다.
- `DataQualitySummary`: 미입력 수, `계산 가능 건수 / 전체 손실 건수`, 워터폴 가능 여부를 짧은 문장과 `Badge`로 표시한다.
- `SalesTrendChart`: `LineChart`에서 현재 월은 `var(--chart-1)` 실선, 전월은 `var(--muted-foreground)` 점선으로 표시한다. `connectNulls={false}`를 명시하고 툴팁에 금액·현재/전월 상태·`정정 반영 실제 총매출` 기준을 표시한다.
- `LossDonutChart`: `PieChart`와 `Pie innerRadius={58} outerRadius={84}`를 사용한다. 색은 기존 `--chart-1`부터 `--chart-4`까지만 사용하고 중앙에는 계산 가능한 총액을 표시한다.
- `StoreRankingChart`: 로컬 state는 `ReportOverviewMetricKey` 하나뿐이다. 버튼은 `aria-pressed`를 사용하고 이미 정렬된 `report.rankings[metric]`만 렌더링한다. 음수 가능 지표에는 `<ReferenceLine x={0} />`를 표시한다.
- `ProfitAndLossChart`: `available=false`면 차트를 만들지 않고 `reason`과 월간 상세 링크를 표시한다. 가능하면 투명 `offset` 막대와 `amount` 막대를 같은 `stackId="waterfall"`로 그린다.
- `ClosingStatusChart`: DTO의 비율을 그대로 100% 누적 가로 막대 하나로 표시하고 범례에는 비율과 건수를 같이 쓴다.
- `OverviewTables`: 5개 섹션의 같은 DTO를 shadcn `Table`로 표시한다. 마감 표에는 `closingMissingDays`를 포함하며 각 행에는 서버가 만든 `detailHref` 링크가 있다.
- `ActionList`: `오늘 기준 · 선택 지점` 문구, 심각도 배지, 근거 문장, 상세 링크를 표시한다. 빈 배열은 `오늘 바로 조치할 항목이 없습니다.`를 표시한다.

각 차트 제목 아래에는 `report.chartSummaries` 또는 현재 `report.rankings[metric].summary`를 항상 표시한다. 데이터 배열이 비면 빈 SVG 대신 필요한 입력과 상세 리포트 링크를 담은 bordered empty state를 표시한다.

조치 DTO의 `detail`은 `row.signals`의 수치가 포함된 `detail`을 우선 이어 붙이고, 없으면 기존 `row.priority.reasons`를 사용한다. 심각도는 기존 우선순위에 맞춰 rank 10은 `critical`, rank 20~50은 `warning`, 나머지는 `info`로 변환한다.

금액은 기존 `formatKrw`, `formatSignedKrw`를 재사용한다. 비율만 파일 상단 `Intl.NumberFormat("ko-KR", { style: "percent", maximumFractionDigits: 1 })` 하나를 두며 계산은 하지 않고 DTO의 ratio만 포맷한다.

레이아웃은 기존 브랜드 문법을 따른다.

```tsx
<div className="grid gap-4 xl:grid-cols-12">
  <Card className="xl:col-span-8">매출 추세</Card>
  <Card className="xl:col-span-4">손실 유형</Card>
  <Card className="xl:col-span-6">지점 성과 순위</Card>
  <Card className="xl:col-span-6">월 손익 흐름</Card>
  <Card className="xl:col-span-12">월간 마감 상태</Card>
</div>
```

강한 그라데이션, glass 효과, 차트별 임의 색상, 큰 숫자 카드 반복은 사용하지 않는다.

- [ ] **Step 4: UI 소스 계약과 타입 검사 실행**

Run:

```powershell
pnpm test:unit:file tests/unit/hq-report-overview.test.mjs
pnpm typecheck
```

Expected: UI 소스 계약 PASS, TypeScript 오류 0개.

- [ ] **Step 5: 커밋**

```powershell
git add src/features/reports/components/hq-report-overview.tsx tests/unit/hq-report-overview.test.mjs
git commit -m "feat: render headquarters overview charts"
```

### Task 6: overview 페이지, 로딩, 사이드바와 재검증 경로 연결

**Files:**

- Create: `src/app/app/reports/overview/page.tsx`
- Create: `src/app/app/reports/overview/loading.tsx`
- Modify: `src/components/app-sidebar.tsx:27-32`
- Modify: `src/server/revalidation.ts:3-9`
- Modify: `tests/unit/hq-report-overview.test.mjs`
- Modify: `tests/unit/hq-reports.test.mjs:50-60`
- Modify: `tests/unit/revalidation.test.mjs:20-52`

- [ ] **Step 1: 페이지·권한·내비게이션 실패 테스트 추가**

`tests/unit/hq-report-overview.test.mjs`에 다음을 추가한다.

```js
test("overview page is the report entry and uses server authorization", () => {
  const page = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "overview",
    "page.tsx",
  );
  const loading = readProjectFile(
    "src",
    "app",
    "app",
    "reports",
    "overview",
    "loading.tsx",
  );
  const sidebar = readProjectFile("src", "components", "app-sidebar.tsx");
  const revalidation = readProjectFile("src", "server", "revalidation.ts");

  assert.match(page, /requireReportAccess\(/);
  assert.match(page, /hasActionPermission\(/);
  assert.match(page, /PermissionAction\.EXPORT_CREATE/);
  assert.match(page, /getHqReportOverview\(/);
  assert.match(page, /HqReportOverview/);
  assert.match(page, /type="month"/);
  assert.match(page, /전체 지점/);
  assert.match(page, /report=comparison/);
  assert.match(loading, /Skeleton/);
  assert.match(sidebar, /href:\s*"\/app\/reports\/overview"/);
  assert.match(revalidation, /"\/app\/reports\/overview"/);
});
```

`tests/unit/hq-reports.test.mjs:59`의 기존 경로 단언을 바꾼다.

```js
assert.match(sidebarSource, /href:\s*"\/app\/reports\/overview"/);
```

- [ ] **Step 2: 테스트가 파일 부재와 기존 경로 때문에 실패하는지 확인**

Run:

```powershell
pnpm test:unit:file tests/unit/hq-report-overview.test.mjs
pnpm test:unit:file tests/unit/hq-reports.test.mjs
```

Expected: overview 파일 부재와 `/daily` 경로 단언 때문에 FAIL.

- [ ] **Step 3: 서버 페이지 구현**

`src/app/app/reports/overview/page.tsx`는 기존 월간 페이지 패턴을 그대로 사용한다.

```tsx
import Link from "next/link";
import { DownloadIcon } from "lucide-react";
import { PermissionAction } from "../../../../../generated/prisma";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { HqReportOverview } from "~/features/reports/components/hq-report-overview";
import { getHqReportOverview } from "~/features/reports/overview";
import { hasActionPermission, requireReportAccess } from "~/server/authz";

type PageProps = {
  searchParams: Promise<{
    month?: string | string[];
    storeId?: string | string[];
  }>;
};

export default async function HqReportOverviewPage({
  searchParams,
}: PageProps) {
  const user = await requireReportAccess();
  const params = await searchParams;
  const month = Array.isArray(params.month) ? params.month[0] : params.month;
  const storeId = Array.isArray(params.storeId)
    ? params.storeId[0]
    : params.storeId;
  const [navigationItems, canExportReports, report] = await Promise.all([
    getHeadquartersNavigationItems(user.id),
    hasActionPermission(user.id, PermissionAction.EXPORT_CREATE),
    getHqReportOverview({ month, storeId }),
  ]);
  const exportParams = new URLSearchParams({
    report: "comparison",
    startDate: report.monthRange.startDateInput,
    endDate: report.monthRange.endDateInput,
    format: "xlsx",
  });
  if (report.selectedStoreId)
    exportParams.set("storeId", report.selectedStoreId);

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <PageHeader
          title="통합 리포트"
          description="매출 흐름부터 손실 원인과 오늘의 조치 대상까지 한 화면에서 확인합니다."
        />
        <div className="flex flex-col gap-2 lg:items-end">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/daily">일별</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/comparison">기간 비교</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/monthly">월간 상세</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/app/reports/inventory">재고</Link>
            </Button>
          </div>
          <form
            action="/app/reports/overview"
            className="flex flex-wrap items-end gap-2"
          >
            <label className="text-muted-foreground grid gap-1 text-xs">
              조회 월
              <Input
                name="month"
                type="month"
                defaultValue={report.monthRange.monthInput}
                className="h-9 w-36"
              />
            </label>
            <label className="text-muted-foreground grid gap-1 text-xs">
              지점
              <select
                name="storeId"
                defaultValue={report.selectedStoreId ?? ""}
                className="border-input bg-card h-9 min-w-40 rounded-md border px-3 text-sm shadow-xs"
              >
                <option value="">전체 지점</option>
                {report.stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline" size="sm">
              조회
            </Button>
            {canExportReports ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/api/reports/export?${exportParams.toString()}`}>
                  <DownloadIcon data-icon="inline-start" />
                  Excel
                </a>
              </Button>
            ) : null}
          </form>
        </div>
      </div>
      {report.errorMessages.map((message) => (
        <p
          key={message}
          className="bg-muted text-muted-foreground rounded-lg border px-4 py-3 text-sm"
        >
          {message}
        </p>
      ))}
      <HqReportOverview report={report} />
    </HeadquartersShell>
  );
}
```

- [ ] **Step 4: 로딩 골격과 사이드바 경로 변경**

`loading.tsx`는 `Skeleton`만 사용해 제목, 필터, 요약 띠, 큰 차트 2개, 작은 차트 3개, 조치 목록 높이를 유지한다. 실제 차트나 임의 숫자를 렌더링하지 않는다.

```tsx
import { Skeleton } from "~/components/ui/skeleton";

export default function HqReportOverviewLoading() {
  return (
    <div className="grid gap-4" aria-label="통합 리포트 불러오는 중">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 xl:grid-cols-12">
        <Skeleton className="h-96 xl:col-span-8" />
        <Skeleton className="h-96 xl:col-span-4" />
        <Skeleton className="h-80 xl:col-span-6" />
        <Skeleton className="h-80 xl:col-span-6" />
        <Skeleton className="h-48 xl:col-span-12" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
```

`src/components/app-sidebar.tsx`의 리포트 href 한 줄만 바꾼다.

```ts
href: "/app/reports/overview",
```

`src/server/revalidation.ts`의 기존 배열에 overview 한 줄을 넣는다. 새 revalidation 함수는 만들지 않는다.

```ts
const dashboardAndReportPaths = [
  "/app/dashboard",
  "/app/reports/overview",
  "/app/reports/daily",
  "/app/reports/comparison",
  "/app/reports/monthly",
] as const;
```

`tests/unit/revalidation.test.mjs`의 route 목록에도 `"/app/reports/overview"`를 추가한다.

- [ ] **Step 5: 단위 테스트, 타입, lint 실행**

Run:

```powershell
pnpm test:unit:file tests/unit/hq-report-overview.test.mjs
pnpm test:unit:file tests/unit/hq-reports.test.mjs
pnpm test:unit:file tests/unit/revalidation.test.mjs
pnpm typecheck
pnpm lint
```

Expected: 두 단위 파일 PASS, TypeScript·ESLint 오류 0개.

- [ ] **Step 6: 커밋**

```powershell
git add src/app/app/reports/overview src/components/app-sidebar.tsx src/server/revalidation.ts tests/unit/hq-report-overview.test.mjs tests/unit/hq-reports.test.mjs tests/unit/revalidation.test.mjs
git commit -m "feat: add headquarters report overview page"
```

### Task 7: 실제 브라우저에서 필터, 권한, 표, 모바일 검증

**Files:**

- Modify: `tests/e2e/hq-reports.spec.ts:1-1305`

- [ ] **Step 1: overview E2E를 먼저 작성**

기존 `login`, `getCurrentMonthInput`, `seedLedger`, story store fixture를 재사용하고 테스트 이름에 `통합 리포트`를 넣는다.

```ts
test("본사는 사이드바에서 통합 리포트를 열고 차트와 같은 표를 본다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.getByRole("link", { name: "리포트" }).click();
  await expect(page).toHaveURL(/\/app\/reports\/overview/);
  await expect(
    page.getByRole("heading", { name: "통합 리포트" }),
  ).toBeVisible();
  await expect(page.getByLabel("조회 월")).toHaveValue(getCurrentMonthInput());
  await expect(page.getByText("실제 총매출")).toBeVisible();
  await expect(page.getByText("손실 유형")).toBeVisible();
  await expect(page.getByText("월 손익 흐름")).toBeVisible();
  await expect(page.getByText(/오늘 기준/)).toBeVisible();

  await page.getByRole("button", { name: "표 보기" }).click();
  await expect(page.getByRole("table").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /상세/ }).first()).toBeVisible();
});

test("통합 리포트 월 지점 필터는 URL과 모든 표에 유지된다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto(
    `/app/reports/overview?month=${getCurrentMonthInput()}&storeId=${STORE_IDS.closed}`,
  );
  await expect(page.getByLabel("조회 월")).toHaveValue(getCurrentMonthInput());
  await expect(page.getByLabel("지점")).toHaveValue(STORE_IDS.closed);
  await page.getByRole("button", { name: "표 보기" }).click();
  await expect(page.getByText("스토리6-1 정정마감점").first()).toBeVisible();
  await expect(page.getByText("스토리6-2 입력중점")).toHaveCount(0);
});

test("통합 리포트는 정정과 손실 계산 기준 누락을 0으로 숨기지 않는다", async ({
  page,
}) => {
  await login(page, "hq@example.com");
  await page.goto(`/app/reports/overview?month=${getCurrentMonthInput()}`);
  await page.getByRole("button", { name: "표 보기" }).click();
  await expect(page.getByText(/45,000/).first()).toBeVisible();
  await expect(page.getByText(/계산 가능.*전체/).first()).toBeVisible();
  await expect(page.getByText(/판매가 계획 기준/).first()).toBeVisible();
  await expect(page.getByText(/미입력/).first()).toBeVisible();
});

test("통합 리포트는 조회와 export 권한을 분리한다", async ({ page }) => {
  await login(page, "hq-viewer@example.com");
  await page.goto("/app/reports/overview");
  await expect(
    page.getByRole("heading", { name: "통합 리포트" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Excel/ })).toHaveCount(0);
});

test("지정 지점 본사는 통합 리포트에서 배정 지점만 본다", async ({ page }) => {
  await login(page, "hq-assigned@example.com");
  await page.goto("/app/reports/overview");
  const options = await page
    .locator('select[name="storeId"] option')
    .allTextContents();
  expect(options).not.toContain("스토리6-1 정정마감점");
  expect(options).not.toContain("스토리6-2 입력중점");
});

test("지점장은 통합 리포트에 접근할 수 없다", async ({ page }) => {
  await login(page, "manager@example.com");
  await page.goto("/app/reports/overview");
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});

test("통합 리포트는 좁은 화면에서 가로 넘침 없이 표 전환을 제공한다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page, "hq@example.com");
  await page.goto("/app/reports/overview");
  await page.getByRole("button", { name: "표 보기" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("table").first()).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
```

기존 fixture에 `usedPlannedPrice: true` 손실 행 하나를 추가해 도넛의 계산 가능한 조각도 보이게 한다. 기존 기본 `false` 손실 행은 계산 기준 누락 검증에 그대로 남긴다.

- [ ] **Step 2: E2E가 실패하는지 확인**

Run:

```powershell
pnpm test:e2e -- tests/e2e/hq-reports.spec.ts --grep "통합 리포트"
```

Expected: 누락된 라벨, fixture 또는 레이아웃 문제로 최소 한 테스트 FAIL.

- [ ] **Step 3: 실패 원인만 최소 수정**

수정 범위는 `overview.ts`, `hq-report-overview.tsx`, `overview/page.tsx`, `hq-reports.spec.ts` 안으로 제한한다. 테스트가 찾기 어렵다는 이유로 민감한 값을 DOM에 중복 출력하지 않는다. 접근 가능한 이름이나 같은 표의 셀을 사용한다.

- [ ] **Step 4: 집중 E2E와 전체 관련 회귀 실행**

Run:

```powershell
pnpm test:e2e -- tests/e2e/hq-reports.spec.ts --grep "통합 리포트"
pnpm test:unit:file tests/unit/hq-report-overview.test.mjs
pnpm test:unit:file tests/unit/hq-reports.test.mjs
pnpm typecheck
pnpm lint
```

Expected: overview E2E 7개 PASS, 두 단위 파일 PASS, TypeScript·ESLint 오류 0개.

- [ ] **Step 5: 커밋**

```powershell
git add tests/e2e/hq-reports.spec.ts src/features/reports/overview.ts src/features/reports/components/hq-report-overview.tsx src/app/app/reports/overview/page.tsx
git commit -m "test: cover headquarters report overview"
```

### Task 8: 전체 검증과 작업 인계

**Files:**

- Verify only

- [ ] **Step 1: 포맷 확인**

Run:

```powershell
pnpm exec prettier --check "src/features/reports/overview.ts" "src/features/reports/components/hq-report-overview.tsx" "src/app/app/reports/overview/page.tsx" "src/app/app/reports/overview/loading.tsx" "tests/unit/hq-report-overview.test.mjs" "tests/unit/hq-reports.test.mjs" "tests/e2e/hq-reports.spec.ts"
```

Expected: `All matched files use Prettier code style!`

- [ ] **Step 2: 전체 단위·본사 E2E 검증**

Run:

```powershell
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:e2e:core:hq
git diff --check
```

Expected: 모든 명령 exit 0, 단위 실패 0개, 본사 E2E 실패 0개, whitespace 오류 없음.

- [ ] **Step 3: 최종 diff가 승인 범위만 포함하는지 확인**

Run:

```powershell
git status --short
git diff --stat 1969fc1..HEAD
git log --oneline -7
```

Expected: overview 구현·테스트와 sidebar 한 줄 변경만 보이며 Prisma migration, 새 dependency, overview export API 변경은 없음.

- [ ] **Step 4: 검증 중 필요한 수정이 있었다면 마지막 커밋**

```powershell
git add src tests
git commit -m "fix: finish headquarters report overview"
```

검증으로 인한 코드 수정이 없으면 빈 커밋을 만들지 않는다.
