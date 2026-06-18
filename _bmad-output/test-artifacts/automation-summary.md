---
stepsCompleted:
  [
    "step-01-preflight-and-context",
    "step-02-identify-targets",
    "step-03c-aggregate",
    "step-04-validate-and-summarize",
  ]
lastStep: "step-04-validate-and-summarize"
lastSaved: "2026-06-13"
inputDocuments:
  - package.json
  - playwright.config.ts
  - tests/
  - _bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/implementation-artifacts/
  - _bmad-output/implementation-artifacts/tests/test-summary.md
  - .agents/skills/bmad-testarch-automate/resources/tea-index.csv
  - .agents/skills/bmad-testarch-automate/resources/knowledge/test-levels-framework.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/test-priorities-matrix.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/data-factories.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/selective-testing.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/ci-burn-in.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/test-quality.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/overview.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/api-request.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/network-recorder.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/auth-session.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/intercept-network-call.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/recurse.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/log.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/file-utils.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/burn-in.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/network-error-monitor.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/fixtures-composition.md
  - .agents/skills/bmad-testarch-automate/resources/knowledge/playwright-cli.md
---

# Step 1: Preflight & Context Loading

## Stack Detection

- `test_stack_type`: `auto`
- 감지 결과: `frontend`
- 근거:
  - 루트 `package.json`에 Next.js, React, Playwright 테스트 의존성이 있다.
  - `playwright.config.ts`가 존재한다.
  - `pyproject.toml`, `go.mod`, `pom.xml`, `build.gradle`, `Cargo.toml`, `Gemfile`, `.sln`, `*.csproj` 같은 별도 백엔드 manifest는 루트 프로젝트에서 발견되지 않았다.
  - Next.js 서버 액션과 Prisma 사용은 있지만, 이 워크플로의 자동 감지 규칙 기준으로는 frontend로 분류한다.

## Framework Verification

- 결과: 통과
- 확인한 프레임워크:
  - `playwright.config.ts`
  - `package.json` devDependency: `@playwright/test`
  - test scripts: `test:e2e`, `test:unit`
- 기존 테스트 구조:
  - `tests/e2e`: 23개 Playwright spec
  - `tests/unit`: 35개 `node:test` 기반 `.mjs` 테스트
- Playwright 설정 요약:
  - `testDir`: `./tests/e2e`
  - `fullyParallel`: `false`
  - `workers`: `1`
  - `globalSetup`: `./tests/e2e/global-setup.ts`
  - `webServer`: `corepack pnpm dev --hostname 127.0.0.1 --port ${PORT}`
  - 기본 E2E DB URL: `postgresql://postgres:password@localhost:55432/erp_fish_e2e`

## Execution Mode

- 실행 모드: `BMad-Integrated`
- 근거:
  - PRD가 존재한다: `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md`
  - architecture 문서가 존재한다: `_bmad-output/planning-artifacts/architecture.md`
  - 구현 story artifact가 `_bmad-output/implementation-artifacts/`에 존재한다.
  - 기존 테스트 요약이 있다: `_bmad-output/implementation-artifacts/tests/test-summary.md`
- 별도 test-design 산출물은 `_bmad-output/test-artifacts/test-design` 아래에서 발견되지 않았다.

## Loaded Context

### Product And Architecture

- PRD 주요 범위:
  - 인증, 권한, 변경 이력
  - 일일 장부 입력
  - 계산과 검증
  - 본사 관제판과 이상 신호
  - 본사 입력, 마감, 정정
  - 마스터와 관리 설정
  - 리포트
  - 2026-06-10 추가 구현 범위
- Architecture 주요 범위:
  - Create T3 App 기반
  - Prisma 중심 data architecture
  - NextAuth와 서버 권한 경계
  - Server Action/query 중심 API pattern
  - 현재 테스트 구조는 `tests/unit`과 `tests/e2e` 중심

### Existing Automation State

- Unit coverage는 현재 35개 테스트 파일로 넓게 누적되어 있다.
- E2E coverage는 현재 23개 Playwright spec으로 주요 앱 흐름을 다룬다.
- 기존 test-summary 기준:
  - `corepack pnpm test:unit`은 최근 기록에서 35/35 통과.
  - `corepack pnpm check`는 최근 기록에서 통과.
  - `corepack pnpm test:e2e`는 Playwright webServer가 조기 종료되어 실패.
  - 기록된 blocker: `corepack pnpm dev --hostname 127.0.0.1 --port 3000`이 현재 sandbox에서 `listen EPERM: operation not permitted 127.0.0.1:3000`으로 실패.

### Browser Test Pattern Detection

- `tests/e2e`에서 `page.goto`, `page.locator`, `getByRole`, `getByLabel`, `expect(page...)` 패턴이 확인됐다.
- 따라서 Playwright Utils loading profile은 `Full UI+API`로 선택한다.

## TEA Config Flags

- `tea_use_playwright_utils`: `true`
- `tea_use_pactjs_utils`: `false`
- `tea_pact_mcp`: `none`
- `tea_browser_automation`: `auto`
- `test_stack_type`: `auto`

## Knowledge Fragments

### Core

- `test-levels-framework.md`
- `test-priorities-matrix.md`
- `data-factories.md`
- `selective-testing.md`
- `ci-burn-in.md`
- `test-quality.md`

### Playwright Utils: Full UI+API Profile

- `overview.md`
- `api-request.md`
- `network-recorder.md`
- `auth-session.md`
- `intercept-network-call.md`
- `recurse.md`
- `log.md`
- `file-utils.md`
- `burn-in.md`
- `network-error-monitor.md`
- `fixtures-composition.md`

### Browser Automation

- `playwright-cli.md`

### Pact / Contract Testing

- Pact.js Utils는 config에서 비활성화되어 로드하지 않았다.
- 프로젝트 소스에서 실제 Pact 사용 신호는 발견되지 않았다. 검색 결과는 BMAD skill 자체 파일에 한정됐다.
- 따라서 `contract-testing.md`와 Pact MCP 지식은 이번 단계에서 제외했다.

## Step 1 Result

- 프레임워크 scaffold는 존재하므로 workflow를 중단하지 않는다.
- 다음 단계는 테스트 자동화 확장 대상을 식별하는 `step-02-identify-targets`다.

# Step 2: Identify Automation Targets

## Target Discovery

### Browser Exploration

- 요구된 CLI 명령인 `playwright-cli`는 PATH에서 발견되지 않았다.
- fallback으로 `corepack pnpm exec playwright --version`을 확인했고 Playwright `1.60.0`은 사용 가능하다.
- dev server는 포트 `3100`에서 정상 기동했다.
- 인앱 브라우저 fallback은 `http://127.0.0.1:3100/login`과 `http://localhost:3100/login` 모두 `net::ERR_BLOCKED_BY_CLIENT`로 열지 못했다.
- 결론: 이 단계의 browser exploration은 환경 제약으로 제한됐고, 대상 식별은 코드/문서/기존 테스트 분석으로 진행한다.

### Existing ATDD / Test Design

- `_bmad-output/test-artifacts/test-design` 아래 기존 test-design 산출물은 발견되지 않았다.
- 기존 자동화는 story별 단위/source-contract 테스트와 Playwright E2E spec에 직접 누적되어 있다.
- 따라서 중복을 피하기 위해 신규 자동화는 기존 happy path를 복제하지 않고, 권한 경계, 잘못된 입력, export/download, 서버 응답 shaping, 재검증 같은 음성/경계 경로에 둔다.

## Acceptance Criteria To Scenario Map

| Product Area            | Representative AC / Risk                                                                     | Existing Coverage Signal                                                        | Expansion Target                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 인증/권한/지점 범위     | 비활성 사용자, 권한 profile 변경, 지점 scope 변경이 같은 세션 다음 요청에 반영돼야 한다.     | `auth-guard`, `auth-model`, `permission-profiles` unit/E2E 존재                 | P1: 서버 boundary별 source-contract 유지. 신규 중복 E2E는 피한다.                                                                    |
| 장부 입력 7단계         | 저장, stale version conflict, 미저장 변경, field error focus, 모바일 입력성이 유지돼야 한다. | `store-ledger-*` E2E와 `ledger-*` unit 다수 존재                                | P1: 신규 기능이 있을 때만 단계별 edge 추가. 현재는 중복 생성 금지.                                                                   |
| 계산/검증/OQ-gated 상태 | 정책 미정 값을 확정 숫자나 이상 신호로 승격하면 안 된다.                                     | `calculation-policy-gates`, `ledger-review`, `hq-dashboard`, anomaly unit 존재  | P0: shared calculation/status helper의 정책 미정 회귀는 unit/source-contract로 우선 보강.                                            |
| 본사 관제/마감/정정     | 마감 전 preflight, append-only correction, 정정 반영값이 dashboard/report에 반영돼야 한다.   | `hq-dashboard`, `hq-ledger-edit`, `hq-ledger-corrections`, correction unit 존재 | P1: unsupported correction, negative persisted correction, revalidation list 같은 server edge 보강.                                  |
| 마스터 데이터           | 생성/수정/비활성, 중복, 감사 로그, first error focus가 유지돼야 한다.                        | `master-data-*` unit/E2E 넓게 존재                                              | P2: 신규 마스터 규칙이 생길 때만 추가. 현 상태는 중복 위험 높음.                                                                     |
| 리포트/export           | CSV 다운로드, 권한 차단, forbidden response, bad request, audit metadata가 안전해야 한다.    | `hq-reports` E2E와 `sensitive-response-shaping` unit 일부 존재                  | P0: `/api/reports/export` route의 parser/date/month validation, out-of-scope store, forbidden payload, CSV allowlist를 더 직접 검증. |
| 민감 필드 차단          | 지점장 응답/HTML/CSV/forbidden payload에 원가/이익/재고금액 등 민감 값이 새면 안 된다.       | `sensitive-response-shaping`, store ledger review/inventory E2E 존재            | P0: export forbidden/error 응답과 report CSV allowlist를 source-contract로 고정.                                                     |
| 운영/문서-only story    | 정책 산출물 story가 제품 코드나 테스트를 drift시키면 안 된다.                                | 최근 test-summary가 Story 8.9 document-only 범위 기록                           | P2: 문서-only drift guard는 기존 방식 유지.                                                                                          |

## Test Level Selection

| Level                           | Use In This Project                                                                                 | Selected Targets                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Unit / Source-contract          | 순수 계산, schema, route helper, 권한 helper 사용 여부, sensitive key 부재처럼 빠르고 결정적인 검증 | P0 export route/parser/CSV allowlist/forbidden payload, OQ-gated status, sensitive response shaping                                      |
| API-style via Next route helper | 실제 HTTP route handler가 있는 export처럼 request/response contract가 중요한 경계                   | P0 `/app/api/reports/export/route.ts` request validation and response safety                                                             |
| E2E                             | 실제 사용자 여정, 접근성 focus, 브라우저 다운로드, 모바일 표시, navigation/revalidation 확인        | P1 기존 `hq-reports`, `permission-profiles`, `store-ledger-*` selective rerun and focused additions only when browser environment allows |
| Component                       | 독립 component harness가 없고 현재 repo는 component test framework가 없다                           | 이번 자동화 확장에서는 제외. 필요 시 framework workflow에서 먼저 scaffold                                                                |
| Contract / Pact                 | Pact config와 provider source mapping 신호 없음                                                     | 제외                                                                                                                                     |

## Priority Assignments

| Priority | Target                                                                                                                                     | Rationale                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| P0       | Report export route validation: unsupported report/format, invalid date/month/range, `startDate > endDate`                                 | 공개 HTTP route이고 잘못된 입력이 CSV/audit 생성으로 이어지면 위험이 크다.        |
| P0       | Report export authorization and scope: no `EXPORT_CREATE`, requested store outside resolved scope, forbidden payload no sensitive metadata | 권한 경계와 민감 정보 차단은 보안성 핵심이다.                                     |
| P0       | CSV allowlist and sensitive field exclusion for daily/comparison/monthly exports                                                           | CSV는 파일로 외부 전달되므로 민감 필드 누출 영향이 크다.                          |
| P1       | Correction-applied report/dashboard consistency after correction save                                                                      | 중요한 운영 흐름이지만 기존 E2E가 이미 넓게 존재하므로 보강은 selective하게 둔다. |
| P1       | Close preflight OQ-gated/info/warning distinction                                                                                          | 마감 판단 품질에 직접 영향을 주지만 기존 unit/E2E가 있어 회귀 중심으로 보강한다.  |
| P1       | Same-session permission/store-scope revocation                                                                                             | 보안성 높지만 기존 E2E가 이미 있다. 유지/선택 실행 대상이다.                      |
| P2       | Master-data duplicate/focus/mobile variants                                                                                                | 기존 테스트가 넓어 신규 규칙이 없는 한 중복 가능성이 높다.                        |
| P2       | Document-only story drift guard                                                                                                            | 최근 Epic 7/8에서 중요했지만 제품 자동화보다는 workflow guard 성격이다.           |

## Coverage Plan

Scope: selective expansion, not comprehensive rewrite.

1. Add or extend unit/source-contract tests around `src/app/api/reports/export/route.ts` and `src/features/reports/export.ts`.
   - Verify invalid query handling returns Korean bad request messages without CSV/audit side effects.
   - Verify forbidden payloads avoid export metadata and sensitive fields.
   - Verify daily/comparison/monthly CSV columns remain explicit allowlists.
   - Verify filename sanitization and BOM/CSV escaping for Korean report content.

2. Keep existing E2E suites as selective regression targets rather than duplicating their flows.
   - `tests/e2e/hq-reports.spec.ts`: export/download, report navigation, role denial.
   - `tests/e2e/permission-profiles.spec.ts`: same-session revocation.
   - `tests/e2e/hq-dashboard.spec.ts` and `tests/e2e/hq-ledger-corrections.spec.ts`: correction overlay consistency.
   - Run only when browser/dev-server environment allows.

3. Preserve fast verification as the default gate.
   - `corepack pnpm test:unit`
   - `corepack pnpm check`
   - targeted Playwright only after the local browser blocker is resolved.

## Step 2 Result

- Primary automation target for generation: report export server boundary and sensitive response contract.
- Secondary target: selective E2E rerun/addition around report export only if browser environment becomes usable.
- Duplicate coverage guard: do not recreate broad happy-path tests for ledger entry, master data CRUD, dashboard, or report display; those already have substantial coverage.
- 다음 단계는 `step-03-generate-tests`다.

# Step 3 / 3C: Generate And Aggregate Tests

## Execution Mode Resolution

- Requested: `auto`
- Probe enabled: `true`
- Supports agent-team: `false`
- Supports subagent: `true`
- Resolved: `subagent`

## Worker Outputs

- API worker output: `/tmp/tea-automate-api-tests-2026-06-12T23-50-01-877Z.json`
  - `success`: `true`
  - tests proposed: 8
  - files proposed: 1
- E2E worker output: `/tmp/tea-automate-e2e-tests-2026-06-12T23-50-01-877Z.json`
  - `success`: `true`
  - tests proposed: 0
  - duplicate coverage guard applied because `tests/e2e/hq-reports.spec.ts` already covers report export E2E journeys.

## Aggregated Files

- Created `tests/api/report-export.spec.ts`
  - Covers `/api/reports/export` invalid query handling.
  - Covers unauthenticated and unauthorized forbidden payload safety.
  - Covers out-of-scope store request blocking.
  - Covers daily, comparison, and monthly CSV allowlisted headers.
  - Covers CSV BOM, formula escaping, attachment filename, and audit creation.
- Updated `playwright.config.ts`
  - Changed `testDir` to `./tests`.
  - Added `testMatch` for `e2e/**/*.spec.ts` and `api/**/*.spec.ts`.
- Updated `package.json` / `pnpm-lock.yaml`
  - Added `@seontechnologies/playwright-utils@4.3.0` as a dev dependency for the generated `apiRequest` fixture.

## Fixture Handling

- New fixture files created: 0
- Existing infrastructure reused:
  - `tests/e2e/global-setup.ts` for seed users and E2E database setup.
  - Existing seeded users: `hq@example.com`, `hq-viewer@example.com`, `manager@example.com`, `hq-assigned@example.com`.
  - Existing Prisma client and cleanup patterns.

## Summary Statistics

- Stack type: `frontend`
- Total generated tests: 8
  - API tests: 8
  - E2E tests: 0
  - Backend tests: 0
- Generated test files: 1
- Fixtures created: 0
- Priority coverage:
  - P0: 7
  - P1: 1
  - P2: 0
  - P3: 0
- Summary temp file: `/tmp/tea-automate-summary-2026-06-12T23-50-01-877Z.json`

## Step 3C Result

- Aggregation complete.
- 다음 단계는 `step-04-validate-and-summarize`다.

# Step 4: Validate & Summarize

## Checklist Validation

### Passed

- Framework readiness:
  - `playwright.config.ts` exists.
  - `tests/` exists with `e2e`, `unit`, and new `api` structure.
  - `@playwright/test` is installed.
  - `@seontechnologies/playwright-utils@4.3.0` is installed for the generated API request fixture.
- Coverage mapping:
  - Selected target is report export server boundary, not broad UI happy-path duplication.
  - Existing E2E report export coverage was detected and not duplicated.
  - Generated API tests map to P0/P1 risks from Step 2.
- Test quality and structure:
  - Generated tests use priority tags in test names.
  - Generated tests avoid hard waits and browser-only timing patterns.
  - Generated tests use deterministic API requests and explicit status/body/header assertions.
  - Generated tests clean up API-specific stores, permission profiles, and `ReportExport` audit rows.
- Fixture/helper handling:
  - No new fixture files were needed.
  - Existing E2E global setup and seeded users are reused.
  - Playwright Utils `apiRequest` fixture is available through package dependency.
- Session cleanup:
  - Browser tab was closed.
  - temporary dev server on port `3100` was stopped.
  - no matching `next dev` / `tea-automate` process remains, except the validation `pgrep` command itself.
- Temp artifacts:
  - Worker temp JSON files were copied into `_bmad-output/test-artifacts/temp/`.

### Adapted / N/A

- Component tests: N/A, no component test framework is currently scaffolded.
- Pact / CDC tests: N/A, Pact.js Utils are disabled and no Pact project indicators were found.
- New data factory files: N/A, this project already uses deterministic seeded users and Prisma cleanup for E2E/API boundaries.
- New E2E tests: intentionally not generated because `tests/e2e/hq-reports.spec.ts` already covers the report export browser journey.

## Validation Commands

- `corepack pnpm exec prettier --write playwright.config.ts tests/api/report-export.spec.ts _bmad-output/test-artifacts/automation-summary.md package.json`: passed
- `corepack pnpm typecheck`: passed
- `corepack pnpm lint`: passed with existing warnings in `src/app/api/reports/export/route.ts` for unused `DATE_PATTERN` and `MONTH_PATTERN`
- `corepack pnpm check`: passed with the same existing warnings and a Next.js deprecation notice for `next lint`
- `corepack pnpm test:unit`: passed, 261/261
- `git diff --check`: passed
- `corepack pnpm exec playwright test --list tests/api/report-export.spec.ts`: passed, 8 tests discovered
- `corepack pnpm test:e2e -- tests/api/report-export.spec.ts`: initially blocked before test bodies because `localhost:55432` was unreachable.
- `corepack pnpm test:api`: passed after DB setup, 8/8.
  - Development DB: `postgresql://postgres:erp_fish_local_pw@host.docker.internal:5432/erp_fish`
  - E2E DB: `postgresql://postgres:erp_fish_local_pw@host.docker.internal:5432/erp_fish_e2e`
  - Both databases were brought in sync with `prisma db push`.
  - Development seed completed with `corepack pnpm db:seed`.
- `corepack pnpm db:push`: passed using `.env`.
- Next dev smoke check: `PORT=3100 ... corepack pnpm dev --hostname 127.0.0.1 --port 3100` then `curl -I http://127.0.0.1:3100/login`: returned `HTTP/1.1 200 OK`.

## Files Created Or Updated

- Created:
  - `tests/api/report-export.spec.ts`
  - `_bmad-output/test-artifacts/automation-summary.md`
  - `_bmad-output/test-artifacts/temp/tea-automate-api-tests-2026-06-12T23-50-01-877Z.json`
  - `_bmad-output/test-artifacts/temp/tea-automate-e2e-tests-2026-06-12T23-50-01-877Z.json`
  - `_bmad-output/test-artifacts/temp/tea-automate-summary-2026-06-12T23-50-01-877Z.json`
- Updated:
  - `.env`
  - `playwright.config.ts`
  - `package.json`
  - `pnpm-lock.yaml`

## Key Assumptions And Risks

- Assumption: API tests should share the existing Playwright webServer/global setup because `/api/reports/export` depends on the running Next.js app, NextAuth cookies, Prisma, and seeded users.
- Assumption: seeded users from `tests/e2e/global-setup.ts` remain the canonical test identities.
- Risk: WSL cannot use Docker Desktop directly because Docker WSL integration is not enabled; DB access currently uses the reachable Windows host name `host.docker.internal`.
- Risk: local DB availability depends on the Postgres service already listening on Windows host port `5432`.
- Existing unrelated warnings: unused `DATE_PATTERN` and `MONTH_PATTERN` in `src/app/api/reports/export/route.ts`.

## Next Recommended Workflow

- Run `bmad-testarch-test-review` after the E2E database is available, so the generated API tests can be reviewed after an actual execution.
- Run `bmad-testarch-trace` if you want a formal PRD/AC-to-test traceability matrix for the new report export API coverage.

## Completion Summary

- Workflow completed through Step 4.
- Generated coverage: 8 API tests, 0 new E2E tests.
- Priority breakdown: P0 = 7, P1 = 1, P2 = 0, P3 = 0.
- Validation status: static validation passed; generated API runtime execution passed after DB setup.
