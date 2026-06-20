# done_ERP Fish 시스템 효율 개선 검토

작성일: 2026-06-19

## 작업 완료 메모

2026-06-19에 이 검토에서 먼저 권장한 개발 명령 정리, 장부 상태 정책 공통화, 캐시 갱신 helper 도입을 끝냈다. 추적 중이던 임시 Playwright 파일도 작업트리에서 제거하고 `.tmp-*.js` ignore 규칙을 추가했다.

대형 쿼리 파일 분리, 테스트 구조 전면 개선, `Post` 모델 제거는 별도 작업으로 남긴다. `Post` 모델 제거는 운영 데이터 확인과 migration이 필요해 이번 작업에서는 하지 않았다.

## 요약

현재 코드의 기본 품질 신호는 좋다. `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm check`는 모두 통과했다. 다만 운영과 유지보수 관점에서 반복된 규칙, 오래 남은 스캐폴드, 깨지기 쉬운 개발 명령, 큰 파일이 누적되어 있다.

가장 먼저 손볼 후보는 다음 순서다.

1. 로컬 Prisma 검증/DB 명령 흐름 정리
2. 장부 상태 정책과 캐시 갱신 경로 공통화
3. 보고서/대시보드 대형 쿼리 파일 분리
4. 소스 문자열 정규식 기반 단위 테스트 축소
5. 추적 중인 임시 Playwright 파일 정리

## 확인한 명령

| 명령 | 결과 | 메모 |
| --- | --- | --- |
| `pnpm typecheck` | 통과 | TypeScript 오류 없음 |
| `pnpm lint` | 통과 | ESLint 오류 없음 |
| `pnpm test:unit` | 통과 | 279개 테스트 통과 |
| `pnpm check` | 통과 | `next lint` 사용 중단 경고 발생 |
| `pnpm exec -- prisma validate` | 실패 | 현재 환경에서 `prisma` 실행 파일을 찾지 못함 |
| `.\\node_modules\\.bin\\prisma.CMD validate` | 실패 | 현재 `.env`의 `DATABASE_URL` 형식이 PostgreSQL URL이 아님 |

## 발견 사항

### P1. Prisma 검증과 DB 명령 흐름이 불안정하다

근거:

- `README.md:113`은 `pnpm exec prisma validate`를 빠른 검증 명령으로 안내한다.
- 현재 실행한 `pnpm exec -- prisma validate`는 `'prisma' is not recognized`로 실패했다.
- 직접 실행한 `.\\node_modules\\.bin\\prisma.CMD validate`는 Prisma를 찾았지만 `DATABASE_URL` 형식 오류로 실패했다.
- `.env.example:20`은 올바른 `postgresql://...` 형식을 안내한다.
- `package.json:70`의 `package.json#prisma` 설정은 Prisma 7에서 제거될 예정이라는 경고가 기존 로그에 남아 있다.

왜 문제인가:

README의 검증 명령이 현재 워크스페이스에서 바로 성공하지 않는다. 새 개발자나 CI 이슈 분석자가 DB 스키마가 맞는지 빠르게 확인하기 어렵다.

권장 조치:

- 로컬 `.env`의 `DATABASE_URL` 형식을 PostgreSQL URL로 맞춘다.
- `pnpm exec prisma ...`가 왜 로컬 bin을 찾지 못하는지 확인한다.
- `package.json#prisma` seed 설정을 `prisma.config.ts`로 옮긴다.
- `pnpm db:validate` 스크립트를 추가해 팀이 같은 명령을 쓰게 한다.

### P1. `db:generate` 스크립트 이름이 실제 동작과 다르다

근거:

- `package.json:9`에서 `"db:generate": "prisma migrate dev"`로 되어 있다.
- `package.json:17`에는 별도로 `"postinstall": "prisma generate"`가 있다.

왜 문제인가:

`generate`라는 이름은 보통 Prisma Client 생성만 뜻한다. 그런데 실제로는 개발 마이그레이션을 실행한다. 실수로 DB 마이그레이션을 만들거나 적용할 수 있다.

권장 조치:

- `db:generate`는 `prisma generate`로 바꾼다.
- 기존 동작은 `db:migrate:dev` 같은 이름으로 옮긴다.

### P1. 장부 상태 정책이 여러 파일에 반복된다

근거:

- `src/features/ledger/actions.ts:61`과 `src/features/ledger/hq-close-actions.ts:24`에 `editableLedgerStatuses`가 각각 있다.
- `HEADQUARTERS_CLOSED`, `HOLIDAY`, `LEDGER_CLOSED`, `LEDGER_NOT_EDITABLE` 처리가 `ledger`, `inventory`, `losses`, `hq-edit` 액션과 클라이언트 컴포넌트에 반복된다.
- 예: `src/features/ledger/actions.ts:194`, `src/features/inventory/actions.ts:106`, `src/features/losses/actions.ts:68`, `src/features/ledger/hq-edit-actions.ts:273`

왜 문제인가:

장부 상태 규칙은 ERP의 핵심 규칙이다. 같은 규칙이 흩어져 있으면 새 상태가 추가될 때 한 곳을 빠뜨릴 수 있다.

권장 조치:

- `src/features/ledger/status-policy.ts` 같은 공통 모듈을 만든다.
- `isLedgerEditable`, `isLedgerReadOnly`, `getLedgerEditBlockReason`, `editableLedgerStatuses`를 한곳에서 제공한다.
- 서버 액션과 클라이언트 UI가 같은 정책 함수를 쓰도록 바꾼다.

### P2. 캐시 갱신 경로가 액션마다 직접 나열된다

근거:

- `src/features/ledger/actions.ts:64-78`
- `src/features/ledger/hq-edit-actions.ts:98-105`
- `src/features/inventory/actions.ts:204-208`
- `src/features/losses/actions.ts:100-106`
- `src/features/corrections/actions.ts:241-245`
- `src/features/master-data/actions.ts:35-39`

왜 문제인가:

새 화면이 추가되거나 경로가 바뀌면 모든 액션을 찾아 고쳐야 한다. 빠뜨리면 화면에 오래된 데이터가 남는다.

권장 조치:

- `src/server/revalidation.ts` 또는 `src/features/ledger/revalidation.ts`를 만든다.
- 예: `revalidateLedgerEntryPaths()`, `revalidateLedgerReviewPaths(ledgerId)`, `revalidateMasterDataPaths(kind)`.
- 각 액션은 의미 있는 helper만 호출하게 한다.

### P2. 보고서와 대시보드 쿼리 파일이 너무 커졌다

근거:

- `src/features/reports/queries.ts`는 검색 결과상 약 2.9K lines까지 이어진다.
- `src/features/dashboard/queries.ts`는 약 1K lines다.
- 두 파일 모두 `calculateLedgerReviewSummary`를 호출하고, 장부 레코드 타입과 지표/신호 변환 로직을 많이 들고 있다.
- 예: `src/features/reports/queries.ts:313`, `src/features/reports/queries.ts:448`, `src/features/reports/queries.ts:601`, `src/features/dashboard/queries.ts:185`

왜 문제인가:

보고서 기능이 늘수록 한 파일에서 날짜, 권한, DB 조회, 계산, 표시용 변환을 모두 이해해야 한다. 변경 비용과 회귀 위험이 커진다.

권장 조치:

- `daily-meeting`, `store-comparison`, `monthly-closing-anomaly` 단위로 파일을 나눈다.
- 공통 장부 조회 select와 변환기는 shared module로 뺀다.
- 먼저 테스트를 유지한 채 파일만 나누고, 그 다음 중복 타입과 helper를 정리한다.

### P2. 단위 테스트 일부가 소스 문자열 정규식에 크게 의존한다

근거:

- `tests/unit` 아래 30개 파일이 `readFileSync`로 소스 파일을 읽는다.
- 예: `tests/unit/anomaly-thresholds.test.mjs:286-308`은 액션 내부 문자열과 `revalidatePath` 호출 문자열을 검사한다.
- `tests/unit/hq-dashboard.test.mjs:133-143`도 쿼리 파일 내부 구현 문자열을 검사한다.

왜 문제인가:

이 방식은 빠르고 넓은 구조 검사를 하기 좋지만, 실제 동작은 그대로인데 코드 배치만 바뀌어도 테스트가 깨질 수 있다. 리팩터링을 어렵게 만든다.

권장 조치:

- 보안/권한 같은 핵심 경계 테스트는 남긴다.
- 계산, 변환, validation은 실제 함수 import 기반 테스트로 옮긴다.
- 소스 문자열 검사는 “아키텍처 가드”로 이름을 분리하고 최소화한다.

### P2. T3 기본 `Post` 모델이 아직 남아 있다

근거:

- `prisma/schema.prisma:98`에 `model Post`가 있다.
- `prisma/schema.prisma:286`에 `User.posts` 관계가 있다.
- `prisma/migrations/20260529120000_init/migration.sql:8`에서 `"Post"` 테이블을 만든다.
- `rg` 기준 실제 앱 코드에서 `Post` 모델 사용은 보이지 않는다.

왜 문제인가:

업무 도메인과 무관한 테이블은 DB와 Prisma Client를 복잡하게 만든다. 권한/감사 로그가 중요한 ERP에서는 불필요한 모델도 혼란을 만든다.

권장 조치:

- 실제 필요가 없으면 새 migration으로 `Post` 테이블과 관계를 제거한다.
- 제거 전에 운영 데이터 존재 여부를 확인한다.

### P3. `check` 스크립트가 곧 낡은 명령이 된다

근거:

- `package.json:8`은 `"check": "next lint && tsc --noEmit"`이다.
- `pnpm check` 실행 결과 `next lint`가 deprecated이며 Next.js 16에서 제거될 예정이라는 경고가 나왔다.
- 별도 `lint` 스크립트는 이미 `eslint .`로 존재한다.

왜 문제인가:

지금은 통과하지만 Next 16 업그레이드 때 기본 검증 명령이 깨진다.

권장 조치:

- `"check": "pnpm lint && pnpm typecheck"` 또는 `"check": "eslint . && tsc --noEmit"`로 바꾼다.

### P3. 추적 중인 임시 Playwright 파일이 있다

근거:

- `git ls-files`에서 `.tmp-link-check.js`가 추적 대상이다.
- `.tmp-link-check.js:8`은 `http://localhost:3000/login`에 직접 접근한다.
- `.tmp-link-check.js:17-18`에는 테스트용으로 보이는 이메일과 비밀번호 문자열이 하드코딩되어 있다.
- `.tmp-link-check.js:15`, `.tmp-link-check.js:29`, `.tmp-link-check.js:35-39`는 디버그 `console.log`를 출력한다.
- `rg` 기준 이 파일을 참조하는 다른 코드나 문서는 없다.

왜 문제인가:

임시 스크립트가 추적되면 실제 테스트인지 개인 디버그 도구인지 헷갈린다. 계정 문자열도 습관적으로 남기기 쉽다.

권장 조치:

- 필요 없으면 삭제한다.
- 필요하면 `scripts/`로 옮기고 환경 변수로 계정 정보를 받게 한다.
- `.gitignore`에 `.tmp-*.js`도 추가한다.

### P3. 권한 확인 호출이 요청 안에서 반복될 수 있다

근거:

- `src/app/app/ledgers/[ledgerId]/page.tsx:116`에서 `requireReportAccess()`를 호출한다.
- 같은 페이지에서 `getHqLedgerDetail`, `getLedgerCostStepDataById`, `getInventoryStepDataByLedgerId`, `getLossStepDataByLedgerId`, `getCorrectionRecordsForLedger`를 병렬 호출한다.
- 여러 query 함수도 내부에서 다시 `requireReportAccess()`나 `requireHeadquartersLedgerScope()`를 호출한다.
- 예: `src/features/dashboard/queries.ts:196`, `src/features/ledger/queries.ts:432-433`, `src/features/inventory/queries.ts:1186-1187`, `src/features/losses/queries.ts:165-166`

왜 문제인가:

보안 경계가 각 함수에 있는 것은 장점이다. 하지만 한 요청에서 같은 사용자와 권한을 여러 번 DB에서 읽으면 비용이 쌓인다.

권장 조치:

- 보안 경계는 유지한다.
- React `cache()`나 request-scoped helper로 현재 사용자/권한 조회만 캐시한다.
- 먼저 읽기 전용 페이지에서 쿼리 수를 측정한 뒤 적용한다.

## 좋은 점

- 타입체크, 린트, 단위 테스트가 통과한다.
- 권한과 store scope 검사가 여러 경로에 들어가 있어 기본 보안 자세는 좋다.
- 계산 로직을 서버 계산 모듈로 모으려는 흔적이 있고, 관련 테스트도 많다.
- Playwright wrapper가 test-like DB만 허용하도록 설계되어 있어 위험한 DB 오염을 줄인다.

## 권장 순서

1. 개발 명령 신뢰성부터 고친다.
2. 장부 상태 정책과 캐시 갱신 helper를 공통화한다.
3. 대형 query 파일을 기능 단위로 쪼갠다.
4. 테스트를 동작 기반으로 조금씩 옮긴다.
5. 스캐폴드/임시 파일을 정리한다.
