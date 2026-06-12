# 테스트 자동화 요약

## 생성/보강한 테스트

### API / Unit 테스트

- [x] `tests/unit/master-data-stores.test.mjs` - 지점 생성/수정/상태 변경 action이 설정 권한, transaction, 감사 로그, revalidation을 유지하는지 검증
- [x] `tests/unit/master-data-stores.test.mjs` - 중복 지점명 오류 코드(`DUPLICATE_STORE_NAME`)와 `name` field error 계약을 검증
- [x] `tests/unit/master-data-stores.test.mjs` - 지점 목록 query가 `createdAt`/`updatedAt`을 함께 반환하고 활성 지점 옵션이 `isActive: true`만 조회하는지 검증
- [x] `tests/unit/master-data-stores.test.mjs` - UI가 생성 시각/마지막 수정 시각 컬럼, 한국 시간 포맷, 삭제 금지, 상태 전용 저장 흐름을 유지하는지 검증

### E2E 테스트

- [x] `tests/e2e/master-data-stores.spec.ts` - 본사 설정 관리자가 지점 목록, 검색/상태 필터, 생성 시각/마지막 수정 시각 컬럼을 확인
- [x] `tests/e2e/master-data-stores.spec.ts` - 지점 생성, 이름 수정, 비활성화, 감사 로그 생성, 활성 필터 제외 흐름을 검증
- [x] `tests/e2e/master-data-stores.spec.ts` - 빈 지점명과 중복 지점명 오류가 한국어 field error로 표시되고 지점명 필드에 focus가 유지되는지 검증
- [x] `tests/e2e/master-data-stores.spec.ts` - 지점장과 설정 권한이 없는 본사 사용자가 지점 관리 화면에서 차단되고 지점 데이터를 볼 수 없는지 검증

## 커버리지

- Story 5.1 AC: 6/6 covered
- API/action 경계: 설정 권한, 생성/수정/상태 변경 검증, 중복명 오류, transaction-scoped audit, revalidation, 삭제 금지 계약 covered
- UI workflow: 목록 조회, 생성/수정/비활성화, 생성/수정 시각 표시, 검색/상태 필터, field error focus, unauthorized redirect covered
- Critical error cases: 빈 지점명, 중복 지점명, 지점장 unauthorized, 설정 권한 없는 본사 unauthorized covered

## 검증

- [x] `corepack pnpm exec prettier --write tests/e2e/master-data-stores.spec.ts tests/unit/master-data-stores.test.mjs`
- [x] `corepack pnpm test:unit -- master-data-stores` - 33/33 passed
- [ ] `corepack pnpm test:e2e tests/e2e/master-data-stores.spec.ts`

대상 E2E 실행은 이 샌드박스에서 Next dev server가 `127.0.0.1:3000`에 bind하지 못해 테스트 본문 진입 전에 중단되었습니다. Playwright webServer와 직접 실행 모두 `listen EPERM: operation not permitted 127.0.0.1:3000`을 반환했습니다.

## 체크리스트 결과

- [x] API tests generated where applicable
- [x] E2E tests generated for UI behavior
- [x] Tests use standard project APIs (`node:test`, Playwright)
- [x] Happy path covered
- [x] 1-2 critical error cases covered
- [x] Semantic locators and accessible names used
- [x] Clear test descriptions used
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent through global setup and unique generated names
- [ ] All generated tests run successfully: unit tests pass, but E2E scenarios could not run because the sandbox blocks the Next dev server port bind
- [x] Tests saved to appropriate directories
- [x] Summary includes coverage metrics and validation status
