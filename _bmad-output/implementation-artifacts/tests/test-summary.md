# 테스트 자동화 요약

## 기준

- 대상 문서: `docs/meeting_0627/meeting_memo.txt`, `final-summary-and-worklist-2026-06-27.md`, `implementation-work-order-2026-06-27.md`, `client-review-checklist-2026-06-28.md`
- 검증 목적: 2026-06-27 회의 결과 중 자동 검증 가능한 본사/지점장/이카운트/리포트 요구사항을 Playwright E2E로 직접 확인한다.

## 생성/보강한 테스트

### E2E 테스트

- [x] `tests/e2e/meeting-0627-acceptance.spec.ts` - 회의 0627 요구사항 대표 경로 6개를 독립 시드 데이터로 검증
- [x] 본사 홈/관제판: 장부 매출 아래 분석 매출이 같이 보이는지 확인
- [x] 이카운트 업로드: 상세 상태가 raw enum이 아니라 한글 라벨로 보이는지 확인
- [x] 이카운트 신규 품목: `냉)` 접두 품목이 기준자료 규칙대로 `냉동` 분류로 제안되는지 확인
- [x] 지점장 화면: 급여 금액/급여 합계가 보이지 않고, 전날 재고 창에 단가/금액/링크가 없는지 확인
- [x] 본사 전용 기능: 직원 관리, 장기재고 기준일, 월간 xlsx 5시트 export를 확인
- [x] 권한 차단: 지점장이 본사 전용 리포트/직원/장기재고 기준일 화면에 접근할 수 없는지 확인

### API 테스트

- [x] 기존 `tests/api/report-export.spec.ts` 실행 - export 권한, 안전한 403/400 응답, CSV allowlist, xlsx content-type/파일명/감사 로그, 월별손익 sheet 확인

## 커버리지

- UI routes: `/app/dashboard`, `/app/reports/daily`, `/app/reports/product-review`, `/app/reports/sales-review`, `/app/ecount-imports/*`, `/app/store-entry`, `/app/store-entry/inventory`, `/app/labor/employees`, `/app/master-data/long-stock-thresholds`
- API endpoints: `/api/reports/export`
- 자동 검증 제외: 진수산 `재고이상`은 문서상 의뢰자 직접 분석으로 구현 범위 제외

## 검증 결과

- [x] `pnpm test:e2e:meeting-0627` 통과, 6/6
- [x] `pnpm test:api` 통과, 14/14
- [x] `pnpm typecheck` 통과
- [x] `pnpm lint` 통과
- [x] `pnpm test:unit` 통과, 461/461
- [x] `pnpm test:e2e:core:ledger` 통과, 57/57
- [x] `node scripts/run-playwright-clean.mjs tests/e2e/hq-dashboard.spec.ts:1035` 통과, 1/1
- [x] `node scripts/run-playwright-clean.mjs tests/e2e/calculation-policy-gates.spec.ts` 통과, 2/2
- [ ] `pnpm test:e2e:core` 전체 묶음은 별도 실행하지 않음. 전용 회의 검증, API, ledger core, 관련 정책 E2E는 통과함.

## 판단

자동 E2E로 직접 확인 가능한 회의 0627 핵심 요구사항은 통과했다. 남은 미확정/제외 항목은 최신 문서 기준 그대로 별도 관리한다.
