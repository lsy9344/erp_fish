# Test Automation Summary

## Generated Tests

### API Tests
- [x] `tests/unit/hq-dashboard.test.mjs` - 관제판 loading/empty state 문구 경계 계약 검증

### E2E Tests
- [x] `tests/e2e/hq-dashboard.spec.ts` - 최신 반영 시각/마지막 수정자 표시 검증
- [x] `tests/e2e/hq-dashboard.spec.ts` - 미입력 행 자동 생성 금지와 상세 링크 부재 검증
- [x] `tests/e2e/hq-dashboard.spec.ts` - 행 전체 클릭 상세 이동 검증

## Coverage

- Story 4.1 AC: 6/6 covered by generated or existing unit/E2E tests
- API/query boundaries: dashboard authorization, store scope, row contract, no auto-create, correction-applied calculations covered
- UI workflows: today/yesterday switch, row keyboard activation, row mouse activation, read-only mutation absence, mobile presentation covered

## Validation

- [x] `node --experimental-strip-types --test tests/unit/hq-dashboard.test.mjs`
- [x] `corepack pnpm test:unit`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm lint`
- [x] `corepack pnpm exec playwright test tests/e2e/hq-dashboard.spec.ts tests/e2e/permission-profiles.spec.ts --list`
- [ ] `corepack pnpm test:e2e -- tests/e2e/hq-dashboard.spec.ts tests/e2e/permission-profiles.spec.ts`

E2E execution is currently blocked by the sandbox port binding restriction: `listen EPERM: operation not permitted 127.0.0.1:3000`.

## Next Steps

- Run the targeted Playwright command in an environment that allows binding `127.0.0.1:3000`.
