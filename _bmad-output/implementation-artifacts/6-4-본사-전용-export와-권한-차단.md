---
story_key: 6-4-본사-전용-export와-권한-차단
story_id: "6.4"
epic: "6"
status: done
generated: "2026-06-12T19:56:37+09:00"
baseline_commit: 15bbc17
source_story: "_bmad-output/planning-artifacts/epics.md#Story 6.4: 본사 전용 Export와 권한 차단"
---

# Story 6.4: 본사 전용 Export와 권한 차단

Status: done

## Story

As a 본사 사용자,  
I want 허용된 리포트 데이터를 안전하게 export할 수 있기를 원한다,  
so that 회의와 운영 점검에 필요한 자료를 외부 파일로 활용하면서도 민감 데이터 노출을 막을 수 있다.

## Acceptance Criteria

1. **Given** export 권한이 있는 본사 사용자가 리포트에서 export를 요청할 때, **When** 서버가 요청을 처리한다, **Then** 현재 사용자에게 허용된 지점, 기간, 컬럼만 포함한 export가 생성되어야 한다, **And** export 생성 시점의 권한을 서버에서 다시 확인해야 한다.
2. **Given** export 권한이 없는 본사 사용자나 지점장이 export를 요청할 때, **When** 서버가 요청을 처리한다, **Then** 요청은 거부되어야 한다, **And** export 파일 또는 민감 리포트 데이터는 생성되거나 반환되지 않아야 한다.
3. **Given** export 대상에 민감 회계 지표가 포함될 수 있을 때, **When** 서버가 컬럼을 구성한다, **Then** 권한 없는 사용자에게는 매출원가, 매출이익, 영업이익, 이익률, 인당생산성, 재고금액, lot 근거, 본사 고정비 같은 필드를 포함하지 않아야 한다, **And** 클라이언트에서 컬럼을 숨기는 방식에 의존하면 안 된다.
4. **Given** export 대상 데이터에 정정 기록이 있을 때, **When** export 파일이 생성된다, **Then** 기본 숫자는 정정 반영값을 사용해야 한다, **And** 필요 시 원본/정정 반영 구분 컬럼은 권한 있는 본사 사용자에게만 포함되어야 한다.
5. **Given** OQ-gated 계산 항목이 export 대상에 포함될 수 있을 때, **When** export 파일이 생성된다, **Then** 확정 숫자 대신 `기준 확인 필요`, `데이터 부족`, `계산 불가` 상태를 포함해야 한다, **And** 임시 계산값을 export하면 안 된다.
6. **Given** export가 생성될 때, **When** 서버가 작업을 완료한다, **Then** 생성자, 시각, 대상 리포트, 필터, 컬럼 범위는 감사 로그에 남아야 한다, **And** 파일명 또는 메타데이터에 권한 밖 정보가 포함되면 안 된다.

## Tasks / Subtasks

- [x] 기존 리포트와 권한/감사 구조를 먼저 감사한다. (AC: 1-6)
  - [x] `src/features/reports/queries.ts`, `types.ts`, daily/comparison/monthly report pages와 components, `src/server/authz.ts`, `src/server/audit.ts`, `src/features/audit/audit-format.ts`, `tests/unit/hq-reports.test.mjs`, `tests/unit/sensitive-response-shaping.test.mjs`, `tests/e2e/hq-reports.spec.ts`를 읽고 현재 계약을 확인한다.
  - [x] 새 계산식, 새 report domain, client-only report fetch layer를 만들지 않는다. export는 기존 `src/features/reports` query 결과와 shared evidence/status를 변환하는 얇은 서버 경로여야 한다.
  - [x] Story 6.1-6.3의 화면 조회 권한과 store scope 동작을 export에서 다르게 재해석하지 않는다.
- [x] 본사 export 서버 경로를 추가한다. (AC: 1, 2, 6)
  - [x] Route Handler는 export 전용 HTTP endpoint로 둔다. 권장 위치는 `src/app/api/reports/export/route.ts`, 도메인 로직은 `src/features/reports/export.ts` 또는 `src/features/reports/export-helpers.ts`에 둔다.
  - [x] 요청 파라미터는 최소 계약으로 제한한다: `report=daily|comparison|monthly`, daily는 `date`, comparison은 `startDate`, `endDate`, optional `storeId`, monthly는 `month`, optional `storeId`, `format=csv`.
  - [x] 서버 진입점에서 `requireExportCreateAccess()`를 먼저 호출하고, 실제 report data 생성 시 기존 `getHqDailyMeetingReport()`, `getHqStoreComparisonReport()`, `getHqMonthlyClosingAnomalyReport()`가 다시 `requireReportAccess()`와 `getHeadquartersStoreScope()`를 수행하게 한다.
  - [x] 권한이 없거나 지점장 세션이면 redirect HTML이나 partially generated file을 반환하지 말고, 기존 `/app/unauthorized` 흐름 또는 테스트 가능한 403 계약 중 하나로 일관되게 고정한다. 선택한 방식은 unit/e2e에서 검증한다.
- [x] 서버 column allowlist와 민감 필드 차단을 구현한다. (AC: 1, 3, 5)
  - [x] export 컬럼은 클라이언트에서 받은 column 목록을 신뢰하지 말고 report type별 서버 allowlist로 만든다.
  - [x] 기본 CSV 컬럼에는 허용된 지점/기간/상태/비민감 요약과, 권한 있는 본사 export 사용자에게 필요한 회계 지표만 포함한다. `EXPORT_CREATE`가 없는 본사 조회 전용 사용자와 지점장은 어떤 CSV도 받지 못한다.
  - [x] CAP-13/OQ-10B의 동적 지표별 노출 정책은 구현하지 않는다. 현재 story에서는 고정 차단 기준과 `EXPORT_CREATE` action을 사용한다.
  - [x] `omitSensitiveFields()` 또는 같은 기준의 재귀 검사 테스트를 export payload에도 적용해 `costOfGoodsSold`, `grossProfit`, `grossMarginRate`, `operatingProfit`, `productivity`, `inventoryAmount`, `lot`, `fixedCost`, 타 지점 비교 값이 무권한 응답/파일/metadata에 남지 않는지 검증한다.
  - [x] OQ-gated metric은 숫자를 임의로 계산하지 말고 기존 `DailyMeetingReportMetricEvidence.statusLabel`, `unavailableReason`, `LedgerReviewMetric.status` 계열 값을 그대로 export한다.
- [x] 정정 반영값과 근거 상태를 export에 보존한다. (AC: 4, 5)
  - [x] 기본 숫자는 기존 report query가 만드는 correction-applied value를 사용한다. `getLatestCorrectionValuesForLedgers()`, `applyCorrectionValuesToLedgerReviewInput()`, `toReportLedgerCalculationSummary()`와 별도 계산 분기를 만들지 않는다.
  - [x] 원본/정정 반영 구분 컬럼을 넣는 경우 권한 있는 본사 export 사용자에게만 포함하고, 컬럼명은 `원본`, `정정 반영`, `상태`, `사유`처럼 명확히 한다.
  - [x] `정정 확인 필요`, `기준 확인 필요`, `데이터 부족`, `계산 불가`, `권한 차단`을 모두 같은 빈 문자열이나 0으로 뭉개지 않는다.
- [x] 파일 응답과 파일명을 안전하게 만든다. (AC: 1, 6)
  - [x] 1차 format은 CSV로 고정한다. XLSX가 필요하다는 별도 제품 결정 전에는 spreadsheet dependency를 추가하지 않는다.
  - [x] CSV는 RFC 4180 방식으로 quote/escape하고, 한국어 Excel 호환이 필요하면 UTF-8 BOM 포함 여부를 테스트로 고정한다.
  - [x] `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="erp-fish-report-<report>-<period>.csv"`를 사용하고 store name, 사용자명, 권한 밖 필터값, 민감 지표명을 파일명에 넣지 않는다.
  - [x] 응답에는 `Cache-Control: no-store`를 설정한다. export 파일을 public/cacheable asset으로 저장하지 않는다.
- [x] export 생성 감사 로그를 남긴다. (AC: 6)
  - [x] 기존 `AuditLog`와 `writeAuditLog()`를 재사용한다. 별도 `ExportMetadata` model은 현재 story에서 필요할 때만 추가하고, 기본은 `targetType: "ReportExport"`, `action: "report.export.created"` audit entry로 충분하다.
  - [x] audit `after`에는 actor context, report type, normalized filters, included store id count 또는 scoped store ids, column keys, row count, format을 남긴다. 파일 bytes나 민감 cell values는 audit JSON에 저장하지 않는다.
  - [x] `src/features/audit/audit-format.ts`의 target type/action label에 ReportExport를 추가해 본사 감사 로그에서 사람이 읽을 수 있게 한다.
  - [x] 거부된 export 요청 감사가 필요한 경우 `report.export.denied`로 남기되, 무권한 사용자에게 권한 밖 store name/column detail을 누설하지 않는다.
- [x] UI에 export action을 추가한다. (AC: 1, 2, 6)
  - [x] `/app/reports/daily`, `/app/reports/comparison`, `/app/reports/monthly`의 filter 상태를 그대로 export 요청에 전달하는 버튼 또는 form을 추가한다.
  - [x] 버튼 노출은 `hasActionPermission(user.id, PermissionAction.EXPORT_CREATE)` 또는 서버에서 계산한 action availability를 사용한다. 단, UI 숨김은 편의일 뿐이고 서버 route가 최종 차단이다.
  - [x] export 버튼은 shadcn `Button`과 lucide download icon을 사용한다. 버튼 텍스트는 좁은 화면에서도 줄바꿈/overflow가 생기지 않게 한다.
  - [x] Export success/failure를 별도 client-only toast flow로 과하게 만들지 않는다. 파일 download 실패는 서버 status와 e2e로 검증한다.
- [x] 테스트를 Story 6.4 계약으로 추가하고 실행한다. (AC: 1-6)
  - [x] Unit/source-contract: export route/helper가 존재하고 `requireExportCreateAccess`, 기존 report query, server allowlist, CSV escaping, no-store headers, sanitized filename, audit log action을 사용하는지 검증한다.
  - [x] Unit behavior: daily/comparison/monthly export rows가 store scope와 filter를 지키고, correction-applied values/status labels를 사용하며, OQ-gated metric을 숫자로 대체하지 않는지 검증한다.
  - [x] Permission tests: `EXPORT_CREATE` 없는 본사 profile, 지점장, 권한 밖 `storeId`, malformed report type/date/month는 파일 bytes를 생성하지 않는지 검증한다.
  - [x] Sensitive tests: 무권한 경로의 JSON/CSV/header/filename/audit metadata에 민감 key와 권한 밖 store 정보가 없는지 `tests/unit/sensitive-response-shaping.test.mjs` 또는 report export unit에서 재귀 검증한다.
  - [x] E2E: `tests/e2e/hq-reports.spec.ts`에 daily/comparison/monthly export 버튼 노출, 파일 다운로드, 조회 전용 본사/지점장 차단, 감사 로그 표시 시나리오를 추가한다.
  - [x] 권장 실행: `node --experimental-strip-types --test tests/unit/hq-reports.test.mjs tests/unit/sensitive-response-shaping.test.mjs`, `pnpm test:unit -- hq-reports`, `pnpm lint`, `pnpm typecheck`, `git diff --check`, 가능하면 `pnpm test:e2e tests/e2e/hq-reports.spec.ts`.

## Dev Notes

### 현재 구현 상태

- `PermissionAction.EXPORT_CREATE`는 Prisma enum과 seed/global setup에 이미 존재하고, `src/server/authz.ts`에 `requireExportCreateAccess()`가 있다. 새 권한 enum이나 별도 역할 체계를 만들지 않는다. [Source: `prisma/schema.prisma#PermissionAction`] [Source: `src/server/authz.ts#requireExportCreateAccess`]
- 현재 report read path는 `/app/reports/daily`, `/app/reports/comparison`, `/app/reports/monthly`이고 모두 page에서 `requireReportAccess()`를 호출한 뒤 `src/features/reports/queries.ts`의 server query를 사용한다. [Source: `src/app/app/reports/daily/page.tsx`] [Source: `src/app/app/reports/comparison/page.tsx`] [Source: `src/app/app/reports/monthly/page.tsx`]
- `getHqDailyMeetingReport()`, `getHqStoreComparisonReport()`, `getHqMonthlyClosingAnomalyReport()`는 `requireReportAccess()`와 `getHeadquartersStoreScope()`를 통과한 지점만 조회한다. comparison은 out-of-scope `storeId`를 no-row/error로 처리하고, monthly도 invalid/out-of-scope `storeId`에서 no-row 안내를 반환한다. [Source: `src/features/reports/queries.ts`]
- report rows는 `DailyMeetingReportMetricEvidence`와 shared calculation status를 가진다. UI는 `근거 보기`, `원본`, `정정 반영`, `계산 불가 사유`를 표시한다. export는 이 evidence를 버리고 raw DB 필드를 다시 계산하면 안 된다. [Source: `src/features/reports/types.ts`] [Source: `src/features/reports/components/daily-meeting-report-table.tsx`]
- 감사 로그는 `AuditLog` 단일 모델과 `writeAuditLog(tx, input)` helper를 사용한다. 현재 audit formatter의 target type 목록에는 `ReportExport`가 없으므로 Story 6.4에서 사람이 읽을 라벨을 추가해야 한다. [Source: `prisma/schema.prisma#AuditLog`] [Source: `src/server/audit.ts`] [Source: `src/features/audit/audit-format.ts`]
- `src/server/sensitive-fields.ts`와 `tests/unit/sensitive-response-shaping.test.mjs`는 지점장/무권한 응답에서 민감 key를 재귀 제거하는 기준을 이미 제공한다. export에도 같은 차단 기준을 적용해야 한다. [Source: `src/server/sensitive-fields.ts`] [Source: `tests/unit/sensitive-response-shaping.test.mjs`]

### Architecture Guardrails

- ERP Fish는 Next.js App Router, Server Components/Server Actions/Route Handlers, Prisma, PostgreSQL, NextAuth/Auth.js, Tailwind/shadcn UI를 사용한다. tRPC, 별도 API abstraction, client-only report fetch layer를 새로 도입하지 않는다. [Source: `_bmad-output/planning-artifacts/architecture.md#API & Communication Patterns`] [Source: `package.json`]
- Route Handlers는 exports/health/integration 같은 실제 HTTP endpoint에 한정한다. report 화면 조회는 기존 server query + page render로 유지하고, export 다운로드만 Route Handler로 추가한다. [Source: `_bmad-output/planning-artifacts/architecture.md#API & Communication Patterns`]
- Report, dashboard, detail pages, export는 같은 server-side calculation functions를 공유해야 한다. 계산식을 export 전용 helper 안에 복제하지 않는다. [Source: `_bmad-output/planning-artifacts/architecture.md#Calculation Strategy`]
- Original ledger records는 본사 마감 후 보존되고, reports/dashboard/export 기본 숫자는 correction-applied values를 사용한다. 원본과 정정 반영값은 권한 있는 본사에게만 구분 가능해야 한다. [Source: `_bmad-output/planning-artifacts/architecture.md#Audit and Correction Strategy`]
- 권한 제한은 UI 숨김이 아니라 서버 응답, export, cache response, mutation 권한에서 강제되어야 한다. [Source: `_bmad-output/planning-artifacts/epics.md#NFR1`]

### Previous Story / Git Intelligence

- Story 6.1은 daily report UI와 shared calculation/evidence display를 확장했다. Export는 이 화면 컬럼을 참고하되 daily report 전용 DB query를 새로 만들지 않는다. [Source: `_bmad-output/implementation-artifacts/6-1-일별-아침-회의-리포트.md`]
- Story 6.2는 comparison report의 store scope, no-row guardrail, OQ-gated evidence, revalidation 경로를 정리했다. Export는 권한 밖 `storeId` fallback을 만들면 안 된다. [Source: `_bmad-output/implementation-artifacts/6-2-지점별-기간-비교-리포트.md`]
- Story 6.3은 monthly report에서 invalid/out-of-scope `storeId`를 no-row 안내로 바꾸고, 정정 반영 건수와 `미마감 장부 포함` 신호를 추가했다. Export는 monthly query가 반환한 `selectedStoreId` 계약을 그대로 따르며, 권한 밖 `storeId`를 다른 지점 데이터로 fallback하면 안 된다. [Source: `_bmad-output/implementation-artifacts/6-3-월간-지점-요약-리포트.md`]
- 최근 commits: `15bbc17 feat(story-6.3): 월간 지점 요약 리포트`, `2c9f86e feat(story-6.2): 지점별 기간 비교 리포트`, `1a31206 feat(story-6.1): 일별 아침 회의 리포트`. 모두 `src/features/reports/queries.ts`, report components, `tests/unit/hq-reports.test.mjs`, `tests/e2e/hq-reports.spec.ts`를 중심으로 변경했다. [Source: `git log --oneline -5`]
- 현재 worktree에는 이 workflow 실행 전부터 `_bmad-output/story-automator/orchestration-1-20260611-080819.md` 수정이 있다. Dev agent는 unrelated artifact churn을 되돌리지 않는다. [Source: `git status --short`]

### Scope Boundaries

- 포함: daily/comparison/monthly report CSV export, export 권한 서버 재검증, store/period/column allowlist, 민감 필드 차단, correction-applied value/status export, OQ-gated 상태 export, sanitized file response, no-store headers, ReportExport audit log, export 버튼과 tests.
- 제외: XLSX dependency, 기존 엑셀 수식/서식 복제, CAP-13 동적 민감 지표 정책, CAP-2 특수기간, CAP-3 기존 엑셀 항목 매핑 고도화, CAP-10 월 손익, FIFO lot trace 상세 export, public/shared link export, background job/file storage, AI 기능.
- 금지: 지점장용 본사 report export shape, 권한 밖 store fallback, 클라이언트 column hiding만으로 민감 필드 보호, audit JSON에 파일 전체/민감 cell 저장, export 전용 계산식 복제, `src/components/ui`에 도메인 컴포넌트 추가.

### UX and Accessibility Notes

- UX는 `리포트 › 기간 비교`와 `리포트 › 월간 요약`을 MVP 본사 조회/export 화면으로 정의하고, 일부 계산은 OQ gate 상태라고 명시한다. [Source: `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/EXPERIENCE.md#Screen Inventory`]
- `PermissionActionGuard` 기준을 따른다: 권한 없는 action은 숨김/비활성/차단 화면을 구분하되, 서버 차단이 최종 기준이다. UI는 필요한 권한과 차단 이유를 짧게 설명한다. [Source: `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/EXPERIENCE.md#Component Patterns`]
- `ReportContractPanel` 기준상 report별 필수 컬럼, 필터, 기본 정렬, export 컬럼 차이, 정정 반영값, 미마감/휴무/미입력 처리, 가격 신뢰 상태가 명확해야 한다. Story 6.4에서는 실제 패널을 새로 만들 필요는 없지만 export 컬럼 계약을 테스트와 helper 이름으로 명확히 둔다. [Source: `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/EXPERIENCE.md#Component Patterns`]
- Export 버튼은 desktop/mobile report header의 기존 report tab/button 그룹에 자연스럽게 붙이고, 390px 모바일에서 overflow가 생기지 않아야 한다. [Source: `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/EXPERIENCE.md#Responsive Strategy`]

### Latest Technical Information

- Current workspace package versions: Next.js `^15.2.3`, React `^19.0.0`, Prisma `^6.6.0`, NextAuth `5.0.0-beta.25`, Zod `^3.24.2`, Playwright `^1.60.0`, TypeScript `^5.8.2`, shadcn `^4.8.2`. [Source: `package.json`]
- Next.js docs list latest as 16.2.2 and describe Route Handlers as custom request handlers in the `app` directory using Web Request/Response APIs. Do not upgrade framework for this story; follow installed Next 15 App Router patterns. [Source: https://nextjs.org/docs/app/getting-started/route-handlers]
- MDN documents `Content-Disposition` for attachment downloads and filename metadata. Use sanitized ASCII-safe report filenames and keep private store/user details out of the header. [Source: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition]
- Prisma supports sequential and interactive `$transaction`; keep audit write transactions short and do not hold a transaction while streaming or building large files. [Source: https://www.prisma.io/docs/orm/prisma-client/queries/transactions]

### Testing Requirements

- Focused unit: `node --experimental-strip-types --test tests/unit/hq-reports.test.mjs tests/unit/sensitive-response-shaping.test.mjs`.
- Repo unit command: `pnpm test:unit -- hq-reports`. Note: current `test:unit` script is `node --experimental-strip-types --test tests/unit/*.test.mjs`; file filters may not narrow the suite. Record actual execution.
- Static checks: `pnpm lint`, `pnpm typecheck`, `git diff --check`.
- E2E target: `pnpm test:e2e tests/e2e/hq-reports.spec.ts`. Previous runs in this environment can fail before test body with `listen EPERM`; record environment port binding failures separately from assertion failures.

### Project Context Reference

- Workflow persistent facts requested `file:{project-root}/**/project-context.md`; no `project-context.md` was found in the repository.
- Discovery loaded: `_bmad-output/planning-artifacts/epics.md`, `_bmad-output/planning-artifacts/architecture.md`, PRD `prd.md`, UX `DESIGN.md` and `EXPERIENCE.md`, sprint status, Story 6.1-6.3 implementation artifacts, current report source files, report tests, authz/audit/sensitive-field files, Prisma schema, package versions, recent git history, and official Next.js/MDN/Prisma docs.

### Validation Notes

- Checklist 재분석에서 핵심 위험을 story에 반영했다.
- Critical 1: `EXPORT_CREATE`와 `requireExportCreateAccess()`가 이미 있으므로 새 권한 모델을 만들면 중복/회귀가 된다. 기존 action helper 사용을 task로 고정했다.
- Critical 2: export가 기존 report query를 우회하면 store scope, correction overlay, OQ-gated status가 깨진다. 기존 query 재사용과 export helper thin layer를 필수로 명시했다.
- Critical 3: 클라이언트 column hiding에 의존하면 NFR1 위반이다. 서버 allowlist와 sensitive response shaping tests를 필수로 넣었다.
- Critical 4: 파일명/header/audit metadata도 노출 surface다. 권한 밖 store/user/column 정보가 들어가지 않도록 별도 task로 분리했다.
- Critical 5: audit log가 없으면 AC6와 운영 추적성이 깨진다. `ReportExport` target type/action label과 row/filter/column metadata 기록을 명시했다.
- Critical 6: XLSX dependency를 성급히 추가하면 범위가 커지고 엑셀 수식 복제 오해가 생긴다. 1차 CSV 계약으로 제한했다.

## Project Structure Notes

- 예상 신규 파일:
  - `src/app/api/reports/export/route.ts`
  - `src/features/reports/export.ts` 또는 `src/features/reports/export-helpers.ts`
- 예상 수정 파일:
  - `src/app/app/reports/daily/page.tsx`
  - `src/app/app/reports/comparison/page.tsx`
  - `src/app/app/reports/monthly/page.tsx`
  - `src/features/reports/queries.ts` only if path/filter helpers must be exported/reused
  - `src/features/reports/types.ts` only if export-specific types are shared
  - `src/features/audit/audit-format.ts`
  - `tests/unit/hq-reports.test.mjs`
  - `tests/unit/sensitive-response-shaping.test.mjs`
  - `tests/e2e/hq-reports.spec.ts`
- 변경 가능성이 있는 보조 파일:
  - `src/components/app-sidebar.tsx` only if navigation/action availability needs explicit export label
  - `tests/e2e/global-setup.ts` only if fixture profiles need a no-export HQ user
- 변경하지 말아야 할 파일/패턴:
  - 새 `src/features/export-report`, `src/features/monthly-report`, report-specific DB query domain 추가 금지
  - Prisma enum에 새 export 권한 추가 금지
  - XLSX/spreadsheet dependency 추가 금지
  - `src/server/calculations/*`에 export 전용 계산식 추가 금지
  - public/static file storage나 signed public link 추가 금지

### References

- Story requirements: `_bmad-output/planning-artifacts/epics.md#Story 6.4: 본사 전용 Export와 권한 차단`
- Epic context: `_bmad-output/planning-artifacts/epics.md#Epic 6: 본사 리포트와 안전한 Export`
- PRD sensitive/export requirements: `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#CAP-13: 민감 지표 노출 제한과 권한 세분화`
- Architecture: `_bmad-output/planning-artifacts/architecture.md#API & Communication Patterns`
- UX: `_bmad-output/planning-artifacts/ux-designs/ux-erp_fish-2026-05-28/EXPERIENCE.md#Component Patterns`
- Previous stories: `_bmad-output/implementation-artifacts/6-1-일별-아침-회의-리포트.md`, `_bmad-output/implementation-artifacts/6-2-지점별-기간-비교-리포트.md`, `_bmad-output/implementation-artifacts/6-3-월간-지점-요약-리포트.md`
- Current implementation: `src/server/authz.ts`, `src/server/audit.ts`, `src/features/audit/audit-format.ts`, `src/server/sensitive-fields.ts`, `src/features/reports/queries.ts`, `src/features/reports/types.ts`, report pages/components
- Current tests: `tests/unit/hq-reports.test.mjs`, `tests/unit/sensitive-response-shaping.test.mjs`, `tests/e2e/hq-reports.spec.ts`
- Official docs: https://nextjs.org/docs/app/getting-started/route-handlers, https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition, https://www.prisma.io/docs/orm/prisma-client/queries/transactions

## Change Log

- 2026-06-12: Create-story workflow로 Story 6.4 ready-for-dev 문서 생성. 기존 report query 재사용, `EXPORT_CREATE` 서버 권한 재검증, CSV export route, server column allowlist, 민감 필드 차단, correction-applied value/status 보존, sanitized file response, ReportExport audit log, UI export action, unit/e2e 검증 범위를 구현 지침으로 고정했다.
- 2026-06-12: Dev-story workflow로 본사 전용 CSV export route, 서버 allowlist, 403 권한 차단, 안전한 파일 응답, ReportExport 감사 로그, 리포트 UI export 버튼, unit/e2e 계약 테스트를 구현하고 story를 review 상태로 전환했다.
- 2026-06-12: Story-automator review workflow로 export route의 calendar date/month 검증, 권한 밖 storeId CSV 생성 차단, CSV formula injection 방어를 자동 수정하고 story/sprint 상태를 done으로 전환했다.

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- Dev-story workflow executed for Story 6.4.
- Resolved workflow customization: no activation prepend/append steps, persistent facts requested `project-context.md`, `on_complete` empty.
- Loaded `_bmad/bmm/config.yaml`: communication/document output language Korean, implementation artifacts `_bmad-output/implementation-artifacts`.
- Persistent fact lookup found no `project-context.md`.
- Preserved existing `baseline_commit: 15bbc17`; updated story and sprint status to `in-progress` before implementation.
- Audited current report query/type/page/component files, authz/audit/sensitive-field files, and existing unit/e2e report tests before editing.
- RED: Added Story 6.4 unit/source-contract and sensitive response tests; initial run failed because export route/helper did not exist.
- GREEN: Added `src/app/api/reports/export/route.ts` and `src/features/reports/export.ts`; added CSV export buttons to daily/comparison/monthly pages; added ReportExport audit labels.
- REFACTOR: Formatted touched source/test files with Prettier and adjusted source-contract regex to tolerate formatter whitespace.
- Validation: `node --experimental-strip-types --test tests/unit/hq-reports.test.mjs tests/unit/sensitive-response-shaping.test.mjs` passed.
- Validation: `node --experimental-strip-types --test tests/unit/hq-reports.test.mjs tests/unit/sensitive-response-shaping.test.mjs tests/unit/master-data-history.test.mjs` passed.
- Validation: `pnpm test:unit -- hq-reports` passed; script executed the full `tests/unit/*.test.mjs` suite, 35/35 files passed.
- Validation: `pnpm lint` passed.
- Validation: `pnpm typecheck` passed.
- Validation: `git diff --check` passed.
- E2E target `pnpm test:e2e tests/e2e/hq-reports.spec.ts` could not run test bodies because Playwright webServer exited early; direct dev server check showed `listen EPERM: operation not permitted 127.0.0.1:3100`, so this is an environment port-binding failure, not an assertion failure.
- Story-automator review workflow executed for Story 6.4.
- Review loaded `.agents/skills/bmad-story-automator-review/SKILL.md`, `workflow.yaml`, `instructions.xml`, and `checklist.md`.
- Review finding fixed: export route now validates real calendar dates/months, so inputs like `2026-02-31` or `2026-13` return 400 before report generation/audit.
- Review finding fixed: comparison/monthly export now rejects requested `storeId` values that existing report queries resolve outside the current user's scope, preventing empty CSV success for 권한 밖 지점 요청.
- Review finding fixed: CSV cell escaping now prefixes Excel-formula-leading values (`=`, `+`, `-`, `@`) with `'` before RFC 4180 quoting.
- Review validation: `node --experimental-strip-types --test tests/unit/hq-reports.test.mjs tests/unit/sensitive-response-shaping.test.mjs` passed.
- Review validation: `pnpm test:unit -- hq-reports` passed; script executed full `tests/unit/*.test.mjs`, 35/35 files passed.
- Review validation: `pnpm lint` passed.
- Review validation: `pnpm typecheck` passed.
- Review validation: `git diff --check` passed.
- Review E2E target `pnpm test:e2e tests/e2e/hq-reports.spec.ts` still could not run test bodies because Playwright webServer exited early; direct dev server check showed `listen EPERM: operation not permitted 127.0.0.1:3000`.
- Create-story workflow executed with `#YOLO`.
- Loaded `.agents/skills/bmad-create-story/SKILL.md`, `discover-inputs.md`, `template.md`, and `checklist.md`.
- Resolved workflow customization: no activation prepend/append steps, persistent facts requested `project-context.md`, `on_complete` empty.
- Loaded `_bmad/bmm/config.yaml`: communication/document output language Korean, implementation artifacts `_bmad-output/implementation-artifacts`.
- Persistent fact lookup found no `project-context.md`.
- Loaded complete `_bmad-output/implementation-artifacts/sprint-status.yaml` and used explicit Story 6.4 key `6-4-본사-전용-export와-권한-차단`.
- Discovery loaded planning sources: `epics.md`, `architecture.md`, PRD `prd.md`, UX `DESIGN.md` and `EXPERIENCE.md`.
- Loaded previous story `_bmad-output/implementation-artifacts/6-3-월간-지점-요약-리포트.md`, recent git history, and current worktree status.
- Read current report pages, report query/type/component files, authz/audit/sensitive-field files, Prisma schema, report unit/e2e tests, and package versions.
- Official docs checked for Next.js Route Handlers, MDN Content-Disposition, and Prisma transactions.
- Validation checklist pass applied directly due `#YOLO`: added reuse guardrails, existing export permission usage, server allowlist, sensitive field/file metadata/audit metadata prevention, correction-applied value preservation, CSV-only scope, audit log contract, UI export action, and focused verification commands.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Implemented a thin Next.js route handler for `/api/reports/export` that calls `requireExportCreateAccess()` first, validates the minimal CSV query contract, then delegates report data generation to the existing daily/comparison/monthly server queries.
- Added server-owned export column allowlists and CSV generation with UTF-8 BOM, RFC 4180 quote escaping, no-store response headers, and sanitized `erp-fish-report-<report>-<period>.csv` filenames.
- Export rows use existing report evidence/status values and correction-applied values; OQ/insufficient/calculation-unavailable states are preserved as text instead of temporary numbers.
- Unauthorized export requests return a consistent 403 JSON payload without generated file bytes or sensitive requested metadata.
- Successful exports write `ReportExport` audit logs with actor context, normalized report filters, scoped store ids/count, column keys, row count, and format; file bytes and cell values are not stored in audit JSON.
- Added permission-gated CSV buttons with lucide download icons to daily, comparison, and monthly report pages.
- Added Story 6.4 unit/source-contract, sensitive response, audit label, and E2E scenario coverage. Targeted E2E execution is blocked in this sandbox by `listen EPERM` before Playwright reaches assertions.
- Senior developer review auto-fixed 3 issues: invalid calendar input acceptance, 권한 밖 `storeId` empty CSV success, and CSV formula injection exposure.

### Senior Developer Review (AI)

Reviewer: GPT-5 Codex on 2026-06-12

Outcome: Approve after automatic fixes. Critical issues remaining: 0.

Findings fixed:
- [HIGH] Export route accepted regex-valid but calendar-invalid dates/months, allowing invalid requests such as `2026-13` to reach report generation instead of returning 400. Fixed with real date/month validation in `src/app/api/reports/export/route.ts`.
- [HIGH] Comparison/monthly export could return a generated empty CSV when a requested `storeId` was normalized out by existing report queries, instead of treating the request as 권한 밖. Fixed by comparing requested store scope to resolved report filters before CSV/audit generation.
- [MEDIUM] CSV output quoted cells but did not neutralize Excel formula-leading values from names/status text. Fixed by prefixing cells beginning with `=`, `+`, `-`, or `@` before CSV escaping.

Checklist validation:
- Story file loaded and status verified as reviewable.
- Acceptance Criteria and completed tasks cross-checked against implementation.
- File List compared with git changes; untracked export route/helper are expected implementation files and are present in story File List.
- Code quality/security review performed on changed export route/helper and related tests.
- Tests mapped to ACs and strengthened for route validation, scope mismatch blocking, and CSV formula escaping.
- Status updated to done because no critical issues remain after fixes.

### File List

- `_bmad-output/implementation-artifacts/6-4-본사-전용-export와-권한-차단.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/api/reports/export/route.ts`
- `src/app/app/reports/daily/page.tsx`
- `src/app/app/reports/comparison/page.tsx`
- `src/app/app/reports/monthly/page.tsx`
- `src/features/reports/export.ts`
- `src/features/audit/audit-format.ts`
- `tests/unit/hq-reports.test.mjs`
- `tests/unit/sensitive-response-shaping.test.mjs`
- `tests/unit/master-data-history.test.mjs`
- `tests/e2e/hq-reports.spec.ts`
