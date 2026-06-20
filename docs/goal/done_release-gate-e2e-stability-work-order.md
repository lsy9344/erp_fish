# ERP Fish 출시 게이트 잔여 검증 및 E2E 안정화 작업 지시서

작성일: 2026-06-19

완료 상태: 이 작업지시서에 따른 로컬 출시 안정화 작업을 끝냈습니다.

## 작업 완료 기록

- `tests/e2e/store-ledger-sales.spec.ts`의 `loginAsStoreManager()`를 보강해 로그인 실패 시 alert, pending 상태, auth/navigation 응답, 실패한 요청, browser console 경고/오류가 Playwright 실패 메시지에 함께 남도록 했다.
- `package.json`에 `release:preflight`를 추가해 `db:validate`, `typecheck`, `lint`, `build`, `test:unit`, `test:api`, `test:e2e:core`, `git diff --check`가 한 worktree에서 직렬로 실행되도록 했다.
- `README.md`에 release gate 직렬 실행 계약과 `.next`를 공유하는 build/API/E2E 병렬 실행 금지 조건을 명시했다.
- FIFO forward-only 정책, ECOUNT 지점명/마감일 scope 기준, `PURCHASE_ROW` 출시 제외, active 지점장 `LEDGER_EDIT` 확인 SQL을 문서에 남겼다.
- 실제 운영 ECOUNT 샘플 5개와 운영/staging DB 권한표 캡처는 로컬 workspace에 없어서 새 증거를 만들 수 없었다. 릴리스 승인 전 외부 샘플과 대상 DB 결과표를 첨부해야 한다는 점을 운영 증거 메모로 분리했다.
- 구조 개선 backlog는 출시 안정화 완료 범위와 분리했다.
- 캘린더 페이지 UI는 변경하지 않았다.

검증 결과:

```powershell
pnpm test:playwright -- tests/e2e/store-ledger-sales.spec.ts
# 12 passed

pnpm test:e2e:core
# 48 passed

pnpm test:playwright -- tests/e2e/store-ledger-sales.spec.ts
# 12 passed

pnpm release:preflight
# db:validate, typecheck, lint, build, test:unit, test:api, test:e2e:core, git diff --check 통과

netstat -ano | Select-String ':3102 '
# LISTENING 없음. TIME_WAIT 연결만 확인.
```

## 검토 배경

`docs/goal`의 완료 표시된 검토 결과와 작업지시서를 기준으로 현재 작업 트리를 대조했다. 개발 명령 정리, 장부 상태 정책 공통화, 캐시 갱신 helper, ECOUNT 지점/일자 scope 검증, FIFO 정책 gate, `PURCHASE_ROW` 정정 차단과 리포트 근거 연결은 코드와 단위 테스트 기준으로 대체로 반영되어 있다.

다만 출시 게이트 기준으로는 핵심 E2E 묶음이 아직 통과하지 않았고, 운영 데이터로만 확인할 수 있는 항목의 증거가 남아 있다. 이 문서는 새 기능 추가가 아니라 출시 가능 판정을 위한 잔여 보완 작업만 다룬다.

## 작업 전 확인한 검증 결과

통과:

```powershell
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build
pnpm test:api
git diff --check
```

부분 통과/실패:

```powershell
pnpm test:e2e:core
```

결과:

- 48개 중 46개 통과, 2개 실패.
- 실패 1: `tests/e2e/store-ledger-sales.spec.ts`의 `390px에서 매출/결제 키패드 입력성과 터치 타깃이 충족된다`
- 실패 2: `tests/e2e/store-ledger-sales.spec.ts`의 `저장 실패 시 한국어 오류와 재시도 동작이 표시된다`
- 두 실패 모두 `loginAsStoreManager()` 이후 `/app/store-entry`로 가지 못하고 `/login`에 머물렀다. 실패 시 로그인 폼은 disabled 상태였다.
- 실패 후 DB의 `manager@example.com`은 `isActive: true`, `STORE_MANAGER` profile, `LEDGER_EDIT`, `store-gangnam` 배정이 정상으로 확인되었다.
- 실패한 `390px` 케이스는 단독 실행에서 통과했다.
- `store-ledger-sales.spec.ts -g 저장` 부분 실행에서는 원래 실패한 `저장 실패...` 케이스는 통과했지만, 같은 파일의 다른 저장 관련 케이스 2개가 timeout으로 실패했다.

주의:

- `pnpm build`와 `pnpm test:api`를 병렬로 실행하면 `.next` 산출물 충돌로 보이는 React Client Manifest/PageNotFound 오류가 발생했다. 같은 명령을 직렬로 다시 실행하면 둘 다 통과했다. 출시 게이트 명령은 직렬 실행해야 한다.

## Task 1. 핵심 E2E 묶음을 안정적으로 통과시킨다

**우선순위:** P0

**문제:** `pnpm test:e2e:core`가 46/48에서 멈춘다. 실패 케이스 자체는 단독으로 통과하므로 단순 UI assertion 오류보다 테스트 순서, 서버 상태, auth 요청, DB connection, session/cookie 상태 누수 가능성이 높다.

**작업 파일 후보:**

- `tests/e2e/store-ledger-sales.spec.ts`
- `tests/e2e/global-setup.ts`
- `playwright.config.ts`
- `scripts/run-playwright-clean.mjs`
- `scripts/playwright-clean-env.mjs`
- 로그인 form/action 관련 `src/app/login/**`, `src/server/authz.ts`, `src/server/auth.ts`

**작업 순서:**

1. `pnpm test:playwright -- tests/e2e/store-ledger-sales.spec.ts`를 단독 실행해 sales spec 전체가 재현되는지 확인한다.
2. 실패 시점의 login POST 응답, 서버 로그, browser console, trace를 확인한다.
3. `loginAsStoreManager()`에서 단순 URL 대기만 하지 말고 로그인 실패 alert, pending 상태 장기화, callback redirect 응답을 구분해 원인을 드러내도록 보강한다.
4. sales spec 안에서 DB fixture가 날짜 `2026-06-02`와 공용 사용자 `manager@example.com`에 남기는 상태를 test별로 완전히 정리하는지 확인한다.
5. 여러 spec을 이어서 실행할 때 PrismaClient/DB connection/session이 누적되어 auth 요청이 느려지거나 멈추는지 확인한다.
6. 원인이 테스트 fixture라면 fixture reset을 고치고, 제품 코드 문제라면 최소 재현 테스트를 먼저 만든 뒤 수정한다.

**완료 기준:**

- 아래 명령이 2회 연속 통과한다.

```powershell
pnpm test:playwright -- tests/e2e/store-ledger-sales.spec.ts
pnpm test:e2e:core
netstat -ano | Select-String ':3102 '
```

- `3102` 포트에 LISTENING 프로세스가 남지 않는다.
- 실패 시 Playwright report가 login pending, auth error, DB timeout, assertion 실패를 구분해서 보여준다.

## Task 2. 출시 게이트 명령을 직렬 실행 계약으로 고정한다

**우선순위:** P1

**문제:** `next build`와 Playwright dev server를 병렬 실행하면 같은 `.next` 산출물을 건드려 잘못된 실패가 난다. 이번 검토에서도 병렬 실행 때는 build/API가 실패했고, 직렬 실행 때는 둘 다 통과했다.

**작업 파일 후보:**

- `README.md`
- `package.json`
- `.github/workflows/**`
- 필요하면 `scripts/release-preflight.mjs`

**작업 순서:**

1. README의 출시 검증 절차에 "build/API/E2E는 같은 worktree에서 병렬 실행하지 않는다"를 명시한다.
2. CI나 local release script가 있다면 `pnpm build`, `pnpm test:api`, `pnpm test:e2e:core`를 직렬로 실행하게 한다.
3. 병렬화가 필요하면 worktree 또는 isolated build output을 분리한다.

**완료 기준:**

- 출시 검증 명령을 한 번에 실행하는 단일 절차가 있다.
- 같은 `.next`를 공유하는 build/dev server 병렬 실행 경로가 없다.

## Task 3. 운영 데이터 기반 출시 증거를 남긴다

**우선순위:** P1

**문제:** 코드와 unit test로 확인할 수 없는 운영형 항목이 아직 완료 증거로 남아 있지 않다.

**작업 항목:**

1. 실제 ECOUNT 엑셀 샘플 5개 이상으로 지점명 matching 정책을 검증한다.
   - 정상 허용: 완전 일치, `(수산물)` 접미어, 전각 괄호
   - 차단: 다른 base store name, 다른 마감일
2. 운영 또는 staging DB에서 active 지점장 계정별 `LEDGER_EDIT` 권한 표를 남긴다.
3. FIFO는 이번 출시에서 forward-only인지 backfill인지 최종 승인 기록을 남긴다.
4. backfill을 하지 않는다면 기존 장부의 FIFO-derived 금액이 계속 `policy-unconfirmed` 또는 fallback 상태로 표시되는 샘플을 기록한다.
5. `PURCHASE_ROW` 정정이 이번 출시 범위 밖이라는 점을 릴리스 노트 또는 운영 안내에 명시한다.

**완료 기준:**

- 운영 샘플, 권한 표, FIFO 정책 결정이 문서에 남아 있다.
- 운영 DB에 `LEDGER_EDIT` 없는 입력 대상 지점장이 없거나, 의도된 read-only 계정으로 분리되어 있다.
- ECOUNT 정상 파일과 잘못된 파일의 처리 결과가 각각 캡처되어 있다.

## Task 4. 의도적으로 남긴 구조 개선 항목을 별도 backlog로 분리한다

**우선순위:** P2

**문제:** 아래 항목은 기존 작업지시서에서 별도 작업으로 남긴다고 했고, 현재 작업 트리에도 남아 있다. 출시 차단은 아니지만 완료 범위와 섞이면 안 된다.

**남은 항목:**

- `prisma/schema.prisma`의 T3 기본 `Post` 모델과 `User.posts`
- `src/features/reports/queries.ts` 대형 파일 분리
- `src/features/dashboard/queries.ts` 대형 파일 분리
- `tests/unit`의 소스 문자열 기반 구조 검사 축소와 아키텍처 가드 분리

**완료 기준:**

- 출시 안정화 작업과 구조 개선 backlog가 문서상 분리되어 있다.
- 위 항목을 이번 출시 완료 범위로 표현하지 않는다.

## 운영 증거 및 범위 메모

로컬 작업 기준으로 남긴 출시 증거와 외부 확인이 필요한 항목을 분리한다.

- ECOUNT 지점명 matching 정책은 `README.md`의 Release Preflight Notes에 정상 허용/차단 기준을 남겼다. 다만 이 로컬 workspace에는 실제 운영 ECOUNT 엑셀 샘플 5개와 처리 캡처가 포함되어 있지 않으므로, 운영 승인 전 별도 첨부가 필요하다.
- active 지점장 `LEDGER_EDIT` 권한 확인용 SQL은 `README.md`에 남겼다. 운영 또는 staging DB에서 실행한 결과표는 외부 DB 접근 권한이 있는 담당자가 릴리스 승인 전 첨부해야 한다.
- FIFO 정책은 이번 출시에서 forward-only로 둔다. 과거 장부 backfill은 별도 승인된 staging run으로 분리하고, 기존 장부의 FIFO-derived 금액은 근거가 확정되지 않으면 `policy-unconfirmed` 또는 fallback 상태로 유지한다.
- `PURCHASE_ROW` 정정은 이번 출시 범위 밖이다. enum/type은 호환성을 위해 남아 있지만 UI 선택과 서버 생성은 차단된 상태로 둔다.
- 구조 개선 backlog는 `docs/goal/done_system-improvement-work-order.md`와 `docs/goal/done_system-efficiency-review.md`로 분리되어 있으며, 이번 출시 안정화 완료 범위에 포함하지 않는다.

## 최종 재검증 명령

작업 완료 후 아래를 직렬로 실행한다.

```powershell
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm build
pnpm test:unit
pnpm test:api
pnpm test:e2e:core
git diff --check
```

전체 E2E까지 출시 게이트로 삼는다면 마지막에 추가로 실행한다.

```powershell
pnpm test:e2e
```
