# 테스트 자동화 요약

## 생성/보강한 테스트

### API / Unit 테스트

- [x] `tests/unit/hq-reports.test.mjs` - Story 6.4 export route/source-contract, `requireExportCreateAccess()`, 기존 report query 재사용, no-store/CSV/header/filename/audit action 계약 검증
- [x] `tests/unit/hq-reports.test.mjs` - daily export CSV가 UTF-8 BOM, RFC 4180 quote escaping, sanitized filename, 정정 반영 상태, OQ-gated 상태, original value 미노출을 지키는지 검증
- [x] `tests/unit/hq-reports.test.mjs` - comparison/monthly export helper가 `정정 반영`, `기준 확인 필요`, `데이터 부족`, `계산 불가`, `미마감 장부 제외` 상태를 보존하고 audit metadata에 cell/store display 값을 저장하지 않는지 추가 검증
- [x] `tests/unit/sensitive-response-shaping.test.mjs` - export forbidden payload와 무권한 경로가 민감 key, 요청 store id, 요청 column metadata를 노출하지 않는지 검증

### E2E 테스트

- [x] `tests/e2e/hq-reports.spec.ts` - 본사 사용자가 daily/comparison/monthly 리포트에서 CSV를 다운로드하고 `ReportExport` 감사 이력을 확인하는 흐름 검증
- [x] `tests/e2e/hq-reports.spec.ts` - 다운로드된 daily CSV 파일명이 안전한 패턴을 따르고, BOM/정정 반영 상태를 포함하며 original correction value와 sensitive implementation key를 포함하지 않는지 검증
- [x] `tests/e2e/hq-reports.spec.ts` - export 권한이 없는 본사 조회 사용자와 지점장이 UI/API 경로에서 CSV를 받을 수 없는지 검증
- [x] `tests/e2e/hq-reports.spec.ts` - malformed export 요청이 400 JSON을 반환하고 `Content-Disposition`/CSV file/audit log를 만들지 않는지 검증

## 커버리지

- Story 6.4 AC: 6/6 covered by unit/source-contract + E2E scenarios
- API endpoints: `/api/reports/export` daily/comparison/monthly CSV happy path, malformed request, unauthorized request covered
- UI features: daily/comparison/monthly export button visibility and download path covered
- Permission cases: `EXPORT_CREATE` 본사 허용, 본사 조회 전용 차단, 지점장 차단 covered
- Sensitive/OQ-gated behavior: forbidden response metadata, CSV status text, correction-applied values, original value omission, audit metadata no cell values covered
- Audit behavior: `ReportExport` target/action, created logs, malformed request no-log covered

## 체크리스트 결과

- [x] API tests generated where applicable
- [x] E2E tests generated for UI behavior
- [x] Tests use standard project APIs (`node:test`, Playwright)
- [x] Happy path covered
- [x] Critical error cases covered: no export permission, branch-manager access, malformed report/month/date, no CSV bytes on bad request
- [x] Semantic locators and accessible names used
- [x] Clear test descriptions used
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent through story-scoped seed IDs and cleanup
- [x] Tests saved to appropriate directories
- [x] Summary includes coverage metrics and validation status

## 검증

- [x] `node --experimental-strip-types --test tests/unit/hq-reports.test.mjs tests/unit/sensitive-response-shaping.test.mjs` - passed
- [x] `pnpm test:unit -- hq-reports` - passed, 35/35 unit files; repo script did not narrow to one file
- [x] `pnpm lint` - passed
- [x] `pnpm typecheck` - passed
- [x] `git diff --check` - passed
- [ ] `pnpm test:e2e tests/e2e/hq-reports.spec.ts` - blocked before test body because Playwright `config.webServer` exited early

E2E 차단 원인 확인: 동일 dev server 경로인 `pnpm dev --hostname 127.0.0.1 --port 3000`이 현재 sandbox에서 `listen EPERM: operation not permitted 127.0.0.1:3000`으로 시작하지 못한다. 따라서 E2E spec은 생성/정적 검증됐지만, 현재 실행 환경에서는 포트 listen 권한 때문에 브라우저 테스트 본문을 완료할 수 없다.
