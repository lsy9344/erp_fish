# Test Automation Summary

## Generated Tests

### API Tests

- [x] `tests/unit/ledger-validation.test.mjs` - 서버 검증 schema, dotted `fieldErrors`, 권한 우선 action 순서, 클라이언트 오류 접근성 wiring, 검증 오류/계산 상태 분리를 검증한다.
- [x] 기존 ledger unit suite - 매출, 비용, 매입, 재고, 손실, 제출, conflict 회귀를 유지하며 Story 3.2의 서버 검증 경계를 보강한다.

### E2E Tests

- [x] `tests/e2e/store-ledger-sales.spec.ts` - 매출/결제 필수 금액 누락 시 서버 오류가 첫 오류 필드로 포커스되고 `aria-describedby`로 연결되는지 추가 검증한다.
- [x] `tests/e2e/store-ledger-cost-labor.spec.ts` - 비용 항목 필수 오류와 근무인원 숫자 오류의 포커스, `aria-invalid`, 오류 설명 연결을 검증한다.
- [x] `tests/e2e/store-ledger-purchase.spec.ts` - 매입 단가/수량 숫자 오류가 값을 조용히 보정하지 않고 필드 오류와 연결되는지 검증한다.
- [x] `tests/e2e/store-ledger-inventory.spec.ts` - 재고 수량 오류가 동적 행 입력의 `aria-describedby` alert와 연결되는지 검증한다.
- [x] `tests/e2e/store-ledger-losses.spec.ts` - 손실 사유 필수 오류와 손실액 숫자 오류의 포커스 및 접근성 연결을 검증한다.
- [x] `tests/e2e/store-ledger-review.spec.ts` - 기존 검토/제출 E2E가 필수 누락, 경고, 제출 차단/성공/중복 제출을 검증한다.

## Coverage

- API endpoints: N/A. Story 3.2는 public API route를 추가하지 않으며 서버 action/schema 검증은 unit/source tests로 커버한다.
- Server validation: 필수 누락, 음수/소수/콤마/NaN/Infinity/overflow, dotted field path, 권한 우선 검증 구조가 unit tests로 커버된다.
- UI workflows: 6개 장부 단계의 서버 `fieldErrors` 표시, 첫 오류 포커스, `aria-invalid`, `aria-describedby` 연결이 E2E로 커버된다.
- Happy path: 기존 단계별 저장/재방문 E2E가 매출, 비용, 매입, 재고, 손실, 근무, 검토 제출 정상 흐름을 커버한다.
- Critical error cases: 필수 누락, 숫자 오류, 동적 행 오류, 권한 밖 화면 차단, 제출 전 누락, 계산 상태/검증 오류 병렬 표시를 커버한다.

## Validation

- [x] `corepack pnpm test:unit` - pass, 32/32 unit files.
- [x] `corepack pnpm typecheck` - pass.
- [x] `corepack pnpm lint` - pass.
- [x] `corepack pnpm exec prettier --check tests/e2e/store-ledger-sales.spec.ts tests/e2e/store-ledger-cost-labor.spec.ts tests/e2e/store-ledger-purchase.spec.ts tests/e2e/store-ledger-inventory.spec.ts tests/e2e/store-ledger-losses.spec.ts` - pass.
- [ ] `corepack pnpm test:e2e -- tests/e2e/store-ledger-sales.spec.ts tests/e2e/store-ledger-cost-labor.spec.ts tests/e2e/store-ledger-purchase.spec.ts tests/e2e/store-ledger-inventory.spec.ts tests/e2e/store-ledger-losses.spec.ts tests/e2e/store-ledger-review.spec.ts` - blocked by sandbox localhost access failure: `connect EPERM 127.0.0.1:3000`, followed by Playwright `Process from config.webServer exited early`.

## Checklist Result

- API tests generated if applicable: complete via unit/source tests for server action/schema contracts.
- E2E tests generated if UI exists: complete.
- Tests use standard framework APIs: complete. Uses Playwright `test`/`expect`, semantic role/label locators, and existing Prisma fixture patterns.
- Happy path covered: complete through existing stage save/revisit and review submission E2E.
- Critical error cases covered: complete for required fields, numeric validation, focus, accessibility wiring, authorization screen, and review missing-state separation.
- All generated tests run successfully: unit/type/lint/format pass; Playwright E2E execution is blocked only by sandbox localhost permission.
- Proper locators: complete.
- Clear descriptions: complete.
- No hardcoded waits or sleeps: complete.
- Tests are independent: complete, using existing per-test cleanup and isolated story fixtures.
- Summary includes coverage metrics: complete.
