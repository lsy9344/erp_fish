# Test Automation Summary

## Generated Tests

### API / Server Contract Tests

- [x] `tests/e2e/calculation-policy-gates.spec.ts` - Playwright runtime에서 OQ-gated 계산 helper가 임시 숫자 대신 `policy-unconfirmed` 상태와 OQ reason을 반환하는지 검증한다.
- [x] `tests/unit/calculation-policy-gates.test.mjs` - OQ gate registry, `확인 필요` metric contract, dashboard/report/review query의 shared helper 사용 guardrail을 검증한다.
- [x] `tests/unit/ledger-review.test.mjs` - salesDifference context가 없을 때 OQ-14 policy gate가 반환되고, context가 있을 때만 허용 계산이 수행되는지 검증한다.
- [x] `tests/unit/sensitive-response-shaping.test.mjs` - 지점장 review 응답에서 민감 metric/key와 손실/재고 금액이 제거되는지 검증한다.

### E2E Tests

- [x] `tests/e2e/calculation-policy-gates.spec.ts` - 지점장 검토 화면에서 총매출/결제차액/근무인원 같은 허용 항목은 보이고, FIFO, `30%단가`, 희망 판매가 손실액, 매출원가, 마진율, 영업이익, 재고금액, OQ 텍스트는 노출되지 않는지 검증한다.
- [x] `tests/e2e/store-ledger-review.spec.ts` - 기존 검토/제출 E2E가 지점장 민감 계산값 미노출, 비민감 경고/이상 후보, 제출 차단/성공/중복 제출을 검증한다.

## Coverage

- API endpoints: N/A. Story 3.4는 public API route를 추가하지 않으며 서버 계산/helper contract를 unit 및 Playwright runtime tests로 커버한다.
- OQ policy gates: OQ-1, OQ-2, OQ-7/OQ-17, OQ-9, OQ-10A, OQ-14 registry와 `policy-unconfirmed` metric contract가 커버된다.
- UI workflows: 지점장 검토 화면에서 허용 summary만 표시하고 민감/OQ-gated 파생 계산을 화면 응답에 노출하지 않는 흐름이 커버된다.
- Happy path: 허용 MVP 계산인 총매출, 결제수단 합계, 결제 차액, 근무인원 표시가 E2E로 커버된다.
- Critical error cases: OQ-14 context 없는 매출차액 계산 차단, FIFO/30%단가/희망 판매가 손실액 gate, 지점장 민감 지표 미노출 회귀가 커버된다.

## Validation

- [x] `corepack pnpm exec prettier --check tests/e2e/calculation-policy-gates.spec.ts` - pass.
- [x] `corepack pnpm test:unit -- tests/unit/calculation-policy-gates.test.mjs tests/unit/ledger-review.test.mjs tests/unit/sensitive-response-shaping.test.mjs` - pass, 33/33 unit files.
- [x] `corepack pnpm exec playwright test tests/e2e/calculation-policy-gates.spec.ts --list` - pass, 2 tests discovered.
- [x] `corepack pnpm typecheck` - pass.
- [x] `corepack pnpm lint` - pass.
- [ ] `corepack pnpm test:e2e -- tests/e2e/calculation-policy-gates.spec.ts` - blocked by sandbox localhost permission: Next webServer exits with `listen EPERM: operation not permitted 127.0.0.1:3000`.

## Checklist Result

- API tests generated if applicable: complete via server contract unit tests and Playwright runtime helper test.
- E2E tests generated if UI exists: complete.
- Tests use standard framework APIs: complete. Uses Playwright `test`/`expect`, semantic role/label locators, and existing Prisma fixture patterns.
- Happy path covered: complete for allowed review summary values.
- Critical error cases covered: complete for OQ-gated numeric blocking and store-manager sensitive metric suppression.
- All generated tests run successfully: unit/type/lint/format and Playwright discovery pass; browser execution is blocked only by sandbox localhost permission.
- Proper locators: complete.
- Clear descriptions: complete.
- No hardcoded waits or sleeps: complete.
- Tests are independent: complete, using per-test cleanup and isolated Story 3.4 fixtures.
- Summary includes coverage metrics: complete.
