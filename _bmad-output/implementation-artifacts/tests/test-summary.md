# Test Automation Summary

## Generated Tests

### API Tests

- [x] N/A - Story 2.3는 public API route가 없고, 장부 저장은 Next.js Server Action과 Prisma transaction 경로로 처리된다. 서버 저장 계약은 unit/source tests와 Playwright UI 흐름으로 검증한다.

### E2E Tests

- [x] `tests/e2e/store-ledger-sales.spec.ts` - 총매출/현금/카드/기타 결제수단 저장, 부호 있는 결제 합계 차액 표시, 저장 후 새로고침 유지, 단계 navigation 저장됨 표시, stale version 충돌, 권한 없는 지점 차단, 본사마감 입력 lock, 저장 실패 retry, 390px 터치 타깃과 overflow 방지를 검증한다.
- [x] `tests/e2e/store-ledger-cost-labor.spec.ts` - 비용 항목 다중 행 추가/삭제/저장, 비용 합계와 마지막 서버 저장 합계, 비활성 과거 비용 코드 표시 보존과 신규 선택지 제외, 비용 단계 미저장 변경 dialog 저장 경로, 저장 실패 retry, validation focus, 390px 다중 행 layout을 검증한다.

### Unit Tests

- [x] `tests/unit/ledger-sales.test.mjs` - 매출/결제 schema edge case, KST date serialization, version guard, audit/revalidation source contract, 결제 차이 계산, OQ-1 threshold/anomaly 미구현 contract를 검증한다.
- [x] `tests/unit/ledger-cost-labor.test.mjs` - 비용 schema edge case, blank memo normalization, active `EXPENSE_ITEM` 서버 검증, inactive/wrong-group 직접 post 차단 source contract, fallback code non-saveability, 과거 비활성 코드 표시 보존, 서버 저장 합계 표시 contract를 검증한다.

## Coverage

- API endpoints: N/A. Story 2.3 범위에는 별도 public API endpoint가 없다.
- Server actions/contracts: `saveLedgerSalesPayment`, `saveLedgerExpenses`, authorization, version conflict, audit logging, revalidation, active expense-code validation covered by unit/source tests.
- UI workflows: sales/payment save and revisit, signed payment difference, cost multi-line save and revisit, inactive historical expense code behavior, unsaved navigation save path, save failure retry, closed-ledger lock, unauthorized store redirect, 390px layout/touch targets.
- Happy path: 1단계 매출/결제 값 저장과 2단계 비용 다중 행 저장이 DB/UI에 유지된다.
- Critical error cases: stale version conflict, unauthorized store access, network save failure retry, validation failure focus, inactive expense code 신규 선택지 제외, headquarters-closed mutation lock.

## Validation

- [x] `corepack pnpm exec node --experimental-strip-types --test tests/unit/ledger-sales.test.mjs` - pass.
- [x] `corepack pnpm exec node --experimental-strip-types --test tests/unit/ledger-cost-labor.test.mjs` - pass.
- [x] `corepack pnpm exec playwright test tests/e2e/store-ledger-sales.spec.ts tests/e2e/store-ledger-cost-labor.spec.ts --list` - 19 tests loaded.
- [x] `corepack pnpm exec prettier --check tests/e2e/store-ledger-sales.spec.ts tests/e2e/store-ledger-cost-labor.spec.ts _bmad-output/implementation-artifacts/tests/test-summary.md` - pass.
- [x] `corepack pnpm exec prisma generate && DATABASE_URL=postgresql://postgres:password@localhost:55432/erp_fish corepack pnpm exec prisma validate` - pass.
- [x] `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test:unit && corepack pnpm build` - pass; unit tests 195/195 passed.
- [x] `PORT=3100 DATABASE_URL=postgresql://postgres:erp_fish_local_pw@host.docker.internal:5432/erp_fish_e2e corepack pnpm exec playwright test tests/e2e/store-ledger-sales.spec.ts tests/e2e/store-ledger-cost-labor.spec.ts` - 19/19 passed after scoping strict locators to the new common save-status UI.

## Checklist Result

- API tests generated if applicable: N/A.
- E2E tests generated if UI exists: complete.
- Tests use standard framework APIs: complete. Uses Playwright `test`/`expect`, semantic role/label/text locators, Node test runner, and Prisma fixture assertions.
- Happy path covered: complete.
- Critical error cases covered: complete.
- Proper locators: complete.
- Clear descriptions: complete.
- No hardcoded waits or sleeps: complete.
- Tests are independent: selected ledger/code cleanup and deterministic fixtures are used.
- Summary includes coverage metrics: complete.
