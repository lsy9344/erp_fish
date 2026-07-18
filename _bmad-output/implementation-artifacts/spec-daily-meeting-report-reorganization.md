---
title: '아침 회의 리포트 재구성'
type: 'feature'
created: '2026-07-18'
status: 'done'
baseline_commit: '6cda800acd177d4a4ec02bf530fd202a607feba0'
context:
  - '{project-root}/docs/rev/2026-07-18_아침회의_리포트_재구성_작업지시서.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 아침 회의 리포트에 전일 대비 매출, 재고비율, 권한 범위 내 매출 포지션과 기존 장부 기반 직원 근태가 없고 기존 섹션 순서도 요청 목차와 다르다.

**Approach:** 기존 권한 범위, 정정 overlay, FIFO 저장 금액, 차트·품목표·상세표를 재사용해 서버 DTO에서 계산을 끝내고 `/app/reports/daily`를 지정된 5개 영역 순서로 재배치한다.

## Boundaries & Constraints

**Always:** 선택일과 직전 달력일을 같은 scope 쿼리로 읽고 양일 정정 반영 `totalSales`를 사용한다. 미입력·휴무·0원·FIFO 금액 누락은 원인 있는 계산 불가로 보존한다. 순위·비중·평균은 동일한 권한 모집단을 사용한다. 근태 상태는 메모 trim으로 판정하되 원문 메모를 표시하고 정정 반영 `workerCount`를 사용한다. 기존 export, 날짜 선택, 정정 근거, 장부 링크, 품목 검색과 차트 정렬을 유지한다.

**Ask First:** FIFO 금액을 무효화하는 재고 수량 정정이 있는 지점의 재고비율을 계산 가능하게 만드는 새 평가 정책이 필요할 때, 또는 작업지시서 밖 파일의 업무 로직 변경이 필요할 때.

**Never:** Prisma 모델·마이그레이션·API route·상태 저장소·의존성을 추가하거나 근태 DTO에 급여금액·`employeeId`·내부 작성자/정정 키를 넣지 않는다. 사분면, 결근·휴가·출퇴근 시각 추정, export 컬럼 확장은 제외한다.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| 정상 분석 | 선택일 120,000원, 전일 100,000원, FIFO 30,000원 | 증감 +20%, 재고비율 25%, 권한 모집단 순위·비중 표시 | N/A |
| 전일 불가 | 전일 미입력·휴무·0원 또는 양일 매출 metric 불가 | 증감률 null과 구체 원인, 정렬 마지막 | 0%로 치환하지 않음 |
| 재고 불가 | 재고 항목 없음, 저장 FIFO 금액 null, 수량 정정으로 FIFO 무효, 선택일 매출 0원 | 지점 전체 재고금액·비율 null | 부분합·수량×단가 폴백 금지 |
| 포지션 제외 | 선택일 미입력 또는 휴무 | 모집단 제외 후 지점명과 사유 표시 | 권한 밖 지점은 제외 목록에도 없음 |
| 근태 복합 | 한 직원에 지각·조퇴·특이사항, 미연결, workerCount 초과 | 모든 상태 배지와 명단 미입력 placeholder 표시 | 민감 필드 직렬화 금지 |

</frozen-after-approval>

## Code Map

- `src/features/reports/types.ts` -- 매출 분석·근태 읽기 전용 DTO.
- `src/features/reports/queries.ts` -- 양일 scope 조회, 공통 정정 계산, 순수 builder, 리포트 조립.
- `src/features/reports/components/daily-sales-analysis.tsx` -- 서버 계산값 전용 반응형 표시.
- `src/features/reports/components/daily-attendance-report.tsx` -- 요약과 desktop/mobile 상세 표시.
- `src/app/app/reports/daily/page.tsx` -- 기존 기능을 보존한 5개 영역 재배치.
- `src/app/app/reports/daily/loading.tsx` -- 실제 영역 순서 skeleton.
- `tests/unit/hq-reports.test.mjs` -- 계산·직렬화·소스 계약.
- `tests/e2e/hq-reports.spec.ts` -- 실제 화면, 권한, 모바일, 기존 기능 회귀.

## Tasks & Acceptance

**Execution:**
- [x] `src/features/reports/types.ts`, `src/features/reports/queries.ts` -- 기존 `toReportLedgerCalculationSummary`를 daily row에도 재사용하고 양일 ledger를 즉시 분리한 뒤 분석·근태 DTO를 생성한다. 저장된 `inventoryAmount`를 엄격 합산하며 수량 정정으로 FIFO가 무효화된 항목은 계산 불가로 처리한다.
- [x] `src/features/reports/components/daily-sales-analysis.tsx`, `src/features/reports/components/daily-attendance-report.tsx` -- 업무 계산 없이 포맷·접근성·반응형 표시만 구현한다.
- [x] `src/app/app/reports/daily/page.tsx`, `src/app/app/reports/daily/loading.tsx` -- 지점 → 분석 → 품목 → 근태 → 마감 순으로 배치하며 기존 공용 컴포넌트 내부는 수정하지 않는다.
- [x] `tests/unit/hq-reports.test.mjs` -- 월/연도 날짜 경계, 양일 정정, 불가 원인, FIFO 엄격성, 한글 동률, 복합 근태와 민감 필드 제외를 검증한다.
- [x] `tests/e2e/hq-reports.spec.ts` -- 전일·재고·근태 fixture와 cleanup을 추가하고 섹션 순서, 권한 범위, 모바일 overflow, export·날짜·검색·정정 근거 회귀를 검증한다.

**Acceptance Criteria:**
- Given 리포트 접근 권한과 선택일이 있을 때, when 페이지를 열면, then 5개 영역이 지정 순서로 표시되고 신규 분석과 근태는 권한 범위 데이터만 포함한다.
- Given 정정 또는 계산 불가 데이터가 있을 때, when 분석 DTO를 만들면, then 정정 반영값과 구체 원인을 보존하며 숫자 0이나 부분합으로 위장하지 않는다.
- Given 기존 일별 리포트 기능이 있을 때, when 재구성 후 사용하면, then 차트 정렬·품목 검색·상세 이동·이상 신호·Excel·CSV·날짜 조회가 계속 동작한다.

## Spec Change Log

## Design Notes

`calculateLedgerReviewSummary().inventoryAmount`는 FIFO가 없으면 수량×단가로 폴백하므로 재고비율에는 사용하지 않는다. correction overlay 후 항목별 저장 `inventoryAmount`가 모두 유효하고 FIFO를 무효화한 수량 정정이 없을 때만 합산한다.

## Verification

**Commands:**
- `pnpm test:unit:file tests/unit/hq-reports.test.mjs` -- 신규 계산과 기존 일별 계약 통과.
- `pnpm typecheck` -- DTO·Prisma select·컴포넌트 타입 통과.
- `pnpm lint` -- 정적 검사 통과.
- `node scripts/run-playwright-clean.mjs tests/e2e/hq-reports.spec.ts --grep "아침 회의|매출 분석|근태|판매 현황|좁은 화면"` -- PostgreSQL `localhost:5432` 미가동으로 global setup에서 중단.
- `git diff --check` -- whitespace 오류 없음.

## Suggested Review Order

**리포트 조립과 계산 경계**

- 권한 범위 양일 장부를 한 흐름에서 조회하고 기존 정정 계산을 재사용한다.
  [`queries.ts:1051`](../../src/features/reports/queries.ts#L1051)

- 매출 증감·FIFO 재고비율·동일 모집단 포지션을 서버에서 확정한다.
  [`queries.ts:437`](../../src/features/reports/queries.ts#L437)

- 근태 메모·미연결·명단 누락을 민감 필드 없는 DTO로 변환한다.
  [`queries.ts:576`](../../src/features/reports/queries.ts#L576)

**화면 구성**

- 기존 기능을 보존하며 요청된 다섯 영역 순서로 페이지를 재배치한다.
  [`page.tsx:207`](../../src/app/app/reports/daily/page.tsx#L207)

- 매출 분석을 데스크톱 표와 모바일 카드로 표시한다.
  [`daily-sales-analysis.tsx:23`](../../src/features/reports/components/daily-sales-analysis.tsx#L23)

- 근태 요약과 복합 상태를 반응형 상세 목록으로 표시한다.
  [`daily-attendance-report.tsx:16`](../../src/features/reports/components/daily-attendance-report.tsx#L16)

- 로딩 화면도 실제 영역 순서와 일치시킨다.
  [`loading.tsx:26`](../../src/app/app/reports/daily/loading.tsx#L26)

**계약과 검증**

- 신규 읽기 전용 DTO가 민감한 근태 필드를 노출하지 않는다.
  [`types.ts:98`](../../src/features/reports/types.ts#L98)

- 경계값·정정·불가 원인·동률·복합 근태를 순수 함수로 검증한다.
  [`hq-reports.test.mjs:2077`](../../tests/unit/hq-reports.test.mjs#L2077)

- 실제 권한·섹션 순서·모바일·기존 기능 회귀 시나리오를 고정한다.
  [`hq-reports.spec.ts:932`](../../tests/e2e/hq-reports.spec.ts#L932)
