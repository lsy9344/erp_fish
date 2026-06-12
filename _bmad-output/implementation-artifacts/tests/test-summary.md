# 테스트 자동화 요약

## 생성/보강한 테스트

### API / Unit 테스트

- [x] `tests/unit/anomaly-thresholds.test.mjs` - Story 5.5 기준값 schema/migration, `isActive`, 적용 범위, 필수 변경 사유, malformed comma, 비활성 기준값 signal 차단, settings/report 권한 경계, audit/revalidation/no-op 계약 검증
- [x] `tests/unit/hq-dashboard.test.mjs` - 저장된 기준값과 비활성 기준값이 OQ-gated 확정 이상으로 승격되지 않고 `기준 확인 필요` 계열 info 상태로 유지되는 회귀 검증
- [x] `tests/unit/master-data-history.test.mjs` - `AnomalyThresholdSetting` 대상 유형, `threshold.updated` 액션 라벨, `reason` 표시, 이력 조회 target lookup 검증

### E2E 테스트

- [x] `tests/e2e/anomaly-thresholds.spec.ts` - 본사 기준값 저장, 필수 사유 입력, 활성 상태/적용 범위/마지막 변경 표시, audit reason/snapshot, field error focus, 지점장 URL 차단 검증
- [x] `tests/e2e/anomaly-thresholds.spec.ts` - 같은 값 재저장이 audit row를 추가하지 않는 no-op 계약을 브라우저 흐름에서 검증
- [x] `tests/e2e/anomaly-thresholds.spec.ts` - 활성에서 비활성 전환 시 `before.isActive=true`, `after.isActive=false`, 변경 사유가 audit row와 변경 이력 상세에 표시되는지 검증
- [x] `tests/e2e/hq-dashboard.spec.ts` - 기준값 저장 후에도 관제판이 매출/이익률/매출차액/재고/손실을 확정 이상 대신 정책 확인 필요 상태로 표시하는 기존 회귀 검증 확인

## 커버리지

- Story 5.5 AC: 6/6 covered
- API/action 경계: settings 권한, report 권한 분리, Zod field validation, active/inactive parsing, 필수 reason, same-transaction audit, no-op audit suppression, revalidation covered
- UI workflow: 목록/상태 영역, 현재 값, 적용 범위, 활성/비활성 상태, 마지막 변경자/시각, 저장/비활성화, 변경 이력 상세, validation focus, unauthorized redirect covered
- Dashboard/review behavior: 저장된 기준값과 비활성 기준값 모두 OQ-gated 확정 이상으로 승격하지 않는 정책 회귀 covered
- Audit/history: `AuditLog.reason`, before/after snapshot, `AnomalyThresholdSetting` target label, `threshold.updated` action label covered

## 체크리스트 결과

- [x] API tests generated where applicable
- [x] E2E tests generated for UI behavior
- [x] Tests use standard project APIs (`node:test`, Playwright)
- [x] Happy path covered
- [x] Critical error cases covered: invalid field values, missing reason, unauthorized branch-manager access, inactive/no-op audit behavior
- [x] Semantic locators and accessible names used
- [x] Clear test descriptions used
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent through cleanup and scoped threshold audit data
- [x] Tests saved to appropriate directories
- [x] Summary includes coverage metrics and validation status

## 검증

- [x] `pnpm test:unit -- anomaly-thresholds` - passed, 35/35. Repo script 특성상 인자와 함께 전체 unit suite가 실행됨
- [x] `pnpm test:unit` - passed, 35/35
- [x] `pnpm lint` - passed
- [x] `pnpm typecheck` - passed
- [x] `pnpm exec prettier --check tests/e2e/anomaly-thresholds.spec.ts` - passed after formatting
- [x] `git diff --check` - passed
- [ ] `pnpm test:e2e tests/e2e/anomaly-thresholds.spec.ts` - blocked before test body because Playwright `config.webServer` exited early

E2E 차단 원인 확인: 동일 webServer 명령을 직접 실행하면 Next dev server가 `listen EPERM: operation not permitted 127.0.0.1:3000`으로 시작하지 못한다. 테스트 코드 생성과 정적 검증은 완료됐지만, 이 sandbox에서는 포트 listen 권한 때문에 Playwright 실행을 완료할 수 없다.
