# Test Automation Summary

## Generated Tests

### API / Unit Tests

- [x] `tests/unit/ledger-corrections.test.mjs` - correction schema, append-only action contract, audit payload, latest correction tie-breaker coverage already present
- [x] `tests/unit/ledger-correction-calculations.test.mjs` - payment, expense, inventory, loss, workerCount overlay and unsupported correction signal coverage already present
- [x] `tests/unit/hq-dashboard.test.mjs` - dashboard correction overlay and batched latest correction helper contract already present
- [x] `tests/unit/hq-reports.test.mjs` - report correction overlay, evidence, and unapplied correction signal contract already present
- [x] `tests/unit/hq-ledger-edit.test.mjs` - correction target options include inventory, loss, calculated metric targets and exclude derived inventory rows

### E2E Tests

- [x] `tests/e2e/hq-ledger-corrections.spec.ts` - HQ creates correction records on closed ledgers, original values remain unchanged, second correction records `previousAppliedValue`, required reason focuses the field, store manager creation path is blocked
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - closed ledger detail disables original inputs and shows correction guidance without weakening original edit guards
- [x] `tests/e2e/hq-dashboard.spec.ts` - dashboard default sales and anomaly signals use correction-applied values
- [x] `tests/e2e/hq-dashboard.spec.ts` - added viewer regression: read-only HQ users on closed ledger detail do not receive the correction form, target selector, value/reason fields, or correction timeline link
- [x] `tests/e2e/hq-reports.spec.ts` - daily, comparison, and monthly reports use correction-applied values while evidence distinguishes original/corrected values and links to the correction timeline

## Coverage

- Story 4.6 AC: 6/6 covered by existing unit/source-contract tests plus Playwright user flows
- API/action boundaries: correction create permission, headquarters ledger scope, closed-ledger-only creation, append-only record creation, original value preservation, latest correction ordering, audit payload, and unsupported target handling covered
- UI workflows: closed detail correction panel, semantic fields, required reason validation, correction history, original/correction-applied display, read-only role suppression, dashboard and report reflected values covered
- Critical error cases: missing reason, unauthorized store manager, read-only HQ sensitive target suppression, unsupported/unapplied corrections, and OQ-gated calculation status covered

## Validation

- [x] `corepack pnpm lint`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm test:unit` - 33/33 passed
- [ ] `corepack pnpm test:e2e -- tests/e2e/hq-ledger-corrections.spec.ts tests/e2e/hq-ledger-edit.spec.ts tests/e2e/hq-dashboard.spec.ts tests/e2e/hq-reports.spec.ts`

Targeted E2E execution is blocked in this sandbox because the Next dev server cannot bind `127.0.0.1:3000`: `listen EPERM: operation not permitted 127.0.0.1:3000`. The failure was reproduced through Playwright webServer and by running `corepack pnpm dev --hostname 127.0.0.1 --port 3000` directly.

## Checklist Result

- [x] API tests generated or already present where applicable
- [x] E2E tests generated for UI behavior
- [x] Tests use standard project APIs (`node:test`, Playwright)
- [x] Happy path covered
- [x] Critical error cases covered
- [x] Semantic locators and accessible names used
- [x] Clear test descriptions used
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent through per-test cleanup/seed setup
- [ ] All generated tests run successfully: unit tests pass, but E2E scenarios could not run because the sandbox blocks the Next dev server port bind
- [x] Tests saved to appropriate directories
- [x] Summary includes coverage metrics and validation status
