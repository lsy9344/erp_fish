# done_미팅 설계 구현 감사

반영완료: 감사 발견 사항의 P0/P1/P2 대응 작업을 끝냈습니다.

작성일: 2026-06-19

## 범위

- 기준 설계: `docs/meeting/change.md`
- 비교 대상: 현재 작업 트리의 `src/`, `prisma/`, `tests/`, `_bmad-output/implementation-artifacts`, `_bmad-output/planning-artifacts`
- 주의: 현재 작업 트리에는 미커밋 변경이 많다. 이 문서는 현재 작업 트리 기준으로, "이미 구현됨", "정책 대기", "구현되어 있지만 잘못됨"을 구분한다.

## 요약 판단

`docs/meeting/change.md`의 기본 MVP 흐름인 본사 관제, 장부 작성, 마감/정정, 감사 로그, 일별 회의 리포트는 대체로 구현되어 있다. 그러나 추가 미팅 요구 중 일부는 아직 정책 대기 상태이고, 두 영역은 정책 문서와 반대로 코드가 먼저 움직여 위험하다.

가장 큰 문제는 다음 세 가지다.

1. 이카운트 업로드는 설계상 자동 매입 장부 생성 기능인데, 현재 UI/액션은 사라졌고 parser는 선택 지점/일자와 다른 행도 가져오는 테스트를 통과시킨다.
2. FIFO 재고 금액은 OQ-7/OQ-17 승인 전에는 확정값처럼 표시하면 안 되는데, 현재 계산 로직은 FIFO 값이 있으면 `ok`로 사용한다.
3. 본사 정정은 매입 행 정정을 만들 수 있지만, 공통 계산 overlay와 리포트 근거에는 `PURCHASE_ROW`가 반영되지 않는다.

## 구현 상태 매트릭스

| 요구 | 상태 | 판단 |
| --- | --- | --- |
| 본사 대시보드 4단계 상태, 이상 신호 | 구현됨 | 핵심 관제 흐름은 구현되어 있고 회의 리포트와 연결되어 있다. |
| 본사 강제 수정, 마감, 감사 로그 | 부분 구현 | 정정과 감사 흐름은 있으나 매입 행 정정 반영에 구멍이 있다. |
| 7단계 지점장 장부 입력, 작성자명, 모바일 대응 | 구현됨 | 기존 MVP 범위와 대체로 맞는다. |
| 지점장 민감 지표 차단 | 대체로 구현됨 | 지점장 review 응답에서 민감 필드가 줄어든 상태다. |
| 이카운트 엑셀 업로드 기반 매입 자동 생성 | 잘못됨/비활성 | 업로드 액션 파일이 삭제되어 있고 parser 검증도 위험하다. |
| FIFO 재고 금액, lot 근거 팝업 | 잘못됨/정책 위반 | 정책 승인 전인데 계산 경로와 schema가 생겼다. |
| 본사 통합 전체 재고 뷰 | 정책 대기 | CAP-8은 CAP-7 승인 또는 수량-only slice가 필요하다. |
| 희망 판매가 기준 손실액 | 정책 대기 | OQ-9 정책 gate가 남아 있으며 계산 구현은 금지되어 있다. |
| 외부 LINE/텔레그램 알림 | 정책 대기 | OQ-13/OQ-16 승인 전 구현 금지 상태다. |
| 그리드/대시보드 리사이징 | 부분/대기 | 일부 테이블은 `min-w-[1280px]` 고정 폭이며, 완성 기준만 정리된 상태다. |

## 발견 사항

### P0. 이카운트 업로드가 기능하지 않거나, 복구 시 잘못된 장부를 만들 수 있다

설계 요구는 이카운트 엑셀을 올리면 매입 장부가 자동 생성되는 것이다. `docs/meeting/change.md:19`는 품목명, 규격, 단가 등이 반영된 엑셀 업로드 자동 생성을 요구한다.

현재 상태는 이 요구와 맞지 않는다.

- `src/features/ledger/ecount-purchase-actions.ts`가 현재 작업 트리에서 삭제되어 있다. `HEAD`에는 `previewEcountPurchaseUpload()`가 있었고, 서버에서 본사 권한과 store scope를 확인한 뒤 parser를 호출했다.
- `src/features/ledger/components/purchase-step-client.tsx`에는 업로드 UI가 없다.
- `tests/unit/ledger-purchase.test.mjs:467`, `tests/unit/ledger-purchase.test.mjs:500`은 `ecountUploadEnabled`가 없어야 한다고 확인한다. 즉 현재 테스트는 업로드 비활성 상태를 보호한다.
- `src/features/ledger/ecount-purchase-import.ts:359`의 `parseEcountPurchaseWorkbook()`은 `_options: { storeName; closingDate }`를 받지만, 이름이 `_options`라 실제 필터 조건으로 쓰지 않는다.
- `src/features/ledger/ecount-purchase-import.ts:377`, `src/features/ledger/ecount-purchase-import.ts:423`은 원본 거래처명을 reference에 남길 뿐, 선택 장부의 지점/마감일과 일치하는지 막지 않는다.
- `tests/unit/ecount-purchase-import.test.mjs:385`는 "선택한 장부의 지점/일자와 맞지 않아도 import한다"는 동작을 테스트한다.

정책 문서도 이 상태와 충돌한다.

- `_bmad-output/planning-artifacts/policy-decisions/8-2-품목-정규화와-이카운트-업로드-계약.md:17`은 OQ-6/OQ-15 등 승인 전 CAP-6 구현 story를 만들지 않는다고 둔다.
- 같은 문서 `:225`는 preview/commit/void/reprocess 권한을 장부 직접 수정 권한과 구분하고 서버에서 강제해야 한다고 한다.
- 같은 문서 `:292`는 현재 구현 승격 가능 여부가 `불가`라고 적는다.

결론: 현재 업로드는 제품 기능으로는 동작하지 않는다. 더 나쁘게는 parser 단독으로는 다른 지점/다른 날짜 행도 가져올 수 있어, 액션/UI가 복구될 때 잘못된 매입 행이 장부에 들어갈 위험이 있다.

### P0. FIFO 계산이 정책 gate보다 먼저 확정값으로 사용된다

설계 요구는 FIFO 기반 재고 금액 자동 계산과 매입 이력 추적 팝업이다. `docs/meeting/change.md:21`, `docs/meeting/change.md:22`가 이에 해당한다.

하지만 현재 정책 문서는 FIFO가 아직 확정 구현 단계가 아니라고 말한다.

- `_bmad-output/implementation-artifacts/8-3-fifo-원가-통합-재고-상품-분석-선행-정책-확정.md:23`은 OQ-7/OQ-17이 닫히기 전 FIFO 계산 구현 story를 만들면 안 된다고 한다.
- 같은 문서 `:45`는 CAP-7/FIFO 승인 전 재고금액, FIFO 원가, lot 근거를 확정값처럼 표시하지 말라고 한다.
- 같은 문서 `:57`은 이 정책 산출물만으로 `PurchaseLot`, `InventoryValuation`, `AllStoreInventory`, upload/FIFO engine, migrations, tests를 추가하지 않는다고 한다.
- `_bmad-output/planning-artifacts/policy-decisions/8-3-fifo-원가-통합-재고-상품-분석-선행-정책.md:19`도 승인 전 FIFO valuation engine, 통합 재고 UI/API, 상품 분석을 구현하지 않는다고 적는다.
- 같은 문서 `:200`은 `src/server/calculations/policy-gates.ts`의 FIFO gate를 해제하지 않는다고 한다.

현재 코드와 테스트는 이 정책과 다르다.

- `prisma/schema.prisma:491`에 FIFO lot relation이 추가되어 있다.
- `src/features/inventory/fifo-lots.ts:283` 이후에서 FIFO lot snapshot을 계산하고, `:301`에서 inventory amount에 반영한다.
- `src/server/calculations/ledger.ts:365`의 `calculateCostOfGoodsSold()`와 `:395`의 `calculateInventoryTotal()`은 FIFO 값이 있으면 사용한다.
- `src/server/calculations/ledger.ts:376`, `:406`은 FIFO consumed/remaining amount를 합산한다.
- `tests/unit/calculation-policy-gates.test.mjs:129`, `:130`은 FIFO 값이 있을 때 판매원가와 재고금액이 `{ status: "ok" }`가 되기를 기대한다.
- `tests/unit/calculation-policy-gates.test.mjs:195`, `:196`, `:258`, `:259`도 fallback 값 또는 정정 후 값이 `ok`로 남는 것을 기대한다.

결론: 현재 FIFO는 "정책 승인 전 기준 확인 필요"가 아니라 "값이 있으면 정상 계산"으로 흐른다. 회의 자료, 대시보드, 리포트에서 원가/재고 금액이 확정값처럼 보일 수 있다.

### P1. 매입 행 정정은 만들 수 있지만 공통 계산/리포트에 반영되지 않는다

설계는 본사가 지점장이 입력한 매출, 비용, 매입, 재고 등 모든 데이터를 수정할 수 있고, 변경 이력을 남겨야 한다고 한다. `docs/meeting/change.md:14`, `docs/meeting/change.md:15`가 기준이다.

현재 정정 생성 경로는 매입 행을 허용한다.

- `src/features/corrections/actions.ts:368`은 `input.targetType === "PURCHASE_ROW"` 분기를 갖고 있다.
- `tests/unit/ledger-corrections.test.mjs:28`은 `PURCHASE_ROW` target type이 schema에 있어야 한다고 확인한다.

그러나 공통 계산 overlay는 매입 행을 적용하지 않는다.

- `src/server/calculations/ledger.ts:638`의 `applyCorrectionValuesToLedgerReviewInput()`이 계산 입력에 정정값을 덮는다.
- `src/server/calculations/ledger.ts:752`, `:760`, `:777`, `:798`, `:808`은 각각 결제, 비용, 장부 필드, 재고, 손실만 처리한다.
- `src/server/calculations/ledger.ts:818`은 남은 target을 `"unapplied"`로 돌린다. `PURCHASE_ROW` 적용 분기는 없다.
- `src/features/reports/queries.ts:2568`부터 `:2587`까지의 리포트 근거 matcher에도 `PURCHASE_ROW`가 없다.

결론: 사용자는 매입 정정을 남겼다고 생각할 수 있지만, 회의 리포트와 계산값은 그 정정을 반영하지 않거나 "재확인 필요" 근거를 충분히 보여주지 못할 수 있다.

### P1. 테스트가 일부 잘못된 동작을 보호한다

현재 unit test는 모두 통과하지만, 통과 자체가 안전함을 뜻하지 않는다.

- `tests/unit/ecount-purchase-import.test.mjs:385`는 지점/일자 mismatch import를 허용한다.
- `tests/unit/calculation-policy-gates.test.mjs:129`, `:130`은 FIFO 값이 `ok`가 되기를 기대한다.

검증 실행:

```powershell
pnpm test:unit -- tests/unit/ecount-purchase-import.test.mjs tests/unit/calculation-policy-gates.test.mjs tests/unit/ledger-correction-calculations.test.mjs
```

결과: unit suite 279개 통과. 단, 위 테스트들은 현재 문제 동작을 회귀 보호하고 있으므로 먼저 기대값을 고쳐야 한다.

### P2. 미팅 요구 중 일부는 제품 기능이 아니라 정책 대기 상태다

다음 요구는 `docs/meeting/change.md`에는 있지만, 현재 정책상 구현 완료로 보면 안 된다.

- 희망 판매가 기준 손실액: `docs/meeting/change.md:32`. `_bmad-output/implementation-artifacts/7-5-희망-판매가-기준-손실액-정책-확정.md:80`은 `hopedSalePriceLossAmount`가 policy-unconfirmed라고 한다. 같은 문서 `:105`, `:106`은 schema, 계산 함수, 리포트 컬럼 구현과 기존 `LedgerLossItem.amount` 재해석을 금지한다.
- 외부 LINE/텔레그램 알림: `docs/meeting/change.md:47`. `_bmad-output/planning-artifacts/policy-decisions/8-7-외부-알림-채널과-템플릿-정책.md:37`, `:69`, `:75`는 OQ-13/OQ-16 승인 전 provider, scheduled route, worker, 자동 알림 구현을 금지한다.
- 본사 통합 전체 재고 뷰: `docs/meeting/change.md:24`. `_bmad-output/planning-artifacts/policy-decisions/8-3-fifo-원가-통합-재고-상품-분석-선행-정책.md:191`, `:196`은 CAP-7 이후 또는 수량-only slice로 분리해야 한다고 한다.
- 리사이즈 가능한 그리드: `docs/meeting/change.md:9`. 현재 `src/features/dashboard/components/hq-dashboard-table.tsx:67`, `src/features/reports/components/store-comparison-report-table.tsx:53`에는 고정 `min-w-[1280px]` 테이블이 남아 있다.

결론: 이 항목들은 "미구현"으로 추적해야 한다. 제품 화면이나 릴리스 노트에서 완료라고 표현하면 안 된다.

## 권장 우선순위

1. 이카운트 업로드는 CAP-6 승격 여부를 먼저 정한다. 승인 전이면 runtime 업로드 경로와 위험한 parser 기대값을 막는다. 승인 후이면 store/date/mapping/권한/감사 로그를 포함한 preview/commit으로 구현한다.
2. FIFO는 OQ-7/OQ-17 승인 전까지 확정 계산 경로에서 빼거나, 모든 FIFO-derived 금액을 `policy-unconfirmed`로 내려야 한다.
3. `PURCHASE_ROW` 정정은 즉시 반영 경로를 만들거나, 반영 경로가 준비될 때까지 생성 자체를 막아야 한다.
4. 정책 대기 항목은 별도 backlog로 남기고 제품 완료 범위에서 제외한다.
