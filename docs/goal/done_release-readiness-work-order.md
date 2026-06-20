# ERP Fish 출시 전 작업 지시서

작성일: 2026-06-19

완료 상태: 작업지시서에 따른 출시 안정화 작업을 끝냈습니다.

## 목표

ERP Fish를 출시 가능한 상태로 만들기 위해 남은 검증 실패와 운영 리스크를 제거한다. 이번 작업은 새 기능 추가가 아니라 출시 안정화 작업이다.

## 원칙

- 기능 범위를 넓히지 않는다.
- DB migration은 실제 운영 데이터가 있다고 가정하고 검증한다.
- 권한 검사는 약하게 만들지 않는다.
- 화면에서 되는 것처럼 보이는 상태가 아니라, 서버 action과 DB 저장까지 검증한다.
- 각 task는 완료 기준과 검증 명령을 만족해야 끝난 것으로 본다.

## Task 1. E2E 실행이 끝나지 않는 원인 제거

**우선순위:** P0

**문제:** `pnpm test:e2e`, store ledger 핵심 묶음, 재고 단일 spec이 모두 timeout으로 끝났다.

**작업 파일 후보:**

- `playwright.config.ts`
- `scripts/run-playwright-clean.mjs`
- `scripts/playwright-clean-env.mjs`
- `tests/e2e/global-setup.ts`
- `tests/e2e/store-ledger-inventory.spec.ts`
- timeout이 재현되는 spec 파일

**작업 순서:**

1. `pnpm test:e2e -- tests/e2e/auth.spec.ts` 같은 가장 작은 spec으로 Playwright 실행 자체가 정상 종료되는지 확인한다.
2. `tests/e2e/store-ledger-inventory.spec.ts`를 `-g`로 test case 단위까지 좁힌다.
3. timeout 뒤 포트 `3102`에 서버가 남는지 확인한다.
4. 남는다면 Playwright webServer 종료, reuse 설정, dev server child process 종료 문제를 확인한다.
5. 특정 화면 wait가 멈춘다면 해당 locator와 서버 action 응답을 확인한다.
6. timeout 원인을 수정한 뒤 전체 또는 핵심 E2E 묶음을 다시 실행한다.

**완료 기준:**

- `pnpm test:e2e`가 정상 종료된다. 전체가 너무 길면 아래 핵심 묶음은 반드시 통과해야 한다.
- timeout 뒤 `netstat -ano | Select-String ':3102 '`에서 실제 `3102` listener가 남지 않는다.
- 실패 시 Playwright report가 원인 spec과 locator를 보여준다.

**최소 핵심 E2E 묶음:**

```bash
pnpm test:e2e -- tests/e2e/store-ledger-sales.spec.ts tests/e2e/store-ledger-purchase.spec.ts tests/e2e/store-ledger-inventory.spec.ts tests/e2e/store-ledger-inventory-adjustment.spec.ts tests/e2e/store-ledger-losses.spec.ts tests/e2e/store-ledger-review.spec.ts
```

## Task 2. Prisma/DB preflight 안정화

**우선순위:** P0

**문제:** Prisma validate는 표준 PostgreSQL URL을 주면 통과하지만, 실행 환경에 따라 CLI 탐색 또는 inherited `DATABASE_URL` 문제로 실패했다.

**작업 파일 후보:**

- `package.json`
- `README.md`
- `src/env.js`
- 필요하면 `prisma.config.ts`

**작업 순서:**

1. `package.json`에 명확한 DB 검증 스크립트를 추가한다.
   - `db:validate`: `prisma validate`
   - `db:generate`: `prisma generate`
   - 기존 `db:generate`가 migration을 실행하는 이름 혼선을 정리한다.
2. 배포 shell에서 `DATABASE_URL`이 반드시 `postgresql://` 또는 `postgres://`로 들어가게 문서화한다.
3. Prisma CLI가 앱의 `src/env.js` 보정을 타지 않는다는 점을 README에 적는다.
4. `package.json#prisma` deprecation 경고를 없애려면 `prisma.config.ts`로 seed 설정을 옮긴다.
5. 빈 DB와 기존 DB에 대해 migration deploy를 각각 검증한다.

**완료 기준:**

```bash
pnpm db:validate
pnpm db:migrate
pnpm test:unit
```

## Task 3. FIFO lot 운영 정책 확정

**우선순위:** P1

**문제:** 신규 FIFO lot 테이블은 앞으로 저장되는 장부에는 채워지지만, 기존 장부에는 자동 backfill이 없다.

**작업 파일 후보:**

- `src/features/inventory/fifo-lots.ts`
- `src/server/calculations/ledger.ts`
- `src/features/dashboard/queries.ts`
- `src/features/reports/queries.ts`
- 필요하면 `scripts/backfill-inventory-fifo-lots.ts`

**작업 순서:**

1. 과거 장부를 FIFO 기준으로 다시 계산해야 하는지 제품 정책을 확정한다.
2. forward-only가 맞다면 문서와 UI 문구에 "기존 장부는 기존 계산 fallback"을 명시한다.
3. backfill이 필요하면 운영 전에 script를 작성한다.
4. legacy opening lot이 포함된 지표가 계속 `policy-unconfirmed`로 표시되는지 확인한다.
5. HQ close, dashboard, daily/monthly reports에서 같은 계산 helper를 쓰는지 확인한다.

**완료 기준:**

- forward-only 또는 backfill 중 하나가 명시적으로 승인된다.
- backfill을 선택했다면 staging DB에서 script 실행 전후 count와 샘플 장부 금액을 기록한다.
- FIFO 관련 unit test가 통과한다.

## Task 4. ECOUNT 지점명 매칭 정책 확정

**우선순위:** P1

**문제:** 현재 parser는 지점명과 일자를 엄격히 비교한다. 안전하지만 운영 ECOUNT 거래처명과 ERP Fish 지점명이 다르면 정상 파일도 막는다.

**작업 파일 후보:**

- `src/features/ledger/ecount-purchase-import.ts`
- `tests/unit/ecount-purchase-import.test.mjs`
- 필요하면 지점 mapping 관련 schema/query/action

**작업 순서:**

1. 실제 ECOUNT 엑셀의 거래처명 샘플을 5개 이상 확인한다.
2. ERP Fish `Store.name`과 완전 일치하는지 확인한다.
3. `(수산물)`, 전각 괄호, 공백, 지점 별칭 처리 정책을 정한다.
4. 정책에 맞게 `normalizeStoreName()` 또는 mapping 구조를 고친다.
5. mismatch는 계속 조용히 skip하지 말고 사용자가 이해할 수 있는 오류로 보여준다.

**완료 기준:**

- 실제 운영 샘플로 정상 파일과 잘못된 파일을 모두 검증한다.
- 단위 테스트가 "정상 별칭 허용"과 "다른 지점 차단"을 함께 포함한다.

## Task 5. 권한 프로필 운영 데이터 점검

**우선순위:** P1

**문제:** 지점장 저장 action이 `LEDGER_EDIT` 권한을 새로 요구한다. 코드와 seed는 맞지만, 기존 운영 DB 사용자에게 프로필이 붙어 있지 않으면 지점장 입력이 막힌다.

**작업 파일 후보:**

- `prisma/seed.ts`
- `src/server/authz.ts`
- 필요하면 운영 one-time SQL 또는 script

**작업 순서:**

1. 운영 DB에서 active store manager 중 permission profile이 없는 사용자를 조회한다.
2. 의도된 read-only 계정과 입력 가능 계정을 구분한다.
3. 입력 가능 계정에는 `STORE_MANAGER` 또는 동등한 `LEDGER_EDIT` profile을 부여한다.
4. 본사 계정도 dashboard/report/export/edit/close 권한이 의도대로 나뉘는지 확인한다.

**완료 기준:**

- active 지점장 계정별 권한 상태 표가 있다.
- 입력 가능 지점장으로 매출/매입/재고/손실 저장 smoke test를 수행한다.

## Task 6. 매입 행 정정 범위 명시

**우선순위:** P2

**문제:** `PURCHASE_ROW`는 schema/type에는 남아 있지만 UI와 action에서는 막혀 있다.

**작업 파일 후보:**

- `src/features/corrections/schemas.ts`
- `src/features/corrections/types.ts`
- `src/features/corrections/actions.ts`
- `src/app/app/ledgers/[ledgerId]/page.tsx`

**작업 순서:**

1. 이번 출시에서 매입 행 정정을 지원하지 않는 것이 맞는지 확정한다.
2. 미지원이 맞다면 schema/type에 남기는 이유를 주석 또는 문서에 남긴다.
3. 지원해야 한다면 action, calculation overlay, report 근거까지 한 번에 구현한다.

**완료 기준:**

- UI, server action, schema, 문서가 같은 범위를 말한다.
- 미지원이면 사용자가 매입 행 정정을 선택할 수 없다.
- 지원이면 매입 정정이 대시보드와 리포트 계산에 반영된다.

## 최종 출시 게이트

아래 명령이 모두 통과해야 출시 가능으로 판단한다.

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test:unit
pnpm test:api
pnpm test:e2e
pnpm db:validate
pnpm db:migrate
```

E2E 전체가 너무 오래 걸려 release gate로 부적합하다면, 팀이 합의한 핵심 E2E 묶음을 별도 script로 만들고 CI에서 항상 실행한다.
