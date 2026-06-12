# 테스트 자동화 요약

## 생성/보강한 테스트

### API / Unit 테스트

- [x] `tests/unit/hq-reports.test.mjs` - Story 6.1 일별 아침 회의 리포트 source-contract, 권한 helper, store scope, shared calculation, correction overlay, 최신 반영 시각, 상태 메시지, metric evidence 상태 구분 검증

### E2E 테스트

- [x] `tests/e2e/hq-reports.spec.ts` - 본사 사용자가 일별 아침 회의 리포트에서 지점별 상태, 최신 반영, 상태 메시지, 정정 반영 숫자, 상세 링크를 확인하는 흐름 검증
- [x] `tests/e2e/hq-reports.spec.ts` - 특정 일자 조회, 원본/정정 근거, 정정 타임라인 이동, 미입력/휴무 상태 구분 검증
- [x] `tests/e2e/hq-reports.spec.ts` - 좁은 화면 모바일 카드에서 미제출, 본사마감, 휴무일, 정정 확인 필요, 정정 반영, 상세 링크, 가로 overflow 방지 검증
- [x] `tests/e2e/hq-reports.spec.ts` - 지점장 사용자의 일별 본사 리포트 URL 접근 차단 검증

## 커버리지

- Story 6.1 AC: 6/6 covered by unit/source-contract + E2E scenarios
- API/server boundary: public report API route 없음, `requireReportAccess()`, `getHeadquartersStoreScope()`, active scoped stores, no write query contract covered
- UI workflow: 날짜 preset/custom 조회, desktop table, mobile card, latest reflected time, status message, numeric alignment evidence, detail link covered
- Correction behavior: correction-applied default number, original/corrected evidence, correction timeline link, correction review required state covered
- Error/negative cases: branch-manager unauthorized access, missing ledger, holiday ledger, calculation unavailable/data insufficient/correction review states covered

## 체크리스트 결과

- [x] API tests generated where applicable
- [x] E2E tests generated for UI behavior
- [x] Tests use standard project APIs (`node:test`, Playwright)
- [x] Happy path covered
- [x] Critical error cases covered: unauthorized branch-manager access, missing ledger, holiday ledger, correction review required state
- [x] Semantic locators and accessible names used
- [x] Clear test descriptions used
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent through story-scoped seed IDs and cleanup
- [x] Tests saved to appropriate directories
- [x] Summary includes coverage metrics and validation status

## 검증

- [x] `pnpm test:unit` - passed, 35/35
- [x] `pnpm lint` - passed
- [x] `pnpm typecheck` - passed
- [x] `git diff --check` - passed
- [ ] `pnpm test:e2e tests/e2e/hq-reports.spec.ts` - blocked before test body because Playwright `config.webServer` exited early

E2E 차단 원인 확인: 동일 webServer 명령인 `corepack pnpm dev --hostname 127.0.0.1 --port 3000`을 직접 실행하면 Next dev server가 `listen EPERM: operation not permitted 127.0.0.1:3000`으로 시작하지 못한다. 따라서 E2E spec은 생성/정적 검증됐지만, 현재 sandbox에서는 포트 listen 권한 때문에 브라우저 실행을 완료할 수 없다.
