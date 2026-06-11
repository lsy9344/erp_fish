# Test Automation Summary

## Generated Tests

### API Tests

- [x] N/A - Story 2.6은 public API route를 추가하지 않고 Next.js Server Action과 Prisma transaction 경로로 재고 조정 저장/조회 계약을 처리한다. 서버 계약은 focused unit/source tests와 Playwright UI 흐름으로 검증한다.

### E2E Tests

- [x] `tests/e2e/store-ledger-inventory-adjustment.spec.ts` - 실제 재고 차이 저장, 조정 전/후/차이 수량 표시, 조정 사유 persistence, audit reason, 금액 정책 `POLICY_UNCONFIRMED`, 지점장 민감 금액 미노출을 검증한다.
- [x] `tests/e2e/store-ledger-inventory-adjustment.spec.ts` - 조정 사유 누락 시 필드 오류와 focus, 본사 마감 장부 원본 조정 차단, `IN_REVIEW` 원본 조정 허용을 검증한다.
- [x] `tests/e2e/store-ledger-inventory-adjustment.spec.ts` - 추가 gap으로 기존 조정 저장 후 손실 입력을 저장하면 조정 전 기준 수량과 차이 수량이 재계산되고 기존 사유와 금액 정책 상태가 보존되는 회귀 테스트를 보강했다.

### Unit Tests

- [x] `tests/unit/ledger-inventory.test.mjs` - adjustment model/migration, amount policy status, reason validation, calculation contract, query/action/audit wiring, safe store manager response, adjustment reconciliation source contracts를 검증한다.

## Coverage

- API endpoints: N/A. Story 2.6 범위에는 별도 public API endpoint가 없다.
- Server actions/contracts: `saveLedgerInventoryAdjustment`, `saveLedgerInventoryItems`, `saveLedgerLosses`, `reconcileLedgerInventoryAdjustments`, editable ledger status guard, stale `version` conflict, audit reason, amount policy status, safe store manager response covered by unit/source tests and E2E user paths.
- UI workflows: 재고 조정 저장/재방문, 사유 필수 오류, 마감 후 정정 기록 안내, 검토 대기 상태 조정, 손실 저장 후 재고 조정 재계산.
- Happy path: 시스템 기준 수량과 실제 수량 차이를 사유와 함께 저장하고 재방문 시 조정 전/후/차이를 표시한다.
- Critical error/status cases: 사유 누락, 본사 마감 차단, `IN_REVIEW` 허용, 민감 금액 미노출, 손실 변경 후 stale adjustment 방지.

## Validation

- [x] `corepack pnpm exec node --experimental-strip-types --test tests/unit/ledger-inventory.test.mjs` - pass.
- [x] `corepack pnpm typecheck` - pass.
- [x] `corepack pnpm lint` - pass.
- [x] `corepack pnpm exec prisma validate` - pass.
- [x] `corepack pnpm test:unit` - 197/197 passed.
- [x] `corepack pnpm build` - pass.
- [x] `PORT=3100 DATABASE_URL=postgresql://postgres:erp_fish_local_pw@host.docker.internal:5432/erp_fish_e2e corepack pnpm exec playwright test tests/e2e/store-ledger-inventory-adjustment.spec.ts` - 5/5 passed after locator/isolation fixes and the loss-to-adjustment recalculation guardrail.
- [x] Senior review verification: `corepack pnpm exec prisma validate`, focused `ledger-inventory.test.mjs`, `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test:unit`, and `corepack pnpm build` passed after auto-fixes.
- [x] Senior review final orchestrator rerun: `PORT=3100 DATABASE_URL=postgresql://postgres:erp_fish_local_pw@host.docker.internal:5432/erp_fish_e2e corepack pnpm exec playwright test tests/e2e/store-ledger-inventory-adjustment.spec.ts` - 5/5 passed after auto-fixes.

## Checklist Result

- API tests generated if applicable: N/A.
- E2E tests generated if UI exists: complete.
- Tests use standard framework APIs: complete. Uses Playwright `test`/`expect`, semantic role/label/text locators, Node test runner, and Prisma fixture setup.
- Happy path covered: complete.
- Critical error cases covered: complete.
- All generated tests run successfully: unit/source checks pass and focused adjustment E2E passes on PORT=3100.
- Proper locators: complete.
- Clear descriptions: complete.
- No hardcoded waits or sleeps: complete.
- Tests are independent: Story 2.6 product/loss-type prefixes, per-test cleanup, and isolated today-ledger upserts are used.
- Summary includes coverage metrics: complete.
