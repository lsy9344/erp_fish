# 테스트 자동화 요약

## 생성/보강한 테스트

### API / Unit 테스트

- [x] `tests/unit/master-data-codes-story54.test.mjs` - Story 5.4 코드 관리 도메인 재사용, hard-delete/API route 금지, settings 권한, validation, audit, revalidation, no-op 계약 검증
- [x] `tests/unit/master-data-codes-story54.test.mjs` - active-only 비용/손실 코드 선택지, wrong-group/inactive 직접 post 차단, 과거 snapshot 보존, 보수적 `PAYMENT_METHOD` 경계 검증
- [x] `tests/unit/master-data-codes.test.mjs` - 기존 코드 관리 action/query/schema 회귀 검증 유지

### E2E 테스트

- [x] `tests/e2e/master-data-codes.spec.ts` - Story 5.4 fixture prefix로 코드 관리 목록/검색/그룹/상태 필터, 빈 데이터 그룹 표시, 생성/수정/비활성화, 감사 로그, validation focus, 지점장 차단 검증
- [x] `tests/e2e/master-data-codes.spec.ts` - 같은 그룹 중복 코드명 거부와 다른 그룹의 같은 코드명 허용을 신규 critical error case로 보강
- [x] `tests/e2e/master-data-codes.spec.ts` - 결제수단 코드 관리의 보수 경계 문구를 화면에서 검증
- [x] `tests/e2e/store-ledger-cost-labor.spec.ts` - 기존 비용 신규 입력에서 비활성 비용 코드 제외와 기존 비활성 비용 코드 표시 보존 검증 확인
- [x] `tests/e2e/store-ledger-losses.spec.ts` - 기존 손실 신규 입력에서 비활성 손실 유형 제외와 기존 손실 유형 snapshot 표시 보존 검증 확인

## 커버리지

- Story 5.4 AC: 6/6 covered
- API/action 경계: settings 권한, 생성/수정/상태 변경, same-group duplicate, validation, same-transaction audit, revalidation, no hard-delete covered
- UI workflow: 목록/필터, 세 그룹 표시, 생성/수정/비활성화, 감사 로그, field error focus, branch-manager unauthorized redirect covered
- 장부 입력: 비용/손실 active-only 신규 선택지, 비활성 기존 코드 표시 보존, wrong-group/inactive server validation covered
- 결제수단: 코드 관리/audit/option boundary covered. 매출/결제 입력은 현금/카드/기타 결제수단 고정 필드 계약으로 명시 검증

## 체크리스트 결과

- [x] API tests generated where applicable
- [x] E2E tests generated for UI behavior
- [x] Tests use standard project APIs (`node:test`, Playwright)
- [x] Happy path covered
- [x] 1-2 critical error cases covered
- [x] Semantic locators and accessible names used
- [x] Clear test descriptions used
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent through cleanup, unique generated names, and Story 5.4 fixture scope
- [x] Tests saved to appropriate directories
- [x] Summary includes coverage metrics and validation status

## 검증

- [x] `pnpm test:unit -- master-data-codes` - 35/35 passed. 스크립트 특성상 focused 인자와 함께 전체 unit suite가 실행됨
- [ ] `pnpm test:e2e tests/e2e/master-data-codes.spec.ts` - blocked before test body because Playwright `config.webServer` exited early
- [x] `pnpm lint` - passed
- [x] `pnpm typecheck` - passed
- [x] Senior review `pnpm exec prettier --check src/app/app/master-data/codes/page.tsx src/features/ledger/hq-edit-actions.ts tests/unit/master-data-codes-story54.test.mjs tests/unit/master-data-codes.test.mjs tests/e2e/master-data-codes.spec.ts` - passed after formatting Story 5.4 test files

E2E 차단 원인 확인: 동일 webServer 명령을 직접 실행하면 Next dev server가 `listen EPERM: operation not permitted 127.0.0.1:3000`으로 시작하지 못한다. 테스트 코드 생성과 정적 검증은 완료됐지만, 이 sandbox에서는 포트 listen 권한 때문에 Playwright 실행을 완료할 수 없다.
