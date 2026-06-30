# 의뢰자 검수 증거 기록 (2026-06-30)

기준 체크리스트: `docs/meeting_0627/client-review-checklist-2026-06-28.md`

모든 명령은 저장소 루트에서 실행했고, 결과는 PASS다. Playwright(API/E2E)는
`erp_fish_e2e` DB에 `prisma db push`로 스키마(신규 `adjustmentReason` 컬럼 포함)를 동기화한 뒤
`hq@example.com` 및 시드된 지점장 계정으로 실제 화면/응답을 검증한다.

## 자동 검증

| 항목 | 명령 | 결과 | 근거 |
| --- | --- | --- | --- |
| 1.1~1.3, 4.5, 4.6 지점장 민감정보 숨김 | `pnpm test:e2e:meeting-0627` (test 4) | PASS | `tests/e2e/meeting-0627-acceptance.spec.ts:135` 급여액·전날재고 금액 미노출 |
| 1.2 응답 본문 민감 필드 제거 | `pnpm test:unit:file tests/unit/sensitive-response-shaping.test.mjs` | PASS | 원가/마진/매출차이 필드 응답 미포함 계약 |
| 1.5, 1.6 단가/재고 본사전용·원본단가 보존 | `pnpm test:unit:file tests/unit/ecount-supply-remediation.test.mjs` | PASS | 지점장 적용단가 차단·원본 raw 필드 보호·보정 이력 |
| 2.1 본사 홈 장부/분석 이중 매출 | `pnpm test:e2e:meeting-0627` (test 1) | PASS | `tests/e2e/meeting-0627-acceptance.spec.ts:42` 장부 ₩80,000 / 분석 ₩96,000 |
| 2.3 AE4/AE5/C5/C17 문서·테스트 반영 | `pnpm test:unit:file tests/unit/hq-dashboard.test.mjs` | PASS | analysisSalesAmount=plannedSalesTotal(AE4), 이익률 C17/AE5 기준; `ledger-cell-mapping-review` 표 |
| 3.1~3.3 이카운트 상태 한글 라벨 | `pnpm test:e2e:meeting-0627` (test 2) | PASS | `:85` `반영됨` 등 한글 상태, 영어 enum 미노출 |
| 3.5 냉동/생물 기준자료 규칙 분류 | `pnpm test:e2e:meeting-0627` (test 3) | PASS | `:109` 신규 `냉)` 품목 냉동 분류 |
| 3.5 분류 단위 규칙 | `pnpm test:unit:file tests/unit/ecount-supply-import.test.mjs` | PASS | `냉)`/`냉동` 접두만 냉동, 나머지 생물 |
| 5.1, 5.2 품목 리포트 제목·추정 판매수량 | `pnpm test:e2e:meeting-0627` (test 1) | PASS | `:57` `품목별 판매 현황 (추정)` 헤딩, `:61` `추정 판매 수량` 컬럼헤더 |
| 5.4 월별 손익 구조 | `pnpm test:unit:file tests/unit/monthly-profit-loss.test.mjs` | PASS | 남은금액 = 매출이익 - 인건비 - 비용합계; 조정사유/메모 분리 |
| 5.5 월별 xlsx 5시트 | `pnpm test:e2e:meeting-0627` (test 5), `pnpm test:api -- tests/api/report-export.spec.ts` (test 11) | PASS | 요약/기간조회_RAW/월별손익/재고현황/품목매출; 품목매출은 기간 합산 확정 컬럼 |
| 5.6 export 감사 로그 | `pnpm test:api -- tests/api/report-export.spec.ts` (test 9) | PASS | 필터·기간·지점·row수·포맷 감사 기록, 출력 후 기록 |
| 6.4 기준 없는 품목 알림 제외 | `pnpm test:unit:file tests/unit/long-stock-thresholds.test.mjs tests/unit/morning-summary-notification.test.mjs` | PASS | 기준일 없는 품목군(`기준 확인 필요`) LINE 대상 제외 |
| 6.1, 6.2 장기재고 기준일 메뉴·저장 반영 | `pnpm test:e2e:meeting-0627` (test 5) | PASS | `:163` 본사 메뉴에서 장기재고 기준일 저장 성공 토스트 |
| 7.1~7.3 변경 이력 한글·링크·작성자 | `pnpm test:unit:file tests/unit/master-data-history.test.mjs` | PASS | 한글 필드명·전후값·사유, 장부 상세 링크, name→email→id |
| 8.1 화면 표시명 도원에스디(로그인) | `pnpm exec playwright test tests/e2e/auth.spec.ts` | PASS | `tests/e2e/auth.spec.ts:10` `도원에스디 로그인` 헤딩; `src/lib/brand.ts` COMPANY_NAME |

## 수동 검증

E2E 테스트가 실제 계정 로그인 + 화면/응답 검증을 자동화하므로 아래 행은 해당 E2E 테스트로 대체 검증했다.

| 항목 | 계정 | 화면/API | 결과 | 근거 |
| --- | --- | --- | --- | --- |
| 본사 홈 장부/분석 매출·이익률 | hq@example.com | `/app/dashboard?date=today` | PASS | E2E test 1, 본사 행 장부 ₩80,000 / 분석 ₩96,000 |
| Ecount 상태 한글 라벨 | hq@example.com | 이카운트 배치 상세 | PASS | E2E test 2 |
| 월간 리포트 Excel 5시트 | hq@example.com | `/api/reports/export?report=monthly&format=xlsx` | PASS | E2E test 5 + API test 11 |
| 장기재고 기준일 메뉴 | hq@example.com | 장기재고 기준일 관리 | PASS | E2E test 5 |
| 급여/인건비/개인급여 미노출 | 지점장(seed) | 지점장 홈/리포트 | PASS | E2E test 4 |
| 전날 재고 보기 금액/단가/원가/마진 미노출 | 지점장(seed) | 재고 `전날 재고 보기` | PASS | E2E test 4 |
| 본사 전용 페이지 지점장 차단 | 지점장(seed) | 본사 전용 라우트 | PASS | E2E test 6 |

## 미검증(증거 없음 → 체크하지 않음)

아래 항목은 전용 자동 검증이 아직 없어 체크리스트에서 미체크로 둔다(수동 UI 확인 필요).

- 4.1~4.4 지점장 입력 미저장 경고/필수 수량 field error/비용 표준항목
- 5.3 원가·마진 열 본사 권한 전용 노출(전용 검증 없음)
- 6.5 장기재고 화면 지점장 vs 본사 노출 항목 차이
- 6.6 알림 LINE 단일 채널

8.1(화면 표시명)은 로그인 헤딩이 자동 검증되어 체크했다. 사이드바·메타데이터는 같은
상수(`src/lib/brand.ts` COMPANY_NAME)를 쓰지만 화면 단위 전용 검증은 아직 없어, 체크리스트
행에 그 단서를 명시했다.
