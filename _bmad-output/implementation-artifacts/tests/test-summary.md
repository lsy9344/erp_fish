# Test Automation Summary

## Generated Tests

### API / Unit Tests

- [x] `tests/unit/hq-ledger-edit.test.mjs` - HQ 원본 수정 action이 `HEADQUARTERS_CLOSED`를 `LEDGER_CLOSED`로, `HOLIDAY`를 `LEDGER_NOT_EDITABLE`로 차단하는 계약 고정
- [x] `tests/unit/hq-ledger-edit.test.mjs` - 닫힌/휴무 장부 차단이 감사 로그 작성 전에 반환되고, 쓰기 조건이 `IN_PROGRESS`, `IN_REVIEW`로 제한됨을 검증
- [x] `tests/unit/hq-ledger-edit.test.mjs` - HQ 재고 조정 저장에서 본사 수정 사유 누락 시 공유 reason field error와 focus 계약 고정
- [x] `tests/unit/ledger-conflicts.test.mjs` - 최신 수정자가 본사인 stale 저장 충돌은 공통 conflict payload에 `hqEditing`을 설정함을 검증

### E2E Tests

- [x] `tests/e2e/hq-ledger-edit.spec.ts` - 본사가 매출/비용/매입/재고/손실/근무를 사유와 함께 저장하고 audit `reason`, `before`, `after`, `actorId`를 남김
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - 조회 전용 본사는 장부 상세를 볼 수 있지만 원본 입력 탭, 저장 버튼, 본사 수정 사유 입력을 받지 못함
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - stale token 본사 원본 저장은 `SaveConflictDialog`, `본사 수정 중`, 내 입력값/서버 최신값 비교를 보여주고 서버 최신값을 유지함
- [x] `tests/e2e/hq-ledger-edit.spec.ts` - 본사 마감 장부는 원본 입력 컨트롤을 disabled로 유지하고 정정 안내를 표시함
- [x] `tests/e2e/store-ledger-conflicts.spec.ts` - 지점장 stale 저장은 conflict dialog와 최신값 재확인 흐름을 표시함
- [x] `tests/e2e/permission-profiles.spec.ts` - 본사/조회 전용/지점장 권한 fixture와 지점 범위를 검증함

## Coverage

- Story 4.3 AC: 6/6 covered by generated or existing unit/E2E tests
- API/action boundaries: HQ edit permission, store scope, editable status, stale token conflict payload, audit reason/before/after covered
- UI workflows: HQ six-section original edit, read-only HQ detail, closed-ledger disabled state, correction guidance, conflict comparison dialog covered
- Critical error cases: read-only HQ cannot save, stale HQ save rejected, stale store-manager save rejected, closed/holiday original edit action contract covered

## Validation

- [x] `corepack pnpm test:unit`
- [x] `corepack pnpm typecheck`
- [x] `corepack pnpm lint`
- [ ] `corepack pnpm test:e2e -- tests/e2e/hq-ledger-edit.spec.ts tests/e2e/store-ledger-conflicts.spec.ts tests/e2e/permission-profiles.spec.ts`

Targeted E2E execution is blocked in this sandbox because the Next dev server cannot bind `127.0.0.1:3000`: `listen EPERM: operation not permitted 127.0.0.1:3000`. This was reproduced both through Playwright webServer and direct `corepack pnpm dev --hostname 127.0.0.1 --port 3000`.

## Checklist Result

- [x] API tests generated where applicable
- [x] E2E tests generated for UI behavior
- [x] Tests use standard project APIs (`node:test`, Playwright)
- [x] Happy path and critical error cases covered
- [x] Semantic locators and accessible names used
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent through per-test cleanup/seed setup
- [x] Summary includes coverage metrics and validation status
