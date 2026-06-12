# 테스트 자동화 요약

## 생성/보강한 테스트

### API / Unit 테스트

- [x] `tests/unit/master-data-purchase-standards.test.mjs` - 매입 기준 schema의 product trim, optional KRW integer, 음수/소수/포맷 문자열/Int 범위 초과, 단가/참조 정보 둘 중 하나 필수 검증
- [x] `tests/unit/master-data-purchase-standards.test.mjs` - 매입 기준 action의 settings 권한, Prisma transaction, same-transaction audit, before/after payload, active product rule, revalidation 검증
- [x] `tests/unit/master-data-purchase-standards.test.mjs` - 매입 기준 query의 settings-only list, active 기준 + active 품목 신규 선택지, active/inactive URL 필터 계약 검증
- [x] `tests/unit/master-data-purchase-standards.test.mjs` - 관리 화면의 headquarters shell, URL filter, 표시 컬럼, validation accessibility, no hard-delete 계약 검증
- [x] `tests/unit/master-data-purchase-standards.test.mjs` - eCount upload/FIFO/mapping/effective-start 후속 범위 제외 검증
- [x] `tests/unit/master-data-purchase-standards.test.mjs` - 장부 저장 action이 매입 기준을 참조로만 사용하고 사용자 snapshot을 덮어쓰지 않는 구조 검증

### E2E 테스트

- [x] `tests/e2e/master-data-purchase-standards.spec.ts` - 본사 설정 관리자가 매입 기준 목록 컬럼, 상태 필터, 생성, 수정, 비활성화, 감사 로그를 확인
- [x] `tests/e2e/master-data-purchase-standards.spec.ts` - 비활성 품목의 매입 기준 활성화 차단과 생성 dialog의 active product option 제한 검증
- [x] `tests/e2e/master-data-purchase-standards.spec.ts` - 매입 기준 폼의 서버 validation error, `aria-invalid`, `aria-describedby`, 첫 오류 focus 검증
- [x] `tests/e2e/master-data-purchase-standards.spec.ts` - 지점장이 매입 기준 관리 URL에서 차단되고 데이터를 볼 수 없는지 검증
- [x] `tests/e2e/master-data-purchase-standards.spec.ts` - 장부 매입 입력에서 active 기준 선택, 비활성 기준 제외, 수동 입력 가능, 사용자 수정 snapshot 저장 검증
- [x] `tests/e2e/master-data-purchase-standards.spec.ts` - 저장 후 매입 기준/품목이 변경 및 비활성화되어도 과거 장부 입력값은 유지되고 신규 매입 기준 선택지에서는 제외되는 회귀 검증

## 커버리지

- Story 5.3 AC: 6/6 covered
- API/action 경계: settings 권한, 생성/수정/상태 변경, KRW integer validation, active product rule, transaction-scoped audit, revalidation, no hard-delete covered
- UI workflow: 목록/필터, 생성/수정/비활성화, 감사 로그, validation focus, branch-manager unauthorized redirect covered
- 장부 입력: active 기준 참조, inactive 기준 신규 선택지 제외, 수동 입력 유지, 사용자 수정 snapshot 보존, 기준 변경 후 과거 입력값 유지 covered
- Critical error cases: invalid KRW format, missing required reference, inactive product activation, unauthorized manager access, inactive standard option exclusion covered

## 체크리스트 결과

- [x] API tests generated where applicable
- [x] E2E tests generated for UI behavior
- [x] Tests use standard project APIs (`node:test`, Playwright)
- [x] Happy path covered
- [x] 1-2 critical error cases covered
- [x] Semantic locators and accessible names used
- [x] Clear test descriptions used
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent through cleanup, unique generated names, and Story 5.3 fixture scope
- [x] Tests saved to appropriate directories
- [x] Summary includes coverage metrics and validation status

## 검증

- [x] `corepack pnpm test:unit -- master-data-purchase-standards` - 34/34 passed. 스크립트 특성상 focused 인자와 함께 전체 unit suite가 실행됨.
- [x] `corepack pnpm exec playwright test --list tests/e2e/master-data-purchase-standards.spec.ts` - 4 tests discovered
- [ ] `corepack pnpm test:e2e tests/e2e/master-data-purchase-standards.spec.ts` - blocked before test body because Playwright `config.webServer` exited early.
- [x] `corepack pnpm lint` - passed
- [x] `corepack pnpm typecheck` - passed

E2E 차단 원인 확인: 동일 webServer 명령을 직접 실행하면 Next dev server가 `listen EPERM: operation not permitted 127.0.0.1:3000`으로 시작하지 못한다. 테스트 코드 생성과 정적 검증은 완료됐지만, 이 sandbox에서는 포트 listen 권한 때문에 Playwright 실행을 완료할 수 없다.
