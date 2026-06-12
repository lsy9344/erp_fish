# Test Automation Summary

## Generated Tests

### API / Unit Tests
- [x] `tests/unit/hq-dashboard.test.mjs` - `policy-unconfirmed`, `data-insufficient`, `calculation-unavailable`, 필수 누락 상태를 서로 다른 info signal로 보존
- [x] `tests/unit/hq-dashboard.test.mjs` - OQ-gated threshold 후보를 확정 warning/critical 이상으로 승격하지 않음
- [x] `tests/unit/hq-dashboard.test.mjs` - 복수 info signal row가 `needs-attention` 필터에 포함되고 priority reasons를 모두 보존
- [x] `tests/unit/hq-dashboard.test.mjs` - SignalChip label, icon, title, aria 접근성 계약 검증
- [x] `tests/unit/hq-dashboard.test.mjs` - 지점장 응답 shaping이 HQ dashboard row shape와 민감 지표를 재사용하지 않음

### E2E Tests
- [x] `tests/e2e/hq-dashboard.spec.ts` - 기준값 저장 상태에서도 OQ-gated 항목을 `기준 확인 필요` chip으로 표시하고 확정 이상 문구를 숨김
- [x] `tests/e2e/hq-dashboard.spec.ts` - 상세 이동 후에도 기준 확인 필요 detail과 관련 OQ 문구를 유지
- [x] `tests/e2e/hq-dashboard.spec.ts` - 정정 반영값 기준으로 관제판 신호가 갱신됨
- [x] `tests/e2e/hq-dashboard.spec.ts` - 지점장 기본/검토 경로가 본사 관제판 shape, 민감 지표, 타 지점 데이터를 내려받지 않음
- [x] `tests/e2e/hq-dashboard.spec.ts` - 모바일 카드에서 핵심 상태와 복수 기준 확인 chip이 겹치지 않고 줄바꿈 표시됨
- [x] `tests/e2e/permission-profiles.spec.ts` - 본사/지점장 권한 fixture와 접근 경계를 검증

## Coverage

- Story 4.2 AC: 6/6 covered by generated or existing unit/E2E tests
- API/query boundaries: calculation status separation, OQ policy gate normalization, priority/filter behavior, store manager response shaping covered
- UI workflows: desktop signal chips, detail navigation, today/yesterday preservation, keyboard activation, mobile card wrapping, read-only store manager boundary covered
- Critical error cases: unauthorized dashboard/detail access, OQ-unconfirmed threshold state, correction-applied anomaly state covered

## Validation

- [x] `pnpm test:unit`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm exec playwright test tests/e2e/hq-dashboard.spec.ts tests/e2e/permission-profiles.spec.ts --list`
- [ ] `pnpm exec playwright test tests/e2e/hq-dashboard.spec.ts tests/e2e/permission-profiles.spec.ts`

Targeted E2E execution is blocked in this sandbox because the Next dev server cannot bind `127.0.0.1:3000`: `listen EPERM: operation not permitted 127.0.0.1:3000`.

## Checklist Result

- [x] API tests generated where applicable
- [x] E2E tests generated for UI behavior
- [x] Tests use standard project APIs (`node:test`, Playwright)
- [x] Happy path and critical error cases covered
- [x] Semantic locators and accessible names used
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent through per-test cleanup/seed setup
- [x] Summary includes coverage metrics and validation status
