# 테스트 자동화 요약

## 생성/보강한 테스트

### API / Unit 테스트

- [x] Story 7.1은 정책 문서-only story로 정리되어 새 unit test를 남기지 않음. 필수 정책 항목은 `rg` 기반 문서 검증과 review checklist로 확인.

### E2E 테스트

- [x] Story 7.1은 승인 전 제품 동작을 변경하지 않는 정책 story로 정리되어 새 E2E test를 남기지 않음. 기존 관제판/상세 OQ-1 guardrail은 현행 테스트와 source contract 검토로 확인.

## 커버리지

- Story 7.1 AC: 5/5 covered by policy artifact review and required-section validation
- API endpoints: 해당 없음. Story 7.1은 정책 산출물 및 기존 관제판 표시 guardrail 검증 대상이며 새 API surface가 없다.
- UI features: 제품 UI 변경 없음. 기존 `기준 확인 필요` guardrail 유지 여부를 source/search로 확인.
- Critical policy cases: 금액 기준 단독, 부호/절댓값 판정, 비율 미채택, GLOBAL 적용, 복수 신호 비숨김, 승인 전 구현 금지, 감사 로그 필수 필드 covered by policy artifact.

## 체크리스트 결과

- [x] API tests not generated; no API/code behavior changed
- [x] E2E tests not generated; no UI behavior changed
- [x] Project APIs unchanged
- [x] Policy happy path covered by document sections and traceability
- [x] Critical policy cases covered: 승인 전 gate 유지, 확정 경고 미노출, 승인 guardrail, 필수 정책 항목 누락 방지
- [x] Semantic locators/accessibility not applicable to this document-only story
- [x] Clear test descriptions used
- [x] No hardcoded waits or sleeps added
- [x] No test state or seed data added
- [x] No test files saved for this story after review auto-fix
- [x] Summary includes coverage metrics and validation status

## 검증

- [x] `rg -n "기준표|부호 예시|임계값|표시 문구|감사 로그 필드|우선순위|중복 표시|승인자|MVP-S04 구현 story 생성 가능|Traceability|기준 확인 필요" _bmad-output/planning-artifacts/policy-decisions/7-1-매출차액-이상-신호-기준-정책.md` - passed
- [x] `rg -n "sales-difference-exceeded|매출차액 초과|thresholds-configured|기준 확인 필요" src tests _bmad-output/planning-artifacts` - reviewed
- [x] `pnpm test:unit` - passed after review cleanup, 35/35 unit files
- [x] `pnpm lint` - passed with existing warnings in `src/app/api/reports/export/route.ts` for unused `DATE_PATTERN` and `MONTH_PATTERN`
- [x] `pnpm typecheck` - passed
- [x] `git diff --check` - passed
- [ ] `pnpm test:e2e` - blocked before test body because Playwright `config.webServer` exited early

E2E 차단 원인 확인: 동일 dev server 경로가 현재 sandbox에서 `listen EPERM`으로 시작하지 못한다. 따라서 현재 실행 환경에서는 브라우저 테스트 본문을 완료할 수 없다.
