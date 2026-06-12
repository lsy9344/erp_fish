# 테스트 자동화 요약

## 생성/보강한 테스트

### API / Unit 테스트

- [x] `tests/unit/hq-reports.test.mjs` - Story 6.3 월간 리포트 source-contract, 권한 helper, store scope, month/store URL 상태, correction overlay, shared calculation, status counts, monthly KPI/loss/inventory flow, revalidation 경로 검증
- [x] `tests/unit/hq-reports.test.mjs` - 월간 집계가 미입력/휴무/0원 손실/정정 반영값/데이터 부족/계산 불가/OQ-gated 상태를 구분하는지 검증
- [x] 별도 public API route 없음 - `/app/reports/monthly`는 server query + page render 경계라 API 테스트 대신 서버 계약 단위 테스트로 검증

### E2E 테스트

- [x] `tests/e2e/hq-reports.spec.ts` - 본사 사용자가 일별 리포트에서 월간 리포트로 이동해 월/지점 필터를 적용하고 선택 지점의 월간 상태를 확인하는 흐름 검증
- [x] `tests/e2e/hq-reports.spec.ts` - 월간 리포트에서 정정 반영 매출, 정정 반영 건수, 손실/재고 흐름, 최고매출품목 policy gate, 계산 포함/제외 일자를 검증
- [x] `tests/e2e/hq-reports.spec.ts` - 월간 리포트에서 `입력중` 미마감 장부와 `휴무` 장부를 색상만이 아닌 텍스트 상태와 포함/제외 사유로 구분하는 시나리오 추가
- [x] `tests/e2e/hq-reports.spec.ts` - 잘못된 월과 권한 밖/비활성 지점 URL이 fallback 데이터 없이 빈 결과와 안내 메시지를 표시하는지 검증
- [x] `tests/e2e/hq-reports.spec.ts` - 좁은 화면 모바일 카드에서 월간 KPI, 손실/재고 흐름, 최고매출품목 상태, 일자별 상태, 정정 타임라인 링크, 가로 overflow 방지 검증
- [x] `tests/e2e/hq-reports.spec.ts` - 지점장 사용자의 월간 리포트 직접 URL 접근 차단 검증

## 커버리지

- Story 6.3 AC: 6/6 covered by unit/source-contract + E2E scenarios
- API/server boundary: public monthly API route 없음, `requireReportAccess()`, `getHeadquartersStoreScope()`, active scoped stores, unauthorized store no-data contract covered
- UI workflow: month filter, store filter, invalid month fallback, invalid store empty result, desktop table, mobile card, empty/error messaging covered
- Correction behavior: correction-applied default aggregate number, monthly correction count, original/corrected evidence, ledger detail link, correction timeline link covered
- Monthly states: closed, in-progress, missing, holiday, unfinished-included signal, calculation included/excluded reasons covered
- Sensitive/OQ-gated behavior: finalized number 차단, `계산 기준 확인 필요`, `데이터 부족`, `계산 불가`, `정정 확인 필요` 상태 구분 covered

## 체크리스트 결과

- [x] API tests generated where applicable
- [x] E2E tests generated for UI behavior
- [x] Tests use standard project APIs (`node:test`, Playwright)
- [x] Happy path covered
- [x] Critical error cases covered: unauthorized branch-manager access, out-of-scope store filter, invalid month, missing/holiday/unclosed ledgers, correction review required state
- [x] Semantic locators and accessible names used
- [x] Clear test descriptions used
- [x] No hardcoded waits or sleeps added
- [x] Tests are independent through story-scoped seed IDs and cleanup
- [x] Tests saved to appropriate directories
- [x] Summary includes coverage metrics and validation status

## 검증

- [x] `node --experimental-strip-types --test tests/unit/hq-reports.test.mjs` - passed
- [x] `pnpm test:unit -- hq-reports` - passed, 35/35 unit files; repo script did not narrow to one file
- [x] `pnpm lint` - passed
- [x] `pnpm typecheck` - passed
- [x] `git diff --check` - passed
- [ ] `pnpm test:e2e tests/e2e/hq-reports.spec.ts` - blocked before test body because Playwright `config.webServer` exited early

E2E 차단 원인 확인: 동일 dev server 경로인 `pnpm dev --hostname 127.0.0.1 --port 3000`이 현재 sandbox에서 `listen EPERM: operation not permitted 127.0.0.1:3000`으로 시작하지 못한다. 따라서 E2E spec은 생성/정적 검증됐지만, 현재 실행 환경에서는 포트 listen 권한 때문에 브라우저 테스트 본문을 완료할 수 없다.
