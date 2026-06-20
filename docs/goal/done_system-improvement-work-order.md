# done_ERP Fish 시스템 개선 작업 지시서

작성일: 2026-06-19

## 작업 완료 메모

2026-06-19에 우선 작업 범위인 1단계, 2단계, 3단계를 끝냈다. 6단계 중 DB migration과 무관한 임시 파일 정리도 끝냈다.

4단계의 보고서/대시보드 대형 쿼리 파일 분리, 5단계의 테스트 구조 전면 개선, 6단계의 `Post` 모델 제거는 별도 작업으로 남긴다. 특히 `Post` 제거는 운영 데이터 확인과 migration이 필요하므로 이번 작업에서 진행하지 않았다.

## 목적

ERP Fish의 운영 안정성, 개발 속도, 유지보수성을 높인다. 이번 작업은 기능 추가가 아니라 비합리적인 구조와 반복을 줄이는 개선 작업이다.

## 작업 원칙

- 기존 사용자 흐름을 바꾸지 않는다.
- 큰 리팩터링은 작은 PR로 나눈다.
- 권한 검사는 약하게 만들지 않는다.
- DB migration은 운영 데이터 존재 여부를 확인한 뒤 만든다.
- 각 단계는 `pnpm typecheck`, `pnpm lint`, 관련 unit test로 확인한다.

## 1단계. 개발 명령과 Prisma 설정 정리

### 작업

1. 현재 `.env`의 `DATABASE_URL`을 PostgreSQL URL 형식으로 맞춘다.
2. `pnpm exec prisma validate`가 왜 Prisma CLI를 찾지 못하는지 확인한다.
3. `package.json#prisma` seed 설정을 `prisma.config.ts`로 옮긴다.
4. `package.json` 스크립트를 정리한다.
   - `db:generate`: `prisma generate`
   - `db:migrate:dev`: `prisma migrate dev`
   - `db:migrate`: `prisma migrate deploy`
   - `db:validate`: `prisma validate`
   - `check`: `pnpm lint && pnpm typecheck`
5. README의 검증 명령을 새 스크립트 기준으로 갱신한다.

### 완료 기준

- `pnpm db:validate`가 통과한다.
- `pnpm check`에서 `next lint` deprecation 경고가 사라진다.
- README의 명령과 `package.json` 스크립트가 서로 맞다.

### 검증 명령

```bash
pnpm db:validate
pnpm check
pnpm test:unit
```

## 2단계. 장부 상태 정책 공통화

### 작업

1. `src/features/ledger/status-policy.ts`를 만든다.
2. 다음 규칙을 한곳에 모은다.
   - 수정 가능 상태: `IN_PROGRESS`, `IN_REVIEW`
   - 읽기 전용 상태: `HEADQUARTERS_CLOSED`, `HOLIDAY`
   - 상태별 에러 코드와 사용자 메시지
3. store manager 액션, HQ edit 액션, HQ close 액션, client read-only 판단을 새 helper로 교체한다.
4. 상태 정책 unit test를 추가한다.

### 완료 기준

- `editableLedgerStatuses`가 여러 파일에 중복 선언되어 있지 않다.
- `HEADQUARTERS_CLOSED`와 `HOLIDAY` 편집 차단 메시지가 한곳에서 관리된다.
- 기존 장부 저장/제출/마감 테스트가 통과한다.

### 검증 명령

```bash
pnpm test:unit:file tests/unit/ledger-submit.test.mjs
pnpm test:unit:file tests/unit/ledger-sales.test.mjs
pnpm test:unit:file tests/unit/ledger-inventory.test.mjs
pnpm test:unit:file tests/unit/ledger-losses.test.mjs
pnpm typecheck
```

## 3단계. 캐시 갱신 helper 도입

### 작업

1. `src/server/revalidation.ts` 또는 `src/features/ledger/revalidation.ts`를 만든다.
2. 반복 경로를 helper로 묶는다.
   - `revalidateDashboardAndReports()`
   - `revalidateStoreEntryPaths()`
   - `revalidateLedgerDetailPath(ledgerId)`
   - `revalidateMasterDataPaths(kind)`
3. 기존 액션의 `revalidatePath(...)` 직접 나열을 helper 호출로 바꾼다.
4. 테스트의 문자열 검사는 helper 이름 중심으로 줄인다.

### 완료 기준

- 동일한 보고서 경로 묶음이 여러 액션에 직접 반복되지 않는다.
- 장부/재고/손실/마스터 데이터 저장 후 기존 화면 갱신이 유지된다.

### 검증 명령

```bash
pnpm test:unit
pnpm typecheck
```

## 4단계. 보고서와 대시보드 쿼리 파일 분리

### 작업

1. `src/features/reports/queries.ts`를 기능 단위로 나눈다.
   - `daily-meeting-queries.ts`
   - `store-comparison-queries.ts`
   - `monthly-closing-anomaly-queries.ts`
   - `report-shared.ts`
2. `src/features/dashboard/queries.ts`의 공통 타입과 변환 helper를 shared module로 옮긴다.
3. public export는 기존 import가 크게 깨지지 않게 유지한다.
4. 먼저 파일 분리만 하고, 계산 로직 변경은 하지 않는다.

### 완료 기준

- 단일 query 파일이 1,000줄을 크게 넘지 않는다.
- 보고서별 테스트가 기존과 같은 결과를 낸다.
- `calculateLedgerReviewSummary` 호출 위치는 명확하게 유지된다.

### 검증 명령

```bash
pnpm test:unit:file tests/unit/hq-dashboard.test.mjs
pnpm test:unit:file tests/unit/hq-reports.test.mjs
pnpm typecheck
```

## 5단계. 테스트 구조 개선

### 작업

1. `readFileSync`로 소스 문자열을 검사하는 테스트를 분류한다.
   - 반드시 남길 아키텍처 가드
   - 함수 import 기반 테스트로 바꿀 수 있는 테스트
   - E2E나 integration test가 더 맞는 테스트
2. 새 폴더나 파일명으로 아키텍처 가드를 구분한다.
3. 리팩터링 대상 파일부터 동작 기반 테스트로 옮긴다.

### 완료 기준

- 단순 코드 이동 때문에 깨지는 테스트 수가 줄어든다.
- 핵심 권한/보안 경계 테스트는 유지된다.
- 리팩터링 PR에서 테스트 수정량이 줄어든다.

### 검증 명령

```bash
pnpm test:unit
pnpm lint
```

## 6단계. 스캐폴드와 임시 파일 정리

### 작업

1. `Post` 모델이 운영 데이터에 쓰이는지 확인한다.
2. 사용하지 않는다면 Prisma schema에서 `Post`와 `User.posts`를 제거한다.
3. 새 migration으로 `"Post"` 테이블을 제거한다.
4. `.tmp-link-check.js`를 삭제하거나 `scripts/`로 옮긴다.
5. `.gitignore`에 `.tmp-*.js`를 추가한다.

### 완료 기준

- 업무 도메인과 무관한 `Post` 모델이 남아 있지 않다.
- 추적 중인 임시 Playwright 파일이 없다.
- 필요한 디버그 스크립트는 계정 정보를 환경 변수로 받는다.

### 검증 명령

```bash
pnpm db:validate
pnpm test:unit
git ls-files ".tmp-*"
```

## 추천 작업 순서

1. 1단계만 먼저 처리해 개발 명령을 믿을 수 있게 만든다.
2. 2단계와 3단계는 같은 PR에서 처리해도 된다.
3. 4단계는 큰 변경이므로 별도 PR로 한다.
4. 5단계는 4단계와 함께 조금씩 진행한다.
5. 6단계는 DB 확인이 필요하므로 운영 반영 전에 따로 검토한다.

## 주의할 점

- `Post` 제거는 migration이 필요하므로 단순 삭제로 끝내지 않는다.
- 권한 helper를 캐시할 때는 사용자별, 요청별 범위를 넘지 않게 한다.
- 캐시 갱신 helper는 경로를 덜 갱신하는 방향이 아니라 빠뜨리지 않는 방향으로 설계한다.
- 테스트 문자열 검사를 줄일 때 보안 경계 확인까지 없애면 안 된다.
