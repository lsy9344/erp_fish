# 미팅 원본 메모 반영 갭 작업지시서

작성일: 2026-06-21
기준 문서: 사용자가 미팅 중 직접 작성한 원본 메모 (change.md 가공 전 raw)
대조 대상: `docs/meeting/change.md`, 현재 작업 트리의 `src/`, `prisma/`
선행 문서: `docs/goal/meeting-requirements-gap-work-order.md` (change.md 기준, 적용 완료)

## 이 문서의 목적

`meeting-requirements-gap-work-order.md`는 가공된 `change.md`를 기준으로 점검했다.
이 문서는 그 가공 전 **원본 메모**를 기준으로 다시 점검한 결과다. 원본 메모에만 있고
change.md에 누락되었거나, 코드가 메모와 충돌하는 항목을 분리한다.

## 적용 기록 (2026-06-21)

P0-1 및 모든 P1 항목과 P0-2를 구현 적용했다. typecheck/lint/unit/api 통과,
e2e 영향 테스트 갱신 완료.

- **P0-1 지점장 마진률·재고금액 노출**: `response-shaping.ts`에서 마진률(%)·총 재고금액을
  지점장 요약에 노출(단, status ok일 때만, FIFO 미확정 시 숨김). 매출원가/이익/영업이익/
  인당생산성/품목별 단가·lot은 계속 차단. `review-queries.ts`에 마진율/재고금액 metric 추가.
- **P0-2 코드 지점별 표시명 덮어쓰기**: `LedgerInputCodeStoreAlias` 모델+마이그레이션,
  지점장 전용 액션 `code-alias-actions.ts`, 손실 유형 read-path 연동, 지점장 손실 페이지에
  표시명 편집 UI, audit 로그. 코드 등록/수정은 본사 전용 유지.
- **P1-3 '설정' 메뉴 삭제**: nav 배열·임시 필터 제거.
- **P1-4 관제판**: 매출차이 컬럼 삭제, 마진률은 단순 "%" 유지(사용자 지시).
- **P1-5 이상신호**: 마진률 미달 신호에 "%p 미달 + 미달 금액" 표기 추가.
- **P1-6 매출 상위5/하위5**: 판매량×단가 추정 매출로 순위 산출(추정 명시).
- **P1-7 용어 외부화**: `src/features/inventory/terms.ts` 중앙 사전 도입.

원래 이번 작업 범위는 **검토 결과 보고 + 작업지시서 정리까지**였으나, 이후 사용자가
"작업지시서대로 구현 시작" 및 P0-2 전체 구현을 지시하여 구현까지 완료했다.

## 사용자 정책 결정 (2026-06-21)

이번 검토 중 확정된 두 가지 정책 결정을 기록한다.

1. **지점장 계산값 노출**: 지점장 화면 '계산값'에 **마진률과 재고금액을 노출한다**.
   단, 매출원가, 매출이익, 영업이익, 인당생산성, FIFO 원가, lot 근거는 계속 차단한다.
   → 이는 선행 문서 `meeting-requirements-gap-work-order.md`의 P0 Task 1 "차단 유지" 권고를
   **뒤집는 결정**이다. 본사 승인이 내려진 것으로 처리한다.
2. **코드 관리 수정 권한**: 코드 **등록은 본사**가 하되, 각 지점은 **화면 표시명만 자기 지점용으로
   덮어쓰기**할 수 있다. 코드 자체(키/값)는 지점장이 수정하지 못한다.

## 근거 요약 (원본 메모 항목별)

| 원본 메모 항목 | change.md 반영 | 코드 상태 | 근거 |
| --- | --- | --- | --- |
| 전일재고 이력 팝업(수량 클릭→작은 화면) | 반영 | 구현됨 | `src/features/inventory/components/inventory-step-client.tsx:1239`, `:968` |
| 재고금액 FIFO 계산 + 판매 lot 이력 | 반영 | 정책 게이트로 차단 | `src/server/calculations/policy-gates.ts:55` |
| 이카운트 엑셀 → 매입 자동 작성 | 반영 | 미구현(파서만) | `src/features/ledger/ecount-purchase-import.ts`, 매입기준 마스터 import만 동작 |
| 재고 페이지 용어 쉽게 수정 | 부분 반영 | 하드코딩 | 용어가 컴포넌트에 인라인, i18n/상수 파일 없음 |
| 손실 수량 에러 문구 | (메모 예시) | 구현됨 | `src/features/losses/quantity-error.ts:30` |
| '차이' → '판매량' 명칭 변경 | 반영 | 구현됨 | `src/features/inventory/components/inventory-step-client.tsx:1340`, `:1616` |
| 매입 가격 강제입력(기준가 기본+수정) | 반영 | 구현됨 | `src/features/ledger/components/purchase-step-client.tsx:405`, `:787` |
| 이상신호: 매출하락률/이익률하락폭/손실액 삭제 | 부분 반영 | 구현됨 | migration `20260616143000` 4개 필드 삭제 |
| 이상신호: 매출차액 삭제 + 마진률 % 미달 + 금액 표기 | 부분 반영 | 부분 구현 | `src/server/calculations/anomaly.ts:250` (% 미달/금액 표기 없음) |
| 이상신호: 재고 차이 기준 유지(1개라도 어긋나면 알림) | 반영 | 구현됨 | `prisma/schema.prisma:335`, `src/server/calculations/anomaly.ts:198` |
| 이상신호: 마진률 추가 | 반영 | 구현됨 | `prisma/schema.prisma:334`, `anomaly-threshold-settings-client.tsx:236` |
| 모든 코멘트/용어 쉽게 수정 | 미반영 | 하드코딩 | 전역 i18n/상수 부재 |
| 지점장 매출 입력 페이지 추가 | 반영 | 구현됨 | `src/app/app/store-entry/page.tsx`, sales step |
| 코드 관리 — 입력자(지점) 표시명 덮어쓰기 | 미반영 | 미구현/충돌 | `src/features/master-data/code-actions.ts:207` 본사 전용 |
| '설정' 메뉴 삭제 | 미반영 | 미구현(시각적 비활성만) | `src/components/app-sidebar.tsx:75`, `src/components/app-sidebar-nav.tsx:88` |
| 관제판: 마진률 "20/100" 형식 + 금액 추가 | 미반영 | 미구현 | `src/features/dashboard/components/hq-dashboard-table.tsx:810` |
| 관제판: 매출차이 삭제 | 미반영 | 충돌(컬럼 존재) | `src/features/dashboard/components/hq-dashboard-table.tsx:78` |
| 급여 관리(이름·금액·조퇴/지각·메모) | 반영 | 미구현 | `prisma/schema.prisma:358` workerCount/workMemo만 |
| 레이아웃 데스크톱 편리하게 | 부분 반영 | 부분(그리드 리사이징 적용됨) | 선행 문서 P1 Task 4 |
| 지점장 계산값: 총매출/이익률/근무인원/재고금액만 | 반영 | 충돌(마진률·재고금액 차단) | `src/server/sensitive-fields.ts:10`, `:26` |
| 매출 상위5/하위5 품목 + 매출액 | 미반영 | 미구현(최고 1개만) | `src/features/reports/types.ts:241` |
| 희망 판매가 입력 페이지 + 손실 연동 + 관제판 차액(★) | 반영 | 미구현(정책 게이트) | `src/server/calculations/policy-gates.ts:62`, hopedSalePrice 필드 없음 |
| 전 지점 잔여 재고 한눈에 + 손익계산서 + 데이터 조사 | 반영 | 부분(월 P&L 일부, 통합 재고 없음) | `src/features/reports`, 통합 재고 뷰 부재 |
| 본사 전용 지출 시스템(본사만 입력/조회) | 반영 | 미구현 | LedgerExpense는 지점 일일비용, 본사 고정비 모델 없음 |

## P0. 정책 결정이 내려진 충돌 항목 (구현 가능)

### Task 1. 지점장 계산값에 마진률·재고금액 노출

**결정**
지점장 화면 '계산값'에 마진률(grossMarginRate/marginRate)과 재고금액(inventoryAmount)을 노출한다.
매출원가, 매출이익, 영업이익, 인당생산성, FIFO 원가, lot 근거는 계속 차단한다.

**작업 지시**
- `src/server/sensitive-fields.ts`의 `defaultSensitiveFieldKeys`에서
  `grossMarginRate`, `marginRate`, `inventoryAmount`를 노출 대상으로 전환한다.
- **주의(substring 매칭 함정)**: 현재 `isSensitiveFieldKey`는 부분 문자열로 매칭한다.
  `marginRate`를 빼면 `grossMarginRate`도 함께 풀린다(의도와 일치). 그러나
  `inventoryAmount`를 노출로 바꿔도 `salesDifference`, `differenceAmount`,
  `amountDifference`는 계속 차단되어야 하므로, 노출 허용은 **정확 키 화이트리스트**로
  처리하고 차단 substring 목록은 그대로 두는 방식을 권장한다.
- `src/features/ledger/response-shaping.ts`의 `storeManagerReviewMetricIds`에
  `grossMarginRate`, `inventoryAmount`를 추가한다.
- `src/features/inventory/queries.ts`의 지점장 응답에 재고금액이 포함되도록 한다.
- 지점장 응답/HTML/CSV/forbidden payload에 **허용 외** 민감 값(원가/이익/FIFO/lot)이
  새지 않는 테스트를 갱신한다. 기존 차단 테스트 중 마진률·재고금액 부분은 노출 기대로 수정한다.

**완료 기준**
- 지점장 화면 계산값에 총매출, 마진률, 근무인원, 재고금액만 노출된다.
- 매출원가/매출이익/영업이익/인당생산성/FIFO/lot은 여전히 차단된다.

**검증**
```powershell
pnpm test:unit -- tests/unit/sensitive-response-shaping.test.mjs
pnpm test:e2e -- tests/e2e/store-ledger-review.spec.ts
```

### Task 2. 코드 관리 — 지점별 표시명 덮어쓰기

**결정**
코드 등록은 본사 전용 유지. 각 지점은 화면 표시명(라벨)만 자기 지점용으로 덮어쓰기 가능.

**작업 지시**
- 지점별 표시명 override 모델을 추가한다(예: `LedgerInputCodeStoreAlias`:
  codeId, storeId, displayName, updatedBy, updatedAt).
- 코드 자체(키/값/활성)는 본사만 수정. override는 해당 지점 사용자만 수정.
- 지점장 화면에서 코드 라벨을 읽을 때 override가 있으면 우선 적용한다.
- override 변경도 audit log에 남긴다(주체/시각/기존→변경).

**완료 기준**
- 지점장은 코드를 새로 만들거나 키를 바꾸지 못한다.
- 지점장은 자기 지점 화면에 보이는 표시명만 바꿀 수 있고, 다른 지점에는 영향 없다.

**검증**
```powershell
pnpm test:unit -- tests/unit/master-data-history.test.mjs
pnpm test:e2e -- tests/e2e/master-data-stores.spec.ts
```

## P1. 정책 충돌 없는 누락 항목 (바로 구현 가능)

### Task 3. '설정' 메뉴 삭제

**문제**
nav 배열에 '설정' 항목이 그대로 있고(`app-sidebar.tsx:75`), `app-sidebar-nav.tsx:88`에서
라벨이 '설정'이면 렌더링만 건너뛰는 임시 처리만 되어 있다.

**작업 지시**
- `src/components/app-sidebar.tsx:74-79`의 '설정' 항목을 배열에서 제거한다.
- `src/components/app-sidebar-nav.tsx:88-90`의 `if (item.label === "설정")` 임시 필터를 제거한다.
- '설정' 라벨에 의존하던 다른 코드/테스트가 없는지 확인한다.

**완료 기준**
- 본사/지점장 nav 어디에도 '설정' 항목이 나타나지 않는다.

### Task 4. 관제판 마진률 표기 변경 + 매출차이 삭제

**문제**
- 마진률이 "35.2%" 퍼센트로만 표시된다(`hq-dashboard-table.tsx:810`).
- 매출차이 컬럼이 그대로 존재한다(`hq-dashboard-table.tsx:78`).

**작업 지시**
- 마진률을 "20/100" 형식(비율) + 금액 함께 표기로 바꾼다.
  "20/100"의 분모/분자 의미(예: 마진금액/매출 또는 달성/목표)를 본사에 1줄로 확정받는다.
- 매출차이(salesDifference) 컬럼을 관제판 테이블 정의와 렌더에서 제거한다.
- 컬럼 폭 저장 localStorage 키에서 salesDifference 잔재를 정리한다.

**완료 기준**
- 관제판에 매출차이 컬럼이 없다.
- 마진률이 비율 + 금액 형식으로 보인다.

**검증**
```powershell
pnpm test:unit -- tests/unit/hq-dashboard.test.mjs
pnpm test:e2e -- tests/e2e/hq-dashboard.spec.ts
```

### Task 5. 이상신호 "마진률 % 미달 + 금액" 표기

**문제**
매출차액 금액 필드는 삭제됐으나, 메모의 "마진률 몇 % 미달 + 그 금액" 표기는 없다.

**작업 지시**
- 마진률 신호 평가 시 "기준 대비 몇 %p 미달"과 "그에 해당하는 금액"을 함께 산출/표시한다.
- 신호 메시지(`src/server/calculations/anomaly.ts:222` 부근)에 미달 %p와 금액을 포함한다.

**완료 기준**
- 마진률 미달 신호에 "기준 X% 대비 Y%p 미달, 금액 Z원" 형태가 보인다.

**검증**
```powershell
pnpm test:unit -- tests/unit/calculation-policy-gates.test.mjs
```

### Task 6. 매출 상위5/하위5 품목

**문제**
현재 최고매출 1개 품목만 있다(`reports/types.ts:241`).

**작업 지시**
- 리포트 query에서 품목별 매출액을 집계해 상위 5 / 하위 5 리스트를 만든다.
- 각 품목의 매출액을 함께 반환/표시한다.
- 지점장/무권한 응답에 민감 지표가 새지 않게 한다.

**완료 기준**
- 본사 리포트에 상위5/하위5 품목과 매출액이 표로 보인다.

**검증**
```powershell
pnpm test:unit -- tests/unit/hq-reports.test.mjs
pnpm test:e2e -- tests/e2e/hq-reports.spec.ts
```

### Task 7. 용어/코멘트 외부화(쉽게 수정)

**문제**
"재고 페이지 용어 쉽게 수정", "모든 코멘트 쉽게 수정" 요구가 있으나
용어가 컴포넌트에 하드코딩되어 있다.

**작업 지시**
- 우선 재고/매입/손실 화면의 라벨·안내문구·코멘트를 중앙 상수(또는 경량 i18n)로 모은다.
- 비개발자 수정 범위를 정한다: 코드 상수 파일 1곳 vs. 본사 관리 화면에서 편집.
  내부 ERP 초기 범위라면 상수 파일부터 시작한다.

**완료 기준**
- 재고/매입/손실 화면 용어를 한 곳에서 바꾸면 화면에 반영된다.

## P2. 신규 모듈 — 설계 후 구현 (정책/스코프 확정 필요)

### Task 8. 급여 관리 모듈

**현재 상태**
`workerCount` + `workMemo` 집계 필드만 존재. 직원별 모델 없음.

**선행 조건**
- 운영 주체(본사/지점장) 확정. 메모에 "(지점장?본사?)" 미확정으로 적혀 있음.
- 개인정보 보존 범위 확정.

**작업 지시**
- `Employee`(이름, 입사일, 활성, 기본 소속), `LedgerWorker`/근무기록(근무일, 지점, 직원id,
  지각/조퇴/특수상황 메모), `PayrollAdjustment`(수동 급여 차액 + 메모) 모델 설계.
- 급여 차액은 자동 계산이 아니라 수동 입력/메모로 처리.
- 여러 지점 교대 근무는 직원별 월 합산으로 정산.
- 기존 workerCount/workMemo를 직원별 기록으로 자동 분해하지 않는다.

### Task 9. 본사 전용 지출(고정비) 시스템

**현재 상태**
LedgerExpense는 지점 일일비용. 본사 고정비 모델/화면 없음. `sensitive-fields.ts:28`의
`fixedCost`는 선언만 있고 데이터 모델 없음.

**작업 지시**
- 매장별 월 고정비/지출 모델 설계(월세, 세금 등). 본사만 입력/조회.
- 본사 전용 입력 화면 + 변경 이력.
- 지점장 응답에서 fixedCost 차단 유지.
- 월 손익계산서 계산에 연동(Task 11과 묶음).

### Task 10. 재고금액 FIFO 계산 + 판매 lot 이력

**적용 완료 (2026-06-22)**
게이트 해제하고 재고 입력 화면에 노출. 결정: FIFO 재고금액 + 판매 lot 이력을 **본사+지점장
전체**에 노출(이전 lot 차단 결정 뒤집음), 품목 재고금액 클릭→팝업으로 "어떤 lot을 팔았는지"
(매입일/단가/입고/소진/잔량) 표시, 차감 순서는 현행 엔진(잔여수량 역산 FIFO) 유지.
- 데이터: `inventory/fifo-lots.ts` `getLedgerInventoryFifoLotsByProductId` read 추가.
- 타입/응답: `inventory/types.ts`·`queries.ts`에 `fifoLots` 추가, 지점장 응답에서
  `inventoryAmount`·`fifoLots` 노출(단가/매입액/손실액·조정금액은 계속 차단).
- UI: `inventory-step-client.tsx` 재고금액 컬럼 상시 노출 + FIFO lot 팝업, "FIFO 계산 안 함"
  안내 제거. 검토 요약(`response-shaping.ts`)은 별개 surface로 기존 정책 유지.
- 검증: typecheck/lint/unit(319) 통과, e2e inventory/review/policy-gates 통과.

**구현 전 상태(기록)**
FIFO 계산 코드/lot 테이블 일부 존재하나 `policy-gates.ts:55`에서 OQ-7/OQ-17 미확정으로 차단.

**선행 조건**
- OQ-7 FIFO 적용 범위 승인, OQ-17 반품/조정/손실 처리 순서 승인.
- 지점장 lot/원가 노출 차단 유지(Task 1과 일관).

**작업 지시**
- 본사 전용 품목별 lot 이력 API(매입일/단가/잔량, 기본 최근 1개월 + 기간 필터).
- "어떤 lot을 팔았는지" 판매 차감 근거 이력 노출(본사 전용).
- 통합 전체 재고는 수량-only 먼저 열지, FIFO 승인 후 금액 포함으로 열지 결정.

### Task 11. 전 지점 통합 재고 뷰 + 월 손익계산서 + 데이터 조사

**현재 상태**
월간 P&L 일부 존재, 전 지점 품목별 통합 재고 뷰 없음.

**작업 지시**
- 10개 지점 품목별 잔여 재고 + 총합 통합 뷰(본사 store scope 서버 강제).
- 본사 고정비(Task 9) 취합한 매장별 월 손익계산서.
- "추천 데이터 조사 / 입력 데이터 조사" 요구는 별도 분석 항목으로 정리해 본사에 제안.

### Task 12. 희망 판매가 입력 페이지 + 손실 연동 + 관제판 차액 (★ 메모 강조)

**현재 상태**
`hopedSalePriceLossAmount`가 `policy-gates.ts:62`에서 OQ-9 미확정으로 차단.
`hopedSalePrice` 입력 필드/페이지 없음.

**선행 조건**
- OQ-9(희망 판매가 기준 손실액) 승인.

**작업 지시**
- 영업 시작 전 지점장이 품목별 희망 판매가를 입력하는 페이지 설계.
- 영업 종료 후 장부 입력과 연동, 손실액을 희망 판매가 기준으로 산정.
- 이로 인한 매출 차액을 관제판에 표시(단, 지점장 노출 정책과 충돌 없게 본사 전용).

## 완료 전 공통 검증

```powershell
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:api
pnpm test:e2e:core
git diff --check
```

## 주의 / 함정 기록

- `sensitive-fields.ts`는 substring 매칭이다. 노출 전환 시 의도치 않게 다른 차단 키가
  풀리지 않도록 정확 키 화이트리스트로 처리한다(Task 1).
- '설정' 메뉴는 삭제가 요구다. 라벨 기반 임시 필터(`app-sidebar-nav.tsx:88`)는 잔재이므로
  함께 제거한다(Task 3).
- 관제판 "20/100" 분모/분자 정의가 모호하다. 구현 전 본사 확정 필요(Task 4).
- FIFO/희망판매가/급여/본사지출/월손익/통합재고는 정책 또는 스코프 확정 후 구현한다.
  승인 없이 제품 완료 기능처럼 표기 금지.
