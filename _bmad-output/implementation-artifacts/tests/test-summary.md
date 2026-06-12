# 테스트 자동화 요약

## 생성/보강한 테스트

### API 테스트

- [x] 해당 없음 - Story 8.9는 CAP-19 운영 계약 범위 분리 정책 산출물 story이며 API 구현 story가 아니다.

### E2E 테스트

- [x] 해당 없음 - Story 8.9는 제품 UI/API 구현 story가 아니며 `src/`, `prisma/`, `tests/`, infra/dependency 변경 금지 범위를 유지한다.

## 커버리지

- API endpoints: 0/0, 적용 대상 없음
- UI features: 0/0, Story 8.9는 운영 계약/견적 기준과 제품 backlog 제외 기준을 정의하며 화면을 구현하지 않는다.
- Policy artifact requirements: CAP-19 `contract/ops only`, OQ-18 결정 상태, 운영 계약서 또는 견적서 참조 기준, 제품 backlog 제외 기준, product surface 변경 절차, 백업/복구 최소선과 계약 변수 경계, 구현 금지 사항, 승인자, Traceability
- Contract/ops boundary: 유지보수 대응 시간, 월 비용, 서버 이용료 포함 여부, 장애 보고 방식, 백업 확인 책임, 서버 세팅 책임, 장애 대응 범위, 시인성 개선 요청 처리 범위는 운영 계약서 또는 견적서에서 확정
- Product surface gate: 운영 로그/상태, 설정 확인 화면, 백업 대상 데이터 식별, 감사 로그, 실패 상태 표시만 별도 PRD/change proposal과 화면/API/권한/감사/test AC 승인 후 후속 구현 가능
- Implementation drift guardrails: 유지보수 SLA, 비용 청구/정산, 서버 이용료 관리, 인프라 운영 대시보드, 백업 실행/복구 자동화, 장애 당직 관리, 계약서 생성/전자서명, 유지보수 티켓 시스템, monitoring/backup/billing/ticketing 구현 금지

## 체크리스트 결과

- [x] API tests generated where applicable - 적용 대상 없음
- [x] E2E tests generated where UI exists - 적용 대상 없음
- [x] Tests use standard test framework APIs - 신규 테스트 없음, 기존 Playwright와 `node:test` 프레임워크 확인
- [x] Tests cover happy path - 정책 산출물 필수 섹션과 CAP-19 contract/ops 선언을 문서 검색으로 검증
- [x] Tests cover critical error cases - 제품 구현 drift 차단을 `src`/`prisma`/`tests`/`package.json` 스캔으로 검증
- [x] Tests use proper locators - 브라우저 UI 대상 없음
- [x] No hardcoded waits or sleeps - 신규 테스트 없음
- [x] Tests are independent - 신규 테스트 없음
- [x] Test summary created
- [x] Tests saved to appropriate directories - 신규 API/E2E 테스트 비적용, QA 산출물은 `_bmad-output/implementation-artifacts/tests/test-summary.md`
- [x] Summary includes coverage metrics

## 검증

- [x] `rg --files -g '*project-context.md'` 결과 없음. workflow persistent facts 대상 파일 없음.
- [x] `rg -n "CAP-19|OQ-18|contract/ops only|운영 계약서|견적서|product surface|제품 backlog 제외|백업/복구|구현 금지 사항|Traceability" _bmad-output/planning-artifacts/policy-decisions/8-9-cap-19-운영-계약-범위-분리.md` 통과
- [x] `rg -n "CAP-19|OQ-18|유지보수 대응|월 유지보수|서버 이용료|장애 보고|백업 확인|운영 계약서|견적서|contract/ops only|ticketing|billing|invoice|on-call|oncall|SLA" src prisma tests package.json` 결과 없음
- [x] `corepack pnpm test:unit` 통과, 35/35 tests
- [x] `corepack pnpm check` 통과. 기존 warning 2개는 `src/app/api/reports/export/route.ts`의 미사용 `DATE_PATTERN`, `MONTH_PATTERN`
- [x] `git diff --check` 통과
- [ ] `corepack pnpm test:e2e` 실패. Playwright webServer가 조기 종료됨
- [ ] E2E blocker 재현: `corepack pnpm dev --hostname 127.0.0.1 --port 3000`이 현재 샌드박스에서 `listen EPERM: operation not permitted 127.0.0.1:3000`으로 실패
