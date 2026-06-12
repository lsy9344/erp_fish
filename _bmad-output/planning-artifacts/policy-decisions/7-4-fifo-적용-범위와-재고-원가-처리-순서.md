# Story 7.4 FIFO 적용 범위와 재고 원가 처리 순서 정책

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 작성일 | 2026-06-12 |
| 작성자 | GPT-5 Codex Dev Agent |
| 검토자 | Noah Lee, 본사 운영자 |
| 승인자 | Noah Lee(개발 리드) 승인 대기, 본사 운영자 승인 대기 |
| 승인 상태 | 승인 대기 |
| 관련 OQ | OQ-7 FIFO 계산은 모든 품목에 적용하는가, 일부 품목에만 적용하는가? / OQ-17 FIFO 계산을 이카운트와 맞출 때 반품, 조정, 폐기, 떨이 처리 순서는 어떤 정책을 따를 것인가? |
| 관련 FR | FR-9, FR-10, FR-11, FR-13 |
| 관련 CAP | CAP-6, CAP-7, CAP-8 |
| 관련 story | Story 7.4, 후속 후보 MVP-S07 또는 CAP-7 구현 story |
| 적용 범위 | FIFO 적용 대상/예외, 수동/업로드 매입 lot 생성과 우선순위, 반품/조정/폐기/떨이/손실 처리 순서, 이월/마감/정정 재확인 규칙 |
| 구현 승격 여부 | 조건부. 아래 "MVP-S07 또는 CAP-7 구현 story 생성 가능" 조건을 모두 만족해야 한다. |

이 문서는 제품 동작 구현 산출물이 아니다. `src/`, `prisma/`, `tests/` 코드는 이 정책 산출물만으로 변경하지 않는다. 승인 전 기존 시스템은 MVP 기본 계산값과 `기준 확인 필요` policy gate를 유지하고, FIFO 확정 원가, FIFO 재고금액, lot 근거 패널, 상품 분석 구현을 시작하지 않는다.

## Traceability

- OQ-7/OQ-17 결정 링크: `_bmad-output/planning-artifacts/policy-decisions/7-4-fifo-적용-범위와-재고-원가-처리-순서.md`
- PRD Open Questions 근거: `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#10 Open Questions`
- CAP-7 근거: `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#CAP-7: FIFO 재고 금액 계산과 매입 잔량 이력`
- 계산 공통 규칙: `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#4.3 계산과 검증`
- Epic 근거: `_bmad-output/planning-artifacts/epics.md#Story 7.4: FIFO 적용 범위와 재고 원가 처리 순서 확정`
- 품목 정규화 의존 정책: `_bmad-output/planning-artifacts/policy-decisions/7-3-품목명-구분-규격-정규화-기준.md`
- 현재 policy gate: `src/server/calculations/policy-gates.ts`의 `fifoCostOfGoodsSold`, `fifoInventoryAmount`
- 현재 기본 계산: `src/server/calculations/inventory.ts`의 `calculateInventoryAmount(quantity, unitPrice)`와 `calculateSystemInventoryQuantity`
- 현재 매입 source 제한: `prisma/schema.prisma`의 `LedgerPurchaseSource = MANUAL`

## 정책 결정 요약

| 결정 항목 | 결정 |
| --- | --- |
| OQ-7 적용 범위 | FIFO 확정 계산은 모든 품목 자동 적용이 아니라 승인된 정규 품목 중 lot 근거가 완전한 품목에만 적용한다. |
| 기본 제외 | mapping 실패, 검토 필요, 기준 단가/매입 lot 누락, 단위 불명확, 음수 lot 발생, 승인자 없음 상태는 FIFO 확정 계산에서 제외한다. |
| 승인 전 표시 | 승인 전에는 기존 MVP 기본 계산값과 `기준 확인 필요`를 분리해 표시한다. FIFO 확정 원가나 FIFO 재고금액으로 이름을 바꾸지 않는다. |
| OQ-17 처리 순서 | 확정 이월 lot -> 매입 lot 생성 -> 반품/void -> 조정 증가 -> 판매 차감 -> 손실/폐기/떨이 차감 -> 조정 감소 -> 마감 snapshot 순서로 처리한다. |
| 수동/업로드 lot 우선순위 | 같은 품목/일자에서는 매입일자 우선, 그 다음 source 우선순위는 업로드 commit lot, 본사 수동 수정 lot, 지점 수동 lot 순으로 둔다. |
| 업로드 차단 조건 | `mapping_failed`, `needs_review`, `basis_missing`, `pending_review`, `revalidation_required` 상태나 단가 확인 필요 row는 FIFO 계산과 commit 확정 lot 생성을 막는다. |
| 마감/정정 원칙 | 마감 전 이월 후보는 확정 lot이 아니며, 마감 후에는 lot 잔량 snapshot과 재생성 기준점을 함께 저장한다. 정정은 원본 row를 덮어쓰지 않고 append-only 재확인 이벤트로 추적한다. |
| OQ close | 이 문서는 결정 초안이다. 본사 운영자와 개발 리드 승인자 이름, 승인일, 승인 근거가 기록되기 전에는 OQ-7/OQ-17 close를 주장하지 않는다. |

## FIFO 적용 범위와 예외 기준

### OQ-7 결정

FIFO는 모든 품목에 일괄 적용하지 않는다. MVP-S07 또는 CAP-7 후속 구현은 다음 조건을 모두 만족하는 품목만 FIFO 확정 계산 대상으로 삼는다.

| 조건 | FIFO 적용 여부 | 상태 표시 | 비고 |
| --- | --- | --- | --- |
| 정규 품목 `name/category/spec` 승인됨 | 적용 가능 | 확정 계산 가능 | Story 7.3 승인과 mapping version 필요 |
| 매입 lot source, 수량, 단가, 매입일자가 모두 있음 | 적용 가능 | 확정 계산 가능 | `PurchaseLot` 또는 동등한 lot record 필요 |
| 단가 다른 매입이 여러 개 있고 lot 잔량 추적 가능 | 적용 가능 | 확정 계산 가능 | CAP-7 핵심 대상 |
| mapping 상태가 `mapping_failed` | 적용 제외 | `기준 확인 필요` | 정규 품목이 없어 lot 귀속 불가 |
| mapping 상태가 `needs_review` | 적용 제외 | `검토 필요` 또는 `기준 확인 필요` | 본사 검수 승인 전 확정 금지 |
| mapping 상태가 `basis_missing` | 적용 제외 | `데이터 부족` | 단가, 수량, 규격, 매입일자 중 필수 근거 결측 |
| mapping 상태가 `pending_review` | 적용 제외 | `검토 필요` | 승인 대기 상태 |
| preview 이후 mapping/version 변경으로 `revalidation_required` | 적용 제외 | `재검증 필요` | reprocess 후 commit 필요 |
| 수량/단위가 음수, 0, 혼합 단위 등으로 해석 불가 | 적용 제외 | `계산 불가` 또는 `기준 확인 필요` | row-level 오류와 감사 로그 필요 |
| 본사 운영자가 정책 제외로 지정한 품목 | 적용 제외 | MVP 기본 계산값 또는 `기준 확인 필요` | 제외 사유와 재검토 조건 필요 |

### 일부 적용 기준

| 대상 구분 | 적용 대상 | 제외 품목/사유 | 후속 재검토 조건 |
| --- | --- | --- | --- |
| 일반 매입 수산물 | 정규 품목 승인, 매입 lot 추적 가능, 단가/수량/규격 확정 | 원문 품목만 있고 정규 mapping 없음 | Story 7.3 승인과 mapping migration 완료 |
| 단가 변동이 잦은 품목 | 같은 품목/규격에 복수 단가 lot 존재 | lot 잔량이 음수거나 매입일자 불명확 | lot replay가 음수 없이 통과 |
| 업로드 매입 품목 | commit 완료 import row, source row id, mapping version, 단가 확정 | preview-only, pending review, revalidation required | 재처리 후 본사 승인 |
| 수동 매입 품목 | 지점 또는 본사 수동 입력 row, 감사 이벤트 존재 | 단가 또는 수량 결측, 원문 혼합 품목 | 본사 수동 수정 승인과 lot 생성 근거 확보 |
| 손실/폐기/떨이 대상 품목 | 손실 유형과 수량이 확정되고 lot 차감 가능 | 손실 유형 불명확, 수량 초과 | 손실 코드 정책과 승인된 차감 순서 확보 |

### FIFO 미적용 품목의 표시

| 표면 | 표시 원칙 |
| --- | --- |
| 본사 장부 상세 | MVP 기본 계산값은 그대로 표시할 수 있지만 `FIFO 기준` 라벨을 붙이지 않는다. FIFO 값은 `기준 확인 필요`, `검토 필요`, `데이터 부족`, `계산 불가` 중 원인별 상태로 표시한다. |
| 본사 리포트/export | 확정 FIFO 컬럼은 승인 전 추가하지 않는다. 기존 리포트의 기본 재고/손익 계산과 FIFO 재고금액은 구분한다. |
| 지점장 화면/응답 | 원가, 매출원가, 재고금액, lot 근거는 Story 7.6/OQ-10A 승인 전 기본 차단이다. |
| lot trace panel | Extension B 후속 구현 전에는 표시하지 않는다. 승인 전 prototype도 확정 계산처럼 보이면 안 된다. |

## 매핑/단가 차단 조건

| 차단 조건 | FIFO 처리 | 표시/후속 조치 |
| --- | --- | --- |
| `mapping_failed` | 확정 계산 차단 | `기준 확인 필요`; 원문 품목 분리 또는 신규 mapping 필요 |
| `needs_review` | 확정 계산 차단 | `검토 필요`; 본사 운영자 mapping 승인 필요 |
| `basis_missing` | 확정 계산 차단 | `데이터 부족`; 단가, 수량, 규격, 매입일자 중 누락 근거 보완 필요 |
| `pending_review` | 확정 계산 차단 | `검토 필요`; 승인자와 승인 시각 기록 전 commit lot 생성 금지 |
| `revalidation_required` | 확정 계산 차단 | `재검증 필요`; mapping version 변경 후 reprocess 필요 |
| 단가 확인 필요 | 확정 계산 차단 | `기준 확인 필요`; 가격 신뢰 상태가 승인될 때까지 FIFO 원가/재고금액 미표시 |
| lot 잔량 부족 또는 음수 발생 | 저장 차단 또는 `계산 불가` | 신규 저장은 차단하고, 과거 replay 오류는 본사 승인 예외와 감사 로그 필요 |

## 매입 lot 생성 기준과 lot 우선순위

### Lot 생성 기준

| source | lot 생성 조건 | lot 필수 필드 | 생성하지 않는 조건 |
| --- | --- | --- | --- |
| 수동 매입 라인 | 장부 저장 또는 본사 수정이 완료되고 product/mapping, 매입일자, 수량, 단가가 확정됨 | storeId, productId, normalized key, purchaseDate, sourceType, source row id, unitPrice, originalQuantity, remainingQuantity, actor, audit event id | raw-only 품목, 단가 결측, mapping 검토 필요, 음수 수량, 승인 없는 본사 수정 |
| 이카운트 업로드 commit 라인 | preview 검증과 본사 commit이 완료되고 mapping version이 유효함 | importBatchId, source row id, source row order, mapping version, commit timestamp, productId, unitPrice, originalQuantity, remainingQuantity | preview-only, mapping_failed, needs_review, basis_missing, pending_review, revalidation_required, voided row |
| 본사 수동 수정 라인 | 기존 lot 조정이 아니라 append-only correction으로 승인됨 | correction id, target row id, before/after snapshot, reason, actor, timestamp | 원본 매입 row를 덮어쓰는 수정 |
| 확정 이월 | 본사 마감 후 확정된 이전 기간 lot 잔량 snapshot 존재 | carryover snapshot id, source close id, productId, remaining quantity by lot, unit cost | 마감 전 후보, 전일 장부 미마감, 정정 반영 재확인 필요 |

현재 `LedgerPurchaseSource`는 `MANUAL`만 있으므로, 업로드/FIFO 구현 story에서는 enum 확장 또는 별도 import lot source 모델이 필요하다. 이 정책 산출물만으로 `LedgerPurchaseSource`를 확장하지 않는다.

### 같은 품목/일자의 lot 우선순위

| 우선순위 | 비교 기준 | 설명 |
| --- | --- | --- |
| 1 | 매입일자 | 더 오래된 매입일자가 먼저 차감된다. |
| 2 | source 우선순위 | 같은 매입일자에서는 업로드 commit lot -> 본사 수동 수정 lot -> 지점 수동 lot 순서로 둔다. 업로드 commit은 이카운트 원문 순서를 보존하기 때문이다. |
| 3 | commit 시각 | 같은 source이면 commit 또는 저장 시각이 빠른 lot을 먼저 둔다. |
| 4 | 원문 source row | 같은 업로드 파일 안에서는 source row number가 낮은 row를 먼저 둔다. |
| 5 | split row | 하나의 source row가 split되면 parent source row 순서를 유지하고 split sequence가 낮은 lot부터 차감한다. |
| 6 | reprocess row | reprocess는 기존 preview lot을 확정 lot으로 바꾸지 않는다. 새 commit lot은 새 batch/version으로 생성하고, voided row는 잔량 0 및 excluded 상태로 남긴다. |
| 7 | 감사 이벤트 | 모든 동률은 audit event timestamp와 id로 안정 정렬한다. |

### 업로드 row 상태별 lot 영향

| row 유형 | lot 잔량 영향 | 처리 |
| --- | --- | --- |
| source row | commit 시 원문 순서대로 lot 생성 | 원문 row id와 order 보존 |
| split row | parent row 수량을 여러 lot으로 분할 | split 합계가 parent 수량과 같아야 commit 가능 |
| reprocess row | 이전 preview를 폐기하고 새 preview/commit 기준 생성 | 이전 preview는 확정 lot이 아니다 |
| voided row | 확정 lot 생성하지 않음 또는 correction lot으로 잔량 0 처리 | 원문과 void reason 보존 |
| duplicate row | idempotency key 충돌 시 commit 차단 | 중복 lot 생성 금지 |

## 반품, 조정, 폐기, 떨이, 손실의 FIFO 반영 순서

### OQ-17 처리 순서표

| 순서 | 이벤트 | lot 잔량 영향 | 원가/재고금액 영향 | 매출원가/손실 영향 | 상태/차단 |
| --- | --- | --- | --- | --- | --- |
| 0 | 전기 확정 이월 | 이전 마감 lot 잔량을 시작점으로 로드 | 시작 재고금액 산출 | 없음 | 마감 전 후보는 `기준 확인 필요` |
| 1 | 매입 lot 생성 | 수동/업로드 commit lot을 증가 | 매입 단가 기준 lot 원가 증가 | 없음 | mapping/단가 미확정 row는 차단 |
| 2 | 반품/void | 반품 대상 lot을 잔량에서 제거하거나 매입 취소 correction으로 표시 | 원 lot 원가를 역분개 | 매출원가가 아니라 매입 차감 | 대상 lot 불명확 시 `기준 확인 필요` |
| 3 | 조정 증가 | 본사 승인 correction lot을 새 lot으로 append | 승인 단가로 재고금액 증가 | 없음 | 단가 기준 없으면 `기준 확인 필요` |
| 4 | 판매/소비 차감 | 가장 오래된 잔량부터 차감 | 남은 lot 기준 재고금액 재계산 | 차감 lot 원가 합계가 매출원가 후보 | 판매량 산식 불명확 시 `기준 확인 필요` |
| 5 | 손실/폐기/떨이 차감 | FIFO 순서로 lot 잔량 차감 | 재고금액 감소 | 손실/폐기/떨이 금액은 차감 lot 원가로 산출 후보 | 손실 유형/수량 초과 시 차단 |
| 6 | 조정 감소 | 본사 승인 조정으로 FIFO 순서 또는 지정 lot 차감 | 조정 전/후 금액과 차이 기록 | 매출원가가 아니라 조정 차이 | 음수 lot이면 저장 차단 |
| 7 | 본사 마감 snapshot | lot 잔량 snapshot 생성 | 확정 이월 금액 저장 | 리포트 기준점 확정 | 정정 발생 시 재확인 필요 |

판매/소비 차감은 현 MVP의 `previousQuantity + purchasedQuantity - lossQuantity` 기본 계산과 다르다. 후속 FIFO 구현 story에서 당일 판매량 또는 소비량 산식이 확정되지 않으면 FIFO 매출원가를 확정하지 않는다.

### 같은 날짜 tie-breaker

| 상황 | tie-breaker |
| --- | --- |
| 음수/반품 row와 매입 row가 같은 날짜 | 원본 매입 lot 생성 후 반품/void를 적용한다. 반품 대상 lot을 특정할 수 없으면 `기준 확인 필요`다. |
| 재고 조정 증가와 판매 차감이 같은 날짜 | 조정 증가를 먼저 반영해 승인된 시작 잔량을 만든 뒤 판매 차감한다. |
| 손실/폐기/떨이와 조정 감소가 같은 날짜 | 손실/폐기/떨이를 먼저 차감하고, 조정 감소는 그 이후 남은 잔량 기준으로 처리한다. |
| 마감 후 정정과 신규 장부가 같은 날짜에 확인됨 | 정정 record가 append된 시각 이후 장부와 리포트에 `정정 반영 재확인`을 표시한다. 과거 snapshot은 덮어쓰지 않는다. |
| 업로드 commit과 수동 매입이 같은 품목/일자 | 업로드 commit lot이 먼저, 본사 수동 수정 lot이 다음, 지점 수동 lot이 마지막이다. |

### 부족/음수 lot 처리

| 조건 | 처리 |
| --- | --- |
| lot 잔량 부족으로 판매/손실/조정 감소를 차감할 수 없음 | 저장 차단이 기본이다. 이미 저장된 과거 데이터 replay에서 발견되면 `계산 불가`와 본사 승인 예외 필요 상태로 표시한다. |
| 단가 또는 매입일자가 없어 원가를 산출할 수 없음 | `기준 확인 필요`로 표시하고 FIFO 확정 원가/재고금액을 만들지 않는다. |
| mapping/version이 깨져 product key가 바뀜 | `재검증 필요` 또는 `기준 확인 필요`로 표시하고 reprocess 전 commit 금지 |
| 본사 승인 예외가 필요한 경우 | 예외 승인자, 사유, 적용 기간, 영향 lot, 후속 재검토 일자를 audit event로 남긴다. |

## 재고 이월, 본사 마감, 정정 반영 규칙

| 단계 | 정책 |
| --- | --- |
| 본사 마감 전 이월 후보 | FIFO 확정 lot이 아니다. 직전 장부가 미마감이거나 mapping/단가/lot 근거가 불완전하면 `검토 필요` 또는 `기준 확인 필요`로 유지한다. |
| 본사 마감 후 확정 이월 | lot 잔량 snapshot이면서 후속 기간 replay의 기준점이다. snapshot은 lot id, 남은 수량, 단가, 원 매입일자, source, close id를 포함해야 한다. |
| 마감 후 정정 | 원본 장부 row와 과거 snapshot은 소급 덮어쓰지 않는다. append-only correction 또는 valuation recheck event를 생성한다. |
| 정정 영향 표시 | 정정이 재고 이월, FIFO 잔량, 리포트 집계에 영향을 주면 후속 장부와 리포트에 `정정 반영 재확인` 또는 `이월 재확인 필요` 상태를 표시한다. |
| 재확인 완료 | 본사 사용자가 recheck 결과를 승인하면 새 valuation snapshot 또는 correction snapshot을 추가한다. 기존 snapshot은 archive evidence로 보존한다. |

## 예시 계산

아래 예시는 정책 검증용이며 현재 코드 동작이 아니다. 모든 금액은 KRW 정수다.

### 예시 1: 단가가 다른 매입 2개와 판매 차감

| 입력 순서 | 이벤트 | 수량 | 단가 | lot 잔량 변화 | 매출원가 후보 | 재고금액 | 상태 |
| --- | --- | ---: | ---: | --- | ---: | ---: | --- |
| 0 | 전기 확정 이월 없음 | 0 | - | 없음 | 0 | 0 | 확정 가능 |
| 1 | 수동 매입 A | 10 | 10,000 | A +10 | 0 | 100,000 | 확정 가능 |
| 2 | 업로드 commit 매입 B | 8 | 12,000 | B +8 | 0 | 196,000 | 확정 가능 |
| 3 | 판매/소비 12 | -12 | - | A -10, B -2 | 124,000 | 72,000 | 확정 가능 |

검증: FIFO 차감 후 B lot 6개가 남고 재고금액은 `6 x 12,000 = 72,000`이다. 매출원가 후보는 `10 x 10,000 + 2 x 12,000 = 124,000`이다.

### 예시 2: 손실, 폐기, 떨이와 재고 조정 포함

| 입력 순서 | 이벤트 | 수량 | 단가 | lot 잔량 변화 | 손실/조정 금액 후보 | 재고금액 | 상태 |
| --- | --- | ---: | ---: | --- | ---: | ---: | --- |
| 0 | 전기 확정 이월 A | 5 | 9,000 | A +5 | 0 | 45,000 | 확정 가능 |
| 1 | 매입 B | 10 | 11,000 | B +10 | 0 | 155,000 | 확정 가능 |
| 2 | 손실 | -3 | - | A -3 | 27,000 | 128,000 | 확정 가능 |
| 3 | 폐기 | -2 | - | A -2 | 18,000 | 110,000 | 확정 가능 |
| 4 | 떨이 | -4 | - | B -4 | 44,000 | 66,000 | 확정 가능 |
| 5 | 조정 증가 | +2 | 11,000 | C +2 | +22,000 | 88,000 | 본사 승인 필요 |

검증: 손실/폐기/떨이는 FIFO 순서로 A lot부터 차감한다. A가 0이 된 뒤 떨이는 B lot에서 차감된다. 조정 증가는 원본 lot을 수정하지 않고 C correction lot으로 append한다.

### 예시 3: 수동 매입과 업로드 매입이 같은 품목/일자에 공존

| 입력 순서 | 이벤트 | source | 수량 | 단가 | lot 순서 | lot 잔량 변화 | 재고금액 | 상태 |
| --- | --- | --- | ---: | ---: | --- | --- | ---: | --- |
| 1 | 업로드 commit row 12 | IMPORT_COMMIT | 6 | 10,500 | 1 | U12 +6 | 63,000 | 확정 가능 |
| 2 | 본사 수동 수정 매입 | HQ_MANUAL_CORRECTION | 4 | 10,800 | 2 | H1 +4 | 106,200 | 승인 필요 |
| 3 | 지점 수동 매입 | STORE_MANUAL | 5 | 11,000 | 3 | S1 +5 | 161,200 | 확정 가능 |
| 4 | 판매/소비 8 | - | -8 | - | - | U12 -6, H1 -2 | 76,600 | 확정 가능 |

검증: 같은 품목/일자에서는 업로드 commit lot이 먼저 차감되고, 그 다음 본사 수동 수정 lot이 차감된다. 남은 잔량은 H1 2개, S1 5개이며 재고금액은 `2 x 10,800 + 5 x 11,000 = 76,600`이다. 이 값이 달라지면 후속 구현 테스트가 실패해야 한다.

### 예시 4: 마감 후 정정으로 후속 장부 재확인 상태

| 날짜/순서 | 이벤트 | lot 영향 | 리포트/장부 상태 |
| --- | --- | --- | --- |
| 2026-06-10 18:00 | 본사 마감 | A 3개, B 4개 snapshot 확정 | 2026-06-11 전일 이월 기준점 |
| 2026-06-11 09:00 | 후속 장부 작성 | snapshot 기준으로 입력 | 정상 |
| 2026-06-11 14:00 | 2026-06-10 매입 row 정정 승인 | 원본 row는 유지, correction event append | 2026-06-10 valuation recheck 필요 |
| 2026-06-11 14:01 | 후속 장부/리포트 조회 | 기존 snapshot을 덮어쓰지 않음 | `정정 반영 재확인`, `이월 재확인 필요` |
| recheck 승인 후 | 새 valuation snapshot append | 이전 snapshot archive | 새 기준으로 후속 리포트 재생성 가능 |

검증: 마감 후 정정은 과거 snapshot을 직접 바꾸지 않는다. 후속 장부는 재확인 상태를 보여주고 본사 승인 후 새 snapshot을 기준점으로 삼는다.

## 현재 동작과 충돌 검토

| 현재 파일/표현 | 검토 결과 |
| --- | --- |
| `src/server/calculations/policy-gates.ts` | `fifoCostOfGoodsSold`, `fifoInventoryAmount`가 OQ-7/OQ-17 미확정으로 `policy-unconfirmed` 상태다. 이 정책 산출물은 승인 전 gate 유지를 요구하므로 충돌하지 않는다. |
| `src/server/calculations/inventory.ts` | 현재 재고금액은 `quantity * unitPrice` 기본 계산이다. 이 값을 FIFO 확정 원가로 재명명하지 않는다는 정책과 충돌하지 않는다. |
| `prisma/schema.prisma` | `PurchaseLot`/`InventoryValuation` 모델이 없고 `LedgerPurchaseSource`는 `MANUAL`만 있다. 이 문서는 후속 구현에서 enum 확장 또는 별도 lot source 모델이 필요하다고만 남긴다. |
| `tests/unit/calculation-policy-gates.test.mjs` | FIFO policy gate가 OQ-7/OQ-17을 참조하고 MVP 저장 단가 계산을 FIFO로 부르지 않도록 검증한다. 이 정책과 정렬된다. |
| Story 7.3 정책 | mapping 실패/검토 필요/재검증 필요가 자동 확정을 막는다. 이 문서는 같은 상태를 FIFO 차단 조건으로 사용한다. |

## 승인 상태별 동작

| 상태 | 동작 |
| --- | --- |
| 승인 전 | 기존 MVP 기본 계산과 `기준 확인 필요` gate 유지. FIFO 구현 story 생성 금지 |
| 개발 리드 승인만 완료 | 본사 운영자 승인 전까지 OQ-7/OQ-17 close 주장 금지 |
| 본사 운영자 승인만 완료 | 개발 리드 승인 전까지 CAP-7 구현 story 생성 금지 |
| 개발 리드 + 본사 운영자 승인 완료 | 아래 조건을 만족하면 MVP-S07 또는 CAP-7 구현 story를 조건부 생성 가능 |

## 승인자와 승인 상태

| 역할 | 승인자 | 상태 | 승인 근거 |
| --- | --- | --- | --- |
| 개발 리드 | Noah Lee | 승인 대기 | 이 문서 또는 연결된 decision log에 승인일과 근거 기록 필요 |
| 본사 운영자 | 본사 운영자 | 승인 대기 | 이 문서 또는 연결된 decision log에 승인일과 근거 기록 필요 |

두 승인자가 모두 승인하기 전에는 OQ-7/OQ-17이 닫혔다고 주장하지 않는다.

## 구현 승격 여부

구현 승격 여부: 조건부

## MVP-S07 또는 CAP-7 구현 story 생성 가능

MVP-S07 또는 CAP-7 구현 story 생성 가능: 조건부

조건:

1. Noah Lee(개발 리드) 승인자 이름, 승인일, 승인 근거가 이 문서 또는 연결된 decision log에 기록되어야 한다.
2. 본사 운영자 승인자 이름, 승인일, 승인 근거가 이 문서 또는 연결된 decision log에 기록되어야 한다.
3. Story 7.3 품목 정규화와 mapping 상태 정책이 승인되어야 한다.
4. CAP-6 업로드 preview/commit/reprocess와 mapping version 고정 정책이 승인되어야 한다.
5. FIFO 적용 제외 품목, 예외 승인자, 재검토 조건이 본사 운영 기준으로 승인되어야 한다.
6. 판매/소비 차감 산식과 매출원가 후보의 리포트 표시 범위가 후속 story에서 테스트 가능한 기준으로 적혀야 한다.

조건 충족 시 구현 story가 변경할 수 있는 코드 표면:

- `prisma/schema.prisma`
- `src/features/imports/*`
- `src/features/inventory-valuation/*`
- `src/features/inventory/*`
- `src/server/calculations/inventory.ts`
- `src/server/calculations/policy-gates.ts`
- `src/features/reports/*`
- 관련 unit/e2e tests

조건 미충족 시 기존 MVP 기본 계산값과 `기준 확인 필요` gate를 유지한다. FIFO 확정 원가, FIFO 재고금액, lot 근거 패널, 상품 분석 구현 story를 만들지 않는다. 승인자 없는 정책 산출물만으로 OQ-7/OQ-17이 닫혔다고 주장하지 않는다.

## 구현 금지 사항

- 이 정책 산출물만으로 `PurchaseLot`, `InventoryValuation`, import lot source schema를 추가하지 않는다.
- 이 정책 산출물만으로 `LedgerPurchaseSource` enum을 확장하지 않는다.
- 이 정책 산출물만으로 FIFO valuation engine, upload parser, lot trace panel, report/export FIFO 컬럼을 구현하지 않는다.
- 기존 `LedgerPurchaseItem`, `LedgerInventoryItem`, `LedgerInventoryAdjustment`, `LedgerLossItem`, `InventoryOpeningSnapshot` snapshot 값을 소급 update하지 않는다.
- 현재 `calculateInventoryAmount` 또는 MVP 기본 재고금액을 FIFO 확정 계산으로 재명명하지 않는다.
- 승인자 없는 상태에서 OQ-7/OQ-17 close, CAP-7 완료, 이카운트 FIFO 정합 완료를 주장하지 않는다.

## 검증 체크리스트

- 적용 범위: 일부 적용으로 결정했고 적용 대상/제외 기준을 표로 정의했다.
- 예외 기준: mapping 실패, 검토 필요, 기준 누락, 재검증 필요, 음수 lot, 승인자 없음 상태를 차단 조건으로 정의했다.
- lot 생성 기준: 수동 매입, 업로드 commit, 본사 수동 수정, 확정 이월의 lot 생성 조건과 필수 필드를 정의했다.
- 처리 순서: 반품, 조정 증가/감소, 판매 차감, 손실/폐기/떨이, 마감 snapshot 순서를 단일 표로 정의했다.
- 예시 계산: 단가 다른 매입 2개 이상, 손실/폐기/떨이, 재고 조정, 수동/업로드 공존, 마감 후 정정 재확인 예시를 포함했다.
- 매핑/단가 차단 조건: `mapping_failed`, `needs_review`, `basis_missing`, `pending_review`, `revalidation_required`가 FIFO 확정 계산을 막도록 정의했다.
- 이월/마감/정정 규칙: 마감 전 후보, 마감 후 snapshot, append-only correction, 재확인 상태를 정의했다.
- 승인자: 승인 대기 상태와 승인자 역할을 명시했다.
- 구현 승격 여부: 조건부로 명시하고 변경 가능 코드 표면을 제한했다.
- 현재 동작 검토: `rg` 검색 결과와 현재 계산/policy gate/schema 상태가 산출물과 충돌하지 않음을 확인했다.
