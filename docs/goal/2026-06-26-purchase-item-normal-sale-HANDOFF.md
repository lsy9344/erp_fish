# 핸드오프: 매입 품목 정상 판매를 재고조정과 분리 (조정 사유 면제)

**작성일:** 2026-06-26
**상태:** 조사 완료 + 작업지시서 확정 + 헬퍼 1개만 추가됨. 나머지 구현 미완. 별도 세션에서 이어감.
**짝 문서:** `docs/goal/2026-06-26-purchase-item-normal-sale-no-adjustment-work-order.md` (작업지시서 본문 — 정책/계획/완료기준)

**본문(1~8절)** = 결정·계획. **부록 A~F** = 누락 없는 상세 근거: A(사용자 결정 전체), B(DB 원시 조회 사실), C(검증된 코드 동작·줄번호), D(병렬 조사 4건 상세), E(막힌 것·함정), F(working tree 오염 상세). 다음 세션은 본문 6절로 구현, 막히면 부록 참조.

---

## 1. 한 줄 요약

재고 4단계에서 **당일 매입이 있는 품목의 당일재고(남은 양)를 입력했을 때, 그것이 정상 판매 소진이면 조정 사유 없이 바로 저장**되게 한다. 진짜 실사 차이(초과 입력·손실 혼재·매입 없는 이월 차이)는 기존대로 조정 사유를 요구한다.

## 2. 왜 이 작업이 생겼나 (사용자 맥락)

- 사용자(점주)가 26일 재고 화면에 들어가 디폴트값 그대로 두고 전복만 바꿔 저장 → "오늘 많이 팔린 품목"에 전복만 떴다.
- 원인 추적 결과: 판매량 = `전일재고 + 당일매입 − 당일재고` 역산. **당일재고를 0으로 두면 "전량 판매"로 해석**된다.
- 실제 DB 확인: 25/26일 어디에도 "당일재고 0 저장" 행은 없었고(미입력은 null이라 집계 제외), 전복만 당일재고=2로 저장돼 8개 판매로 정상 계산된 것이었다.
- 사용자 요구 1: "입력 안 하면 못 넘어가게" → **이미 구현됨**(아래 3-A, 커밋 `7d6c3ae`).
- 사용자 요구 2: 그 위에서 "매입 6, 남은 2 = 4개 판매"인데 시스템이 4개 차이를 **재고조정으로 보고 조정 사유를 강제**하는 게 발견됨 → "판매로 보고 조정 없이 저장"으로 바꿔달라. 이게 본 작업.

## 3. 현재 코드 상태 (working tree, 미커밋)

> ⚠️ **주의: working tree에 이번 작업과 무관한 변경이 섞여 있다.** 커밋 전 분리 필요.

### 3-A. 이미 완료되어 유지할 것

- **커밋 `7d6c3ae` "stabilize manual inventory entry visibility" + `d7151e7`**: "근거 없는 활성 품목 자동 표시 제거 + 품목 추가" 및 "미입력 차단"이 이미 들어가 커밋됨.
- working tree 미커밋: `inventory-step-client.tsx`에 `requiresCurrentQuantityEntry` / `validateRequiredCurrentQuantities`("매입·손실 품목 당일재고 빈칸 시작 + 빈칸이면 저장 차단")가 있음. `tests/e2e/store-ledger-inventory.spec.ts`에 "매입 품목은 당일재고를 빈칸으로 시작하고 미입력이면 저장을 막는다" 테스트 추가됨(통과 확인됨). **이건 유지.**

### 3-B. 이번 작업(조정 면제) 진행도 — 거의 안 됨

- ✅ `src/features/inventory/inventory-persist-policy.ts`: **`isPurchaseDrivenSale` 헬퍼 추가 완료**(약 69줄~). 아래 4의 정책을 캡슐화. **이미 작성됨, 그대로 쓰면 됨.**
- ❌ `src/features/inventory/adjustment-save-guard.ts`: 면제 **미적용** (isPurchaseDrivenSale import/사용 0건).
- ❌ `src/features/inventory/components/inventory-step-client.tsx`: 조정 면제 **미적용** (isPurchaseDrivenSale 사용 0건). `validateInventorySaveAdjustments` / `isAdjustmentNeeded`는 아직 기존 로직.
- ❌ 테스트(조정 면제 검증) 미작성.

### 3-C. ⚠️ 이번 작업과 무관한 미커밋 변경 (건드리지 말 것 / 별도 처리)

`git status`에 아래가 떠 있으나 **이번 작업과 무관**하다. 커밋 시 섞이지 않게 주의:
- `src/features/dashboard/queries.ts` (2줄)
- `src/features/ledger/components/hq-ledger-close-dialog.tsx` (18줄)
- `src/features/ledger/response-shaping.ts` (19줄)
- `src/features/reports/queries.ts` (6줄)
- `src/server/calculations/ledger.ts` (43줄, 코드 삭제 포함) — **확인됨: salesDifference/조정 로직은 안 건드림**, 그래도 별개 변경.
- `src/server/calculations/policy-gates.ts` (18줄 삭제)
- `tests/unit/calculation-policy-gates.test.mjs`, `tests/unit/hq-reports.test.mjs`, `tests/unit/sensitive-response-shaping.test.mjs`

→ 별도 세션에서: 이 변경들의 출처/목적을 먼저 확인하고, 이번 조정-면제 작업과 **별도 커밋으로 분리**하라.

## 4. 확정된 정책 (사용자 승인 완료)

`isPurchaseDrivenSale` = 다음을 **모두** 만족하면 정상 판매로 보고 조정 사유 면제:

1. `purchasedQuantity > 0` (당일 매입 있음)
2. `lossQuantity === 0` (손실 없음)
3. `currentQuantity !== null && currentQuantity <= systemQuantity` (정상 소진; 기준재고 이하)
   - `systemQuantity = previousQuantity + purchasedQuantity - lossQuantity`

면제 조건 밖 = **기존대로 조정 사유 요구**:
- 매입 없음(이월 품목 차이 = 진짜 실사 차이)
- 손실 혼재(정상 판매 + 추가 차이 구분 불가) — 사용자 확정: "손실 있으면 조정 요구 유지"
- 초과(`currentQuantity > systemQuantity`, 재고가 매입보다 많은 이상 입력) — 사용자 확정: "여전히 사유 요구"

## 5. 조사 결론 (병렬 4개 에이전트, 영향 범위)

| 영역 | 결론 | 핵심 근거 (file:line) |
|------|------|----------------------|
| **FIFO 원가** | ✅ 안전. 조정 레코드 안 봄 | `fifo-lots.ts` closingQuantity = `currentQuantity` 직접 사용(~388). 소진량 = available − closingQuantity |
| **리포트(판매량/추정매출/COGS)** | ✅ 안전. 순수 역산 | `reports/queries.ts:344-351` getItemSoldQuantity, `:2121-2122` 랭킹, `ledger.ts:434-460` COGS — 모두 currentQuantity 역산, 조정 무관 |
| **유일 영향: `salesDifference`** | ⚠️ 값 바뀜(의도된 정확화) | `ledger.ts:509-526` calculateSalesDifference: `productSalesAmount = COGS + 조정금액 − 손실`. 정상 판매 조정이 안 생기면 조정금액 합산이 줄어듦 → 매출차액이 실제에 더 가까워짐. 본사 검토 화면 문구만 점검 |

**즉 FIFO·리포트는 손 안 대도 됨. salesDifference만 표시/문구 점검.**

## 6. 남은 구현 단계 (작업지시서 그대로)

1. **(완료) 헬퍼** `isPurchaseDrivenSale` — `inventory-persist-policy.ts`에 이미 있음.
2. **서버 가드** `src/features/inventory/adjustment-save-guard.ts` `getInventorySaveAdjustmentErrors`: `isManualFirstInventoryEntry` 면제 옆에 `if (isPurchaseDrivenSale(item)) continue;` 추가. 가드 아이템 타입에 prev/purchased/loss/currentQuantity 이미 있음.
3. **저장 액션 정합성** `actions.ts` `saveLedgerInventoryItems` + `hq-edit-actions.ts`: 가드를 공유하므로 자동 반영. 단 `reconcileLedgerInventoryAdjustments`가 정상 판매 품목에 조정 레코드를 새로 만들지 않는지 확인(만들면 면제 품목 건너뛰게).
4. **클라이언트** `inventory-step-client.tsx`:
   - `validateInventorySaveAdjustments` 루프에 `if (isPurchaseDrivenSale(item)) continue;`
   - `isAdjustmentNeeded`가 `isPurchaseDrivenSale`이면 false 반환(“고칠 내용 있음” 배지/조정 프롬프트 숨김)
   - `import { isManualFirstInventoryEntry, isPurchaseDrivenSale } from "~/features/inventory/inventory-persist-policy"` (현재 isManualFirstInventoryEntry만 import 중)
5. **테스트**:
   - 유닛: `isPurchaseDrivenSale` 4케이스(부족/초과/손실혼재/매입없음) + `getInventorySaveAdjustmentErrors`에 매입 정상판매 면제 케이스 추가. `tests/unit/ledger-inventory.test.mjs`의 product-1(손실 있음)은 그대로 조정 요구 유지.
   - E2E: 매입 6 → 당일재고 2 입력 → 조정 사유 없이 "저장" 한 번에 성공. (현재 "미입력 차단" 테스트의 2차 저장이 이 흐름 — 통합/정리)
   - 보존 확인: `tests/e2e/store-ledger-inventory-adjustment.spec.ts`(실사 차이 조정, 빈 이유 차단, 손실 후 재계산) 전부 통과해야 함.

## 7. 검증 명령

```powershell
corepack pnpm test:unit:file tests/unit/ledger-inventory.test.mjs
node scripts\run-playwright-clean.mjs tests/e2e/store-ledger-inventory.spec.ts
node scripts\run-playwright-clean.mjs tests/e2e/store-ledger-inventory-adjustment.spec.ts
corepack pnpm typecheck
```

## 8. 환경/주의 메모

- Neon 운영 DB 접속: `.env.local`의 `DATABASE_URL_UNPOOLED`(따옴표 제거 후 사용). Node `--env-file=.env.local`은 따옴표 파싱이 깨지므로, 스크립트에서 직접 파싱해 `process.env.DATABASE_URL`에 주입할 것.
- 직전 세션에서 Neon DB의 이카운트 매입 11개 장부를 25일→26일로 이동시킴(별개 작업, 완료).
- E2E의 `당일재고` 라벨은 `당일재고 바꾼 이유`와 substring 충돌 → `getByLabel(..., { exact: true })`, `getByRole("button", { name: "저장", exact: true })` 사용.
- 관련 메모리: `inventory-purchase-sale-vs-adjustment-2026-06-26`, `inventory-prevday-zero-bug-2026-06-25`.

---

# 부록 A. 사용자에게 질문해 받은 모든 결정 (시간순, 누락 없이)

이 작업과 직전 DB 이동 작업에서 AskUserQuestion으로 확정한 것 전부.

### A-1. 직전 "DB 날짜 이동" 작업의 결정 (별개지만 같은 세션이라 기록)
- **대상 DB**: "Neon 운영/preview DB" 선택.
- **무엇을 26일로**: "이카운트 업로드로 올린 모든 데이터" — 이유는 "지점장 매입 화면에 날짜가 지나서 아무것도 안 뜨기 때문".
- **목적**: "오늘 화면에서 테스트하려고".
- **진수산 충돌 처리**: "빈 26일 장부 삭제 후 25일을 26일로 이동(추천)".
- **이동 방식**: "이동(25일→26일, 원본은 사라짐)" — 복제 아님.
- → 실행 완료: 11개 장부 closingDate 25→26일 이동, 진수산 빈 장부 1개 삭제. 단일 트랜잭션. 검증: 26일 이카운트 매입 라인 83건, 25일 잔여 0.

### A-2. 본 작업 "조정 면제"의 핵심 결정들 (시간순)
1. **"매입 6, 남은 2 → 4개 차이를 재고조정으로 보고 사유 요구"가 맞나?**
   → **"아니 — 판매로 보고 조정 없이 저장"**. (이게 본 작업의 출발점)
2. **입력 강제 대상 범위**: → **"매입·손실로 판매량이 잡히는 품목만"** (화면 모든 품목 아님).
3. **과거 장부(이월 근거 있는) 열 때도 입력 강제?**: → **"미입력 품목이 있을 때만 차단"** (항상 전체 재입력 아님).
4. **'미입력' 판단 방식**: → **"입력란을 빈칸으로 시작 + 빈칸이면 차단"** (디폴트 0 유지 안 함). ← 이게 "0처럼 보여서 전량판매 오해"의 근본 원인 제거.
5. **진행 방식 (조정 모델 변경)**: → **A. "먼저 조사·설계하고 보고"** (즉흥 인라인 수정 아님).
6. **초과(매입 6인데 남은 8) 처리**: → **"여전히 사유 요구(추천)"**.
7. **매입+손실 혼재(매입 6, 손실 1) 처리**: → **"손실 있으면 조정 요구 유지(추천)"**.

→ 이 6·7번이 `isPurchaseDrivenSale`의 면제 조건(부족 방향만, 손실 없을 때만)을 확정함.

# 부록 B. DB에서 실제로 조회한 원시 사실 (읽기 전용)

추측이 아니라 Neon 운영 DB를 직접 조회해 확인한 값. 같은 조회가 필요하면 부록 E의 스크립트 패턴 사용.

### B-1. "전복" 품목 (왜 144,000원이 떴나)
- 전복 매칭 품목 3개: 전복/20미, 전복/13미, 전복/9미 (모두 생물).
- **26일 재고 행은 단 1건**: 진수산 전복 — `전일=0, 매입=10, 당일재고=2(quantity=0), carryoverStatus=DATA_INSUFFICIENT, isModified=true`.
  → 판매수량 = 0 + 10 − 2 = **8개**. 판매가 계획 18,000원 × 8 = **144,000원**. (버그 아님, 정상)
- 26일 전복 매입 8건(제일/안양×2/불광/못골/리얼/강서/진수산), 대부분 매입단가 16,000.
- 26일 전복 판매가 계획: 진수산만 1건(18,000원).

### B-2. 26일 전체 재고 저장 현황 (핵심 — "0으로 저장된 게 없다")
- **26일 저장된 재고 행: 진수산 전복 1건뿐** (당일재고=2, 양수).
- **0으로 저장된 행: 0건. 공백(null): 0건.**
- **25일 저장된 재고 행: 0건** (아무것도 저장 안 됨).
- 다른 지점(제일수산 등)은 매입은 있으나 **재고 행 자체가 미저장** → 리포트 집계에서 자동 제외.
- 결론: 사용자가 "다른 품목 0으로 입력했다"고 했지만 **DB에는 0 저장 흔적이 없었음**. 화면 입력란이 0/빈칸으로 *보이는 것* ≠ DB에 0이 *저장되는 것*. 저장 버튼 안 누르면 안 들어가고, 안 들어간 행은 null이라 집계에서 빠짐.

### B-3. 이동된 11개 장부 (직전 작업, 참고용 ledger ID)
모두 IN_PROGRESS였고 25→26일 이동됨:
- 제일수산 `cmqtlo5za...`, 정수산 `cmqtlo64w...`, 오산제일수산 `cmqtlo68t...`, 안양참수산 `cmqtlo6ew...`, 삼국유통 `cmqtlo6kn...`, 불광수산 `cmqtlo6qo...`, 못골참수산 `cmqtlo6x7...`, 리얼수산 `cmqtlo7160...`, 구로참수산 `cmqtlo752...`, 강서수산 `cmqtlo78z...`, 진수산(수산물) `cmqtl6eke...`.
- 삭제된 진수산 빈 26일 장부: `cmqtnlimh0000ju04wnbzdmgj`.

# 부록 C. 코드 탐색으로 검증한 정확한 동작 (추측 아님)

### C-1. 판매수량 역산 공식 (핵심 모델)
- `src/server/calculations/ledger.ts` `getPlannedSalesSoldQuantity`(~528-539), `calculateCostOfGoodsSold`(~434-460): `soldQuantity = previousQuantity + purchasedQuantity − currentQuantity`.
- `src/features/reports/queries.ts` `getItemSoldQuantity`(344-351), `buildMonthlyRevenueRanking`(2091~, 역산 2121-2122).
- **미입력 vs 0 구분의 핵심**: `reports/queries.ts:2115` `const currentQuantity = item.currentQuantity ?? item.quantity;` → 둘 다 null이면 `:2117`에서 `continue`(집계 제외). 그래서 미입력(null)은 "0개 판매"가 아니라 "집계에서 빠짐". **0을 명시 저장한 것만 전량판매로 계산.**

### C-2. "기준재고"와 조정 강제 (본 작업이 바꿀 지점)
- `src/server/calculations/inventory.ts` `calculateSystemInventoryQuantity` = `previousQuantity + purchasedQuantity − lossQuantity`.
- `src/features/inventory/adjustment-save-guard.ts:23-73` `getInventorySaveAdjustmentErrors`: `currentQuantity !== systemQuantity` && 매칭 조정레코드 없으면 → `missingAdjustmentReasonMessage`("재고 차이를 고친 이유를 먼저 저장해 주세요.") 강제. 이미 `isManualFirstInventoryEntry`(45-47줄) 면제가 있음 → **여기에 `isPurchaseDrivenSale` 면제를 같은 패턴으로 추가**.
- 클라이언트 `inventory-step-client.tsx`: `getSystemQuantity`(649-658), `isAdjustmentNeeded`(664-683, 이미 addedManualIds·isManualFirstInventoryEntry 면제 있음), `validateInventorySaveAdjustments`(407~). 저장 흐름 `saveCurrentDraft`(442~)에서 `validateRequiredCurrentQuantities()`(미입력 차단) → `validateInventorySaveAdjustments()`(조정 강제) 순서로 호출(514-519 부근).

### C-3. 저장이 before.items 기준인 점 (왜 미입력 0이 DB에 안 들어갔나)
- `actions.ts saveLedgerInventoryItems`: 저장은 클라이언트 input이 아니라 **서버 재계산 `before.items`** 기준으로 rows 생성. `shouldPersistInventoryLine`(inventory-persist-policy.ts:18-33)이 synthetic seed 행(id===productId)에서 값이 seed와 같으면 기록 안 함 → 매입 품목 디폴트 0을 안 건드리면 저장 안 됨. (그래서 B-2에서 0 저장 행이 0건이었던 것)
- `buildManualInventoryRows`(manual-inventory-rows.ts): "품목 추가"로 넣은(before.items에 없는) 행은 값이 있을 때만 별도 기록.

### C-4. 기존 면제 헬퍼들 (혼동 주의)
- `isManualFirstInventoryEntry`(inventory-persist-policy.ts:39-55): 매입0·손실0·이월0인 **"품목 추가" 첫 입력** 행 면제.
- `isPurchaseDrivenSale`(~69, **이번에 추가**): 매입>0·손실0·당일재고≤기준인 **정상 판매** 면제.
- 두 조건은 매입량(0 vs >0)에서 상호 배타 → 충돌 없음.
- `requiresCurrentQuantityEntry`(inventory-step-client.tsx:142~): id===productId && (매입>0 || 손실>0)인 행은 입력란 빈칸 시작 + 빈칸이면 차단("미입력 차단", 이미 구현).

# 부록 D. 병렬 조사 에이전트 4개의 상세 결과

본 작업 직전 4개 Explore 에이전트를 동시 실행. 핵심 인용:

### D-1. 조정/판매차이 모델
- 현재 코드는 "정상 판매로 인한 감소"와 "진짜 실사 차이"를 **구분하지 않음**. `currentQuantity ≠ systemQuantity`면 무조건 조정 사유 강제.
- `calculateInventoryAdjustment`(inventory.ts): differenceQuantity 부호 — 음수면 실제가 기준보다 적음(=더 팔림/소진), 양수면 실제가 기준보다 많음(=초과).
- 변경 시 주의: `salesDifference`가 `inventoryAdjustments` 합산에 의존(ledger.ts:520-525). `adjustment-reconciliation.ts`는 differenceQuantity===0이면 조정 레코드 삭제.

### D-2. FIFO — **안전** (가장 중요한 결론)
- `fifo-lots.ts`: `closingQuantity = item.currentQuantity ?? item.quantity ?? systemQuantity ?? previousQuantity`(~388-392). 소진량 = `availableQuantity(전일+매입) − closingQuantity`(~126-142).
- **FIFO는 조정 레코드를 전혀 안 읽음.** `currentQuantity`만으로 소진/COGS 계산. 조정 안 만들어도 원가 그대로.
- 저장 후 `refreshLedgerInventoryFifoLots` 호출이 currentQuantity 읽어 lot 재계산.

### D-3. 리포트 — **안전**
- 판매량/추정매출/COGS 전부 `currentQuantity` 역산. 조정 레코드 비의존.
- 재고조정이 영향 주는 유일한 곳: `calculateSalesDifference`(ledger.ts:509-526)에서 `productSalesAmount = COGS + 조정금액 − 손실`. 정상 판매 조정이 안 생기면 이 값만 바뀜(더 정확해짐).

### D-4. 테스트 영향
- **깨질 것(수정 필요)**: `tests/unit/ledger-inventory.test.mjs`의 조정 강제 단언 중 매입 정상판매 케이스, `store-ledger-inventory-adjustment.spec.ts`의 일부.
  - 단, product-1(전일10+매입3−손실1=14, 실제9)은 **손실 있음**이라 면제 대상 아님 → 단언 유지.
- **보존할 것(깨지면 안 됨)**: `store-ledger-inventory-adjustment.spec.ts`의 "실제 재고 차이를 사유와 함께 저장"(매입 없는 실사 차이), "빈 이유 차단", "손실 후 조정 재계산", manual-product 첫 입력 면제, 스키마 reason 필수.

# 부록 E. 막힌 것 / 함정 (다음 세션이 반복하지 말 것)

1. **Node `--env-file=.env.local`이 깨짐**: `.env.local`의 `DATABASE_URL`이 따옴표/특수문자 때문에 Prisma가 "postgresql:// 로 시작 안 함" 에러. → 스크립트에서 직접 정규식 파싱해 따옴표 제거 후 `process.env.DATABASE_URL`에 주입. 우선순위: `DATABASE_URL_UNPOOLED` > `POSTGRES_URL_NON_POOLING` > `DATABASE_URL`.
2. **scratchpad에서 generated/prisma 상대경로 import 실패**: 임시 스크립트는 프로젝트 루트(`/c/Code/Project/erp_fish/tmp-*.mjs`)에 두고 `./generated/prisma/index.js` import. 끝나면 삭제.
3. **Playwright strict-mode 라벨 충돌**: `getByLabel('...당일재고')`가 `'...당일재고 바꾼 이유'`와 매칭(2개) → `{ exact: true }`. `getByRole('button',{name:'저장'})`가 행별 "고친 이유 저장"과 충돌 → `{ name:'저장', exact:true }`.
4. **검증 메시지 다중 노출**: 폼 에러는 저장상태영역+form+토스트 3곳에 떠서 `getByText().first()` 필요.
5. **매입 품목 2차 저장 막힘(미해결 핵심)**: "미입력 차단" 통과 후 값 입력하면 이번엔 `validateInventorySaveAdjustments`(조정 강제)에 또 걸림 → 이게 본 작업이 푸는 문제. 현재 E2E "미입력 차단" 테스트의 2차 저장(`fill("2")` 후 저장)은 **조정 면제 구현 전에는 실패**할 수 있음(매입6 vs 재고2 = 차이). 구현 후 통과해야 함.

# 부록 F. working tree 오염 상세 (커밋 전 반드시 분리)

`git status`의 미커밋 변경 중 **이번 작업이 만든 것 vs 아닌 것**:

**이번 작업/직전 세션이 만든 것 (조정면제 + 미입력차단 관련):**
- `src/features/inventory/inventory-persist-policy.ts` (isPurchaseDrivenSale 추가)
- `src/features/inventory/components/inventory-step-client.tsx` (requiresCurrentQuantityEntry 등 — 일부는 커밋 7d6c3ae, 일부 미커밋 혼재)
- `tests/e2e/store-ledger-inventory.spec.ts` (미입력 차단 테스트)
- `docs/goal/2026-06-26-*.md` (작업지시서·핸드오프, 신규)

**출처 불명 — 이번 작업과 무관 (확인 후 분리/되돌림 판단):**
- `src/features/dashboard/queries.ts`(2줄), `src/features/ledger/components/hq-ledger-close-dialog.tsx`(18줄), `src/features/ledger/response-shaping.ts`(19줄), `src/features/reports/queries.ts`(6줄), `src/server/calculations/ledger.ts`(43줄·삭제 포함), `src/server/calculations/policy-gates.ts`(18줄 삭제), `tests/unit/calculation-policy-gates.test.mjs`, `tests/unit/hq-reports.test.mjs`, `tests/unit/sensitive-response-shaping.test.mjs`.
- ⚠️ 특히 `ledger.ts`·`policy-gates.ts`는 코드 삭제가 있어, 누가 왜 지웠는지 모른 채 커밋하면 위험. `git log`·`git stash list` 확인하고, 다른 진행 작업이 있는지 사용자에게 물을 것.
- 검증됨: `ledger.ts`의 그 변경은 salesDifference/조정 로직 라인은 안 건드림(grep으로 확인).
