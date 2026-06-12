# 테스트 자동화 요약

## 생성/보강한 테스트

### API / Unit 테스트

- [x] `tests/unit/master-data-products.test.mjs` - Product/PurchaseStandard schema, no hard-delete, ledger snapshot 필드 보존 구조 검증
- [x] `tests/unit/master-data-products.test.mjs` - 품목 schema trim, 한국어 field error, KRW integer/음수/소수/Int 범위 검증
- [x] `tests/unit/master-data-products.test.mjs` - 품목 action의 설정 권한, transaction-scoped audit, duplicate error, revalidation, no snapshot backfill 검증
- [x] `tests/unit/master-data-products.test.mjs` - 품목 query의 settings 권한 목록과 active-only 신규 선택지 검증
- [x] `tests/unit/master-data-products.test.mjs` - OQ-3 미확정 범위(alias/merge/mapping/eCount/FIFO/effective start) 제외 검증

### E2E 테스트

- [x] `tests/e2e/master-data-products.spec.ts` - 본사 설정 관리자가 품목 목록, 검색, 구분 필터, 상태 필터, 필수 컬럼을 확인
- [x] `tests/e2e/master-data-products.spec.ts` - 품목 생성, 수정, 비활성화, 감사 로그, 활성 필터 제외 흐름 검증
- [x] `tests/e2e/master-data-products.spec.ts` - 품목 수정이 보이지 않는 동시 비활성 상태를 되살리지 않는지 검증
- [x] `tests/e2e/master-data-products.spec.ts` - 매입 기준이 비활성 품목 활성화를 막고 active product option만 제공하는지 검증
- [x] `tests/e2e/master-data-products.spec.ts` - 품목/매입 기준 폼의 한국어 validation error, `aria-invalid`, `aria-describedby`, 첫 오류 focus 검증
- [x] `tests/e2e/master-data-products.spec.ts` - 중복 품목 생성이 `name` field error와 첫 오류 focus로 차단되는지 추가 검증
- [x] `tests/e2e/master-data-products.spec.ts` - 품목 변경/비활성화 후 신규 장부 선택지에서는 제외하고 저장된 매입 snapshot은 유지하는지 추가 검증
- [x] `tests/e2e/master-data-products.spec.ts` - 지점장이 품목/매입 기준 관리 URL에서 차단되고 데이터를 볼 수 없는지 검증

## 커버리지

- Story 5.2 AC: 6/6 covered
- API/action 경계: 설정 권한, 생성/수정/상태 변경, duplicate product, transaction-scoped audit, revalidation, no hard-delete, ledger snapshot no-backfill covered
- UI workflow: 목록/필터, 생성/수정/비활성화, 감사 로그, validation focus, duplicate error, unauthorized redirect covered
- 신규 장부 선택지: active product만 노출되고 비활성 품목은 새 매입 line option에서 제외되는 흐름 covered
- Critical error cases: blank/invalid KRW, duplicate product, inactive product standard activation, branch-manager unauthorized, stale active-state race covered

## 검증

- [x] `pnpm test:unit -- master-data-products` - 33/33 passed
- [x] `pnpm lint` - passed
- [x] `pnpm typecheck` - passed
- [ ] `pnpm test:e2e tests/e2e/master-data-products.spec.ts`

대상 E2E 실행은 이 sandbox에서 Next dev server가 `127.0.0.1:3000`에 bind하지 못해 테스트 본문 진입 전에 중단되었습니다. Playwright webServer 실행은 `Process from config.webServer exited early`로 실패했고, 동일 env로 dev server를 직접 실행하자 `listen EPERM: operation not permitted 127.0.0.1:3000`을 반환했습니다.

## 체크리스트 결과

- [x] API tests generated where applicable
- [x] E2E tests generated for UI behavior
- [x] Tests use standard project APIs (`node:test`, Playwright)
- [x] Happy path covered
- [x] 1-2 critical error cases covered
- [x] Semantic locators and accessible names used
- [x] Clear test descriptions used
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent through cleanup, unique generated names, and Story 5.2 fixture scope
- [ ] All generated tests run successfully: unit/lint/typecheck pass, but E2E scenarios could not run because the sandbox blocks the Next dev server port bind
- [x] Tests saved to appropriate directories
- [x] Summary includes coverage metrics and validation status
