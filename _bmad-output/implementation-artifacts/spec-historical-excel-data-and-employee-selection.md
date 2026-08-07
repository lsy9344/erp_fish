---
title: '과거 직영 엑셀 데이터 이관과 직원 선택'
type: 'feature'
created: '2026-08-07'
status: 'done'
baseline_commit: 'f77f46226f67b5926d27bf0177a6b855c32c68fa'
context:
  - '{project-root}/docs/rev/2026-08-06_인사관리_인건비리포트_월간KPI_대표권한_작업지시서.md'
  - '{project-root}/_bmad-output/planning-artifacts/policy-decisions/8-1-직원-근무-급여-참고-범위와-개인정보-기준.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 고객 Excel의 2020-01-01~2026-06-30 실적과 직원별 일일 팀장/팀원 기록이 ERP에 없다. 직원 관리도 검색만 가능해 400명 이상 중 정확한 직원 선택이 어렵다.

**Approach:** 10개 시트 원본을 과거 배치로 보존하고 `입력`을 일별 실적·과거 직원·역할로 정규화한다. 운영 장부와 분리해 기간 분석과 직원 관리에서 조회하고 검색 연동 직원 선택기를 제공한다.

## Boundaries & Constraints

**Always:** 파일 hash와 시트·행·수식·캐시값·공란·오류를 보존하고 재실행은 멱등하게 한다. 최초 등장일은 입사일이 아닌 `최초 확인 근무일`이다. 일별 역할은 고정 직급과 분리한다. 7개 지점은 정확한 이름으로만 매핑한다. 같은 지점·일자의 운영 자료가 우선한다.

**Ask First:** dry-run이 기준과 다르거나, 과거 이름을 현재 `Employee`와 합치거나, 운영 장부·급여 행을 수정해야 하면 중단한다.

**Never:** 과거 자료를 `DailyLedger`/`LedgerLaborItem`으로 만들지 않는다. 이름만으로 현재 직원과 병합하지 않는다. 빈값·수식 오류를 0으로 바꾸거나 파생 시트를 실적으로 중복 집계하지 않는다. 가짜 입사일·급여·활성 상태를 만들지 않는다.

## I/O & Edge-Case Matrix

| 상황 | 기대 동작 |
|---|---|
| 승인 파일 | raw 전체 stage → 검증 → 원자적 활성화 |
| 동일 hash | 기존 배치 반환, 행 증가 없음 |
| 동일 지점·일자 | raw 모두 보존, 첫 canonical fact만 집계 |
| 오류/공란 | 원본 보존, `자료 없음/원본 오류` |
| `0`·`기타`·오타·동명이인 | 원문·검토 상태 보존, 자동 연결 금지 |
| 직원 검색·선택 | 현재/과거 직원 1명 선택 후 상세 표시 |
| 과거+운영 기간 | 중복 없이 집계하고 출처 표시 |
| rollback | raw 보존, 리포트 노출만 복원 |

</frozen-after-approval>

## Code Map

- `prisma/schema.prisma` -- 과거 import/raw/실적/직원/역할
- `src/features/labor/*` -- 직원 디렉터리와 선택 UI
- `src/features/reports/*` -- 운영·과거 통합 집계와 export

## Tasks & Acceptance

**Execution:**
- [x] `prisma/schema.prisma`, migration -- 운영 테이블과 분리된 batch, raw row, 일별 실적, 과거 직원, 일별 역할 모델·인덱스 추가.
- [x] `src/features/historical-excel/*`, `scripts/import-historical-direct-sales.mjs` -- ExcelJS parser, raw 보존, 지점 매핑, 검증, chunk stage/activate/rollback 구현.
- [x] `employees-queries.ts`, `employee-management-client.tsx` -- 현재/과거 badge, 근무 기간·지점·역할 상세와 검색 연동 단일 선택기 구현.
- [x] `src/features/reports/*`, 기간 분석 UI/export -- 과거 fact를 중복 없이 합산하고 출처·누락 지표 표시.
- [x] import unit 및 labor/report API·E2E -- 멱등성, 중복, 오류값, 선택, 2020~2026 분석, rollback 검증.
- [x] `docs/historical-excel-import-operations.md` -- dry-run, 운영 적용·대조·롤백 기록.

**Acceptance Criteria:**
- Given 승인 파일, when dry-run하면, then 10시트·14,309 raw 행·14,072 canonical 지점일·약 52,000 역할·412 원본 이름·28 동일 중복이 보고된다.
- Given 과거 직원, when 검색 후 선택하면, then 원본 이름·과거 상태·근무 기간·지점·날짜별 팀장/팀원 이력이 보인다.
- Given 2020~2026 기간, when 분석/export하면, then 매출·매출이익·이익률·평균 인원·생산성·평균매출이 원본과 일치하고 깨진 재고는 0이 아니다.
- Given 운영 DB, when 이관 전후를 비교하면, then 운영 장부·급여·재고·손실과 현재 Employee 4명의 행·개인정보가 변하지 않는다.
- Given 재실행/rollback, when 완료되면, then 중복 없이 과거 데이터 노출만 전환된다.

## Spec Change Log

## Design Notes

`입력`만 canonical fact로 쓰고 나머지 9개 파생 시트는 raw 근거로 보존한다. 운영 장부는 2026-07-29부터라 엑셀과 겹치지 않고 7개 지점명은 활성 지점과 일치한다. 과거 identity는 source badge로 구분하며 현재 직원과 자동 합치지 않는다.

## Verification

- `pnpm db:validate && pnpm db:generate && pnpm typecheck && pnpm lint && pnpm build`
- `pnpm test:unit && pnpm test:api && pnpm test:e2e`
- `pnpm historical:import -- --dry-run <xlsx>` 및 표본 3개월·전체 지점 월 합계 대조

## Suggested Review Order

**이관 진입점과 안전한 수명주기**

- OWNER 감사와 멱등 stage·활성화·rollback 경계를 먼저 확인합니다.
  [`import-service.ts:91`](../../src/features/historical-excel/import-service.ts#L91)

- 승인 hash·수치·원본 셀 보존 규칙을 확인합니다.
  [`parser.ts:29`](../../src/features/historical-excel/parser.ts#L29)

- 운영자가 실행할 네 가지 명령과 필수 actor를 확인합니다.
  [`import-historical-direct-sales.mjs:48`](../../scripts/import-historical-direct-sales.mjs#L48)

**DB 분리와 무결성**

- 운영 장부와 분리된 과거 데이터 관계를 확인합니다.
  [`schema.prisma:968`](../../prisma/schema.prisma#L968)

- enum·복합 FK·단일 ACTIVE 제약의 실제 DDL을 확인합니다.
  [`migration.sql:3`](../../prisma/migrations/20260807120000_add_historical_excel_data/migration.sql#L3)

**기간 분석 통합**

- 운영 우선·공란 보호·정정 전후 근거 합산을 확인합니다.
  [`historical-integration.ts:105`](../../src/features/reports/historical-integration.ts#L105)

- 다중 기간에서 ACTIVE batch를 고정하는 조회 경계를 확인합니다.
  [`queries.ts:1802`](../../src/features/reports/queries.ts#L1802)

- 화면과 Excel export의 출처·누락 근거를 확인합니다.
  [`export.ts:154`](../../src/features/reports/export.ts#L154)

**직원 선택과 개인정보**

- 검색 결과에서 현재·과거 이름을 명시적으로 선택하는 UI를 확인합니다.
  [`employee-management-client.tsx:327`](../../src/features/labor/components/employee-management-client.tsx#L327)

- 최초 근무일·지점·일별 역할의 대표 전용 조회를 확인합니다.
  [`employees-queries.ts:150`](../../src/features/labor/employees-queries.ts#L150)

- 직원 CRUD 감사 로그가 민감값을 복제하지 않는지 확인합니다.
  [`employees-actions.ts:74`](../../src/features/labor/employees-actions.ts#L74)

**검증과 운영 절차**

- 실제 고객 workbook 계약과 오류·정정 회귀를 확인합니다.
  [`historical-excel.test.mjs:197`](../../tests/unit/historical-excel.test.mjs#L197)

- 재실행·단일 ACTIVE·rollback·운영 무변경 검증을 확인합니다.
  [`historical-import-lifecycle.spec.ts:208`](../../tests/e2e/historical-import-lifecycle.spec.ts#L208)

- 운영 백업·대조·감사·복구 순서를 확인합니다.
  [`historical-excel-import-operations.md:1`](../../docs/historical-excel-import-operations.md#L1)
