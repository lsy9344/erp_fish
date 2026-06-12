# Story 8.3 FIFO 원가, 통합 재고, 상품 분석 선행 정책

## 문서 정보

| 항목 | 값 |
| --- | --- |
| 작성일 | 2026-06-13 |
| 작성자 | GPT-5 Codex Dev Agent |
| 검토자 | Noah Lee(PM/개발 리드), 본사 운영자 |
| 승인자 | Noah Lee(PM/개발 리드) 승인 대기, 본사 운영자 승인 대기 |
| 승인 상태 | 승인 대기 |
| 관련 CAP | CAP-7 FIFO 재고 금액 계산과 매입 잔량 이력, CAP-8 본사 통합 전체 재고 뷰, CAP-4 상품별 관리자 분석 |
| 관련 OQ | OQ-7 FIFO 적용 범위, OQ-10B 민감 지표 노출 고도화, OQ-17 FIFO 반품/조정/폐기/떨이 처리 순서 |
| 관련 FR | FR-9, FR-10, FR-11, FR-13, FR-15, FR-28 |
| 관련 story | Story 7.4, Story 7.6, Story 8.2, Story 8.3 |
| 적용 범위 | FIFO 적용 품목 범위, lot 생성 기준, OQ-17 처리 순서, 마감/정정/이월 영향, 통합 재고 조회 범위와 필터, 원가 근거 노출 여부, 지점장 차단 기준, 상품 분석 필드 매트릭스 |
| 구현 승격 여부 | 조건부 대기. 아래 승격 조건을 만족하기 전에는 CAP-7/CAP-8/CAP-4 구현 story를 만들지 않는다. |

이 문서는 제품 동작 구현 산출물이 아니다. `src/`, `prisma/`, `tests/` 코드는 이 정책 산출물만으로 변경하지 않는다. 승인 전 기존 시스템은 MVP 기본 계산값, policy gate, 지점장 민감 필드 차단 기준을 유지하고, FIFO valuation engine, 본사 통합 재고 UI/API, 상품 분석 chart/table/export/cache/API를 구현하지 않는다.

## 정책 결정 요약

| 영역 | 결정 |
| --- | --- |
| CAP-7 FIFO 적용 | 모든 품목 자동 적용이 아니라 승인된 정규 품목 중 lot 근거가 완전한 품목에만 확정 계산을 적용한다. |
| CAP-7 차단 상태 | `mapping_failed`, `needs_review`, `basis_missing`, `pending_review`, `revalidation_required`, 단가 확인 필요, 음수/부족 lot, 승인자 없음 상태는 FIFO 확정 계산을 차단한다. |
| Lot source | 확정 이월 lot, 이카운트 업로드 commit lot, 본사 수동 수정 lot, 지점 수동 lot만 후속 구현 후보로 둔다. Preview-only row는 lot이 아니다. |
| Lot tie-breaker | 매입일자 -> 업로드 commit lot -> 본사 수동 수정 lot -> 지점 수동 lot -> commit/저장 시각 -> source row number -> audit event 순서로 고정한다. |
| OQ-17 순서 | 확정 이월 lot -> 매입 lot 생성 -> 반품/void -> 조정 증가 -> 판매 차감 -> 손실/폐기/떨이 차감 -> 조정 감소 -> 마감 snapshot 순서로 처리한다. |
| 마감/정정 | 마감 전 이월 후보는 확정 lot이 아니다. 마감 후 정정은 append-only로 남기고 `정정 반영 재확인`, `이월 재확인 필요` 상태를 표시한다. |
| CAP-8 통합 재고 | 본사 권한의 전체 지점 또는 배정 지점 scope를 서버에서 적용한다. CAP-7 승인 전 원가/lot 근거는 확정값처럼 표시하지 않는다. |
| CAP-4 상품 분석 | 본사 전용 지표와 지점장 차단 필드를 분리한다. OQ-10B와 FIFO 정책 승인 전에는 민감 분석 구현 story를 만들지 않는다. |
| 서버 차단 | 지점장 경로에는 타 지점 재고 비교, 전체 합산, 원가, 재고금액, lot 근거, 이익/마진율을 서버 응답부터 제거한다. UI 숨김은 보안 기준이 아니다. |

## OQ 결정 상태

| OQ | 현재 상태 | Story 8.3 정책 | 구현 전 종료 기준 |
| --- | --- | --- | --- |
| OQ-7 | 승인 대기 | FIFO는 일부 적용이다. 승인된 정규 품목이고 lot 근거가 완전한 경우에만 확정 계산한다. | Noah Lee(PM/개발 리드)와 본사 운영자가 FIFO 일부 적용 기준, 제외 상태, 승인자 기록을 승인한다. |
| OQ-10B | 미종결 | 본사가 지표별 민감 노출 허용을 조정하는 UI/API/configurable exposure는 열지 않는다. | 허용 가능 여부, 승인자, 감사 로그, 롤백 기준, 기본 차단값을 별도 산출물로 승인한다. |
| OQ-17 | 승인 대기 | Story 7.4의 처리 순서를 CAP-7/CAP-8/CAP-4 공통 선행 기준으로 채택한다. | 반품/void, 조정 증가/감소, 판매 차감, 손실/폐기/떨이, 마감 snapshot 순서를 승인하고 예외 상태를 기록한다. |

## CAP-7 FIFO 정책 메모

### 적용 품목 범위

| 조건 | FIFO 확정 계산 | 상태 표시 | 비고 |
| --- | --- | --- | --- |
| 정규 품목 `name/category/spec` 승인, mapping version 유효, 매입일자/수량/단가/source row가 완전함 | 가능 | 확정 가능 | 후속 CAP-7 구현 story에서 lot replay 테스트 필요 |
| `mapping_failed` | 차단 | `기준 확인 필요` | 정규 품목 귀속 불가 |
| `needs_review` | 차단 | `검토 필요` | 본사 검수 전 확정 금지 |
| `basis_missing` | 차단 | `데이터 부족` | 단가, 수량, 규격, 매입일자, source identity 중 결측 |
| `pending_review` | 차단 | `검토 필요` | 승인자/승인 시각 기록 전 확정 금지 |
| `revalidation_required` | 차단 | `재검증 필요` | preview 이후 mapping/parser/source 변경 |
| 단가 확인 필요 | 차단 | `기준 확인 필요` | 가격 신뢰 상태 승인 필요 |
| 음수 lot 또는 부족 lot 발생 | 차단 | `계산 불가` | 신규 저장 차단, 과거 replay는 예외 승인과 감사 로그 필요 |
| 승인자 없음 | 차단 | `검토 필요` | 정책 또는 row-level 승인 근거 필요 |

FIFO 확정 계산은 기존 MVP `calculateInventoryAmount(quantity, unitPrice)` 또는 `calculateSystemInventoryQuantity(previousQuantity + purchasedQuantity - lossQuantity)`를 재명명해서 만들지 않는다. FIFO 값은 별도 lot/valuation 근거가 있어야 하며, 근거가 없으면 `확인 필요`, `계산 불가`, `데이터 부족`, `재확인 필요`로 반환한다.

### Lot 생성 source

| source | 생성 조건 | 필수 추적값 | 생성 금지 조건 |
| --- | --- | --- | --- |
| 확정 이월 lot | 본사 마감 후 이전 기간 lot 잔량 snapshot이 승인됨 | carryover snapshot id, close id, productId, lot별 잔량, 단가, 원 매입일자, source | 마감 전 후보, 정정 반영 재확인 필요, 전일 장부 미마감 |
| 이카운트 업로드 commit lot | Story 8.2 preview 검증과 commit이 완료되고 mapping version이 유효함 | import batch id, source sheet/row, source row number, mapping version, commit timestamp, productId, unitPrice, original/remaining quantity | preview-only, `mapping_failed`, `needs_review`, `basis_missing`, `pending_review`, `revalidation_required`, voided row |
| 본사 수동 수정 lot | 마감 전 보완 또는 마감 후 정정이 append-only correction으로 승인됨 | correction id, target row id, before/after snapshot, reason, actor, audit event id | 원본 row 덮어쓰기, 승인자 없음, 단가 근거 없음 |
| 지점 수동 lot | 지점 장부 매입 row가 저장되고 본사 정책상 lot 후보로 인정됨 | ledger id, storeId, source row id, productId, purchaseDate, unitPrice, quantity, actor, audit event id | OQ-15 미종결 비상 입력, mapping/단가/수량 결측 |

### 같은 품목/일자 tie-breaker

| 우선순위 | 기준 | 설명 |
| --- | --- | --- |
| 1 | 매입일자 | 오래된 매입일자가 먼저 차감된다. |
| 2 | 업로드 commit lot | 같은 매입일자에서는 이카운트 원문 순서를 보존한 commit lot을 먼저 둔다. |
| 3 | 본사 수동 수정 lot | 본사 승인 correction lot은 지점 수동 lot보다 우선한다. |
| 4 | 지점 수동 lot | 지점 수동 매입은 같은 일자/source 동률에서 뒤에 둔다. |
| 5 | commit/저장 시각 | 같은 source이면 commit 또는 저장 시각이 빠른 lot을 먼저 둔다. |
| 6 | source row number | 같은 업로드 batch 안에서는 원문 row number가 낮은 row를 먼저 둔다. |
| 7 | audit event 순서 | 최종 동률은 audit event timestamp/id로 안정 정렬한다. |

### OQ-17 처리 순서

| 순서 | 이벤트 | lot 잔량 영향 | 원가/재고금액 영향 | 차단/상태 |
| --- | --- | --- | --- | --- |
| 0 | 확정 이월 lot | 이전 마감 snapshot을 시작 잔량으로 로드 | 시작 재고금액 후보 | 마감 전 후보는 `기준 확인 필요` |
| 1 | 매입 lot 생성 | 수동/업로드 commit lot을 증가 | 매입 단가 기준 재고금액 증가 | mapping/단가 미확정 row 차단 |
| 2 | 반품/void | 대상 lot 제거 또는 correction으로 잔량 0 처리 | 원 lot 원가 역분개 후보 | 대상 lot 불명확 시 `기준 확인 필요` |
| 3 | 조정 증가 | 본사 승인 correction lot append | 승인 단가로 재고금액 증가 | 단가 기준 없으면 `기준 확인 필요` |
| 4 | 판매 차감 | FIFO 순서로 가장 오래된 잔량 차감 | 차감 lot 원가 합계가 판매원가 후보 | 판매/소비 차감 산식 미확정 시 `기준 확인 필요` |
| 5 | 손실/폐기/떨이 차감 | FIFO 순서로 lot 잔량 차감 | 손실/폐기/떨이 원가 후보 | 수량 초과 또는 유형 불명확 시 차단 |
| 6 | 조정 감소 | FIFO 순서 또는 지정 lot 차감 | 조정 전/후 금액과 차이 기록 | 음수 lot이면 저장 차단 |
| 7 | 마감 snapshot | lot 잔량 snapshot 생성 | 후속 이월 기준점 확정 | 정정 발생 시 재확인 필요 |

### 이월, 마감, 정정 영향

| 단계 | 정책 |
| --- | --- |
| 마감 전 이월 후보 | 확정 lot으로 취급하지 않는다. 직전 장부 미마감, mapping/단가/lot 근거 불완전, 정정 대기 상태면 `검토 필요` 또는 `기준 확인 필요`다. |
| 마감 후 lot 잔량 snapshot | lot id, productId, source, 원 매입일자, 단가, 원수량, 잔량, close id를 포함하는 후속 기간 replay 기준점이다. |
| append-only 정정 | 원본 row와 과거 snapshot을 덮어쓰지 않는다. correction event 또는 valuation recheck event를 추가한다. |
| 정정 반영 재확인 | 정정이 FIFO 잔량, 재고금액, 통합 재고, 상품 분석에 영향을 주면 영향받는 화면/리포트/export/cache에 `정정 반영 재확인`을 표시한다. |
| 이월 재확인 필요 | 후속 장부의 전일/당일 재고 기준점이 바뀔 가능성이 있으면 새 snapshot 승인 전까지 `이월 재확인 필요`로 표시한다. |

## CAP-8 본사 통합 전체 재고 뷰 범위

### 조회 대상과 서버 scope

| 사용자/권한 | 조회 대상 | 서버 기준 |
| --- | --- | --- |
| 본사 전체 권한 | 전체 지점 | 서버에서 전체 지점 scope를 적용한다. client filter로 권한을 만들지 않는다. |
| 본사 배정 지점 권한 | 배정된 지점만 | 서버에서 배정 지점 id allowlist를 적용한다. |
| 지점장 | 자기 지점의 비민감 수량/상태 요약만 | 타 지점 비교, 전체 합산, 원가, 재고금액, lot 근거는 서버 응답에서 제거한다. |
| 외부/비로그인 | 없음 | 통합 재고 응답 없음. |

### 필터

| 필터 | 정책 |
| --- | --- |
| 냉동/생물 | 현재 확정 category인 `냉동`, `생물` 기준으로 제한한다. |
| 정규 품목 | 승인된 정규 품목만 확정 집계 후보로 둔다. 미승인 mapping은 `검토 필요`/`기준 확인 필요`로 분리한다. |
| 규격 | `name/category/spec` 단위로 필터링한다. raw spec은 증거로만 보존하고 확정 집계 key로 쓰지 않는다. |
| 지점 | 본사 권한 scope 안에서 선택한다. 지점장은 타 지점 필터를 받지 않는다. |
| 기간 또는 기준일 | 기준일 snapshot 또는 기간별 변동 조회로 구분한다. 기간 조회는 마감/정정 상태를 함께 반환해야 한다. |
| 재고 상태 | 정상, `검토 필요`, `기준 확인 필요`, `데이터 부족`, `계산 불가`, `재확인 필요`, `이월 재확인 필요`, `매핑 실패`를 구분한다. |

### 표시 필드 분리

| 필드 | 본사 CAP-7 승인 전 | 본사 CAP-7 승인 후 | 지점장 경로 |
| --- | --- | --- | --- |
| 전체 합산 수량 | 표시 가능 후보. 단, 미마감/재확인 상태를 함께 표시 | 표시 가능 | 차단 |
| 지점별 잔량 | 본사 scope 안에서 표시 가능 후보 | 표시 가능 | 자기 지점 비민감 수량/상태 요약만 가능 |
| 이월/재확인 상태 | 표시 | 표시 | 자기 지점 상태 레이블만 표시 |
| 기준 확인 필요 상태 | 표시 | 표시 | 표시 가능 |
| 재고금액 | `기준 확인 필요`, `데이터 부족`, `계산 불가`, `재확인 필요` 중 하나로 표시 | CAP-7 확정 근거가 있는 품목만 표시 가능 | 차단 |
| FIFO 원가 | 확정값처럼 표시 금지 | CAP-7 확정 근거가 있는 품목만 본사 표시 가능 | 차단 |
| lot 근거 | 확정값처럼 표시 금지 | 본사 권한에서 lot trace로 표시 가능 | 차단 |
| 타 지점 비교 | 본사 scope 안에서 수량 비교만 후보 | 본사 scope 안에서 원가 포함 비교 후보 | 차단 |

CAP-7/FIFO 승인 전에는 재고금액, FIFO 원가, lot 근거를 숫자 0, stale unit price, MVP 기본 재고금액으로 대체하지 않는다. 원가 없는 수량-only slice를 만들 경우에도 라벨과 API 계약에 원가 미포함을 명시해야 한다.

## CAP-4 상품별 관리자 분석 필드 매트릭스

### 분석 축

| 축 | 정책 |
| --- | --- |
| 품목 | 승인된 정규 품목 기준. raw 품목은 증거와 검토 상태로만 사용한다. |
| 규격 | `spec` 기준으로 단가/재고 분석 단위를 분리한다. |
| 냉동/생물 | 현재 확정 category만 사용한다. |
| 지점 | 본사 분석은 권한 scope 안에서 지점별/전체 집계를 구분한다. 지점장은 자기 지점만 허용한다. |
| 장부 일자 | 마감/정정 상태와 함께 표시한다. |
| 기간 | 기간별 판매/매입/손실/재고 변동은 미마감과 정정 재확인 상태를 포함한다. |
| 매입/판매/손실/재고 상태 | status label을 함께 반환한다. 민감 금액이 없는 상태 요약은 지점장 허용 후보다. |

### 필드 권한 매트릭스

| 분석 필드 | 본사 전용 | 지점장 허용 | 정책 |
| --- | --- | --- | --- |
| 판매금액 | 예 | 아니오 | 매출 규모와 마진 역추정 가능성이 있어 지점장 차단 |
| 판매량 | 예 | 자기 지점 비민감 수량 후보 | 타 지점 비교/전체 순위와 결합 시 차단 |
| 판매원가/FIFO 원가 후보 | 예 | 아니오 | OQ-7/OQ-17 승인과 CAP-7 lot 근거 필요 |
| 매출이익 | 예 | 아니오 | 민감 이익 지표 |
| 이익률/마진율 | 예 | 아니오 | 민감 파생 지표 |
| 재고 수량 | 예 | 자기 지점 비민감 수량/상태 후보 | 전체 합산/타 지점 비교는 차단 |
| 재고금액 | 예 | 아니오 | 원가 기반 민감 지표 |
| lot 근거 | 예 | 아니오 | 매입 단가와 source 추적 가능 |
| 타 지점 비교 | 예 | 아니오 | 지점장 경로 차단 |
| 최고매출품목/매출액 | 예 | 아니오 | 매출액과 순위는 민감 본사 분석 |
| 현장 입력값 | 아니오 | 자기 지점 허용 | 지점장이 직접 입력/검토하는 비민감 값 |
| 비민감 수량/상태 요약 | 아니오 | 자기 지점 허용 | 원가/이익/타 지점 비교를 포함하지 않는다. |
| 검토 필요 상태 | 아니오 | 허용 | `검토 필요`, `기준 확인 필요`, `데이터 부족`, `재확인 필요` 같은 상태 label |

OQ-10B가 닫히기 전에는 민감 분석 노출 허용, configurable exposure, 지표별 예외 허용 UI/API를 구현하지 않는다. OQ-10A/Story 7.6의 기본 차단 기준을 약화시키지 않는다.

### Surface별 후속 구현 조건

| surface | 조건 |
| --- | --- |
| chart | chart series 생성 전에 서버 DTO에서 권한별 필드를 제거한다. 지점장 chart에는 원가/이익/마진율/재고금액/lot/타 지점 비교 series를 만들지 않는다. |
| table | 숨김 컬럼은 편의 기능일 뿐이다. 민감 필드는 지점장 응답 shape에 없어야 한다. |
| export | 본사 export만 민감 지표 후보를 포함할 수 있다. 지점장/export forbidden body에는 민감 key와 민감 seeded value가 없어야 한다. |
| cache | 권한/지점 scope별 cache key와 value를 분리하거나 `no-store`를 사용한다. 본사 결과를 지점장 cache로 재사용하지 않는다. |
| API/Server Action | `requireReportAccess`, `requireExportCreateAccess`, 지점 scope 확인, 민감 field omit/allowlist를 서버에서 수행한다. |

## 후속 구현 승격 조건

| 후보 story | 생성 가능 조건 |
| --- | --- |
| CAP-7 FIFO 구현 story | OQ-7/OQ-17 승인, Story 7.4 승인, Story 8.2 CAP-5/CAP-6 계약 승인, 판매/소비 차감 산식 테스트 기준, lot replay/idempotency 테스트 기준, 마감/정정 append-only 기준이 모두 있어야 한다. |
| CAP-8 본사 통합 재고 구현 story | CAP-7이 제공하는 확정 FIFO/lot 근거가 있거나, 원가 없는 수량-only slice로 명확히 쪼갠 경우에만 생성 가능하다. 수량-only slice도 권한 scope와 지점장 차단 기준을 포함해야 한다. |
| CAP-4 상품 분석 구현 story | OQ-10B와 FIFO 정책 승인 전에는 민감 분석 story를 만들 수 없다. 비민감 수량/상태 분석 slice도 본사 전용/지점장 차단 기준, chart/table/export/cache/API response shaping 기준을 포함해야 한다. |

## 금지 사항

- 이 정책 산출물만으로 `PurchaseLot`, `InventoryValuation`, `ProductAnalysis`, `AllStoreInventory`, `ProductMapping`, `ImportBatch`를 추가하지 않는다.
- `LedgerPurchaseSource` 또는 import source enum을 확장하지 않는다.
- upload/FIFO engine, lot replay, chart/report/export 컬럼, API route, Server Action, migration, seed, unit/e2e tests를 추가하지 않는다.
- 기존 `calculateInventoryAmount`, `calculateSystemInventoryQuantity`, MVP 매출원가/재고금액을 FIFO 확정 계산으로 재명명하지 않는다.
- `src/server/calculations/policy-gates.ts`의 FIFO gate를 해제하지 않는다.
- `src/server/sensitive-fields.ts`의 지점장 민감 필드 기본 차단을 약화시키지 않는다.
- 지점장 응답, export, cache, 알림 템플릿에 원가, 재고금액, lot 근거, 이익, 마진율, 타 지점 비교를 포함하지 않는다.
- 승인자 없는 산출물로 OQ-7/OQ-10B/OQ-17 close를 주장하지 않는다.

## 현재 동작과 충돌 검토

| 현재 파일/표현 | 검토 결과 |
| --- | --- |
| `src/server/calculations/policy-gates.ts` | FIFO 관련 값이 OQ-7/OQ-17 미확정 gate에 묶여 있어 이 정책과 정렬된다. Gate를 해제하지 않는다. |
| `src/server/calculations/inventory.ts` | 현재 MVP 기본 재고 계산을 FIFO 확정값으로 부르지 않는 정책과 정렬된다. |
| `src/server/sensitive-fields.ts` | FIFO 원가, 재고금액, 이익, 마진율, lot, 타 지점 비교 차단 기준과 정렬된다. |
| `prisma/schema.prisma` | `PurchaseLot`, `InventoryValuation`, `ProductMapping`, `ImportBatch`가 없으므로 이 문서는 후속 구현 후보만 남기고 schema를 변경하지 않는다. |
| Story 7.4 정책 | FIFO 일부 적용, OQ-17 처리 순서, 마감/정정 append-only 원칙을 유지한다. |
| Story 8.2 정책 | upload preview/commit/reprocess, mapping 상태, 원문 보존, 감사 기준을 FIFO lot 생성 차단 조건으로 재사용한다. |
| Story 7.6 정책 | 지점장 민감 필드 차단 기준을 CAP-8/CAP-4에도 적용한다. |

## 승인자와 승인 상태

| 역할 | 승인자 | 상태 | 승인 근거 |
| --- | --- | --- | --- |
| PM/개발 리드 | Noah Lee | 승인 대기 | 이 문서 또는 연결된 decision log에 승인일과 승인 근거 기록 필요 |
| 본사 운영자 | 본사 운영자 | 승인 대기 | FIFO 적용 범위, 통합 재고 범위, 상품 분석 차단 기준 승인 필요 |

두 승인자가 모두 승인하기 전에는 OQ-7/OQ-17이 닫혔다고 주장하지 않는다. OQ-10B는 이 문서로 닫지 않으며 별도 고도화 노출 정책 산출물이 필요하다.

## Traceability

| 항목 | 연결 |
| --- | --- |
| Epic/Story | Epic 8 / Story 8.3 |
| Required artifact | `_bmad-output/planning-artifacts/policy-decisions/8-3-fifo-원가-통합-재고-상품-분석-선행-정책.md` |
| PRD CAP-7/CAP-8/CAP-4 | `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#8.2 품목 정규화, 매입 업로드, FIFO 재고 원가`, `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#8.3 본사 재고와 상품 분석` |
| CAP 구현 순서 | `_bmad-output/planning-artifacts/prds/prd-erp_fish-2026-05-28-2/prd.md#CAP 구현 순서와 추적 기준` |
| FIFO 기준 정책 | `_bmad-output/planning-artifacts/policy-decisions/7-4-fifo-적용-범위와-재고-원가-처리-순서.md` |
| CAP-5/CAP-6 선행 계약 | `_bmad-output/planning-artifacts/policy-decisions/8-2-품목-정규화와-이카운트-업로드-계약.md` |
| 지점장 민감 필드 차단 | `_bmad-output/planning-artifacts/policy-decisions/7-6-지점장-민감-필드-노출-차단-매트릭스.md` |
| Architecture guardrails | `_bmad-output/planning-artifacts/architecture.md#Calculation Strategy`, `_bmad-output/planning-artifacts/architecture.md#Sensitive Field Gate`, `_bmad-output/planning-artifacts/architecture.md#Requirements to Structure Mapping` |
| Current implementation guardrails | `prisma/schema.prisma`, `src/server/calculations/inventory.ts`, `src/server/calculations/policy-gates.ts`, `src/server/sensitive-fields.ts` |

