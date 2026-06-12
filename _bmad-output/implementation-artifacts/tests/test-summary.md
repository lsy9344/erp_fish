# 테스트 자동화 요약

## 생성/보강한 테스트

### API / Unit 테스트

- [x] `tests/unit/sensitive-response-shaping.test.mjs` - Story 7.2 정책 alias인 `30%단가`, `30_단가`, `thirtyPercent`, `thirty_percent_unit_price`, `thirty-percent-preview`, `price30`, `price_30`, `margin30`, `margin_30`가 공통 민감 필드 helper에서 제거되는지 검증.
- [x] `src/server/sensitive-fields.ts` - 위 테스트를 만족하도록 공통 민감 필드 차단 목록과 separator-insensitive matching을 보강.

### E2E 테스트

- [x] `tests/e2e/store-ledger-inventory.spec.ts` - 지점장 재고 화면 row와 inventory 응답 payload에 단가/재고금액/조정금액 및 camelCase/snake_case/hyphen/Korean `30%단가` 파생 key가 직렬화되지 않는지 검증.
- [x] `tests/e2e/hq-reports.spec.ts` - daily/comparison/monthly CSV export, export 403 응답, export 400 응답에 camelCase/snake_case/hyphen/Korean `30%단가` 파생 key가 포함되지 않는지 검증.

## 커버리지

- Story 7.2 AC: 승인 전 `30%단가` 파생 key/value 추가 금지와 지점장/export 숨김 정책을 회귀 테스트로 보강.
- API endpoints: 1/1 relevant export endpoint covered for forbidden and invalid export responses.
- UI features: 지점장 재고 화면 민감 응답/표시 1 surface covered.
- Export surfaces: daily, comparison, monthly CSV 3/3 covered for `30%단가` 파생 alias 누출 방지.
- Critical error cases: 권한 없는 export 403, 잘못된 export 요청 400 covered.

## 체크리스트 결과

- [x] API tests generated where applicable
- [x] E2E tests generated where UI/export surfaces exist
- [x] Tests use standard project APIs: Playwright and Node test
- [x] Tests cover happy path: authorized CSV export does not include `30%단가` aliases
- [x] Tests cover critical error cases: unauthorized 403 and bad request 400 responses
- [x] Tests use semantic locators where UI is inspected
- [x] Tests have clear descriptions
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent and reuse existing seed/cleanup patterns
- [x] Test summary created
- [x] Tests saved to appropriate directories
- [x] Summary includes coverage metrics

## 검증

- [x] `node --experimental-strip-types --test tests/unit/sensitive-response-shaping.test.mjs` - passed
- [x] `pnpm test:unit` - passed, 35/35 unit files
- [x] `pnpm typecheck` - passed
- [x] `pnpm lint` - passed with existing warnings in `src/app/api/reports/export/route.ts` for unused `DATE_PATTERN` and `MONTH_PATTERN`
- [x] `git diff --check` - passed
- [ ] `pnpm exec playwright test tests/e2e/store-ledger-inventory.spec.ts tests/e2e/hq-reports.spec.ts` - blocked before test body because Playwright `config.webServer` exited early

E2E 차단 원인 확인: `timeout 10s corepack pnpm dev --hostname 127.0.0.1 --port 3000`가 현재 sandbox에서 `listen EPERM: operation not permitted 127.0.0.1:3000`으로 실패한다. 따라서 브라우저 테스트 본문은 이 실행 환경에서 완료할 수 없다.
