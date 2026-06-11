# Test Automation Summary

## Generated Tests

### API Tests

- [x] N/A - Story 2.4는 public API route를 추가하지 않고 Next.js Server Action과 Prisma transaction 경로로 매입 저장을 처리한다. 서버 저장 계약은 focused unit/source tests와 Playwright UI 흐름으로 검증한다.

### E2E Tests

- [x] `tests/e2e/store-ledger-purchase.spec.ts` - 품목/매입 기준 선택 저장, 여러 매입 라인 저장 후 재방문, 매입 합계 표시, 기준 정보 없는 원문 수동 입력, 삭제 후 저장, 품목 마스터 변경 후 snapshot 표시 보존, 모바일 390px 입력성, 검증 오류 focus, 음수/소수 입력 보존 검증을 커버한다.
- [x] `tests/e2e/store-ledger-purchase.spec.ts` - 추가 gap으로 stale version 저장 거부와 DB 무변경, `HEADQUARTERS_CLOSED`/`HOLIDAY` 원본 저장 UI 차단, 권한 밖 지점 매입 라인 미노출을 보강했다.

### Unit Tests

- [x] `tests/unit/ledger-purchase.test.mjs` - 매입 schema edge case, 기준 정보 없는 raw manual input, 정수/overflow 검증, manual source migration/model contract, 서버 계산/audit/revalidation/source contract, UI wiring을 검증한다.
- [x] `tests/unit/ledger-sales.test.mjs` - 장부 저장의 version conflict/source contract 회귀를 함께 확인한다.

## Coverage

- API endpoints: N/A. Story 2.4 범위에는 별도 public API endpoint가 없다.
- Server actions/contracts: `saveLedgerPurchases`, `requireStoreAccess`, stale `version` conflict, editable ledger status guard, server-side amount calculation, audit logging, revalidation, manual source contract covered by unit/source tests and E2E user paths.
- UI workflows: purchase option prefill, raw manual purchase input, multi-line save/revisit, snapshot preservation after master data change, deletion, validation focus, mobile touch targets, closed/holiday lock, unauthorized store redirect, stale version save rejection.
- Happy path: multiple purchase lines save and reload with server-calculated total.
- Critical error cases: stale version conflict, unauthorized store access, `HEADQUARTERS_CLOSED`/`HOLIDAY` edit lock, validation failure focus, negative/decimal numeric rejection, overflow contract.

## Validation

- [x] `corepack pnpm exec node --experimental-strip-types --test tests/unit/ledger-purchase.test.mjs` - pass.
- [x] `corepack pnpm exec node --experimental-strip-types --test tests/unit/ledger-sales.test.mjs` - pass.
- [x] `corepack pnpm exec node --experimental-strip-types --test tests/unit/ledger-purchase.test.mjs tests/unit/ledger-sales.test.mjs` - pass.
- [x] `corepack pnpm exec playwright test tests/e2e/store-ledger-purchase.spec.ts --list` - 8 tests loaded.
- [x] `corepack pnpm exec prettier --check tests/e2e/store-ledger-purchase.spec.ts` - pass.
- [x] `corepack pnpm typecheck` - pass.
- [x] `corepack pnpm lint` - pass.
- [x] `PORT=3100 DATABASE_URL=postgresql://postgres:erp_fish_local_pw@host.docker.internal:5432/erp_fish_e2e corepack pnpm exec playwright test tests/e2e/store-ledger-purchase.spec.ts` - 8/8 passed after scoping strict locators to the common save-status UI.

## Checklist Result

- API tests generated if applicable: N/A.
- E2E tests generated if UI exists: complete.
- Tests use standard framework APIs: complete. Uses Playwright `test`/`expect`, semantic role/label/text locators, Node test runner, and Prisma fixture assertions.
- Happy path covered: complete.
- Critical error cases covered: complete.
- All generated tests run successfully: unit/source checks pass and focused purchase E2E passes on `PORT=3100`.
- Proper locators: complete.
- Clear descriptions: complete.
- No hardcoded waits or sleeps: complete.
- Tests are independent: deterministic ledger date, product names, and cleanup helpers are used.
- Summary includes coverage metrics: complete.
