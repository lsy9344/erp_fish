# 테스트 자동화 요약

## 생성/보강한 테스트

### API / Unit 테스트

- [x] `tests/unit/hq-reports.test.mjs` - Story 6.2 기간 비교 리포트 source-contract, 권한 helper, store scope, date/store URL 상태, correction overlay, shared calculation, status counts, metric evidence, revalidation 경로 검증
- [x] `tests/unit/hq-reports.test.mjs` - 기간 비교 집계가 미입력/휴무/0원/정정 반영값/데이터 부족/OQ-gated 상태를 구분하는지 검증
- [x] 별도 public API route 없음 - `/app/reports/comparison`은 server query + page render 경계라 API 테스트 대신 서버 계약 단위 테스트로 검증

### E2E 테스트

- [x] `tests/e2e/hq-reports.spec.ts` - 본사 사용자가 일별 리포트에서 기간 비교로 이동해 날짜와 지점 필터를 적용하고 지점별 실적을 확인하는 흐름 검증
- [x] `tests/e2e/hq-reports.spec.ts` - 기간 비교에서 정정 반영 집계, 원본/정정 반영 근거, 장부 상세 링크, 정정 타임라인 링크 검증
- [x] `tests/e2e/hq-reports.spec.ts` - 기간 안에 입력중 장부가 포함될 때 `미마감 포함`과 `입력중 1일` 상태가 표시되는지 검증
- [x] `tests/e2e/hq-reports.spec.ts` - 권한 밖 지점 필터가 데이터 없이 안내 메시지를 표시하는지 검증
- [x] `tests/e2e/hq-reports.spec.ts` - 좁은 화면 모바일 카드에서 핵심 지표, 정정 반영, 접이식 나머지 지표, 가로 overflow 방지 검증
- [x] `tests/e2e/hq-reports.spec.ts` - 지점장 사용자의 기간 비교 리포트 직접 URL 접근 차단 검증

## 커버리지

- Story 6.2 AC: 6/6 covered by unit/source-contract + E2E scenarios
- API/server boundary: public report API route 없음, `requireReportAccess()`, `getHeadquartersStoreScope()`, active scoped stores, unauthorized store no-data contract covered
- UI workflow: start/end date filter, store filter, all active stores default, desktop table, mobile card, empty/error messaging covered
- Correction behavior: correction-applied default aggregate number, original/corrected aggregate evidence, ledger detail link, correction timeline link covered
- Sensitive/OQ-gated behavior: finalized number 차단, `계산 기준 확인 필요`, `데이터 부족`, `계산 불가`, `정정 확인 필요` 상태 구분 covered
- Error/negative cases: branch-manager unauthorized access, out-of-scope store filter, missing ledger, holiday ledger, unclosed ledger, correction review required state covered

## 체크리스트 결과

- [x] API tests generated where applicable
- [x] E2E tests generated for UI behavior
- [x] Tests use standard project APIs (`node:test`, Playwright)
- [x] Happy path covered
- [x] Critical error cases covered: unauthorized branch-manager access, out-of-scope store filter, missing/holiday/unclosed ledgers, correction review required state
- [x] Semantic locators and accessible names used
- [x] Clear test descriptions used
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent through story-scoped seed IDs and cleanup
- [x] Tests saved to appropriate directories
- [x] Summary includes coverage metrics and validation status

## 검증

- [x] `pnpm test:unit -- hq-reports` - passed, 35/35 unit files; repo script did not narrow to one file
- [x] `pnpm lint` - passed
- [x] `pnpm typecheck` - passed
- [x] `git diff --check` - passed
- [ ] `pnpm test:e2e tests/e2e/hq-reports.spec.ts` - blocked before test body because Playwright `config.webServer` exited early

E2E 차단 원인 확인: 동일 dev server 경로인 `pnpm dev`가 현재 sandbox에서 `listen EPERM: operation not permitted 0.0.0.0:3000`으로 시작하지 못한다. 따라서 E2E spec은 생성/정적 검증됐지만, 현재 실행 환경에서는 포트 listen 권한 때문에 브라우저 테스트 본문을 완료할 수 없다.
