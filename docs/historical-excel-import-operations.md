# 과거 직영 Excel 이관 운영 절차

## 목적과 안전 경계

고객 원본 10개 시트를 `DailyLedger`, `LedgerLaborItem`, 현재 `Employee`와 분리해 보존한다. 사용자가 2026-08-07 승인한 명세에 따라 2020~2026 원본 이름·일별 역할을 과거 조회 자료로 보존하되, 현재 직원으로 확정하거나 급여 자료로 사용하지 않는다. 이 절차는 로컬/승인된 운영 작업 창에서만 실행하며 이름 유사도나 이름만으로 과거 직원을 현재 직원에 연결하지 않는다. 법정·계약상 더 짧은 보존 기준이 확인되면 그 기준이 우선하며 batch 비활성화와 별도 비식별화 계획을 먼저 승인한다.

승인 기준:

- SHA-256 `cea3bc37c99214db48464dfecec8483e800b8422d4619fdbcdc17f19dcac3f09`
- 시트 10개, raw 행 14,309개
- canonical 지점·일 14,072개
- 정규화 역할 52,005개, 원본 역할 셀 52,113개
- 원본 이름 412개, 동일 지점·일 중복 28개
- 기간 2020-01-01 ~ 2026-06-30
- 지점은 `강서수산`, `불광수산`, `제일수산`, `삼국유통`, `안양참수산`, `못골참수산`, `구로참수산`과 정확히 일치

## 1. 사전 기록

작업 기록에 다음을 적는다.

- 작업자, OWNER 사용자 id, 작업 일시, 대상 환경
- 원본 파일명과 전달 경로
- 이관 전 `DailyLedger`, `LedgerLaborItem`, `Employee` 행 수 및 현재 Employee 4명의 id/개인정보 hash
- 현재 ACTIVE 과거 batch id(있을 때)

실제 운영 DB에서는 먼저 읽기 전용 대조만 하고, 승인되지 않은 파일/지점 매핑/현재 직원 병합 요청이 있으면 중단한다.

## 2. dry-run

```bash
pnpm historical:import -- --dry-run docs/reference_from_customer/2026-08-06_직영_매출_데이타.xlsx
```

`validation: APPROVED`, `validationErrors: []`인지 확인한다. 승인 hash와 기준 중 하나라도 다르면 stage하지 말고 차이를 기록한 뒤 사용자 승인을 다시 받는다. `0`, 빈 지점, `기타`, 오타는 자동 보정하지 않는다. 같은 hash에 `STAGING`/`FAILED` batch가 남아 있으면 재실행하지 말고 원인을 먼저 확인한다.

## 3. stage

운영 적용 전 DB 백업과 변경 창 승인을 별도로 완료한다.

```bash
pnpm historical:import -- --stage <승인-xlsx> --actor <owner-user-id>
```

출력된 batch id와 hash를 기록한다. 같은 hash 재실행은 `reused: true`로 기존 batch를 반환해야 하며 raw/fact/역할 행 수가 늘면 안 된다. Stage는 raw 전체와 정규화 결과만 적재하고 리포트에는 아직 노출하지 않는다.

대조 SQL은 읽기 전용으로 실행한다.

```sql
SELECT "status", "sheetCount", "rawRowCount", "canonicalFactCount",
       "roleCount", "sourceNameCount", "duplicateStoreDateCount"
FROM "HistoricalExcelImportBatch"
WHERE "id" = '<batch-id>';
```

## 4. 원자적 활성화

```bash
pnpm historical:import -- --activate <batch-id> --actor <owner-user-id>
```

활성화 transaction은 기존 ACTIVE batch를 `SUPERSEDED`로 내리고 새 batch 하나만 `ACTIVE`로 만든다. 다음을 표본 대조한다.

1. 3개월 이상, 7개 지점의 월 매출/매출이익/이익률/평균 근무인원/인당생산성/평균매출. Excel 영업일수는 매출이 0/공란이 아닌 날로 계산한다.
2. 기간 분석에 `과거 Excel` 또는 `운영 + 과거 Excel` 출처 표시
3. 평균재고/재고비율이 0이 아니라 `자료 없음/원본 오류`로 표시
4. 같은 지점·일자에 운영 장부가 있으면 `운영 우선` 표시와 운영 값 적용
5. 직원 관리에서 현재/과거 badge, 최초 확인 근무일, 지점, 날짜별 팀장/팀원 역할 확인
6. XLSX export의 출처/누락 컬럼 확인

이관 전후 `DailyLedger`, `LedgerLaborItem`, `Employee` 행 수와 Employee 4명의 hash가 동일한지 다시 기록한다.

## 5. rollback

문제가 있으면 raw를 삭제하지 않고 리포트 노출만 되돌린다.

```bash
pnpm historical:import -- --rollback <active-batch-id> --actor <owner-user-id>
```

현재 batch는 `ROLLED_BACK`, 이전 batch가 있으면 다시 `ACTIVE`가 된다. rollback 뒤 기간 분석과 직원 관리에서 이전 노출 상태가 복원됐는지 확인한다. raw/fact/역할 행은 감사·재검증을 위해 그대로 남는다.

## 6. 완료 기록

- dry-run JSON, stage/activate/rollback 출력
- `historical_excel.staged` / `activated` / `rolled_back` AuditLog와 actor id
- 적용 batch id/hash와 이전 batch id
- 표본 월·지점별 원본 대조 수치
- 운영 테이블/현재 직원 무변경 대조 수치
- 실행자와 검토자, 발견된 원본 오류/누락 목록

원본 파일과 출력 로그에는 개인정보가 포함될 수 있으므로 대표 전용 저장소/권한 안에서만 보관한다.
