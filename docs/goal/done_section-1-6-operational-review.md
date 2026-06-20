# done_ERP Fish 섹션 1-6 동작 검토

작성일: 2026-06-20

상태: 적용 완료

적용일: 2026-06-20

적용 메모: 본 문서의 4개 보완사항을 코드와 테스트에 반영했다.

## 결론

기본 품질 검증은 통과했다. `pnpm db:validate`, `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` 모두 성공했고 단위 테스트는 291개 통과했다.

하지만 실제 동작 리스크가 4건 확인됐다. 모두 출시 전에 고치는 것이 맞다.

1. 이상 신호 기준값 단순화 migration이 기존 임계값을 `0`으로 잃어버린다.
2. 감사 이력 화면이 장부/정정 민감값을 그대로 보여 주고, 본사 지점 범위를 적용하지 않는다.
3. 매입 저장 뒤 검토/제출 계산이 오래된 재고 `purchasedQuantity`를 사용할 수 있다.
4. `policy-unconfirmed` 계산값이 대시보드에서 기준 확인 상태가 아니라 이상 경고로 승격될 수 있다.

## 검토 범위

### 섹션 1. 프로젝트 구조/설정

- `package.json`
- `next.config.js`
- `tsconfig.json`
- `eslint.config.js`
- `.env.example`
- `src/env.js`
- `prisma.config.ts`

### 섹션 2. DB/Prisma

- `prisma/schema.prisma`
- `prisma/migrations`
- `prisma/seed.ts`

### 섹션 3. 인증/권한/민감정보

- `src/server/auth`
- `src/server/authz.ts`
- `src/server/sensitive-fields.ts`
- `src/features/auth`
- `src/app/api/auth`
- 추가로 민감정보 노출 경로인 `src/features/audit`도 확인했다.

### 섹션 4. 지점 장부 입력 흐름

- `src/features/ledger`
- `src/app/app/store-entry`
- `src/app/app/ledgers/[ledgerId]`

### 섹션 5. 재고/손실/FIFO

- `src/features/inventory`
- `src/features/losses`
- `src/server/calculations/inventory.ts`

### 섹션 6. 계산/정책 게이트/이상 신호

- `src/server/calculations`
- `src/features/dashboard/threshold-*`
- `src/features/dashboard/queries.ts`

## 검증 결과

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| Prisma schema | 통과 | `pnpm db:validate` exit 0 |
| TypeScript | 통과 | `pnpm typecheck` exit 0 |
| ESLint | 통과 | `pnpm lint` exit 0 |
| Unit tests | 통과 | `pnpm test:unit`: 291 pass, 0 fail |
| E2E | 미실행 | 이번 검토는 정적/단위 검증 중심으로 수행 |

검토 중 제약:

- `bmad-code-review` 커스터마이징 resolver는 로컬 Python site 인코딩 문제로 실패했다. 지침대로 설정 파일을 직접 읽고 진행했다.
- CodeGraph는 이 프로젝트에서 초기화되어 있지 않아 사용할 수 없었다.
- 서브에이전트 3개를 병렬로 사용했다. 범위는 설정/DB, 인증/권한, 장부/재고/계산으로 나누었다.

## 발견 사항

### P1. 이상 신호 기준값 migration이 기존 값을 잃는다

분류: DB/Prisma, 계산/정책 게이트

심각도: 높음

근거:

- `prisma/migrations/20260616143000_simplify_anomaly_threshold_settings/migration.sql:1`
- `src/server/calculations/anomaly.ts:241`

문제:

`20260616143000_simplify_anomaly_threshold_settings` migration은 `marginRateBps`를 `NOT NULL DEFAULT 0`으로 추가한 뒤 바로 기본값을 제거하고 기존 컬럼을 삭제한다.

현재 migration:

```sql
ALTER TABLE "AnomalyThresholdSetting"
  ADD COLUMN "marginRateBps" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AnomalyThresholdSetting"
  ALTER COLUMN "marginRateBps" DROP DEFAULT;

ALTER TABLE "AnomalyThresholdSetting"
  DROP COLUMN "salesDropRateBps",
  DROP COLUMN "grossMarginDropBps",
  DROP COLUMN "salesDifferenceAmount",
  DROP COLUMN "lossAmount";
```

기존 `grossMarginDropBps` 또는 그에 준하는 운영 기준값을 새 `marginRateBps`로 옮기는 `UPDATE`가 없다.

영향:

- 운영 DB에 저장된 이상 신호 기준값이 migration 후 `marginRateBps = 0`이 된다.
- `evaluateMarginRateSignal()`은 현재 마진율 bps가 기준값 이상이면 경고를 내지 않는다.
- 기준값이 `0`이면 대부분의 정상 마진율은 `0%` 이상이므로 "마진률 미달" 경고가 조용히 꺼질 수 있다.

확인 방법:

1. migration 전 DB에 `AnomalyThresholdSetting.grossMarginDropBps = 3500` 같은 값을 넣는다.
2. migration을 실행한다.
3. `SELECT "marginRateBps" FROM "AnomalyThresholdSetting";` 결과가 `3500`이 아니라 `0`이면 재현된다.

권장 수정:

- 기존 값을 새 컬럼으로 옮기는 `UPDATE`를 `DROP COLUMN` 전에 넣는다.
- 값의 의미가 바뀌었다면 `0`으로 조용히 초기화하지 말고 명시적인 운영 승인 또는 one-time 보정 절차를 둔다.

### P1. 감사 이력에서 장부/정정 민감값과 비허가 지점 정보가 노출된다

분류: 인증/권한/민감정보

심각도: 높음

근거:

- `src/features/audit/audit-queries.ts:14`
- `src/features/audit/audit-queries.ts:134`
- `src/features/audit/audit-queries.ts:196`
- `src/features/audit/audit-queries.ts:344`
- `src/features/audit/audit-queries.ts:356`
- `src/features/audit/audit-queries.ts:403`
- `src/features/audit/audit-format.ts:3`

문제:

감사 이력 조회는 `requireSettingsAccess()`만 요구한다. 감사 대상에는 `DailyLedger`, `CorrectionRecord`, `ReportExport`가 포함된다. 그런데 조회 결과는 `AuditLog.before`, `AuditLog.after`, `reason`을 그대로 포맷해서 반환한다.

또한 `buildAuditHistoryWhere()`는 날짜, 변경자, target type만 필터링한다. `getHeadquartersStoreScope()`나 `requireHeadquartersStoreScope()` 같은 지점 범위 제한이 없다. `resolveTargetNames()`도 `DailyLedger`와 `CorrectionRecord`를 전체 id 기준으로 조회한다.

영향:

- `SETTINGS_MANAGE`는 있지만 `REPORT_VIEW`나 `LEDGER_EDIT`가 없는 본사 사용자가 장부 감사 로그를 통해 민감 지표를 볼 수 있다.
- 지점 제한이 있는 본사 사용자가 자기 범위 밖 지점의 장부명, 변경 전후 값, 정정값을 볼 수 있다.
- `beforeText`, `afterText`, `changeSummaryText`에는 단가, 매출이익, 생산성, 결제차액, 정정 원본값/수정값이 그대로 들어갈 수 있다.

확인 방법:

1. `SETTINGS_MANAGE`만 있고 `REPORT_VIEW`가 없는 본사 계정으로 로그인한다.
2. `/app/master-data/history?targetType=DailyLedger`를 연다.
3. 변경 전/후 JSON에 `grossProfit`, `productivity`, `purchaseItems`, `unitPrice`, `originalValue`, `correctedValue` 같은 값이 보이는지 확인한다.
4. 지점 제한 권한이 있는 본사 계정으로 다른 지점 장부의 감사 이력이 보이는지 확인한다.

권장 수정:

- 감사 이력 접근 권한을 target type별로 나누거나, 최소한 장부/정정/리포트 로그는 `REPORT_VIEW`와 본사 지점 scope를 같이 요구한다.
- `DailyLedger`, `CorrectionRecord`, `ReportExport` payload는 `omitSensitiveFields()`로 포맷 전에 제거한다.
- target name 조회에도 같은 지점 scope를 적용한다.

### P1. 매입 저장 후 검토/제출 계산이 오래된 매입 수량을 사용할 수 있다

분류: 지점 장부 입력 흐름, 재고/손실/FIFO, 계산

심각도: 높음

근거:

- `src/features/ledger/actions.ts:935`
- `src/features/ledger/actions.ts:1056`
- `src/features/inventory/adjustment-reconciliation.ts:43`
- `src/features/inventory/queries.ts:430`
- `src/features/inventory/queries.ts:445`
- `src/features/ledger/review-queries.ts:396`
- `src/features/ledger/review-queries.ts:410`

문제:

재고 화면 데이터는 `getInventoryStepDataInTx()`를 통해 매입 aggregate를 다시 계산해서 보여 준다. 기존 재고 행도 `purchase?.quantity ?? item.purchasedQuantity`로 최신 매입 수량을 덮어쓴다.

반면 검토/제출 계산은 `getInventoryStepDataInTx()`의 최신 재고 line을 쓰지 않고, `tx.ledgerInventoryItem.findMany()`로 저장된 `LedgerInventoryItem.purchasedQuantity`를 직접 읽는다.

매입 저장 action은 매입 rows를 전체 삭제 후 재생성하고 `reconcileLedgerInventoryAdjustments()`만 호출한다. 이 helper는 조정 기록이 없으면 바로 return한다. 조정 기록이 있어도 조정 대상 품목만 `purchasedQuantity`를 갱신한다.

영향:

- 재고 저장 후 같은 품목의 매입 수량을 바꾸면 검토/제출 화면의 매출원가, 매출차액, 마진율, 영업이익이 오래된 수량 기준으로 계산될 수 있다.
- 지점장이 보는 재고 화면과 제출 전 검토 화면의 계산 근거가 서로 달라진다.
- 제출 검증도 같은 오래된 저장값을 볼 수 있어 계산 불일치를 막지 못한다.

확인 방법:

1. 장부에 품목 A 매입 3개를 저장한다.
2. 재고 화면에서 품목 A 재고를 저장한다.
3. 매입 화면으로 돌아가 품목 A 매입 수량을 10개로 바꾼다.
4. 검토 화면을 연다.
5. 재고 화면은 최신 매입 수량 10개를 보이지만, 검토 계산이 저장된 `LedgerInventoryItem.purchasedQuantity = 3` 기준이면 재현된다.

권장 수정:

- 매입 저장 후 모든 저장된 재고 행의 `purchasedQuantity`를 최신 매입 aggregate로 동기화한다.
- 본사 매입 수정 action에도 같은 동기화를 적용한다.
- 또는 검토/대시보드/리포트 계산 입력을 저장된 재고 행이 아니라 최신 매입 aggregate가 반영된 공통 helper로 통일한다.

### P1. 정책 미확정 계산값이 대시보드 이상 경고로 승격될 수 있다

분류: 계산/정책 게이트/이상 신호

심각도: 높음

근거:

- `src/features/dashboard/queries.ts:830`
- `src/features/dashboard/queries.ts:851`
- `src/features/dashboard/queries.ts:871`
- `src/server/calculations/anomaly.ts:226`
- `src/server/calculations/anomaly.ts:241`
- `src/server/calculations/ledger.ts:630`

문제:

`metricStatusSignal()`은 `metric.status === "policy-unconfirmed"`이면 신호를 만들지 않고 `null`을 반환한다. 그래서 "기준 확인 필요" 정보 신호가 빠진다.

그 다음 revenue anomaly 계산은 metric의 `status`를 보지 않고 `grossMarginRate.value`만 본다. `grossMarginRate`가 `policy-unconfirmed`인데도 값이 기준보다 낮으면 `margin-rate-below-threshold` warning이 나올 수 있다.

영향:

- FIFO/OQ 정책 미확정으로 계산값이 "기준 확인 필요" 상태인데도 본사 대시보드에는 "마진률 미달" 경고처럼 보일 수 있다.
- `salesDifference` 같은 정책 미확정 지표는 정보 신호로도 표시되지 않을 수 있다.
- 사용자는 "정책 확정 전 참고값"과 "확정된 이상 신호"를 구분하기 어렵다.

확인 방법:

1. `getDashboardSignals()`에 `grossMarginRate: { value: 0.2, status: "policy-unconfirmed" }`를 넣는다.
2. threshold를 `marginRateBps: 3500`으로 둔다.
3. `margin-rate-below-threshold` warning이 나오면 재현된다.

권장 수정:

- `policy-unconfirmed` metric은 정보 신호로 표시한다.
- anomaly helper에는 `status: "ok"`인 metric만 전달하거나, anomaly helper가 status를 직접 확인해 정책 미확정 값을 경고로 판정하지 않게 한다.
- `normalizeDashboardAnomalySignals()`의 downgrade만 믿지 말고, 입력 단계에서 확정값과 정책 미확정값을 분리한다.

## 섹션별 추가 판단

### 섹션 1. 프로젝트 구조/설정

차단 이슈는 발견하지 못했다.

- `package.json`의 `check`, `release:preflight`, DB script 구성은 기본 검증 흐름을 갖추고 있다.
- `src/env.js`는 production `AUTH_SECRET` placeholder를 막고, 로컬 inherited PostgreSQL URL 보정도 처리한다.
- `.env.example`은 seed 관련 값을 포함한다.

주의:

- Prisma CLI는 앱 런타임의 `src/env.js`와 다른 경로로 실행된다. `prisma.config.ts`가 `.env` 로딩을 일부 보정하지만, 배포 환경에서는 `DATABASE_URL` 형식이 표준 PostgreSQL URL인지 별도 확인이 필요하다.

### 섹션 2. DB/Prisma

schema 자체는 유효하다. 다만 migration 데이터 보존 문제가 있다.

- `pnpm db:validate` 통과.
- seed는 production 실행을 `ALLOW_PRODUCTION_SEED=true`로 막고 있어 안전장치가 있다.
- 문제는 `20260616143000_simplify_anomaly_threshold_settings` migration의 데이터 이관 누락이다.

### 섹션 3. 인증/권한/민감정보

주요 auth helper는 강해진 편이다.

- 지점장 저장 action은 `requireStoreManagerLedgerEditAccess()`를 사용한다.
- 본사 report/query는 대체로 `requireReportAccess()`와 store scope helper를 쓴다.
- 민감 필드 제거 helper와 지점장 응답 shaping도 존재한다.

남은 문제는 감사 이력이다. 감사 이력은 설정 화면 아래에 있지만 장부와 정정 기록을 포함하므로, 단순 설정 권한만으로 전체 payload를 보여 주면 안 된다.

### 섹션 4. 지점 장부 입력 흐름

상태 전이와 충돌 방어는 대체로 들어가 있다.

- 저장 action은 `version`과 editable status를 조건으로 `updateMany()`를 사용한다.
- 제출 action은 `IN_PROGRESS`에서만 `IN_REVIEW`로 전환한다.
- `IN_REVIEW` 장부는 저장 가능 상태로 유지되어 있다.

남은 문제는 매입 변경 후 재고 저장 snapshot과 검토 계산 snapshot이 달라질 수 있다는 점이다.

### 섹션 5. 재고/손실/FIFO

재고/손실 입력 검증과 민감 응답 shaping은 들어가 있다.

- 재고 조정은 기준 수량을 계산할 수 없으면 저장을 막는다.
- 손실은 시스템 재고를 초과하는 수량을 막는다.
- 지점장 재고/손실 응답은 단가와 금액 중심 필드를 제거한다.

FIFO lot helper는 존재하지만 현재 pre-approval product action에서는 호출하지 않도록 테스트가 잡혀 있다. 따라서 이번 문제는 FIFO lot 저장 자체보다, 저장된 재고 line의 매입 수량 snapshot이 최신 매입과 어긋나는 데 있다.

### 섹션 6. 계산/정책 게이트/이상 신호

핵심 계산 helper는 정책 미확정 상태를 표현하려는 구조가 있다.

- `calculateLedgerReviewSummary()`는 FIFO/OQ 관련 값을 `policy-unconfirmed`로 내릴 수 있다.
- `policy-gates.ts`에 OQ-gated metric registry가 있다.

남은 문제는 대시보드 신호 변환 단계에서 `policy-unconfirmed`가 정보 신호로 보존되지 않고, 일부 값이 이상 경고 판정으로 넘어가는 것이다.

## 권장 처리 순서

1. 감사 이력 권한/민감정보 노출 차단.
2. 이상 신호 기준값 migration 데이터 보존 수정.
3. 매입 저장 후 재고 snapshot 동기화.
4. 정책 미확정 metric의 대시보드 신호 처리 수정.
5. 위 네 가지 수정 뒤 `pnpm db:validate`, `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` 재실행.
6. 가능하면 핵심 E2E까지 실행.
