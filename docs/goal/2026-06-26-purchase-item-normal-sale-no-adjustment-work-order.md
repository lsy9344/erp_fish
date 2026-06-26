# 매입 품목 정상 판매를 재고조정과 분리 (조정 사유 면제) 작업지시서

**작성일:** 2026-06-26

**목표:** 재고 4단계에서 당일 매입이 있는 품목의 당일재고(남은 양)를 입력했을 때, 그것이 정상 판매 소진(기준재고보다 적거나 같음)이면 **조정 사유 없이 바로 저장**되게 한다. 진짜 실사 차이(초과 입력, 손실 혼재, 매입 없는 이월 품목의 차이)는 기존대로 조정 사유를 요구한다.

**배경(현재 문제):**
`기준재고 = 전일재고 + 당일매입 − 손실`을 "시스템상 있어야 할 양"으로 보고, 사용자가 입력한 당일재고가 이와 다르면 무조건 "실사 차이 = 재고조정"으로 간주해 조정 사유를 강제한다. 그래서 "매입 6개 중 2개 남음(4개 정상 판매)"이 "4개 차이 → 사유 요구"가 되어, 매일 모든 판매 품목이 조정 사유를 요구하게 된다. 점주는 "그냥 남은 재고 적었는데 왜 사유를 묻나" 혼란을 겪는다.

## 확정 정책 (조정 사유 면제 조건)

다음을 **모두** 만족하는 품목만 "정상 판매"로 보고 조정 사유를 면제한다:

1. `purchasedQuantity > 0` (당일 매입 있음)
2. `lossQuantity === 0` (손실 없음)
3. `currentQuantity <= systemQuantity` (정상 소진 — 당일재고가 기준재고 이하)

면제 조건을 벗어나면 **기존대로 조정 사유 요구**:
- 초과(`currentQuantity > systemQuantity`, 재고가 매입보다 많은 이상 상태) → 사유 요구
- 손실 혼재(`lossQuantity > 0`) → "정상 판매 + 추가 차이" 구분 불가하므로 사유 요구
- 매입 없는 이월 품목(`purchasedQuantity === 0`)의 차이 → 진짜 실사 차이이므로 사유 요구

> 헬퍼 이름(제안): `isPurchaseDrivenSale(item)` — 위 3조건을 캡슐화. 한 곳에 정의해 서버/클라이언트가 공유한다.

## 조사 결론 (영향 범위 — 왜 안전한가)

병렬 코드 조사로 확인된 사실:

- **FIFO 원가: 안전.** `fifo-lots.ts`의 `closingQuantity`는 `currentQuantity`를 직접 읽는다. 조정 레코드를 보지 않는다. 조정을 안 만들어도 소진량/소진금액(COGS)은 그대로 계산된다.
- **리포트(판매량/추정매출/COGS): 안전.** `reports/queries.ts`의 판매량은 순수하게 `전일+매입−당일재고` 역산. 조정 레코드와 무관. 추정매출/랭킹/카테고리매출 모두 영향 없음.
- **유일한 영향: `salesDifference`(매출차액) 1개 지표.** `calculations/ledger.ts`의 `calculateSalesDifference`가 `productSalesAmount = COGS + 조정금액 − 손실`로 조정금액을 더한다. 정상 판매 품목의 조정 레코드가 안 생기면 이 값이 바뀐다. → **이게 사실 더 정확하다**: 정상 판매를 "조정"으로 잡던 것이 빠지므로 매출차액이 실제 의미에 가까워진다. 본사 검토 화면 표시만 검증/문구 점검 필요.

## 구현 계획

### 공유 헬퍼 추가

- [ ] `src/features/inventory/inventory-persist-policy.ts`(또는 별도 모듈)에 `isPurchaseDrivenSale` 추가.

```ts
// 당일 매입이 있고 손실이 없으며 당일재고가 기준재고 이하인 정상 판매 소진.
// 이 경우 기준재고와의 차이는 재고조정(실사 차이)이 아니라 판매로 본다.
export function isPurchaseDrivenSale(item: {
  previousQuantity: number;
  purchasedQuantity: number;
  lossQuantity: number;
  currentQuantity: number | null;
}) {
  if (item.purchasedQuantity <= 0 || item.lossQuantity > 0) return false;
  if (item.currentQuantity === null) return false;
  const systemQuantity =
    item.previousQuantity + item.purchasedQuantity - item.lossQuantity;
  return item.currentQuantity <= systemQuantity;
}
```

### 서버 조정 가드 면제

- [ ] `src/features/inventory/adjustment-save-guard.ts`의 `getInventorySaveAdjustmentErrors`에서, `isManualFirstInventoryEntry` 면제와 동일한 위치에 `isPurchaseDrivenSale(item)`이면 `continue` 추가. 이 가드 아이템 타입(`InventorySaveAdjustmentGuardItem`)에 이미 previousQuantity/purchasedQuantity/lossQuantity/currentQuantity가 있으므로 추가 필드 불필요.

### 서버 저장 액션 정합성

- [ ] `src/features/inventory/actions.ts` `saveLedgerInventoryItems`와 `src/features/inventory/hq-edit-actions.ts`는 이미 `getInventorySaveAdjustmentErrors`를 통해 검증하므로 가드만 고치면 자동 반영. 다만 `reconcileLedgerInventoryAdjustments`(저장 후 조정 레코드 동기화)가 정상 판매 품목에 대해 조정 레코드를 새로 만들지 않는지 확인. 만들면 면제 조건 품목은 건너뛰도록 정합성 맞춤.

### 클라이언트 검증/표시 면제

- [ ] `src/features/inventory/components/inventory-step-client.tsx`:
  - `validateInventorySaveAdjustments` 루프에 `isPurchaseDrivenSale(item)`이면 `continue`.
  - `isAdjustmentNeeded`가 `isPurchaseDrivenSale`이면 false 반환(“고칠 내용 있음” 배지/조정 프롬프트 숨김).
  - "당일 판매량"(systemQuantity − currentQuantity) 표시는 그대로 두되, 정상 판매면 빨간 강조(차이=조정 뉘앙스)가 아니라 중립 표시로 둔다.

### 기존 "미입력 차단"과의 관계 (이미 구현됨, 유지)

- 매입/손실 품목 당일재고를 빈칸으로 시작 + 빈칸이면 저장/다음단계 차단(`requiresCurrentQuantityEntry`, `validateRequiredCurrentQuantities`)은 그대로 유지. 본 변경은 "빈칸 통과 후 값 입력 시 조정 사유까지 요구하던" 2차 관문을 정상 판매에 한해 제거하는 것.

## 테스트 계획

### 수정할 기존 테스트

- [ ] `tests/unit/ledger-inventory.test.mjs`의 `"inventory normal save requires matching adjustment record for changed actual quantities"`(약 766–817줄): product-1(전일10+매입3−손실1=기준14, 실제9)은 **손실이 있으므로** 여전히 조정 요구 → 단언 유지. 단, 매입 있고 손실 없는 정상 판매 케이스를 새로 추가해 "조정 면제"를 검증.
- [ ] 면제 헬퍼 단위 테스트: 부족/초과/손실혼재/매입없음 4케이스의 `isPurchaseDrivenSale` 반환값 고정.

### 보존할 테스트 (깨지면 안 됨)

- [ ] `tests/e2e/store-ledger-inventory-adjustment.spec.ts`: "실제 재고 차이를 바꾼 이유와 함께 저장"(매입 없는 실사 차이), "바꾼 이유가 비어 있으면 저장을 막고 포커스", "손실 저장 후 조정 재계산" — 전부 보존(면제 조건 밖). 실행해 회귀 없음 확인.
- [ ] `tests/unit/ledger-inventory.test.mjs`의 manual-product 첫 입력 면제, 스키마 reason 필수 검증 — 보존.

### 새 E2E (정상 판매 흐름)

- [ ] `tests/e2e/store-ledger-inventory.spec.ts`에 시나리오 추가: 매입 6 품목 → 당일재고 2 입력 → **조정 사유 없이** "저장" 한 번에 성공 → 재조회 시 값 2 유지. (현재 임시로 추가된 "미입력 차단" 테스트의 두 번째 저장이 이 흐름이므로 통합/정리)

## 검증 명령

```powershell
corepack pnpm test:unit:file tests/unit/ledger-inventory.test.mjs
node scripts\run-playwright-clean.mjs tests/e2e/store-ledger-inventory.spec.ts
node scripts\run-playwright-clean.mjs tests/e2e/store-ledger-inventory-adjustment.spec.ts
corepack pnpm typecheck
```

## 완료 기준

- 매입 있고 손실 없는 품목에 당일재고(기준 이하)를 입력하면 조정 사유 없이 한 번에 저장된다.
- 초과 입력, 손실 혼재, 매입 없는 이월 품목의 차이는 여전히 조정 사유를 요구한다.
- FIFO 원가·리포트 판매량/추정매출은 수치가 바뀌지 않는다(역산 기반).
- `salesDifference` 지표는 정상 판매가 조정에서 빠지면서 값이 바뀔 수 있다(의도된 정확화) — 본사 검토 화면 문구/표시 점검.
- 기존 실사 차이 조정 테스트는 그대로 통과한다.

## 범위 밖 (이번에 안 함)

- 재고조정 모델 자체의 스키마 변경.
- POS 실판매수량 별도 입력(여전히 재고 역산 유지).
- 매출차액 정의 변경(조정금액 합산 공식 자체는 유지, 정상 판매가 조정에서 빠지는 효과만).
