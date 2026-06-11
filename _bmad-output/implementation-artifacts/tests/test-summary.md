# Test Automation Summary

## Generated Tests

### API Tests

- [x] N/A - Story 1.3에는 별도 HTTP API route surface가 없으며, 서버 권한 경계는 unit test와 Prisma-backed Playwright fixture/DB 변경 시나리오로 검증한다.

### E2E Tests

- [x] `tests/e2e/auth.spec.ts` - 비로그인 `/app`, 지점장 본사 URL 직접 접근, 지점장 store scope, 중복 `storeId`, 비활성/미배정 지점장 흐름을 검증한다.
- [x] `tests/e2e/permission-profiles.spec.ts` - 지정 지점 본사 계정의 배정 지점 접근, 미배정 지점 차단, dashboard/report scope 제한, 기준정보 직접 URL 차단, fixture 권한 구조를 검증한다.
- [x] `tests/e2e/permission-profiles.spec.ts` - Story 1.3 QA 보강으로 권한 없는 본사 메뉴 숨김과 `User.isActive=false` 변경 후 같은 세션 다음 요청 차단 테스트를 추가했다.

## Coverage

- API endpoints: N/A. 이 스토리의 권한 경계는 Server Component, server query, Server Action, Playwright route flow 중심이다.
- UI authorization workflows: 비로그인 보호 route, 지점장 본사 URL 차단, 본사 지정 지점 scope, 권한 없는 기준정보 route 차단, 권한 없는 본사 메뉴 숨김을 커버한다.
- Critical error cases: 권한 action 제거, 지점 배정 제거, 사용자 비활성화, 중복/미배정/비활성 `storeId` 흐름을 커버한다.
- Remaining execution gap: Playwright E2E는 현재 PostgreSQL test DB `localhost:55432`가 실행 중이 아니어서 global setup의 Prisma `db push` 단계에서 차단된다.

## Validation

- [x] `corepack pnpm exec prettier --write tests/e2e/permission-profiles.spec.ts`
- [x] `corepack pnpm exec prettier --check tests/e2e/permission-profiles.spec.ts`
- [x] `corepack pnpm lint`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test:unit` - 187/187 unit tests passed.
- [x] `corepack pnpm build`
- [x] `git diff --check`
- [ ] `PATH=/tmp/erp-fish-bin:$PATH corepack pnpm exec playwright test tests/e2e/permission-profiles.spec.ts` - Prisma global setup failed with `P1001: Can't reach database server at localhost:55432`.

## Checklist Result

- API tests generated if applicable: N/A.
- E2E tests generated if UI exists: complete.
- Standard framework APIs: Playwright `test`, `expect`, semantic role/text locators.
- Happy path: assigned HQ dashboard/report/store access.
- Critical errors: unauthorized route, stale permission action, stale store assignment, stale active user.
- All generated tests run successfully: blocked for Playwright by missing PostgreSQL test DB; lint/typecheck/unit/build/format-related checks pass.

## Next Steps

- Start the PostgreSQL test DB on `localhost:55432`, then re-run `corepack pnpm exec playwright test tests/e2e/permission-profiles.spec.ts`.
