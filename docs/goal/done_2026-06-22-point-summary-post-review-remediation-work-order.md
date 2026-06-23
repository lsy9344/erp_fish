# point_summary.md 적용 후속 정밀 보완 작업지시서

> **Status:** done (2026-06-22 구현 완료)
> **작성일:** 2026-06-22
> **기준 문서:** `docs/meeting/point_summary.md`
> **대조 대상:** 현재 작업 트리의 `src`, `prisma`, `tests`, `docs/production-deployment.md`
> **조사 방식:** 정적 코드 조사, 기존 작업지시서 대조, 일부 단위 검증

## 구현 완료 요약 (2026-06-22)

WO-A ~ WO-I를 모두 구현/확정했다. 정책 결정 항목(WO-F 수신자 정책, WO-H 카테고리
이익률, WO-I 대시보드 리사이즈)은
`docs/meeting/point-summary-policy-decisions-2026-06-22.md`에 명문화했다.

| ID | 처리 내용 |
| --- | --- |
| WO-A | `assertStoreManagerClosingDateIsToday` 추가, 지점장 저장/제출 9개 entrypoint(ledger 6 + inventory 2 + losses 1)에 KST 오늘 가드 적용. 하드코딩 과거 날짜 E2E를 동적 KST 오늘로 전환. |
| WO-B | `authorDisplayName`을 최초 작성자로 보존(매출 저장 시 기존 값 미덮어쓰기). UI 입력 read-only, 충돌 후보에서 작성자 제외. 본사 수정도 작성자 보존. |
| WO-C | LINE 단위 테스트 정규식을 `\r?\n` 허용으로 수정(Windows CRLF 대응). |
| WO-D | 직원 쓰기(create/update/deactivate)를 `SETTINGS_MANAGE`로 분리(최소안), 조회는 `REPORT_VIEW` 유지. 쓰기 권한 없으면 폼/버튼 숨김. |
| WO-E | HR 월간 생산성 분석 추가(직원별 근무일 평균 매출/마진, 근무 인원 수별 평균, 직원 미연결 급여 행 경고). 본사 리포트 계산 재사용. |
| WO-F | `vercel.json`에 실제 Cron(`0 23 * * *`=KST 08:00) 등록. 수신자 정책 "3명 이상 허용" 확정 및 문서화. |
| WO-G | LINE 적자/마진을 본사 리포트 기준(correction-aware grossProfit/grossMarginRate, operatingProfit)으로 계산. FIFO lot에 `sourceBusinessDate` 추가(마이그레이션+backfill) 후 장기 체화 재고를 영업일 기준으로 판정. |
| WO-H | 정책 확정: 추정 매출만 제공, 카테고리 이익률 계산 불가 명시(문서+UI 문구 보강). |
| WO-I | 정책 확정: 자유 리사이즈 대신 밀도 프리셋으로 대체(문서화). 기존 E2E가 선택 범위 커버. |

## 목적

`docs/meeting/point_summary.md` 반영 상태를 다시 조사한 결과, 이전에 미완료로 보였던 항목 중 FIFO 갱신, 직원 선택, 주요 판매 품목, 냉동/생물 추정 차트, LINE 로그 마이그레이션 등은 현재 코드에 상당 부분 반영되어 있다.

하지만 원문 요구를 기준으로 보면 아직 닫히지 않은 서버 경계, 감사 추적, 권한, 자동화, 계산 정의 문제가 남아 있다. 이 문서는 남은 일을 개발자가 바로 수행할 수 있는 작업 단위로 정리한다.

## 현재 검증 결과

실행한 명령:

```powershell
pnpm db:validate
pnpm typecheck
pnpm test:unit:file tests/unit/ledger-sales.test.mjs tests/unit/ledger-review.test.mjs tests/unit/labor-employees.test.mjs tests/unit/morning-summary-notification.test.mjs
```

결과:

- `pnpm db:validate`: 통과
- `pnpm typecheck`: 통과
- `pnpm test:unit:file ...`: 실패 1건

실패:

- `tests/unit/morning-summary-notification.test.mjs:71`
- 현재 정규식이 `\n` 줄바꿈만 가정한다.
- Windows 작업 트리의 `src/features/notifications/morning-summary.ts`가 CRLF로 읽혀 `/longTermStagnantProducts,\n\s*belowTargetMarginStores,/`가 실패한다.
- 기능 실패라기보다 테스트 내 소스 스캔 방식이 줄바꿈에 취약한 상태다.

## 판정 요약

### 완료 후보로 보이는 항목

아래 항목은 코드와 테스트 흔적이 있어, 이번 작업의 주 수정 범위로 보지 않는다. 다만 최종 회귀 검증에는 포함한다.

| 항목 | 근거 | 판정 |
| --- | --- | --- |
| 재고 오차 기준 제로화 | `src/server/calculations/anomaly.ts:5`, `src/server/calculations/anomaly.ts:255`, `tests/unit/anomaly-inventory-loss-signals.test.mjs:17` | 완료 후보 |
| FIFO lot 자동 갱신 | `src/features/ledger/actions.ts:1106`, `src/features/inventory/actions.ts:331`, `src/features/losses/actions.ts:419`, `src/features/ledger/ecount-purchase-actions.ts:289` | 완료 후보 |
| 지점장 주요 판매 품목 카드 | `src/features/ledger/review-types.ts:62`, `src/features/ledger/review-queries.ts:424`, `src/features/ledger/components/review-summary-client.tsx:362` | 완료 후보 |
| 직원 마스터와 급여 행 연결 | `src/features/ledger/schemas.ts:375`, `src/features/ledger/components/workstep-client.tsx:674`, `prisma/migrations/20260622130000_add_employee_payroll_rollup/migration.sql:2` | 완료 후보 |
| LINE 발송 로그 모델/마이그레이션 | `prisma/schema.prisma:801`, `prisma/migrations/20260622131000_add_notification_delivery_log/migration.sql:2` | 완료 후보 |
| 대시보드 밀도 조절 | `src/features/dashboard/components/dashboard-layout-controls.tsx:12`, `src/app/app/dashboard/page.tsx:48`, `tests/e2e/hq-dashboard.spec.ts:544` | 부분 완료 |

### 아직 열린 항목

| ID | 우선순위 | 증거 등급 | 항목 | 현재 문제 |
| --- | --- | --- | --- | --- |
| WO-A | P0 | Confirmed | 지점장 당일 입력 제한 | 화면은 과거 날짜를 막지만 서버 액션은 클라이언트의 `closingDate`를 그대로 사용한다. |
| WO-B | P0 | Confirmed | 최초 작성자 보존 | `authorDisplayName`이 매출 저장 때마다 덮어써질 수 있다. |
| WO-C | P0 | Confirmed | LINE 단위 테스트 실패 | 현재 단위 테스트 1개가 Windows 줄바꿈 때문에 실패한다. |
| WO-D | P1 | Confirmed | HR 직원 관리 권한 | 직원 생성/수정/비활성화가 `REPORT_VIEW` 권한만으로 가능하다. |
| WO-E | P1 | Confirmed | HR 생산성 분석 | 현재 HR 화면은 급여 롤업 중심이고, 매출/마진/근무 인원 효율 분석이 없다. |
| WO-F | P1 | Deduced | LINE 8시 자동 발송 | 문서 예시는 있으나 repo 안에 실제 스케줄러 설정이 없다. |
| WO-G | P1 | Confirmed | LINE 계산 정확도 | 장기 적자/마진 미달 계산이 `총매출 - 지출`만 사용하고, 장기 체화 재고는 매입 행 `createdAt`에 의존한다. |
| WO-H | P2 | Confirmed | 냉동/생물 카테고리 이익률 | 차트는 있으나 이익률은 `null`/`계산 불가` 상태다. |
| WO-I | P2 | Confirmed | 대시보드 자유 크기 조절 | 현재 구현은 밀도 프리셋이며, 원문 표현의 자유 리사이즈와는 다르다. |

## P0 작업

### WO-A. 지점장 서버 액션에도 당일 입력 제한 적용

**문제**

`store-entry` 페이지는 오늘이 아닌 날짜를 `/app/unauthorized`로 보낸다.

근거:

- `src/app/app/store-entry/page.tsx:188`

하지만 서버 액션은 `parsed.data.closingDate`를 그대로 받아 장부를 조회하거나 생성한다.

근거:

- `src/features/ledger/actions.ts:541`
- `src/features/ledger/actions.ts:687`
- `src/features/ledger/actions.ts:779`
- `src/features/ledger/actions.ts:883`
- `src/features/ledger/actions.ts:1169`
- `src/features/ledger/actions.ts:1247`
- `src/features/inventory/actions.ts:224`
- `src/features/inventory/actions.ts:395`
- `src/features/losses/actions.ts:204`
- `src/features/ledger/queries.ts:349`
- `src/features/ledger/queries.ts:365`

**작업 지시**

- store-manager 전용 저장/제출 액션에 서버 측 날짜 가드를 추가한다.
- `closingDate`가 KST 오늘이 아니면 `FORBIDDEN` 또는 기존 권한 오류 계열로 반환한다.
- 본사 장부 수정, 본사 리포트, 본사 과거 조회 경로는 이 제한을 적용하지 않는다.
- 공통 헬퍼를 만든다. 예: `assertStoreManagerClosingDateIsToday(closingDate)`.
- 기존 하드코딩 과거 날짜 E2E는 동적 KST 오늘 날짜를 쓰도록 바꾸거나, 본사 전용 과거 조회 테스트로 분리한다.

**완료 기준**

- 지점장이 서버 액션 요청을 직접 조작해 과거 `closingDate`를 보내도 저장/제출되지 않는다.
- 과거 날짜 장부는 본사 권한 경로에서만 조회/수정된다.
- `getOrCreateStoreLedgerInTx` 자체는 본사/테스트 재사용을 위해 그대로 둘 수 있지만, store-manager action entrypoint가 반드시 먼저 막아야 한다.

**검증**

```powershell
pnpm test:unit:file tests/unit/ledger-sales.test.mjs tests/unit/ledger-submit.test.mjs tests/unit/ledger-inventory.test.mjs tests/unit/ledger-losses.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-sales.spec.ts tests/e2e/store-ledger-inventory.spec.ts tests/e2e/store-ledger-losses.spec.ts tests/e2e/store-ledger-review.spec.ts
```

### WO-B. 최초 작성자 표시명 보존

**문제**

원문 요구는 1단계 저장 시 최초 1회 작성자 실명을 받고, 이후 최종 단계까지 자동 유지하며, 사후 수정 시에도 최초 작성자 이력을 보존하는 것이다.

근거:

- `docs/meeting/point_summary.md:52`

현재 모델에는 `DailyLedger.authorDisplayName` 하나만 있고, 별도 최초 작성자 필드가 없다.

근거:

- `prisma/schema.prisma:389`

현재 저장 액션은 매출 저장 때마다 클라이언트 입력값으로 `authorDisplayName`을 갱신한다.

근거:

- `src/features/ledger/actions.ts:707`

현재 UI 입력도 장부가 읽기 전용이 아니면 계속 편집 가능하다.

근거:

- `src/features/ledger/components/sales-payment-step-client.tsx:334`
- `src/features/ledger/components/sales-payment-step-client.tsx:342`
- `src/features/ledger/components/sales-payment-step-client.tsx:343`

**작업 지시**

- 정책을 명확히 선택한다.
- 권장: `authorDisplayName`을 최초 작성자 표시명으로 취급하고, 값이 이미 있으면 store-manager 매출 저장에서 덮어쓰지 않는다.
- 더 명확한 모델이 필요하면 `initialAuthorDisplayName`과 `lastEditorDisplayName`을 분리하는 마이그레이션을 추가한다.
- 1단계 첫 저장에서는 작성자 표시명이 필수다.
- 이미 작성자가 있는 장부는 지점장 UI에서 작성자 입력을 읽기 전용으로 표시한다.
- 본사 사후 수정에서도 최초 작성자 표시는 보존한다. 변경자는 기존 `updatedById`, audit log, correction record로 추적한다.

**완료 기준**

- 최초 저장 후 다른 사용자가 매출/결제 값을 수정해도 최초 작성자 표시명은 유지된다.
- 감사 로그에는 실제 수정 계정과 수정 전/후 값이 남는다.
- 충돌 처리 화면에서도 작성자 필드가 덮어쓰기 후보로 나오지 않거나, 최초 작성자 보존 정책에 맞게 표시된다.

**검증**

```powershell
pnpm test:unit:file tests/unit/ledger-sales.test.mjs tests/unit/ledger-submit.test.mjs tests/unit/sensitive-response-shaping.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-sales.spec.ts tests/e2e/hq-ledger-edit.spec.ts
```

### WO-C. LINE 단위 테스트 줄바꿈 취약성 수정

**문제**

현재 단위 테스트가 Windows CRLF 파일을 읽을 때 실패한다.

근거:

- `tests/unit/morning-summary-notification.test.mjs:71`
- 실패 정규식: `/longTermStagnantProducts,\n\s*belowTargetMarginStores,/`

**작업 지시**

- 테스트 정규식을 `\r?\n` 허용 형태로 바꾼다.
- 가능하면 소스 문자열 포맷 대신 실제 export 함수 또는 더 안정적인 구조 검증으로 바꾼다.
- 이 작업은 제품 코드 변경 없이 테스트만 고쳐도 된다.

**완료 기준**

- Windows와 Unix 줄바꿈 모두에서 동일 테스트가 통과한다.

**검증**

```powershell
pnpm test:unit:file tests/unit/morning-summary-notification.test.mjs
```

## P1 작업

### WO-D. HR 직원 관리 권한 분리

**문제**

현재 직원 생성/수정/비활성화가 `requireReportAccess()`만 통과하면 가능하다.

근거:

- `src/features/labor/employees-actions.ts:39`
- `src/features/labor/employees-actions.ts:65`
- `src/features/labor/employees-actions.ts:111`
- `src/app/app/labor/employees/page.tsx:14`
- `src/server/authz.ts:185`

`REPORT_VIEW`는 보고서 조회 권한이다. 직원 마스터를 바꾸는 권한과 같게 두면 읽기 전용 본사 사용자도 인사 마스터를 수정할 수 있다.

**작업 지시**

- 읽기 권한과 쓰기 권한을 분리한다.
- 최소안: 직원 목록/급여 롤업 조회는 `REPORT_VIEW`, 직원 생성/수정/비활성화는 `SETTINGS_MANAGE`로 제한한다.
- 권장안: `PermissionAction.LABOR_MANAGE` 또는 `EMPLOYEE_MANAGE`를 추가하고 권한 프로필 UI/seed/테스트를 함께 갱신한다.
- 직원 관리 화면에서 쓰기 권한이 없으면 폼과 저장 버튼을 숨기거나 비활성화한다.

**완료 기준**

- 보고서 조회 권한만 가진 사용자는 직원 데이터를 볼 수 있어도 변경할 수 없다.
- 직원 변경 권한이 있는 사용자만 create/update/deactivate 서버 액션을 통과한다.
- 권한 없는 직접 서버 액션 호출은 차단된다.

**검증**

```powershell
pnpm test:unit:file tests/unit/labor-employees.test.mjs tests/unit/permission-profiles.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/labor-employees.spec.ts tests/e2e/permission-profiles.spec.ts
```

### WO-E. HR 생산성/인력 배치 분석 추가

**문제**

원문은 직원별 ID 기반 급여 누락 방지만이 아니라, 근무 인원과 매출/마진율의 관계를 분석하는 기반을 요구한다.

근거:

- `docs/meeting/point_summary.md:67`

현재 HR 쿼리는 직원별 월간 급여, 근무 지점 수, 근무일 수, 메모 수 중심이다.

근거:

- `src/features/labor/employees-queries.ts:88`
- `src/features/labor/employees-queries.ts:102`
- `src/features/labor/employees-queries.ts:175`

**작업 지시**

- HR 페이지에 월간 생산성 분석 섹션을 추가한다.
- 최소 지표:
  - 직원별 근무일의 평균 매출
  - 직원별 근무일의 평균 마진율 또는 계산 불가 사유
  - 근무 인원 수별 평균 매출
  - 근무 인원 수별 평균 마진율
  - 직원이 연결되지 않은 급여 행 수
- 계산은 기존 장부 요약 계산 로직을 재사용한다. 단순 `totalSalesAmount - expense`만 쓰지 않는다.
- 직원이 연결되지 않은 자유 입력 급여 행은 별도 `미연결` 경고로 보여준다.

**완료 기준**

- HR 화면에서 급여 롤업 외에 매출/마진/근무 인원 분석을 볼 수 있다.
- 직원 연결 누락이 분석 결과에서 조용히 사라지지 않는다.
- 계산 불가 값은 `계산 불가`와 사유로 표시한다.

**검증**

```powershell
pnpm test:unit:file tests/unit/labor-employees.test.mjs tests/unit/hq-reports.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/labor-employees.spec.ts
```

### WO-F. LINE 오전 8시 실제 스케줄러와 수신자 3명 정책 확정

**문제**

문서에는 외부 크론 예시가 있지만, repo 안에는 실제 스케줄러 설정이 없다.

근거:

- `docs/production-deployment.md:141`
- `docs/production-deployment.md:155`
- `rg --files | rg "(^|/)vercel\\.json$|(^|/)\\.github/workflows/.*\\.(ya?ml)$|cron|scheduler"` 결과 없음

또한 원문은 핵심 관리자 3명에게 발송한다고 했지만, route는 수신자 목록이 비어 있지 않은지만 검사한다.

근거:

- `docs/meeting/point_summary.md:74`
- `src/app/api/internal/notifications/morning-summary/route.ts:30`
- `src/app/api/internal/notifications/morning-summary/route.ts:35`

**작업 지시**

- 배포 플랫폼을 확정한다.
- Vercel이면 `vercel.json`에 `0 23 * * *` cron을 추가한다.
- GitHub Actions면 `.github/workflows/morning-summary.yml`을 추가한다.
- `LINE_MORNING_SUMMARY_RECIPIENT_IDS`는 정확히 3명이어야 하는지, 3명 이상 허용인지 정책을 확정한다.
- 원문 그대로라면 정확히 3개 ID를 요구하고, 아니면 배포 문서에 “3명 이상 가능”으로 정책 변경을 명시한다.

**완료 기준**

- repo만 보고도 매일 KST 08:00 호출 설정이 확인된다.
- 수신자 수 정책이 코드와 문서에서 일치한다.
- 스케줄러 호출은 `INTERNAL_CRON_SECRET` 인증을 사용한다.

**검증**

```powershell
pnpm test:unit:file tests/unit/morning-summary-notification.test.mjs
pnpm test:api
```

### WO-G. LINE 장기 적자/마진 미달/장기 체화 재고 계산 보정

**문제**

현재 장기 적자와 목표 마진율 미달 계산은 최근 30일 장부에서 `totalSalesAmount - ledgerExpenses`만 본다.

근거:

- `src/features/notifications/morning-summary.ts:133`
- `src/features/notifications/morning-summary.ts:146`
- `src/features/notifications/morning-summary.ts:159`
- `src/features/notifications/morning-summary.ts:186`
- `src/features/notifications/morning-summary.ts:191`

이 계산은 매입, 손실, 급여, FIFO 원가, 본사 정정 반영 상태를 충분히 반영하지 못한다.

장기 체화 재고도 `sourcePurchaseItem.createdAt`를 기준으로 삼고, 매입 행이 없는 이월/기초/legacy lot은 제외한다.

근거:

- `src/features/notifications/morning-summary.ts:214`
- `src/features/notifications/morning-summary.ts:263`
- `src/features/notifications/morning-summary.ts:283`
- `src/features/inventory/fifo-lots.ts:105`
- `src/features/inventory/fifo-lots.ts:338`

**작업 지시**

- 마진/적자 계산은 기존 장부 요약 또는 리포트 계산을 재사용한다.
- 본사 리포트의 `grossProfit`, `grossMarginRate`, correction-aware metric 계산과 같은 기준을 쓰는 것이 우선이다.
- 장기 적자의 정의를 확정한다.
  - 권장: 최근 30일 누적 영업이익 또는 gross profit이 음수인 지점.
  - 대안: 최근 N일 연속 적자인 지점.
- 장기 체화 재고는 lot의 실제 입고 기준일을 보존하도록 모델을 보강한다.
  - 권장: `LedgerInventoryFifoLot.sourceBusinessDate` 또는 `sourceDate` 추가.
  - `PURCHASE`는 매입 장부의 `closingDate`를 사용한다.
  - `PREVIOUS_CARRYOVER`/`OPENING`/`LEGACY_OPENING`은 원천 장부일 또는 이월 기준일을 사용한다.
- 기존 `createdAt` 기준은 데이터 입력 시각이라 영업 기준일과 다를 수 있으므로 제거한다.

**완료 기준**

- LINE 요약의 마진/적자 판정이 본사 리포트 숫자와 같은 기준을 쓴다.
- 30일 이상 남아 있는 이월/기초 재고도 장기 체화 후보에 포함된다.
- 알림 테스트가 실제 계산 데이터 케이스를 검증한다. 단순 소스 스캔만으로 끝내지 않는다.

**검증**

```powershell
pnpm db:validate
pnpm test:unit:file tests/unit/morning-summary-notification.test.mjs tests/unit/hq-reports.test.mjs tests/unit/ledger-inventory.test.mjs
pnpm test:api
```

## P2 작업

### WO-H. 냉동/생물 카테고리 이익률 요구 범위 결정

**문제**

원문은 냉동/생물 총매출액과 카테고리별 이익률을 한눈에 보는 차트를 요구한다.

근거:

- `docs/meeting/point_summary.md:26`

현재 차트는 추정 매출을 보여주지만 `grossMarginRate`는 `null`이고 UI에는 `계산 불가`로 표시된다.

근거:

- `tests/unit/hq-reports.test.mjs:188`
- `src/features/reports/components/product-category-margin-chart.tsx:107`

**작업 지시**

- 제품 정책을 확정한다.
- 실제 카테고리 이익률까지 요구한다면 FIFO consumed amount 또는 매입 원가 기준으로 카테고리 COGS를 계산한다.
- 정확한 POS 품목별 매출이 없어서 이익률 산출이 불가하다는 정책이면, `docs/meeting/point_summary.md` 대응 메모 또는 작업지시서에 “추정 매출만 제공, 이익률은 계산 불가”로 명시한다.
- 원문 그대로 구현하려면 `grossMarginRate`를 계속 `null`로 두면 안 된다.

**완료 기준**

- 냉동/생물 차트가 이익률을 표시하거나, 이익률 제외 정책이 문서화되어 이해관계자 승인을 받은 상태다.
- UI 문구가 확정값과 추정값을 혼동시키지 않는다.

**검증**

```powershell
pnpm test:unit:file tests/unit/hq-reports.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/hq-reports.spec.ts
```

### WO-I. 대시보드 자유 리사이즈 요구 범위 결정

**문제**

원문은 모든 대시보드 컴포넌트 크기를 사용자의 요구에 따라 자유롭게 키우고 조절한다고 되어 있다.

근거:

- `docs/meeting/point_summary.md:10`

현재 구현은 자유 리사이즈가 아니라 `기본/넓게/압축` 밀도 프리셋과 테이블 컬럼 폭 조절이다.

근거:

- `src/features/dashboard/components/dashboard-layout-controls.tsx:12`
- `src/features/dashboard/components/dashboard-layout-controls.tsx:13`
- `src/features/dashboard/components/dashboard-layout-controls.tsx:63`
- `src/features/dashboard/components/hq-dashboard-table.tsx:397`

**작업 지시**

- 요구 범위를 확정한다.
- 밀도 프리셋이 충분하면 `point_summary` 대응 문서에 “자유 리사이즈 대신 운영 안정성을 위해 밀도 프리셋으로 대체”라고 기록한다.
- 자유 리사이즈가 필요하면 요약 카드, 테이블, 주요 섹션 단위의 resize/persist 기능을 추가한다.
- 임의 드래그 레이아웃까지 할지, 폭/높이 프리셋만 할지 먼저 정한다.

**완료 기준**

- 원문 대비 대체 구현인지, 진짜 자유 리사이즈 구현인지 명확하다.
- 선택된 범위에 맞는 E2E가 있다.

**검증**

```powershell
pnpm test:unit:file tests/unit/hq-dashboard.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/hq-dashboard.spec.ts
```

## 최종 회귀 검증

모든 작업 완료 후 아래를 실행한다.

```powershell
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:api
pnpm test:e2e:core
git diff --check
```

## 구현 순서

1. WO-C: 현재 실패 중인 LINE 단위 테스트를 먼저 고친다.
2. WO-A: 지점장 과거 날짜 서버 액션 차단을 적용한다.
3. WO-B: 최초 작성자 보존 정책을 모델/액션/UI에 반영한다.
4. WO-D: HR 쓰기 권한을 조회 권한과 분리한다.
5. WO-G: LINE 계산 기준을 본사 리포트 기준과 맞춘다.
6. WO-F: 실제 오전 8시 스케줄러와 수신자 3명 정책을 확정한다.
7. WO-E: HR 생산성 분석을 추가한다.
8. WO-H, WO-I: 원문 요구와 대체 구현 사이의 정책 결정을 닫는다.

## 주의 사항

- 이미 완료 후보인 FIFO 갱신, 지점장 주요 판매 품목, 직원 선택 UI는 불필요하게 다시 구현하지 않는다.
- 지점장 화면의 민감 지표 차단을 약화하지 않는다.
- 본사 과거 조회/수정 기능과 지점장 당일 입력 제한을 같은 규칙으로 묶지 않는다.
- 소스 스캔 테스트는 가능하면 줄바꿈과 포맷에 덜 민감하게 작성한다.
