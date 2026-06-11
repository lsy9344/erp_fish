# Test Automation Summary

## Generated Tests

### API Tests

- [x] N/A - Story 2.7은 public API route를 추가하지 않고 Next.js Server Action과 Prisma transaction 경로로 손실 저장/조회 계약을 처리한다. 서버 계약은 focused unit/source tests와 Playwright UI 흐름으로 검증한다.

### E2E Tests

- [x] `tests/e2e/store-ledger-losses.spec.ts` - 손실 항목 여러 건 저장, 재방문, active 품목/손실 유형 선택지, 비활성 snapshot 보존, 지점장 민감 필드 미노출, 입력 손실액 재표시를 검증한다.
- [x] `tests/e2e/store-ledger-losses.spec.ts` - 사유 누락 시 필드 오류와 focus, 390px 모바일 터치 타겟, 과다 손실 수량 차단, 재고 흐름 반영을 검증한다.
- [x] `tests/e2e/store-ledger-losses.spec.ts` - 추가 gap으로 손실 라인 수정/삭제 시 장부 version 갱신과 `ledger.losses.saved` 감사 로그의 before/after snapshot 보존을 검증한다.
- [x] `tests/e2e/store-ledger-losses.spec.ts` - 추가 gap으로 본사 마감 장부에서 원본 손실 입력 버튼이 비활성화되고 손실 레코드가 생성되지 않는 상태 차단을 검증한다.
- [x] `tests/e2e/store-ledger-inventory-adjustment.spec.ts` - 손실 저장 후 기존 재고 조정의 기준 수량과 차이 수량 재계산 회귀를 검증한다.

### Unit Tests

- [x] `tests/unit/ledger-losses.test.mjs` - 손실 모델/migration, schema validation, 손실 집계와 이상 후보 계산, 과다 손실 오류 메시지, action/query/UI source contract, safe amount display contract를 검증한다.
- [x] `tests/unit/ledger-inventory.test.mjs` - 손실 수량이 재고 기준 수량 계산과 재고 조정 재계산 계약을 깨지 않는지 관련 inventory source contract를 검증한다.

## Coverage

- API endpoints: N/A. Story 2.7 범위에는 별도 public API endpoint가 없다.
- Server actions/contracts: `saveLedgerLosses`, active `LOSS_TYPE` code filtering, editable ledger status guard, stale `version` conflict, quantity validation, audit write, inventory revalidation/reconciliation, safe store manager response covered by unit/source tests and E2E user paths.
- UI workflows: 손실 저장/재방문, 비활성 snapshot 보존, 필수 오류 focus, 모바일 입력 상태, 과다 손실 방어, 재고 반영, 수정/삭제 audit/version, 마감 상태 원본 입력 차단.
- Happy path: 여러 손실/폐기/떨이 라인을 저장하고 재방문 시 품목, 수량, 금액, 유형, 사유를 다시 확인한다.
- Critical error/status cases: 사유 누락, 과다 손실 수량, 본사 마감 차단, 민감 원가/파생 필드 미노출, 손실 변경 후 stale inventory adjustment 방지.

## Validation

- [x] `corepack pnpm exec node --experimental-strip-types --test tests/unit/ledger-losses.test.mjs` - pass.
- [x] `corepack pnpm exec node --experimental-strip-types --test tests/unit/ledger-inventory.test.mjs` - pass.
- [x] `corepack pnpm exec prettier --check tests/e2e/store-ledger-losses.spec.ts` - pass.
- [x] `corepack pnpm exec eslint tests/e2e/store-ledger-losses.spec.ts` - pass.
- [x] `corepack pnpm exec prisma validate` - pass.
- [x] `corepack pnpm typecheck` - pass.
- [x] `corepack pnpm lint` - pass.
- [x] Orchestrator rerun: `PORT=3100 DATABASE_URL=postgresql://postgres:erp_fish_local_pw@host.docker.internal:5432/erp_fish_e2e corepack pnpm exec playwright test tests/e2e/store-ledger-losses.spec.ts tests/e2e/store-ledger-inventory-adjustment.spec.ts` - 11/11 passed.
- [x] `corepack pnpm test:unit` - 197/197 passed.
- [x] `corepack pnpm build` - pass.

## Checklist Result

- API tests generated if applicable: N/A.
- E2E tests generated if UI exists: complete.
- Tests use standard framework APIs: complete. Uses Playwright `test`/`expect`, semantic role/label/text locators, Node test runner, and Prisma fixture setup.
- Happy path covered: complete.
- Critical error cases covered: complete.
- All generated tests run successfully: unit/source checks, static validation, and focused E2E pass.
- Proper locators: complete.
- Clear descriptions: complete.
- No hardcoded waits or sleeps: complete.
- Tests are independent: Story 2.7 product/loss-type prefixes, per-test cleanup, and isolated today-ledger upserts are used.
- Summary includes coverage metrics: complete.
