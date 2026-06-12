# Test Automation Summary

## Generated Tests

### API Tests

- [x] N/A - Story 3.1는 public API route를 추가하지 않는다. 서버 계산 계약은 Node unit/source tests로 검증하고, 화면 표시 계약은 Playwright E2E로 보강했다.

### E2E Tests

- [x] `tests/e2e/hq-dashboard.spec.ts` - 본사 관제판과 장부 상세에서 `data-insufficient` 계산 상태가 `데이터 부족`으로 표시되고, 0값/빈값/legacy `계산 불가` 문구로 숨겨지지 않는 회귀 테스트를 추가했다.
- [x] 기존 `tests/e2e/hq-dashboard.spec.ts` - story 3.1 fixture의 활성/비활성 지점, 장부 상태, 본사 상세 이동, 정정 반영, 권한 차단, 모바일 겹침 검증을 유지한다.

### Unit Tests

- [x] `tests/unit/calculation-status.test.mjs` - 계산 상태 코드/라벨/legacy reason 분리, unsafe KRW 계산 로그, review UI 공통 formatter 사용, dashboard/report 서버 계산 경계 재사용을 검증한다.
- [x] `tests/unit/ledger-review.test.mjs` - 정상값, 데이터 부족, 정책 미정, 계산 오류 계열 상태와 민감 지표 차단을 검증한다.

## Coverage

- API endpoints: N/A. Story 3.1 범위에는 별도 public API endpoint가 없다.
- Server calculation contracts: total sales, payment total/difference, expense total, worker count, inventory-dependent metrics, productivity, sales difference status, unsafe integer handling covered by unit tests.
- UI workflows: HQ dashboard and ledger detail now cover visible `데이터 부족` state rendering for calculation metrics.
- Happy path: existing dashboard E2E and ledger calculation unit tests cover normal calculated values.
- Critical status cases: `data-insufficient`, `policy-unconfirmed`, `calculation-unavailable` covered in unit tests; `data-insufficient` display now covered in E2E.

## Validation

- [x] `corepack pnpm test:unit` - pass, 31/31 unit files.
- [x] `corepack pnpm typecheck` - pass.
- [x] `corepack pnpm lint` - pass.
- [ ] `corepack pnpm test:e2e -- tests/e2e/hq-dashboard.spec.ts` - blocked by sandbox web server bind failure: `listen EPERM: operation not permitted 127.0.0.1:3000`.

## Checklist Result

- API tests generated if applicable: N/A.
- E2E tests generated if UI exists: complete.
- Tests use standard framework APIs: complete. Uses Playwright `test`/`expect`, role/label/test-id locators, and Prisma fixture setup.
- Happy path covered: complete through existing story 3.1 dashboard E2E and unit tests.
- Critical error/status cases covered: complete for server calculation states; E2E display coverage added for `데이터 부족`.
- All generated tests run successfully: blocked only for Playwright E2E because local server binding is denied by the sandbox. Unit/type/lint validation passes.
- Proper locators: complete.
- Clear descriptions: complete.
- No hardcoded waits or sleeps: complete.
- Tests are independent: existing per-test cleanup and story fixture IDs are used.
- Summary includes coverage metrics: complete.
