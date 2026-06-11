# Test Automation Summary

## Generated Tests

### API Tests

- [x] N/A - Story 1.4에는 별도 export/API route handler가 아직 없으며, 서버 권한 경계는 unit test와 Server Component/server query 기반 Playwright 흐름으로 검증한다.

### E2E Tests

- [x] `tests/e2e/permission-profiles.spec.ts` - 지정 지점 본사 계정이 dashboard, daily report, comparison report, monthly report HTML/serialized response에서 배정 지점만 받는지 검증하도록 보강했다.
- [x] `tests/e2e/store-ledger-inventory.spec.ts` - 지점장 재고 화면이 단가, 매입/손실/재고금액, 조정 전후 금액, 조정 차액 key/value를 HTML/serialized response에 포함하지 않는 회귀 테스트를 추가했다.
- [x] `tests/e2e/store-ledger-losses.spec.ts` - 지점장 손실 화면의 본사 전용 단가/총손실액/금액 후보 노출 기대값을 Story 1.4 계약에 맞게 수정하고, 손실 저장 후 재고 화면에서도 손실액/재고금액 key/value가 직렬화되지 않는지 검증했다.
- [x] `tests/e2e/store-ledger-review.spec.ts` - 기존 Story 1.4 검토 화면 테스트가 민감 계산 key와 값이 페이지 HTML에 없는지 커버한다.

## Coverage

- API endpoints: N/A. 현재 관련 보안 경계는 Server Component, server query, Server Action, Playwright route flow 중심이다.
- UI workflows: 지점장 검토/재고/손실 화면의 민감 필드 차단, 지정 지점 본사 계정의 dashboard/report store scope 제한을 커버한다.
- Happy path: 지점장은 비민감 수량/상태/사유/검토 정보를 계속 볼 수 있고, 지정 지점 본사는 허용 지점 리포트를 볼 수 있다.
- Critical error cases: 권한 밖 지점 데이터가 page HTML에 섞이지 않음, 지점장 응답에 단가/재고금액/조정금액/손실액 key가 섞이지 않음을 커버한다.

## Validation

- [x] `corepack pnpm exec playwright test tests/e2e/permission-profiles.spec.ts tests/e2e/store-ledger-inventory.spec.ts tests/e2e/store-ledger-losses.spec.ts tests/e2e/store-ledger-review.spec.ts --list` - 20 tests loaded.
- [x] `corepack pnpm exec prisma validate`
- [x] `corepack pnpm exec prisma generate`
- [x] `corepack pnpm lint`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test:unit` - 191/191 unit tests passed.
- [x] `corepack pnpm build`
- [x] `git diff --check`
- [ ] `PATH=/tmp/erp-fish-bin:$PATH corepack pnpm exec playwright test tests/e2e/permission-profiles.spec.ts tests/e2e/store-ledger-inventory.spec.ts tests/e2e/store-ledger-losses.spec.ts tests/e2e/store-ledger-review.spec.ts` - blocked before tests because `127.0.0.1:3000` is already in use by another project dev server (`EADDRINUSE`).

## Checklist Result

- API tests generated if applicable: N/A.
- E2E tests generated if UI exists: complete.
- Standard framework APIs: Playwright `test`, `expect`, semantic role/label/text locators, and `page.content()` serialized response checks.
- Happy path covered: complete.
- Critical error cases covered: complete for Story 1.4 security regressions.
- Tests are independent: fixtures create and clean scoped Story 2.x data; no order dependency added.
- No hardcoded waits or sleeps: complete.
- Summary includes coverage metrics: complete.
