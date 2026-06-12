# Test Automation Summary

## Generated Tests

### API / Unit Tests

- [x] `tests/unit/hq-ledger-edit.test.mjs` - ClosePreflight server contract, result shape, severity values, permission gate, and scope-before-detail ordering
- [x] `tests/unit/hq-ledger-edit.test.mjs` - Close action reruns ClosePreflight inside the transaction before status update/audit and returns `LEDGER_CLOSE_PREFLIGHT_BLOCKED` without detailed row metadata
- [x] `tests/unit/hq-ledger-edit.test.mjs` - Preflight builder reuses missing-item, calculation, correction, carryover, purchase-basis, and dashboard signal contracts
- [x] `tests/unit/ledger-conflicts.test.mjs` - `hq-close` conflict payload keeps `clientValues`, `serverValues`, `reloadRequired: true`, and `hqEditing: true`

### E2E Tests

- [x] `tests/e2e/hq-ledger-edit.spec.ts` - 본사 마감 dialog가 ClosePreflight 표를 먼저 표시하고 통과 시에만 `마감 확정`을 활성화함
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - OQ-gated `기준 확인 필요`가 확정 이상/확정 계산값으로 보이지 않는 안내를 표시함
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - 차단/사유 필요 항목은 색상 외 텍스트 상태와 보완 링크를 표시하고 `마감 확정`을 막음
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - 보완 링크가 기존 `/app/store-entry` 입력 단계로 이동함
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - 조회 전용 본사는 상세를 볼 수 있어도 본사마감 버튼/action UI를 받지 못함
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - 지점장 direct URL은 본사 ClosePreflight 상세 없이 unauthorized로 차단됨
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - stale token 마감은 conflict dialog를 표시하고 status/audit을 변경하지 않음
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - 중복 마감 요청은 감사 로그를 한 번만 남김

## Coverage

- Story 4.4 AC: 6/6 covered by unit/source-contract tests and Playwright UI flows
- API/action boundaries: permission, ledger scope, stale token, same-transaction preflight revalidation, idempotent close, and sensitive-detail suppression covered
- UI workflows: preflight table, accessible severity text, warning/info display, blocked confirm, remediation links, close success, stale conflict, and role denial covered
- Critical error cases: read-only HQ cannot initiate close, store manager direct URL sees no preflight detail, stale close rejected, blocked preflight prevents close

## Validation

- [x] `corepack pnpm test:unit`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm lint`
- [ ] `corepack pnpm test:e2e -- tests/e2e/hq-ledger-edit.spec.ts tests/e2e/store-ledger-conflicts.spec.ts`

Targeted E2E execution is blocked in this sandbox because the Next dev server cannot bind `127.0.0.1:3000`: `listen EPERM: operation not permitted 127.0.0.1:3000`. This was reproduced through Playwright webServer and direct `corepack pnpm dev --hostname 127.0.0.1 --port 3000`.

## Checklist Result

- [x] API tests generated where applicable
- [x] E2E tests generated for UI behavior
- [x] Tests use standard project APIs (`node:test`, Playwright)
- [x] Happy path and critical error cases covered
- [x] Semantic locators and accessible names used
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent through per-test cleanup/seed setup
- [ ] All generated tests run successfully: unit tests pass, but generated E2E scenarios could not run because the sandbox blocks the Next dev server port bind
- [x] Summary includes coverage metrics and validation status
