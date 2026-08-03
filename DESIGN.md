# 관리자 홈 지표 및 마감 장부 마스터 수정 설계

## Source of truth

- Status: Draft
- Last refreshed: 2026-07-31
- Primary product surfaces:
  - 본사 관리자 홈 `/app/dashboard`
  - 본사 장부 상세 `/app/ledgers/[ledgerId]`
  - 변경 이력 `/app/master-data/history`
- Evidence reviewed:
  - `src/app/app/dashboard/page.tsx`
  - `src/features/dashboard/types.ts`
  - `src/features/dashboard/queries.ts`
  - `src/features/dashboard/components/hq-dashboard-table.tsx`
  - `src/server/calculations/ledger.ts`
  - `src/app/app/ledgers/[ledgerId]/page.tsx`
  - `src/server/authz.ts`
  - `src/features/ledger/status-policy.ts`
  - `src/features/ledger/hq-edit-actions.ts`
  - `src/features/inventory/hq-edit-actions.ts`
  - `src/features/losses/hq-edit-actions.ts`
  - `src/features/corrections/actions.ts`
  - `src/features/corrections/queries.ts`
  - `src/features/inventory/queries.ts`
  - `src/features/inventory/actions.ts`
  - `src/features/inventory/sales-price-carryover.ts`
  - `prisma/schema.prisma`
  - `prisma/seed.ts`
  - `docs/260722/CARRYOVER_SALES_CONTRACT.md`
  - `README.md`
  - `tests/unit/hq-dashboard.test.mjs`
  - `tests/unit/hq-ledger-edit.test.mjs`
  - `tests/unit/ledger-status-policy.test.mjs`
  - `tests/e2e/hq-dashboard.spec.ts`
  - `tests/e2e/hq-ledger-edit.spec.ts`
  - `tests/e2e/hq-ledger-corrections.spec.ts`
  - `tests/e2e/store-ledger-inventory.spec.ts`

## 요청 요약

1. 관리자 홈의 `매출 구성`을 다음 세 값으로 단순화한다.
   - `매출`: 이월 매출을 합한 매출
   - `예상매출`: 기존 `분석` 값의 라벨 변경
   - `재고금액`: 선택한 일자의 마감 장부 재고 총액
2. `이월` 금액은 별도 줄로 표시하지 않는다.
3. `실제 / 예상 마진율`은 유지하되 `경보 기준` 표시는 제거한다.
4. 마스터 계정은 본사 마감된 과거 장부의 업무 내용을 직접 수정할 수 있어야 한다.
5. 수정 시 기존 권한 범위, 감사 로그, 수정 사유, 충돌 방지, FIFO 재계산 및 다음 날 이월 재확인 안전장치를 유지한다.

## 현행 분석

### Evidence

| 영역                  | 현행 근거                                                                                                                       | 확인 내용                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 매출 구성             | `src/features/dashboard/components/hq-dashboard-table.tsx:752-803`                                                              | `장부 마감`, `이월`, `영업 합계`, `분석` 네 줄을 표시한다.                                                                                                       |
| 합산 매출             | `src/server/calculations/ledger.ts:44-49`, `:620-626`                                                                           | `operatingSales = totalSalesAmount + carryoverSalesAmount`가 이미 공용 계산으로 존재한다.                                                                        |
| 예상매출              | `src/features/dashboard/queries.ts:67-125`, `:751`                                                                              | 판매수량과 `StoreSalesPricePlan.plannedUnitPrice`를 사용한 `plannedSalesTotal`이 `analysisSalesAmount`로 전달된다.                                               |
| 재고금액              | `src/server/calculations/ledger.ts:484-509`, `:613-619`, `:820-827`                                                             | FIFO 잔액 합계를 우선 사용하고, FIFO가 없으면 수량 × 단가로 계산하는 `inventoryAmount`가 이미 존재한다. 한 품목이라도 계산할 수 없으면 부분합을 반환하지 않는다. |
| 마진 표시             | `src/features/dashboard/components/hq-dashboard-table.tsx:777-803`                                                              | 실제/예상 마진과 함께 `경보 기준`, 기준 미달 금액을 같은 셀에 표시한다.                                                                                          |
| 경보 계산             | `src/features/dashboard/queries.ts:995-1165`, `:1333-1368`                                                                      | 임계값은 이상 신호와 우선순위 계산에도 사용된다. 표시를 지워도 계산 자체는 유지할 수 있다.                                                                       |
| 마감 장부 차단        | `src/features/ledger/status-policy.ts:1-60`                                                                                     | `HEADQUARTERS_CLOSED`, `HOLIDAY`는 원본 수정 불가로 분류된다.                                                                                                    |
| 본사 저장 경로        | `src/features/ledger/hq-edit-actions.ts`, `src/features/inventory/hq-edit-actions.ts`, `src/features/losses/hq-edit-actions.ts` | 매출/결제, 지출, 매입, 근무, 급여, 재고, 재고조정, 손실 저장 경로가 이미 있고 사유·감사·낙관적 잠금을 사용한다.                                                  |
| 마감 장부 정정        | `src/app/app/ledgers/[ledgerId]/page.tsx:176-389`                                                                               | 현재는 마감 장부의 원본 수정 대신 제한된 `CorrectionRecord`만 추가한다. 매입 행과 판매한 가격 등은 정정 대상에 포함되지 않는다.                                  |
| 권한 모델             | `prisma/schema.prisma:28-39`, `src/server/authz.ts:113-198`                                                                     | 역할명이나 이메일이 아니라 `PermissionAction` 기반으로 action 권한을 검사한다.                                                                                   |
| 마스터 프로파일       | `prisma/seed.ts:16-56`                                                                                                          | `OWNER`, `HQ_ADMIN`, `HQ_STAFF`가 분리되어 있으나 마감 장부 직접 수정 전용 권한은 없다.                                                                          |
| 다음 날 재고 안전장치 | `src/features/inventory/queries.ts:586-617`                                                                                     | 앞 장부의 재고가 바뀌면 뒤 장부를 자동 덮어쓰지 않고 `CARRYOVER_RECHECK_REQUIRED`로 표시할 수 있다.                                                              |
| 판매한 가격 저장      | `src/features/inventory/actions.ts:184-261`                                                                                     | 판매한 가격은 장부 행이 아니라 지점/영업일/품목별 `StoreSalesPricePlan`에 저장된다. 현재 본사 재고 저장 schema에는 이 필드가 없다.                               |

### Inference

- 관리자 홈 변경은 새 계산식을 만들 필요 없이 기존 `operatingSales`, `plannedSalesTotal`, `inventoryAmount`를 행 DTO에 연결하고 라벨을 정리하는 작업이다.
- “마감된 장부의 모든 내용 수정”은 현재 제한된 정정 overlay만 확장해서는 충족하기 어렵다. 매입 행 추가·삭제, 판매한 가격, 다음 날 재고 이월 근거는 원본 업무 데이터와 연결되므로 마스터 전용 직접 수정 경로가 필요하다.
- 모든 본사 사용자에게 마감 장부 수정을 허용하면 기존 `HQ_STAFF`까지 권한이 확대된다. 요청의 “마스터 계정” 의미를 지키려면 별도 action 권한이 필요하다.
- 과거 재고를 수정한 뒤 미래 장부를 자동 변경하면 이미 입력한 실제 수량을 덮어쓸 수 있다. 기존 `CARRYOVER_RECHECK_REQUIRED` 정책을 유지하는 편이 안전하다.

### Unknowns / limits

- 요청의 “전일 이월금”과 현행 확정 계약의 `carryoverSalesAmount` 의미가 다를 수 있다. 현행 계약은 “해당 영업일 마감 뒤 발생한 이월 매출을 같은 영업일 성과에 합산하고 다음 날에는 다시 더하지 않는다”이다.
- 본 문서는 기존 확정 계약 A를 유지해 `매출 = totalSalesAmount + carryoverSalesAmount`로 설계한다. 실제로 전일 장부의 이월 값을 다음 날에 다시 더하려는 요청이라면 매출·결제 대사·리포트 계약을 별도로 재설계해야 한다.

## 결정 사항

### D1. 관리자 홈의 매출 구성

`매출 구성` 컬럼은 다음 세 줄만 표시한다.

```text
매출       110,000원
예상매출    98,000원
재고금액   350,000원
```

| 표시     | 서버 값                    | 규칙                                                                         |
| -------- | -------------------------- | ---------------------------------------------------------------------------- |
| 매출     | `row.operatingSalesAmount` | `totalSalesAmount + carryoverSalesAmount`. 이월 금액을 별도 표시하지 않는다. |
| 예상매출 | `row.analysisSalesAmount`  | 기존 `분석` 값과 계산은 유지하고 라벨만 `예상매출`로 바꾼다.                 |
| 재고금액 | `row.inventoryAmount`      | 선택일 장부의 correction-aware `reviewSummary.inventoryAmount`를 사용한다.   |

추가 규칙:

- `장부 마감`, `이월`, `영업 합계`, `분석` 라벨은 관리자 홈에서 제거한다.
- `closingSalesAmount`, `carryoverSalesAmount`는 계산·리포트·정정 계약에 계속 필요하므로 데이터 모델에서 삭제하지 않는다.
- 재고금액을 클라이언트에서 다시 합산하지 않는다.
- 부분 재고금액은 정상 금액처럼 표시하지 않는다.
- 화폐 형식은 기존 `ko-KR` 원화 포맷과 tabular number 스타일을 재사용한다.

### D2. 재고금액의 날짜와 상태

재고금액은 “화면에서 선택한 일자의 장부 마감 재고”를 뜻한다.

| 장부 상태                    | 표시                                                                   |
| ---------------------------- | ---------------------------------------------------------------------- |
| `HEADQUARTERS_CLOSED`        | FIFO 기준 재고 총액. 정정 또는 마스터 직접 수정 반영 후 다시 계산한 값 |
| `IN_PROGRESS`                | `마감 전`                                                              |
| `IN_REVIEW`                  | `마감 전`                                                              |
| `HOLIDAY`                    | `해당 없음`                                                            |
| 장부 없음                    | `데이터 부족`                                                          |
| 마감 장부이나 계산 근거 부족 | 기존 metric의 `데이터 부족` 또는 `계산 불가` 라벨                      |

이 설계는 미확정 장부의 변동 재고액을 확정값처럼 보이지 않게 한다.

### D3. 실제 / 예상 마진율

표시는 다음 한 줄만 유지한다.

```text
실제 35.9% / 예상 34.4%
```

제거 대상:

- `경보 기준 90.0%`
- `90.0% 기준 미달 금액 ...`

유지 대상:

- 임계값 설정 화면
- 임계값 저장값
- 이상 신호 계산
- 확인 필요 필터와 문제 우선순위
- 임계값 미달 여부에 따른 경고 상태

즉, 경보 기준은 화면의 반복 설명에서만 숨기고 업무 규칙에서는 제거하지 않는다.

### D4. 마스터 계정의 정의

이메일, 사용자 ID 또는 화면 표시명으로 마스터를 판별하지 않는다.

새 권한 action을 추가한다.

```text
PermissionAction.LEDGER_CLOSED_EDIT
```

기본 부여:

| 프로파일         | 부여 여부 |
| ---------------- | --------- |
| `OWNER`          | 허용      |
| `HQ_ADMIN`       | 허용      |
| `HQ_STAFF`       | 불허      |
| `CLOSE_MANAGER`  | 불허      |
| `HQ_READONLY`    | 불허      |
| `SETTINGS_ADMIN` | 불허      |
| `STORE_MANAGER`  | 불허      |

기본 seed 본사 관리자 계정은 `HQ_ADMIN`을 가지므로 마스터 수정 기능을 사용할 수 있다.

서버 권한 조건:

1. 활성 `HEADQUARTERS` 사용자
2. 대상 지점이 사용자의 지점 접근 범위에 포함
3. 일반 장부 수정은 `LEDGER_EDIT`
4. `HEADQUARTERS_CLOSED` 수정은 `LEDGER_EDIT`와 `LEDGER_CLOSED_EDIT`를 모두 만족

### D5. 수정 가능한 범위

마스터는 `HEADQUARTERS_CLOSED` 장부에서 다음 업무 내용을 직접 수정할 수 있다.

- 매입
  - 수동 매입 행 추가·수정·삭제
  - 이카운트 행의 장부 적용 단가 보정
  - 기존 이카운트 원본 추적 정책 유지
- 손실
  - 손실 행 추가·수정·삭제
  - 수량, 회수금액, 사유 등 현행 편집 필드
- 재고
  - 품목 추가·삭제
  - 당일재고, 표시재고, 재고조정 사유
  - 판매한 가격 `StoreSalesPricePlan.plannedUnitPrice`
- 지출
  - 지출 행 추가·수정·삭제
- 근무
  - 근무인원, 업무 메모
  - 직원별 급여·지각·조퇴·특이사항 행
- 매출/결제
  - 장부 마감 매출
  - 이월 매출
  - 현금·카드·기타 결제

직접 수정하지 않는 시스템 정보:

- `ledgerId`, `storeId`, `closingDate`
- `status`, `closedAt`, `closedById`
- `createdAt`, `createdById`
- 이카운트 원본 파일·원본 행·원본 단가
- 기존 감사 로그와 과거 정정 이력

`HOLIDAY` 장부는 이번 범위에서 계속 읽기 전용이다.

### D6. 마감 상태 보존

- 마스터가 내용을 수정해도 장부 status는 `HEADQUARTERS_CLOSED`를 유지한다.
- 재오픈, 재제출, 재마감 단계를 만들지 않는다.
- `closedAt`, `closedById`는 최초 마감 기록으로 보존한다.
- `updatedAt`, `updatedById`, `version`은 각 저장마다 갱신한다.
- 화면에는 “마감 상태 유지 · 마스터 수정” 안내를 표시한다.

### D7. 수정 사유, 감사 및 충돌

모든 마감 장부 직접 저장은 기존 본사 수정 계약을 그대로 따른다.

- 수정 사유 필수, 공백 제거 후 1~500자
- 서버에서 권한과 장부 상태를 다시 검증
- `ledgerUpdatedAt` 또는 version 기반 낙관적 잠금
- stale 저장은 기존 conflict dialog로 차단
- 저장과 감사 로그를 같은 DB 트랜잭션에서 처리
- 감사 로그의 `before`는 사용자가 편집 화면에서 본 유효값, `after`는 저장된 유효값
- action 이름은 기존 section별 action을 유지하거나 `.closed` 문맥을 명확히 추가한다.
  - 예: `ledger.hq.sales_payment.updated`
  - 감사 payload에 `ledgerStatusAtEdit: "HEADQUARTERS_CLOSED"`와 `closedEdit: true`를 추가

### D8. 기존 정정 기록과 직접 수정의 공존

마감 장부에는 이미 `CorrectionRecord`가 있을 수 있으므로 이전 정정값이 새 원본 저장을 다시 덮어쓰지 않게 해야 한다.

채택 정책:

1. 마스터 편집 폼은 원본값이 아니라 활성 정정이 반영된 유효값을 초기값으로 사용한다.
2. 탭을 직접 저장하면 해당 탭의 활성 정정값을 원본 업무 데이터에 통합한다.
3. 통합된 정정 기록은 삭제하지 않고 `superseded` 상태로 보존한다.
4. 대시보드·리포트·상세 overlay는 활성 정정만 읽는다.
5. 원가·매출·재고 입력을 직접 수정하면 기존 `CALCULATED_METRIC` 정정은 더 이상 유효하지 않으므로 함께 supersede하고 서버 계산값을 다시 사용한다.

필요 schema 확장:

```text
CorrectionRecord.supersededAt       DateTime?
CorrectionRecord.supersededById     String?
CorrectionRecord.supersedeReason    String?
```

화면 안내:

```text
이 탭에는 기존 정정 2건이 반영되어 있습니다.
저장하면 현재 반영값을 장부 원본에 통합하고 기존 정정은 이력으로 보존합니다.
```

### D9. 재고, FIFO 및 미래 장부 영향

과거 장부의 매입·손실·재고를 저장하면 현재 장부 안에서는 다음을 같은 트랜잭션에서 재계산한다.

- 재고 조정 정합성
- FIFO lot snapshot
- 품목별 `inventoryAmount`
- 장부 총 재고금액
- 매출원가
- 실제 마진율
- 예상매출 및 예상 마진율
- 이상 신호

미래 장부 정책:

- 이미 저장된 다음 날 장부의 실제 입력값은 자동으로 덮어쓰지 않는다.
- 다음 날 `previousQuantity`와 수정된 앞 장부 재고가 다르면 기존 로직대로 `CARRYOVER_RECHECK_REQUIRED`를 표시한다.
- 마스터는 영향받은 다음 장부를 열어 실제 수량을 확인한 뒤 별도 사유로 수정한다.
- 대시보드와 마감 preflight는 재확인 필요 상태를 계속 경고한다.

### D10. 판매한 가격 수정

판매한 가격은 `LedgerInventoryItem`이 아니라 `StoreSalesPricePlan`에 저장되므로 마감 장부 재고 저장 payload에 명시적으로 포함해야 한다.

- 본사 마감 장부 편집용 inventory schema에 `plannedUnitPrice`를 추가한다.
- 지점장 저장과 본사 저장이 동일한 공유 persistence 함수를 사용하도록 현재 private upsert 로직을 추출한다.
- 키는 `(storeId, closingDate, productId)`를 유지한다.
- 수정 후 예상매출과 예상 마진율을 즉시 재계산한다.
- 다음 날에 이미 별도 판매한 가격이 저장돼 있으면 자동 변경하지 않는다.
- 과거 날짜의 가격 수정은 해당 날짜 리포트·대시보드에만 즉시 반영한다.

## Brand

- Personality: 정확하고 절제된 내부 운영 도구
- Trust signals:
  - 금액과 비율의 출처를 서버 계산 계약으로 고정
  - 마감 상태, 수정자, 수정 시각, 수정 사유를 명확히 표시
  - 계산 불가와 0을 구분
- Avoid:
  - 같은 값을 `장부 마감`, `영업 합계`, `매출`처럼 중복 표시
  - 임계값을 여러 줄로 반복 노출
  - 마감 장부 수정이 일반 수정처럼 보이는 표현
  - 과거 수정이 미래 장부를 조용히 덮어쓰는 동작

## Product goals

- Goals:
  - 관리자 홈에서 매출, 예상매출, 재고금액을 한눈에 비교한다.
  - 실제/예상 마진율에 집중하고 이미 아는 경보 기준 반복 표시를 줄인다.
  - 마스터가 운영 실수를 발견한 즉시 과거 마감 장부의 업무 내용을 바로잡는다.
  - 수정 후 계산·리포트·이월 상태가 일관되게 갱신된다.
- Non-goals:
  - 이월 매출 계약 A 변경
  - 모든 본사 직원에게 마감 장부 수정 권한 부여
  - 휴무 장부 편집
  - 과거 수정 후 미래 장부 자동 덮어쓰기
  - 지점장에게 FIFO 원가나 재고금액 노출
  - 감사 로그 삭제 또는 과거 이력 변경
- Success signals:
  - 대시보드 매출 구성에 요청한 세 값만 표시된다.
  - 경보 기준 문구가 없어도 이상 신호와 정렬 결과는 기존과 같다.
  - 마스터가 모든 업무 탭을 수정하고 장부는 계속 마감 상태다.
  - 권한 없는 본사와 지점장은 동일 작업을 할 수 없다.
  - 과거 재고 수정 뒤 다음 날 입력은 보존되고 재확인 상태만 표시된다.

## Personas and jobs

- Primary personas:
  - 마스터/본사 관리자: 전 지점 운영 데이터와 권한을 책임진다.
  - 본사 스텝: 배정 지점의 진행 중 장부를 보완한다.
  - 본사 조회 전용 사용자: 관제와 리포트만 확인한다.
  - 지점장: 당일 장부를 입력하고 제출한다.
- User jobs:
  - 마스터: 전날 재고 또는 판매한 가격 오기입을 발견하면 과거 장부를 즉시 바로잡고 영향 범위를 확인한다.
  - 본사 사용자: 관리자 홈에서 지점별 매출·예상매출·재고금액·마진을 빠르게 비교한다.
- Key contexts of use:
  - 아침 회의 전 전날 마감 결과 확인
  - 다음 날 이월 재고 이상 발견
  - 지점의 판매한 가격 또는 결제 입력 실수 신고

## Information architecture

- Primary navigation:
  - `관제판` → 지점 행 → `장부 상세`
  - 장부 상세 → 매입 / 손실 / 재고 / 지출 / 근무 / 매출·결제
  - 기준정보 → 변경 이력
- Core routes/screens:
  - `/app/dashboard`
  - `/app/ledgers/[ledgerId]`
  - `/app/master-data/history`
- Content hierarchy:
  1. 선택일과 지점 상태
  2. 매출 구성과 실제/예상 마진
  3. 이상 신호
  4. 장부 상세와 수정 가능 여부
  5. 수정 사유와 감사 이력

## Design principles

- Principle 1: 계산은 서버 한 곳에서 하고 UI는 라벨과 상태만 렌더링한다.
- Principle 2: 마감 장부 수정은 허용하되 흔적을 지우지 않는다.
- Principle 3: 과거 수정은 미래 입력을 자동 덮어쓰지 않는다.
- Principle 4: 권한은 계정명이 아니라 명시적 capability로 판정한다.
- Tradeoffs:
  - 직접 수정은 운영 복구 속도를 높이지만 데이터 영향 범위가 커진다. 강한 권한, 사유, 감사, 충돌 검사를 필수로 한다.
  - 미래 장부 자동 연쇄 수정 대신 재확인 상태를 사용하므로 운영자가 한 번 더 확인해야 하지만 실제 입력 보존을 우선한다.

## Visual language

- Color:
  - 기존 `primary`, `warning`, `destructive`, `success`, `muted` token만 사용한다.
  - 마스터 수정 안내는 warning 계열, 저장 실패는 destructive 계열을 사용한다.
- Typography:
  - 기존 Inter / Apple SD Gothic Neo / Noto Sans KR 체계를 유지한다.
  - 금액과 비율은 tabular numbers를 유지한다.
- Spacing/layout rhythm:
  - 기존 대시보드 표와 모바일 카드 간격을 유지한다.
  - 매출 구성은 세 줄, 마진은 한 줄을 기본으로 한다.
- Shape/radius/elevation:
  - 기존 shadcn 카드, 표, Alert 스타일을 재사용한다.
- Motion:
  - 새 애니메이션을 추가하지 않는다.
- Imagery/iconography:
  - 이미지가 필요하지 않은 내부 데이터 화면이다.

## Components

- Existing components to reuse:
  - `HqDashboardTable`
  - `DashboardSignalSummary`
  - `DashboardStatusBadge`
  - `LedgerDetailTabs`
  - `HqEditReasonField`
  - `SaveConflictDialog`
  - 매입/손실/재고/지출/근무/매출 입력 client
  - `Alert`, `Badge`, `Button`, `Table`
- New/changed components:
  - `SalesCell`: 매출/예상매출/재고금액 세 줄
  - `MarginCell`: 실제/예상 한 줄
  - 마감 장부 편집 경고 및 기존 정정 통합 안내
  - 공용 입력 client의 `allowHeadquartersClosedEdit` 계열 prop
- Variants and states:
  - 일반 편집 가능
  - 마스터 마감 장부 편집 가능
  - 조회 전용
  - 미래 이월 재확인 필요
  - stale conflict
- Token/component ownership:
  - 새 전역 디자인 token을 만들지 않는다.
  - 권한 판정은 서버 authz/status policy가 소유하고 client prop은 표시 제어만 담당한다.

## Accessibility

- Target standard: 기존 WCAG 2.1 AA 수준 유지
- Keyboard/focus behavior:
  - 표 행, 상세 링크, 탭, 저장 버튼의 기존 키보드 동작을 유지한다.
  - 저장 오류는 첫 오류 필드로 포커스를 이동한다.
  - conflict dialog와 마감 장부 경고는 스크린 리더가 읽을 수 있어야 한다.
- Contrast/readability:
  - muted 텍스트도 기존 token 대비를 유지한다.
  - 경고를 색만으로 전달하지 않고 `마감 상태 유지`, `수정 사유 필수` 문구를 함께 표시한다.
- Screen-reader semantics:
  - 모바일 `<dt>/<dd>` 라벨을 데스크톱 컬럼명과 일치시킨다.
  - `실제 / 예상 마진율`을 모바일에서도 단순 `마진율`로 축약하지 않는다.
- Reduced motion and sensory considerations:
  - 새 motion 없음
  - 자동 갱신 후 값 변화는 기존 새로고침 상태 텍스트로 전달한다.

## Responsive behavior

- Supported breakpoints/devices:
  - 기존 390px 모바일 E2E 기준
  - `md` 이상 표 레이아웃
- Layout adaptations:
  - 데스크톱: `매출 구성` 셀에 세 줄 표시
  - 모바일: 같은 세 줄을 `<dl>` 안에 표시
  - 마진은 실제/예상 한 줄을 우선하고 좁은 폭에서 자연스럽게 줄바꿈한다.
- Touch/hover differences:
  - 모바일에서도 행 전체 이동과 상세 링크의 기존 터치 영역을 유지한다.
  - 컬럼 리사이즈는 데스크톱 동작을 유지한다.

## Interaction states

- Loading:
  - 기존 대시보드 및 장부 loading UI를 유지한다.
- Empty:
  - 장부 없음: `데이터 부족`
  - 마감 전 재고금액: `마감 전`
- Error:
  - 권한 없음: `/app/unauthorized`
  - stale version: 기존 저장 충돌 dialog
  - 계산 근거 부족: `데이터 부족` 또는 `계산 불가`
- Success:
  - `마감 장부 내용을 저장했습니다. 마감 상태는 유지됩니다.`
  - 기존 정정 통합 시 통합 건수도 알린다.
- Disabled:
  - 권한 없는 사용자, 휴무 장부, 저장 중 상태
- Offline/slow network, if applicable:
  - 별도 offline 저장은 만들지 않는다.
  - 중복 제출 방지를 위해 저장 중 버튼을 비활성화한다.

## Content voice

- Tone: 짧고 직접적인 운영 문구
- Terminology:
  - `매출`
  - `예상매출`
  - `재고금액`
  - `실제 / 예상 마진율`
  - `마스터 수정`
  - `이월 재확인 필요`
- Microcopy rules:
  - `분석`처럼 목적이 불명확한 단어를 금액 라벨로 사용하지 않는다.
  - 0원과 데이터 부족을 구분한다.
  - “수정 가능”만 쓰지 않고 마감 상태가 유지됨을 함께 알린다.
  - 이월 매출의 별도 금액을 관리자 홈에 노출하지 않는다.

## Implementation constraints

- Framework/styling system:
  - Next.js 15, React 19, TypeScript, Prisma, PostgreSQL
  - Tailwind CSS 4, shadcn/ui
- Design-token constraints:
  - 기존 CSS 변수와 컴포넌트 variant를 재사용한다.
- Performance constraints:
  - 대시보드의 재고금액은 기존 ledger 조회와 `calculateLedgerReviewSummary` 결과를 재사용한다.
  - 행별 추가 DB 조회를 만들지 않는다.
  - 판매한 가격은 기존 bulk lookup을 유지한다.
- Compatibility constraints:
  - `closingSalesAmount`, `carryoverSalesAmount`, CorrectionRecord 과거 데이터와 기존 export 계약을 보존한다.
  - 새 permission action migration 후 system profile seed/upsert를 함께 갱신한다.
  - client의 편집 허용 prop은 기본값 `false`로 두어 지점장 경로가 열리지 않게 한다.
- Test/screenshot expectations:
  - 단위 테스트 → typecheck/lint → dashboard/HQ ledger E2E 순으로 검증한다.
  - 390px 모바일 대시보드에서 가로 넘침과 라벨 겹침이 없어야 한다.

## 권한 및 상태 정책

| 사용자/권한                                                |        진행 중 |      검토 대기 | 본사 마감 | 휴무 |
| ---------------------------------------------------------- | -------------: | -------------: | --------: | ---: |
| OWNER 또는 HQ_ADMIN + `LEDGER_EDIT` + `LEDGER_CLOSED_EDIT` |           수정 |           수정 |      수정 | 조회 |
| HQ_STAFF + `LEDGER_EDIT`                                   |           수정 |           수정 |      조회 | 조회 |
| CLOSE_MANAGER                                              |      조회/마감 |      조회/마감 |    정정만 | 조회 |
| HQ_READONLY                                                |           조회 |           조회 |      조회 | 조회 |
| STORE_MANAGER                                              | 기존 당일 정책 | 기존 당일 정책 |      조회 | 조회 |

## 데이터 흐름

### 관리자 홈

```text
DailyLedger + inventory/loss/expense rows + active corrections
  → calculateLedgerReviewSummary()
  → operatingSales
  → plannedSalesTotal
  → inventoryAmount
  → grossMarginRate / plannedGrossMarginRate
  → HqDashboardRow
  → SalesCell / MarginCell
```

### 마감 장부 직접 수정

```text
권한 확인
  → 지점 scope 확인
  → ledger row lock + version 확인
  → active correction이 반영된 유효값 조회
  → section 입력 검증
  → 원본 업무 데이터 저장
  → 관련 correction supersede
  → 재고조정/FIFO/재고금액/마진 재계산
  → updatedAt/version/updatedBy 갱신
  → 같은 transaction에서 audit log 저장
  → dashboard/report/store-entry revalidate
```

## 예상 변경 파일

| 파일                                                       | 설계상 변경                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| `prisma/schema.prisma`                                     | `LEDGER_CLOSED_EDIT`, CorrectionRecord supersede 필드      |
| `prisma/seed.ts`                                           | OWNER/HQ_ADMIN 권한 부여                                   |
| `tests/e2e/global-setup.ts`                                | 테스트 프로파일 권한 반영                                  |
| `src/server/authz.ts`                                      | 마감 장부 수정 권한 helper                                 |
| `src/features/ledger/status-policy.ts`                     | 사용자 권한 문맥을 받는 본사 편집 정책                     |
| `src/features/dashboard/types.ts`                          | `inventoryAmount` metric 추가                              |
| `src/features/dashboard/queries.ts`                        | correction-aware inventoryAmount 전달, 마감 상태 표시 규칙 |
| `src/features/dashboard/components/hq-dashboard-table.tsx` | 매출 구성·마진 문구 변경                                   |
| `src/app/app/ledgers/[ledgerId]/page.tsx`                  | 마스터 마감 편집 UI, 기존 정정 통합 안내                   |
| `src/features/ledger/hq-edit-actions.ts`                   | 마감 장부 조건부 직접 저장                                 |
| `src/features/inventory/hq-edit-actions.ts`                | 마감 장부 재고 및 판매한 가격 저장                         |
| `src/features/losses/hq-edit-actions.ts`                   | 마감 장부 손실 저장                                        |
| `src/features/inventory/actions.ts`                        | 판매한 가격 persistence 공유 추출                          |
| `src/features/corrections/queries.ts`                      | active correction만 overlay                                |
| `src/features/corrections/actions.ts`                      | superseded correction 재활성화 방지                        |
| 공용 입력 client                                           | 서버에서 전달한 마스터 마감 편집 허용 prop 반영            |
| 관련 unit/E2E 테스트                                       | 표시, 권한, 감사, 충돌, 재계산, 이월 재확인 회귀           |

## 검증 및 수용 기준

### 관리자 홈

- [ ] `매출 구성`에 `매출`, `예상매출`, `재고금액`만 표시한다.
- [ ] 별도 `이월`, `장부 마감`, `영업 합계`, `분석` 문구가 없다.
- [ ] 매출은 기존 합산 매출과 같다.
- [ ] 예상매출 계산식은 기존 분석 매출과 같다.
- [ ] 본사 마감 장부의 재고금액은 FIFO 기준 총액과 같다.
- [ ] 미마감 장부는 재고금액 대신 `마감 전`을 표시한다.
- [ ] 재고 근거가 하나라도 부족하면 부분합을 정상 금액으로 표시하지 않는다.
- [ ] `실제 / 예상 마진율`은 유지된다.
- [ ] `경보 기준`과 기준 미달 금액 문구는 표시되지 않는다.
- [ ] 경보 신호, 확인 필요 필터, 문제 우선순 결과는 기존과 같다.
- [ ] 390px 화면에서 세 금액과 마진 라벨이 겹치거나 잘리지 않는다.

### 마감 장부 수정

- [ ] OWNER/HQ_ADMIN만 본사 마감 장부의 입력 컨트롤과 저장 action을 사용할 수 있다.
- [ ] HQ_STAFF, CLOSE_MANAGER, HQ_READONLY, STORE_MANAGER는 마감 장부 원본을 수정할 수 없다.
- [ ] 매입, 손실, 재고, 지출, 근무, 급여, 매출/결제를 수정할 수 있다.
- [ ] 재고 탭에서 해당 날짜의 판매한 가격을 수정할 수 있다.
- [ ] 저장 뒤 장부 status와 최초 마감 정보는 유지된다.
- [ ] 수정 사유 없이는 저장되지 않는다.
- [ ] stale 저장은 거부되고 최신 서버 값이 보존된다.
- [ ] 감사 로그에 수정자, 사유, before/after, 마감 장부 수정 문맥이 남는다.
- [ ] 기존 정정이 있는 탭은 유효값을 초기값으로 보여준다.
- [ ] 직접 저장한 탭의 기존 정정은 삭제되지 않고 superseded 이력으로 남는다.
- [ ] 재고 관련 수정 뒤 FIFO, 재고금액, 실제/예상 마진, 대시보드와 리포트가 갱신된다.
- [ ] 다음 날 장부의 기존 실제 입력은 자동으로 바뀌지 않는다.
- [ ] 다음 날 이월 근거가 달라지면 `이월 재확인 필요`가 표시된다.
- [ ] 휴무 장부는 계속 원본 수정 불가다.

## 테스트 계획

### Unit

1. `HqDashboardRow.inventoryAmount`가 `reviewSummary.inventoryAmount`를 사용한다.
2. 마감 상태별 재고금액 표시 규칙을 검증한다.
3. `SalesCell`에 별도 이월과 분석 문구가 없고 세 새 라벨이 있다.
4. `MarginCell`이 실제/예상만 표시하고 threshold를 렌더링하지 않는다.
5. threshold 기반 signal/priority 계산이 유지된다.
6. `LEDGER_CLOSED_EDIT` 권한 매트릭스를 검증한다.
7. HQ 저장 action은 권한이 있을 때만 `HEADQUARTERS_CLOSED`를 허용하고 `HOLIDAY`는 거부한다.
8. 판매한 가격 shared upsert가 과거 영업일 키를 유지한다.
9. 직접 저장 시 해당 correction이 supersede되고 다른 탭 correction은 유지된다.
10. FIFO 재계산과 다음 날 `CARRYOVER_RECHECK_REQUIRED` 판정을 검증한다.

### E2E

1. 마감 장부가 있는 지점의 관리자 홈에서 세 금액과 실제/예상 마진을 확인한다.
2. 미마감·휴무·장부 없음 상태 문구를 확인한다.
3. 마스터가 6개 탭과 급여를 수정하고 저장 결과와 감사 로그를 확인한다.
4. 판매한 가격 수정 후 예상매출과 예상 마진이 바뀌는지 확인한다.
5. 재고 수정 후 재고금액과 실제 마진이 바뀌는지 확인한다.
6. 기존 correction이 있는 값을 직접 수정하고 중복 overlay가 생기지 않는지 확인한다.
7. HQ_STAFF와 조회 전용 본사의 direct URL/server action을 차단한다.
8. 지점장 direct URL을 차단한다.
9. 두 브라우저 stale 저장 충돌을 확인한다.
10. 과거 재고 수정 후 다음 날 값은 보존되고 재확인 상태가 표시되는지 확인한다.

## 배포 및 데이터 호환

1. Prisma enum과 nullable supersede 필드를 먼저 배포한다.
2. 기존 CorrectionRecord는 `supersededAt = null`이므로 모두 활성 이력으로 호환된다.
3. system permission profile에 새 action을 upsert한다.
4. 실제 마스터 계정이 `HQ_ADMIN` 또는 `OWNER`를 보유하는지 배포 전 확인한다.
5. 기존 `LEDGER_EDIT`만 가진 HQ_STAFF에는 새 권한을 자동 부여하지 않는다.
6. 과거 장부나 기존 감사 로그를 일괄 변경하지 않는다.
7. 기능 배포 후 대표 마감 장부 한 건으로 매출·재고·가격 수정과 다음 날 재확인 흐름을 smoke test한다.

## Open questions

- [ ] 운영 확인: 요청의 “전일 이월금 포함”이 현행 계약 A의 당일 이월 매출 합산을 뜻하는지 확인한다. 다를 경우 본 문서의 매출 계산 계약만 별도 개정한다. / Owner: 운영 책임자 / Impact: 매출·결제·리포트 전 범위
- [ ] 운영 확인: `IN_REVIEW` 장부에도 재고금액을 잠정값으로 보여줄지 확인한다. 본 설계 기본값은 마감 장부만 금액 표시다. / Owner: 본사 운영 / Impact: 관리자 홈 표시만
