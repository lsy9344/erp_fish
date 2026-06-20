# done_Section 1-6 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 섹션 1-6 검토에서 확인된 데이터 손실, 권한/민감정보, 장부 계산, 정책 게이트 오류를 제거한다.

**Architecture:** 수정은 기존 경계 안에서 한다. DB 데이터 보존은 migration에서 해결하고, 권한은 `src/server/authz.ts`의 semantic gate를 재사용하며, 장부 계산은 저장 snapshot과 계산 입력이 같은 값을 보도록 맞춘다. 정책 미확정 계산값은 대시보드 신호 생성 전에 확정값과 분리한다.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma 6, PostgreSQL, NextAuth, Node test runner.

---

작성일: 2026-06-20

상태: 적용 완료

적용일: 2026-06-20

적용 메모: 본 작업지시서의 4개 보완 작업을 코드와 테스트에 반영했다.

## 작업 원칙

- 새 기능을 넓히지 않는다. 확인된 4개 결함만 고친다.
- 권한을 약하게 만들지 않는다.
- 민감값은 화면에 넘기기 전에 서버에서 제거한다.
- migration은 운영 데이터가 이미 있다고 가정하고 작성한다.
- 각 task는 테스트를 먼저 추가하거나 고친 뒤 구현한다.

## 파일 책임

- `prisma/migrations/20260616143000_simplify_anomaly_threshold_settings/migration.sql`: 기존 이상 신호 임계값을 새 `marginRateBps`로 보존한다.
- `tests/unit/anomaly-thresholds.test.mjs`: migration 데이터 보존을 정적 테스트로 고정한다.
- `src/server/authz.ts`: 감사 이력에 필요한 semantic gate가 부족하면 추가한다.
- `src/features/audit/audit-queries.ts`: 감사 이력 조회 권한, 지점 scope, payload redaction을 적용한다.
- `src/features/audit/audit-format.ts`: 포맷 helper가 민감값 제거 뒤에도 안전하게 동작하는지 유지한다.
- `tests/unit/master-data-history.test.mjs`: 감사 이력 권한/scope/redaction 계약을 고정한다.
- `src/features/inventory/adjustment-reconciliation.ts`: 매입 변경 뒤 재고 snapshot 동기화 helper를 추가한다.
- `src/features/ledger/actions.ts`: 지점장 매입 저장 뒤 재고 snapshot 동기화를 호출한다.
- `src/features/ledger/hq-edit-actions.ts`: 본사 매입 수정 뒤 재고 snapshot 동기화를 호출한다.
- `tests/unit/ledger-purchase.test.mjs`: 매입 저장 뒤 재고 snapshot 동기화 계약을 고정한다.
- `src/features/dashboard/queries.ts`: `policy-unconfirmed` metric을 정보 신호로 보존하고 anomaly 판정에서 제외한다.
- `tests/unit/hq-dashboard.test.mjs`: 정책 미확정 metric이 warning으로 승격되지 않는 회귀 테스트를 추가한다.

## Task 1. 이상 신호 migration 데이터 보존

**우선순위:** P1

**문제:** `marginRateBps`가 `DEFAULT 0`으로 생성된 뒤 기존 임계값 컬럼이 삭제된다.

**Files:**

- Modify: `prisma/migrations/20260616143000_simplify_anomaly_threshold_settings/migration.sql`
- Modify: `tests/unit/anomaly-thresholds.test.mjs`

- [x] **Step 1: migration 보존 테스트 추가**

`tests/unit/anomaly-thresholds.test.mjs`에 아래 테스트를 추가한다.

```js
test("anomaly threshold simplification migration preserves previous margin threshold before dropping columns", () => {
  const migration = readProjectFile(
    "prisma",
    "migrations",
    "20260616143000_simplify_anomaly_threshold_settings",
    "migration.sql",
  );
  const updateIndex = migration.indexOf('SET "marginRateBps"');
  const dropIndex = migration.indexOf('DROP COLUMN "grossMarginDropBps"');

  assert.notEqual(updateIndex, -1);
  assert.notEqual(dropIndex, -1);
  assert.ok(
    updateIndex < dropIndex,
    "marginRateBps must be populated before grossMarginDropBps is dropped",
  );
  assert.match(
    migration,
    /UPDATE\s+"AnomalyThresholdSetting"[\s\S]*"marginRateBps"\s*=\s*"grossMarginDropBps"/,
  );
});
```

- [x] **Step 2: 테스트 실패 확인**

Run:

```bash
pnpm test:unit:file tests/unit/anomaly-thresholds.test.mjs
```

Expected: 새 테스트가 `SET "marginRateBps"` 또는 `UPDATE` 누락으로 실패한다.

- [x] **Step 3: migration에 데이터 이관 추가**

`prisma/migrations/20260616143000_simplify_anomaly_threshold_settings/migration.sql`을 아래 순서로 바꾼다.

```sql
ALTER TABLE "AnomalyThresholdSetting"
  ADD COLUMN "marginRateBps" INTEGER NOT NULL DEFAULT 0;

UPDATE "AnomalyThresholdSetting"
SET "marginRateBps" = "grossMarginDropBps";

ALTER TABLE "AnomalyThresholdSetting"
  ALTER COLUMN "marginRateBps" DROP DEFAULT;

ALTER TABLE "AnomalyThresholdSetting"
  DROP COLUMN "salesDropRateBps",
  DROP COLUMN "grossMarginDropBps",
  DROP COLUMN "salesDifferenceAmount",
  DROP COLUMN "lossAmount";
```

- [x] **Step 4: 검증**

Run:

```bash
pnpm test:unit:file tests/unit/anomaly-thresholds.test.mjs
pnpm db:validate
```

Expected: 둘 다 통과한다.

## Task 2. 감사 이력 권한, 지점 scope, 민감값 제거

**우선순위:** P1

**문제:** 감사 이력이 `SETTINGS_MANAGE`만 확인하고 장부/정정 payload를 그대로 보여 준다.

**Files:**

- Modify: `src/server/authz.ts`
- Modify: `src/features/audit/audit-queries.ts`
- Modify: `tests/unit/master-data-history.test.mjs`

- [x] **Step 1: 감사 이력 보안 계약 테스트 추가**

`tests/unit/master-data-history.test.mjs`의 "audit history query enforces..." 테스트에 아래 assertion을 추가한다.

```js
assert.match(query, /requireAuditHistoryAccess\(\)|requireReportAccess\(\)/);
assert.match(query, /getHeadquartersStoreScope\(\)/);
assert.match(query, /omitSensitiveFields/);
assert.match(query, /DailyLedger/);
assert.match(query, /CorrectionRecord/);
assert.match(query, /storeId:\s*\{\s*in:/s);
assert.doesNotMatch(
  query,
  /beforeText:\s*formatAuditJsonValue\(log\.before\)/,
  "audit history must redact before payload before formatting",
);
assert.doesNotMatch(
  query,
  /afterText:\s*formatAuditJsonValue\(log\.after\)/,
  "audit history must redact after payload before formatting",
);
```

- [x] **Step 2: 테스트 실패 확인**

Run:

```bash
pnpm test:unit:file tests/unit/master-data-history.test.mjs
```

Expected: `getHeadquartersStoreScope`, `omitSensitiveFields`, raw `beforeText`/`afterText` 관련 assertion이 실패한다.

- [x] **Step 3: authz semantic gate 추가**

`src/server/authz.ts`에 감사 이력용 gate를 추가한다. 최소 정책은 설정 권한과 리포트 조회 권한을 모두 요구하는 것이다. 더 세밀한 target별 권한 분기는 별도 제품 정책이 있을 때만 한다.

```ts
export async function requireAuditHistoryAccess() {
  const currentUser = await requireSettingsAccess();
  await requireReportAccess();

  return currentUser;
}
```

- [x] **Step 4: 감사 이력 query에 scope와 redaction 적용**

`src/features/audit/audit-queries.ts`에서 import를 바꾼다.

```ts
import {
  getHeadquartersStoreScope,
  requireAuditHistoryAccess,
} from "~/server/authz";
import { omitSensitiveFields } from "~/server/sensitive-fields";
```

`getAuditHistoryForHeadquarters()` 시작 부분을 아래 흐름으로 바꾼다.

```ts
await requireAuditHistoryAccess();
const storeScope = await getHeadquartersStoreScope();
```

`buildAuditHistoryWhere()`는 `storeIds`를 받을 수 있게 확장한다. 장부/정정 로그는 accessible ledger id로 제한한다. 구현은 아래 구조를 따른다.

```ts
async function getScopedAuditTargetFilters(storeIds: string[]) {
  const [ledgers, corrections] = await Promise.all([
    db.dailyLedger.findMany({
      where: { storeId: { in: storeIds } },
      select: { id: true },
    }),
    db.correctionRecord.findMany({
      where: {
        dailyLedger: {
          storeId: { in: storeIds },
        },
      },
      select: { id: true },
    }),
  ]);

  return {
    ledgerIds: ledgers.map((ledger) => ledger.id),
    correctionIds: corrections.map((correction) => correction.id),
  };
}
```

`formatAuditJsonValue()`에 넘기기 전 payload를 제거한다.

```ts
const safeBefore = omitSensitiveFields(log.before);
const safeAfter = omitSensitiveFields(log.after);

return {
  ...,
  changeSummaryText: formatAuditChangeSummary(safeBefore, safeAfter),
  beforeText: formatAuditJsonValue(safeBefore),
  afterText: formatAuditJsonValue(safeAfter),
};
```

- [x] **Step 5: target name 조회에도 scope 적용**

`resolveTargetNames()`가 `storeIds`를 받도록 바꾸고 `DailyLedger`, `CorrectionRecord` 조회에 같은 scope를 넣는다.

```ts
async function resolveTargetNames(logs: AuditLogWithActor[], storeIds: string[]) {
  ...
  db.dailyLedger.findMany({
    where: {
      id: { in: [...(ids.get("DailyLedger") ?? [])] },
      storeId: { in: storeIds },
    },
    ...
  }),
  db.correctionRecord.findMany({
    where: {
      id: { in: [...(ids.get("CorrectionRecord") ?? [])] },
      dailyLedger: {
        storeId: { in: storeIds },
      },
    },
    ...
  }),
}
```

- [x] **Step 6: 검증**

Run:

```bash
pnpm test:unit:file tests/unit/master-data-history.test.mjs tests/unit/sensitive-response-shaping.test.mjs tests/unit/auth-guard.test.mjs
pnpm typecheck
```

Expected: 모두 통과한다.

## Task 3. 매입 저장 후 재고 snapshot 동기화

**우선순위:** P1

**문제:** 매입 수량을 바꿔도 저장된 `LedgerInventoryItem.purchasedQuantity`가 전체 품목에 대해 갱신되지 않아 검토/제출 계산이 오래된 수량을 볼 수 있다.

**Files:**

- Modify: `src/features/inventory/adjustment-reconciliation.ts`
- Modify: `src/features/ledger/actions.ts`
- Modify: `src/features/ledger/hq-edit-actions.ts`
- Modify: `tests/unit/ledger-purchase.test.mjs`

- [x] **Step 1: 저장 action 계약 테스트 추가**

`tests/unit/ledger-purchase.test.mjs`의 "ledger purchase calculations, queries, and actions expose expected contracts" 테스트에 아래 assertion을 추가한다.

```js
assert.match(actionSource, /syncLedgerInventoryPurchasedQuantitiesInTx/);
assert.ok(
  actionSource.indexOf("tx.ledgerPurchaseItem.createMany") <
    actionSource.indexOf("syncLedgerInventoryPurchasedQuantitiesInTx"),
  "purchase save must sync inventory purchased quantities after purchase rows are written",
);

assert.match(
  readProjectFile("src", "features", "ledger", "hq-edit-actions.ts"),
  /syncLedgerInventoryPurchasedQuantitiesInTx/,
);
```

- [x] **Step 2: 테스트 실패 확인**

Run:

```bash
pnpm test:unit:file tests/unit/ledger-purchase.test.mjs
```

Expected: `syncLedgerInventoryPurchasedQuantitiesInTx`가 없어 실패한다.

- [x] **Step 3: 재고 매입 수량 동기화 helper 추가**

`src/features/inventory/adjustment-reconciliation.ts`에 아래 helper를 추가한다.

```ts
export async function syncLedgerInventoryPurchasedQuantitiesInTx(
  tx: Prisma.TransactionClient,
  dailyLedgerId: string,
  actorId: string,
) {
  const [items, purchases] = await Promise.all([
    tx.ledgerInventoryItem.findMany({
      where: { dailyLedgerId },
      select: {
        id: true,
        productId: true,
        purchasedQuantity: true,
      },
    }),
    tx.ledgerPurchaseItem.findMany({
      where: { dailyLedgerId, productId: { not: null } },
      select: { productId: true, quantity: true },
    }),
  ]);
  const purchasedQuantityByProductId = aggregatePurchasedQuantity(purchases);

  for (const item of items) {
    const purchasedQuantity = purchasedQuantityByProductId.get(item.productId) ?? 0;

    if (item.purchasedQuantity === purchasedQuantity) {
      continue;
    }

    await tx.ledgerInventoryItem.update({
      where: { id: item.id },
      data: {
        purchasedQuantity,
        updatedById: actorId,
      },
    });
  }
}
```

- [x] **Step 4: 지점장 매입 저장 action에서 호출**

`src/features/ledger/actions.ts` import를 바꾼다.

```ts
import {
  reconcileLedgerInventoryAdjustments,
  syncLedgerInventoryPurchasedQuantitiesInTx,
} from "~/features/inventory/adjustment-reconciliation";
```

`saveLedgerPurchases()`에서 매입 rows 저장 후 조정 재계산 전에 호출한다.

```ts
await syncLedgerInventoryPurchasedQuantitiesInTx(
  tx,
  beforeLedger.id,
  actor.user.id,
);

await reconcileLedgerInventoryAdjustments(
  tx,
  beforeLedger.id,
  actor.user.id,
);
```

- [x] **Step 5: 본사 매입 수정 action에도 같은 호출 추가**

`src/features/ledger/hq-edit-actions.ts`에서도 같은 import와 호출을 추가한다. 위치는 본사 매입 rows 저장 직후, `reconcileLedgerInventoryAdjustments()` 호출 전이다.

```ts
await syncLedgerInventoryPurchasedQuantitiesInTx(
  tx,
  beforeLedger.id,
  actor.user.id,
);
```

- [x] **Step 6: 검증**

Run:

```bash
pnpm test:unit:file tests/unit/ledger-purchase.test.mjs tests/unit/ledger-review.test.mjs tests/unit/ledger-inventory.test.mjs
pnpm typecheck
```

Expected: 모두 통과한다.

## Task 4. 정책 미확정 metric을 이상 경고로 승격하지 않기

**우선순위:** P1

**문제:** `policy-unconfirmed` metric이 대시보드 정보 신호로 남지 않고, 일부 값은 anomaly warning으로 바뀔 수 있다.

**Files:**

- Modify: `src/features/dashboard/queries.ts`
- Modify: `tests/unit/hq-dashboard.test.mjs`

- [x] **Step 1: 회귀 테스트 추가**

`tests/unit/hq-dashboard.test.mjs`에 아래 테스트를 추가한다.

```js
test("HQ dashboard keeps policy-unconfirmed margin metrics as info instead of anomaly warnings", async () => {
  const queryPath = assertProjectFile(
    "src",
    "features",
    "dashboard",
    "queries.ts",
  );
  const anomalyPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "anomaly.ts",
  );
  const { getDashboardSignals } = await import(pathToFileURL(queryPath).href);
  const { evaluateRevenueAnomalySignals } = await import(
    pathToFileURL(anomalyPath).href
  );

  const signals = getDashboardSignals({
    thresholdSettings: {
      marginRateBps: 3500,
      inventoryDifferenceQuantity: 10,
    },
    revenueCurrent: {
      totalSales: { value: 100000, status: "ok" },
      grossMarginRate: {
        value: 0.2,
        status: "policy-unconfirmed",
        reason: "FIFO 금액은 OQ-7/OQ-17 승인 전이라 계산 기준 확인이 필요합니다.",
      },
      salesDifference: {
        value: 25000,
        status: "policy-unconfirmed",
        reason: "OQ-1 매출차액 기준이 확정되지 않았습니다.",
      },
    },
    inventoryLossCurrent: {
      inventoryItems: [],
      inventoryAdjustments: [],
      lossItems: [],
    },
    evaluateRevenueAnomalySignals,
    evaluateInventoryLossAnomalySignals: () => [],
  });

  assert.deepEqual(
    signals.map(({ id, label, severity }) => ({ id, label, severity })),
    [
      {
        id: "calculation-grossMarginRate-policy-unconfirmed",
        label: "기준 확인 필요",
        severity: "info",
      },
      {
        id: "calculation-salesDifference-policy-unconfirmed",
        label: "기준 확인 필요",
        severity: "info",
      },
    ],
  );
  assert.ok(
    signals.every((signal) => signal.id !== "margin-rate-below-threshold"),
  );
});
```

- [x] **Step 2: 테스트 실패 확인**

Run:

```bash
pnpm test:unit:file tests/unit/hq-dashboard.test.mjs
```

Expected: 현재 코드는 policy-unconfirmed 신호를 만들지 않거나 margin warning을 만들 수 있어 실패한다.

- [x] **Step 3: policy-unconfirmed를 정보 신호로 남기기**

`src/features/dashboard/queries.ts`의 `metricStatusSignal()`을 아래처럼 바꾼다.

```ts
function metricStatusSignal(
  id: "totalSales" | "grossMarginRate" | "salesDifference",
  metricLabel: string,
  metric: LedgerReviewMetric,
) {
  if (metric.status === "ok") {
    return null;
  }

  const statusLabel =
    metric.status === "data-insufficient"
      ? "데이터 부족"
      : metric.status === "policy-unconfirmed"
        ? "기준 확인 필요"
        : "계산 불가";
  const detail =
    metric.reason ??
    metric.unavailableReason ??
    metric.label ??
    `${metricLabel} 계산 상태 확인이 필요합니다.`;

  return {
    id: `calculation-${id}-${metric.status}`,
    label: statusLabel,
    severity: "info" as const,
    detail: `${metricLabel}: ${detail}`,
  };
}
```

- [x] **Step 4: anomaly 입력을 확정 metric으로 제한**

`getDashboardSignals()` 안에서 revenue anomaly를 만들기 전에 확정 metric만 넘긴다. `src/features/dashboard/queries.ts`에서 `getDashboardSignals()` 위에 아래 helper를 추가한다.

```ts
function toAnomalyReadyRevenueCurrent(
  current: DashboardRevenueCurrent,
): DashboardRevenueCurrent {
  return {
    totalSales: current.totalSales,
    grossMarginRate:
      current.grossMarginRate.status === "ok"
        ? current.grossMarginRate
        : { value: null, status: "data-insufficient", reason: current.grossMarginRate.reason },
    salesDifference:
      current.salesDifference.status === "ok"
        ? current.salesDifference
        : { value: null, status: "data-insufficient", reason: current.salesDifference.reason },
  };
}
```

그리고 revenue anomaly 호출부를 아래처럼 바꾼다.

```ts
const anomalyReadyRevenueCurrent =
  toAnomalyReadyRevenueCurrent(revenueCurrent);

const revenueSignals = thresholdSettings
  ? normalizeDashboardAnomalySignals(
      evaluateRevenueAnomalySignals({
        thresholds: thresholdSettings,
        current: anomalyReadyRevenueCurrent,
      }),
    )
  : [];
```

- [x] **Step 5: 검증**

Run:

```bash
pnpm test:unit:file tests/unit/hq-dashboard.test.mjs tests/unit/calculation-policy-gates.test.mjs
pnpm typecheck
```

Expected: 모두 통과한다.

## 전체 검증

네 task를 모두 끝낸 뒤 아래 명령을 실행한다.

```bash
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test:unit
```

가능하면 핵심 E2E도 실행한다.

```bash
pnpm test:e2e:core
```

## 완료 기준

- migration이 기존 `grossMarginDropBps` 값을 `marginRateBps`로 옮긴다.
- 감사 이력은 장부/정정/리포트 payload의 민감값을 제거한다.
- 감사 이력의 장부/정정 target name과 로그 조회가 본사 지점 scope를 따른다.
- 매입 저장 후 검토/제출/대시보드 계산이 최신 매입 수량을 본다.
- `policy-unconfirmed` metric은 대시보드에서 정보 신호로 남고 anomaly warning으로 승격되지 않는다.
- `pnpm db:validate`, `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`이 모두 통과한다.
