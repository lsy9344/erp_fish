# 3단계 매입 화면 판매 예정가 통합 작업지시서

> 구현완료 (2026-06-25): 판매 예정가("오늘 팔 가격(예상)") 입력을 3단계 매입 화면에 통합했다.
> 매입 저장 트랜잭션이 `StoreSalesPricePlan`을 함께 upsert/delete하고, 같은 품목의 충돌은
> 저장 전에 차단한다. 별도 `판매가 계획` 메뉴는 지점장 네비게이션에서 제거하고 기존 route는
> `step=purchase`로 redirect한다. 7단계 검토 화면은 새 입력 위치 안내와 이동 링크를 제공한다.
> 본사 검토 장부 탭은 판매 예정가 입력을 끈다(지점장 전용). 검증: `pnpm db:validate`,
> `pnpm typecheck`, `pnpm lint`, 단위 4종(29 pass), e2e 3종(18 pass) 모두 통과.
> 구현 중 발견한 부수 버그(지점장 매입/검토 화면 `Invalid business date` 크래시)도 함께 고쳤다.

작성일: 2026-06-25
작업 성격: UX 통합, 판매가 계획 입력 위치 변경, 회귀 테스트 보강

## 목적

지점장이 `판매가 계획`을 별도 메뉴에서 찾지 않아도 되도록, 기존 장부 입력 흐름의 `3단계: 매입` 화면에 품목별 판매 예정가 입력을 통합한다.

지점장의 실제 사고 흐름은 `이 품목이 얼마에 들어왔는지`를 확인한 뒤 `오늘 얼마에 팔지`를 정하는 쪽에 가깝다. 따라서 매입 행 안에서 `매입 단가 / 수량 / 오늘 팔 가격(예상)`을 함께 입력하게 해, 7단계 검토 화면의 `오늘 많이 팔린 품목` 추정 매출에 판매 예정가가 자연스럽게 반영되도록 한다.

## 핵심 결정

- 판매 예정가 입력 위치는 `3단계: 매입` 화면으로 옮긴다.
- 표시 라벨은 `오늘 팔 가격(예상)`을 우선 사용한다.
- `매입 단가`, `수량`, `오늘 팔 가격(예상)`을 같은 매입 품목 행에서 볼 수 있게 한다.
- 데이터 모델은 기존 `StoreSalesPricePlan`을 계속 사용한다.
- `LedgerPurchaseItem`에 판매가 컬럼을 새로 만들지 않는다.
- 판매 예정가는 `지점 + 영업일 + 품목` 단위로 하루 1개 값만 저장한다.
- 7단계 추정 매출 계산은 계속 `StoreSalesPricePlan.plannedUnitPrice`를 우선 사용한다.
- 판매 예정가가 없는 품목은 기존처럼 매입 단가로 폴백하고 `판매가 미반영`을 표시한다.

## 이유

기존 별도 `판매가 계획` 메뉴는 계산상으로는 맞지만, 지점장이 장부 입력 중에 놓치기 쉽다. 특히 7단계에서 `판매가 미반영`을 보고 나서야 별도 메뉴를 찾아야 하므로 작업 흐름이 끊긴다.

반면 매입 화면은 사용자가 이미 품목, 매입 단가, 수량을 보는 자리다. 이곳에서 바로 `오늘 팔 가격(예상)`을 입력하면 `얼마에 들어왔고 얼마에 팔지`를 한 번에 판단할 수 있다.

다만 판매 예정가는 매입 원가가 아니므로, 라벨과 설명에서 `매입가`와 분명히 나누어야 한다.

## 범위

### 포함

- `3단계: 매입` 화면의 매입 행에 `오늘 팔 가격(예상)` 입력 추가
- 매입 저장 시 판매 예정가를 `StoreSalesPricePlan`에 함께 저장
- 기존 판매가 계획 조회 로직을 매입 화면 초기 데이터에 연결
- 같은 품목이 여러 매입 행에 있을 때 판매 예정가를 하루 1개 값으로 다루는 UX 처리
- 기존 별도 `판매가 계획` 메뉴의 노출 정책 정리
- 7단계 `판매가 미반영` 상태에서 사용자가 매입 단계로 돌아갈 수 있는 안내 보강
- 관련 단위 테스트와 E2E 테스트 보강

### 제외

- POS 품목별 실제 판매가 연동
- 품목별 실제 매출 확정 계산
- `LedgerPurchaseItem` 판매가 컬럼 추가
- `StoreSalesPricePlan` DB 모델 변경
- 판매 예정가 자동 추천
- 마진율, 매출이익, 원가성 민감 지표 노출 정책 변경
- 과거 영업일 판매 예정가 수정 허용

## 주요 파일

- Modify: `src/features/ledger/components/purchase-step-client.tsx`
- Modify: `src/features/ledger/schemas.ts`
- Modify: `src/features/ledger/actions.ts`
- Modify: `src/features/ledger/types.ts`
- Modify: `src/features/ledger/queries.ts`
- Modify: `src/app/app/store-entry/page.tsx`
- Modify: `src/components/store-manager-navigation.tsx`
- Modify: `src/features/ledger/components/review-summary-client.tsx`
- Modify: `src/features/sales-plan/queries.ts`
- Modify: `tests/unit/ledger-purchase.test.mjs`
- Modify: `tests/unit/sales-price-plan.test.mjs`
- Modify: `tests/unit/ledger-review.test.mjs`
- Modify: `tests/e2e/store-ledger-purchase.spec.ts`
- Modify: `tests/e2e/store-ledger-review.spec.ts`
- Modify or Remove: `tests/e2e/store-sales-price-plan.spec.ts`

## 구현 지시

### Task 1. 매입 단계 초기 데이터에 판매 예정가 포함

**문제**

현재 매입 단계 데이터는 `purchaseItems`만 내려준다. 판매 예정가는 별도 `sales-plan` query에서만 읽는다.

**작업**

- `getLedgerCostStepData...` 계열 query에서 해당 `storeId`, `closingDate`, `productId` 기준의 `StoreSalesPricePlan`을 함께 조회한다.
- `LedgerPurchaseLine` 또는 매입 단계 전용 view model에 `plannedUnitPrice: number | null`을 추가한다.
- 품목이 선택된 매입 행은 해당 품목의 판매 예정가를 표시한다.
- 품목이 없는 자유 입력 행은 판매 예정가 저장 대상이 아니므로 `plannedUnitPrice`를 `null`로 둔다.

**완료 기준**

- 매입 화면을 열면 이미 저장된 판매 예정가가 각 품목 행에 채워져 있다.
- 같은 품목이 여러 행에 있으면 같은 판매 예정가가 보인다.
- `StoreSalesPricePlan`이 없는 품목은 빈 입력값으로 보인다.

### Task 2. 매입 행 UI에 `오늘 팔 가격(예상)` 입력 추가

**문제**

현재 매입 행은 매입 단가와 수량만 입력한다. 사용자는 7단계 추정 매출에 필요한 판매 예정가를 이 흐름 안에서 입력할 수 없다.

**작업**

- `PurchaseStepClient`의 매입 행 입력 영역에 `오늘 팔 가격(예상)` 필드를 추가한다.
- 권장 배치는 품목 정보 아래 금액 입력 줄에 아래 순서로 둔다.

```txt
매입 단가 / 수량 / 오늘 팔 가격(예상)
```

- `오늘 팔 가격(예상)`은 원 단위 정수 입력이다.
- 필드 설명은 짧게 둔다.

권장 문구:

```txt
7단계 추정 매출에 쓰는 판매 예정가입니다.
```

- 이카운트 업로드 행은 원본 매입 단가와 수량이 잠겨 있어도 `오늘 팔 가격(예상)`은 수정할 수 있게 한다. 이 값은 원본 출고/입고 데이터가 아니라 지점장의 판매 판단값이다.

**완료 기준**

- 매입 행에서 사용자가 매입 단가, 수량, 오늘 팔 가격을 한 번에 볼 수 있다.
- 사용자는 `오늘 팔 가격(예상)`이 매입 단가가 아니라 판매 예정가임을 화면에서 이해할 수 있다.
- 모바일 화면에서 세 입력이 겹치거나 가로 overflow를 만들지 않는다.

### Task 3. 매입 저장과 판매 예정가 저장을 하나의 흐름으로 묶기

**문제**

매입 저장과 판매가 계획 저장이 따로 있으면 사용자는 한 화면에서 입력했는데 일부만 저장되는 상황을 겪을 수 있다.

**작업**

- `ledgerPurchaseSchema`에 매입 행별 선택 필드로 `plannedUnitPrice`를 추가한다.
- 빈 값은 `계획 없음`으로 해석한다.
- 값이 있으면 0원 이상의 정수만 허용한다.
- `saveLedgerPurchases` 트랜잭션 안에서 매입 행 저장 후 `StoreSalesPricePlan`을 upsert/delete 한다.
- 저장 대상은 `productId`가 있는 행만이다.
- 같은 품목의 판매 예정가가 여러 행에 입력되면 하루 1개 값으로 정리한다.

권장 정책:

- 같은 품목의 여러 행 중 판매 예정가가 모두 비어 있으면 해당 품목의 기존 계획을 삭제한다.
- 같은 품목의 여러 행에 같은 판매 예정가가 있으면 그 값으로 저장한다.
- 같은 품목의 여러 행에 서로 다른 판매 예정가가 있으면 저장을 막고 필드 오류를 표시한다.

권장 오류 문구:

```txt
같은 품목의 오늘 팔 가격은 하루에 하나만 입력해 주세요.
```

**완료 기준**

- 매입 저장 버튼 한 번으로 매입 행과 판매 예정가가 함께 저장된다.
- 저장 실패 시 매입만 저장되고 판매 예정가는 실패하는 부분 저장이 발생하지 않는다.
- 같은 품목의 판매 예정가 충돌은 저장 전에 차단된다.

### Task 4. 품목 선택 변경 시 판매 예정가 동기화

**문제**

매입 행에서 품목을 바꾸면 기존 판매 예정가 입력값이 다른 품목에 잘못 남을 수 있다.

**작업**

- 품목 선택 시 해당 품목의 기존 판매 예정가를 입력칸에 채운다.
- 선택한 품목에 저장된 판매 예정가가 없으면 빈 값으로 둔다.
- 같은 품목이 여러 행에 있으면 사용자가 한 행에서 값을 바꿀 때 같은 품목의 다른 행도 같은 값으로 맞추거나, 저장 시 충돌 오류를 명확히 보여준다.

**완료 기준**

- 품목 A에 입력한 판매 예정가가 품목 B로 잘못 따라가지 않는다.
- 같은 품목의 중복 매입 행에서 저장 결과가 예측 가능하다.

### Task 5. 별도 `판매가 계획` 메뉴 노출 정리

**문제**

매입 화면에 입력을 통합한 뒤에도 별도 `판매가 계획` 메뉴가 그대로 있으면 사용자는 어디에서 입력해야 하는지 다시 헷갈릴 수 있다.

**작업**

- 지점장 상단/하단 네비게이션에서 별도 `판매가 계획` 메뉴를 제거한다.
- 기존 `/app/store-entry/sales-plan` route는 즉시 삭제하지 않는다.
- 기존 route는 `3단계: 매입`으로 안내하거나 redirect한다.
- redirect할 경우 `storeId`와 `date` query를 보존한다.

권장 redirect:

```txt
/app/store-entry?storeId=<storeId>&date=<date>&step=purchase
```

**완료 기준**

- 지점장은 기본 네비게이션에서 판매 예정가 입력 위치를 `3단계: 매입`으로 이해한다.
- 기존 북마크나 외부 링크가 완전히 깨지지 않는다.

### Task 6. 7단계 검토 화면 안내 보강

**문제**

7단계에서 `판매가 미반영`이 보여도 사용자가 어디로 가서 고쳐야 하는지 바로 알기 어렵다.

**작업**

- `오늘 많이 팔린 품목` 카드 안내 문구를 새 입력 위치와 맞춘다.

권장 문구:

```txt
추정 매출은 3단계 매입의 오늘 팔 가격(예상)을 우선 사용합니다. 값이 없는 품목은 매입 단가로 대체해 표시합니다(판매가 미반영).
```

- `판매가 미반영` 품목이 있으면 `3단계 매입에서 오늘 팔 가격 입력` 링크 또는 버튼을 제공한다.
- 링크는 현재 지점과 영업일을 유지한 채 `step=purchase`로 이동한다.

**완료 기준**

- 사용자는 7단계에서 판매가 미반영을 보고 수정 위치를 바로 알 수 있다.
- 기존 추정 매출 계산 결과는 바뀌지 않는다. 입력 위치만 바뀐다.

### Task 7. 테스트 보강

**작업**

- 단위 테스트
  - 매입 저장 payload가 `plannedUnitPrice`를 검증한다.
  - 매입 저장 시 `StoreSalesPricePlan`이 upsert된다.
  - 같은 품목의 서로 다른 판매 예정가는 저장을 막는다.
  - 빈 판매 예정가는 기존 계획을 삭제한다.
  - 7단계 top sold item은 계속 판매 예정가를 우선 사용한다.
- E2E 테스트
  - 지점장이 3단계 매입에서 `매입 단가 / 수량 / 오늘 팔 가격(예상)`을 입력하고 저장한다.
  - 7단계 `오늘 많이 팔린 품목` 추정 매출에 오늘 팔 가격이 반영된다.
  - 오늘 팔 가격이 비어 있으면 7단계에 `판매가 미반영`이 표시된다.
  - 별도 `판매가 계획` 메뉴가 기본 네비게이션에서 보이지 않는다.

**완료 기준**

- 새 입력 위치가 테스트로 고정된다.
- 기존 `store-sales-price-plan` 테스트는 새 UX에 맞게 수정하거나, route redirect 검증으로 축소한다.

## Acceptance Criteria

- 지점장은 `3단계: 매입` 화면에서 각 매입 품목의 `오늘 팔 가격(예상)`을 입력할 수 있다.
- `오늘 팔 가격(예상)`은 매입 저장과 함께 저장된다.
- 저장된 값은 `StoreSalesPricePlan.plannedUnitPrice`로 남는다.
- 7단계 `오늘 많이 팔린 품목` 추정 매출은 저장된 `오늘 팔 가격(예상)`을 우선 사용한다.
- 오늘 팔 가격이 없는 품목은 기존처럼 매입 단가로 폴백하고 `판매가 미반영`을 표시한다.
- 같은 품목의 판매 예정가는 하루에 하나만 저장된다.
- 별도 `판매가 계획` 메뉴는 기본 지점장 네비게이션에서 제거된다.
- 모바일과 데스크톱에서 매입 행 입력값이 겹치지 않는다.

## 검증 명령

```powershell
pnpm db:validate
pnpm typecheck
pnpm test:unit:file tests/unit/ledger-purchase.test.mjs tests/unit/sales-price-plan.test.mjs tests/unit/ledger-review.test.mjs tests/unit/point-summary-sales-price-basis.test.mjs
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-purchase.spec.ts tests/e2e/store-ledger-review.spec.ts tests/e2e/store-sales-price-plan.spec.ts
```

## 구현 메모

- `StoreSalesPricePlan`은 이미 `@@unique([storeId, businessDate, productId])`를 가지고 있으므로 새 DB 모델은 필요 없다.
- 판매 예정가는 원가, 마진, FIFO lot 근거가 아니다. 지점장 화면에서 원가성 민감 지표를 새로 노출하지 않는다.
- `오늘 팔 가격(예상)`은 실제 POS 판매가가 아니므로 화면과 리포트에서는 계속 `추정` 표현을 유지한다.
- 기존 `sales-plan` feature의 query/action은 재사용하거나 매입 저장 흐름으로 흡수하되, 동일한 저장 정책이 두 곳에 중복 구현되지 않게 한다.
