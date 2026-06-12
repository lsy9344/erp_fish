# Test Automation Summary

## Generated Tests

### API / Unit Tests

- [x] `tests/unit/hq-ledger-edit.test.mjs` - `closeHqLedger()` 입력 schema가 선택적 `exceptionReason`과 500자 제한을 포함함
- [x] `tests/unit/hq-ledger-edit.test.mjs` - close transaction 안에서 stale token 충돌을 ClosePreflight 재실행보다 먼저 반환함
- [x] `tests/unit/hq-ledger-edit.test.mjs` - blocking ClosePreflight는 상태 변경/audit 없이 `LEDGER_CLOSE_PREFLIGHT_BLOCKED`를 반환함
- [x] `tests/unit/hq-ledger-edit.test.mjs` - `exception-allowed`만 있는 ClosePreflight는 사유 없이는 막고, 사유가 있으면 audit payload와 `AuditLog.reason`에 남김
- [x] `tests/unit/hq-ledger-edit.test.mjs` - `ledger.hq.closed` audit payload가 closer, token, summary, exception item, exception reason을 포함함
- [x] `tests/unit/hq-ledger-edit.test.mjs` - 본사/지점장 원본 수정 action이 `HEADQUARTERS_CLOSED` 장부를 서버에서 차단함
- [x] `tests/unit/hq-ledger-edit.test.mjs` - 본사 마감 상세가 사람이 읽을 수 있는 마감자/마감 시각 metadata를 조회/표시함

### E2E Tests

- [x] `tests/e2e/hq-ledger-edit.spec.ts` - 본사 마감 dialog가 ClosePreflight 표를 표시하고 통과 시 `마감 확정`을 활성화함
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - 본사마감 성공 후 DB 상태가 `HEADQUARTERS_CLOSED`로 변경되고 `closedById/closedAt`이 저장됨
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - 마감 후 상세 화면이 마감 상태, 마감자, 마감 시각, disabled 원본 입력, 정정 기록 패널을 표시함
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - 중복 마감 요청은 audit log를 한 번만 남기고 기존 마감 정보를 보존함
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - stale token 본사마감은 conflict dialog를 표시하고 status/audit을 변경하지 않음
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - ClosePreflight `사유 필요` 항목은 사유 입력 전 disabled, 사유 입력 후 개별 마감 성공, audit reason 저장 흐름을 검증함
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - 조회 전용 본사와 지점장 direct URL은 본사마감 action/ClosePreflight 상세를 받지 못함

## Coverage

- Story 4.5 AC: 7/7 covered by unit/source-contract tests and Playwright UI flows
- API/action boundaries: permission, ledger scope, stale token, same-transaction preflight revalidation, blocking preflight, exception reason requirement, idempotent close, and sensitive-detail suppression covered
- UI workflows: preflight table, accessible `사유 필요` state, exception reason field, close success, post-close locked original inputs, human-readable close metadata, CorrectionPanel guidance, stale conflict, and role denial covered
- Critical error cases: unauthorized close hidden/blocked, stale close rejected before preflight rebuild, duplicate close audit deduplication, closed-ledger original edits rejected

## Validation

- [x] `corepack pnpm test:unit` - 33/33 passed
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm lint`
- [ ] `corepack pnpm test:e2e -- tests/e2e/hq-ledger-edit.spec.ts tests/e2e/store-ledger-conflicts.spec.ts`

Targeted E2E execution is blocked in this sandbox because the Next dev server cannot bind `127.0.0.1:3000`: `listen EPERM: operation not permitted 127.0.0.1:3000`. This was reproduced through Playwright webServer and direct `corepack pnpm dev --hostname 127.0.0.1 --port 3000`.

## Checklist Result

- [x] API tests generated where applicable
- [x] E2E tests generated for UI behavior
- [x] Tests use standard project APIs (`node:test`, Playwright)
- [x] Happy path covered
- [x] Critical error cases covered
- [x] Semantic locators and accessible names used
- [x] Clear test descriptions used
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent through per-test cleanup/seed setup
- [ ] All generated tests run successfully: unit tests pass, but generated E2E scenarios could not run because the sandbox blocks the Next dev server port bind
- [x] Tests saved to appropriate directories
- [x] Summary includes coverage metrics and validation status
