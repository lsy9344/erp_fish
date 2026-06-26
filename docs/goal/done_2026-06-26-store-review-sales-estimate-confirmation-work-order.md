# Store Review Sales Estimate Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지점장 7단계 `경고와 이상 후보`에서 손실이 섞인 부족 수량을 `재고 이상`이나 `수량 -N개`가 아니라 `판매 추정 확인`으로 이해되게 표시한다.

**Architecture:** `review-signals.ts`에서 신호의 원시 계산값(`quantity: -2`)과 지점장 표시 문구(`판매 추정 2개`)를 분리한다. `LedgerReviewSignal`에 표시용 수량 라벨/문구를 선택 필드로 추가하고, 검토 화면 컴포넌트는 표시용 값이 있으면 그것을 우선 렌더링한다. 손실이 없는 정상 판매 면제 정책은 유지하고, 손실이 있는 부족 방향만 확인 카드로 남긴다.

**Tech Stack:** Next.js App Router, React, TypeScript, Node test runner, Playwright.

---

## Product Decision

지점장 화면에서는 `당일재고가 기준재고보다 적다`를 기본적으로 판매 추정으로 읽는다.

```text
판매 추정 = 전일재고 + 매입 - 손실 - 당일재고
```

손실이 없는 품목은 정상 판매로 보아 `경고와 이상 후보`에 띄우지 않는다. 손실이 있는 품목은 손실 기록과 판매 추정이 함께 있으므로 카드에 남기되, 카드의 말투는 `재고 확인 필요`가 아니라 `판매 추정 확인`으로 한다.

적용할 지점장 카드 문구:

```text
판매 추정 확인
고등어는 손실 1개를 제외한 뒤, 남은 재고를 기준으로 2개 판매로 계산됩니다.

판매 추정 2개
```

금지할 지점장 표현:

```text
재고 확인 필요
고등어 기준보다 2개 부족합니다.
수량 -2개
```

## File Structure

- Modify: `src/features/ledger/review-types.ts`
  - `LedgerReviewSignal`에 지점장 표시용 `quantityLabel?: string`, `quantityText?: string`를 추가한다.
- Modify: `src/features/ledger/review-signals.ts`
  - 손실이 있는 부족 방향 신호를 `판매 추정 확인`으로 만든다.
  - 원시 `quantity`는 기존처럼 `-2`를 보존한다.
  - 표시용으로 `quantityLabel: "판매 추정"`, `quantityText: "2개"`를 넣는다.
- Modify: `src/features/ledger/components/review-summary-client.tsx`
  - 하단 수량 렌더링에서 `quantityLabel`/`quantityText`를 우선 사용한다.
  - 표시용 값이 없으면 기존 `수량 {formatSignedQuantity(signal.quantity)}`를 유지한다.
- Modify: `tests/unit/ledger-review.test.mjs`
  - 손실 포함 부족 케이스의 새 라벨, 본문, 표시용 수량 문구를 검증한다.
  - 기존 정상 판매 면제, 매입 없는 부족, 초과 재고, 손실 기록 신호는 유지한다.
- Modify: `tests/e2e/store-ledger-review.spec.ts`
  - 검토 화면에서 `판매 추정 확인`, 새 본문, `판매 추정 2개`가 보이고 `수량 -2개`가 보이지 않는지 검증한다.
- Optional Modify: `tests/unit/sensitive-response-shaping.test.mjs`
  - 지점장 응답 shaping이 `amount`는 제거하되 `quantityLabel`/`quantityText`는 보존하는지 고정한다.

---

## Task 1: Signal Type And Unit Contract

**Files:**

- Modify: `src/features/ledger/review-types.ts:23-29`
- Modify: `tests/unit/ledger-review.test.mjs:503-590`

- [ ] **Step 1: Write the failing unit test**

Update the signal assertion in `tests/unit/ledger-review.test.mjs` so the existing test includes all four inventory states:

```js
const signals = buildLedgerReviewSignals({
  inventoryItems: [
    {
      productId: "normal-sale",
      productName: "꽃게",
      previousQuantity: 0,
      purchasedQuantity: 10,
      lossQuantity: 0,
      currentQuantity: 0,
      adjustment: {
        differenceQuantity: -10,
        differenceAmount: -100_000,
      },
    },
    {
      productId: "unexplained-shortage",
      productName: "바지락",
      previousQuantity: 5,
      purchasedQuantity: 0,
      lossQuantity: 0,
      currentQuantity: 0,
      adjustment: {
        differenceQuantity: -5,
        differenceAmount: -25_000,
      },
    },
    {
      productId: "overstock",
      productName: "문어",
      previousQuantity: 2,
      purchasedQuantity: 1,
      lossQuantity: 0,
      currentQuantity: 5,
      adjustment: {
        differenceQuantity: 2,
        differenceAmount: 20_000,
      },
    },
    {
      productId: "loss-sale-estimate",
      productName: "고등어",
      previousQuantity: 0,
      purchasedQuantity: 4,
      lossQuantity: 1,
      currentQuantity: 1,
      adjustment: {
        differenceQuantity: -2,
        differenceAmount: -20_000,
      },
    },
  ],
  lossSignalCandidates: [
    {
      productId: "loss-1",
      productName: "낙지",
      quantity: 1,
      amount: 12_000,
    },
  ],
});
```

Assert this expected shape:

```js
assert.deepEqual(
  signals.map((signal) => ({
    id: signal.id,
    label: signal.label,
    detail: signal.detail,
    quantity: signal.quantity,
    quantityLabel: signal.quantityLabel,
    quantityText: signal.quantityText,
  })),
  [
    {
      id: "inventory-unexplained-shortage",
      label: "재고 확인 필요",
      detail: "바지락 기준보다 5개 부족합니다.",
      quantity: -5,
      quantityLabel: undefined,
      quantityText: undefined,
    },
    {
      id: "inventory-overstock",
      label: "재고 확인 필요",
      detail: "문어 기준보다 2개 많습니다.",
      quantity: 2,
      quantityLabel: undefined,
      quantityText: undefined,
    },
    {
      id: "inventory-loss-sale-estimate",
      label: "판매 추정 확인",
      detail:
        "고등어는 손실 1개를 제외한 뒤, 남은 재고를 기준으로 2개 판매로 계산됩니다.",
      quantity: -2,
      quantityLabel: "판매 추정",
      quantityText: "2개",
    },
    {
      id: "loss-loss-1",
      label: "손실 기록 있음",
      detail: "낙지 손실 항목이 기록되어 제출 전 확인해 주세요.",
      quantity: 1,
      quantityLabel: undefined,
      quantityText: undefined,
    },
  ],
);
```

- [ ] **Step 2: Run the unit test and verify RED**

Run:

```powershell
corepack pnpm test:unit:file tests/unit/ledger-review.test.mjs
```

Expected: FAIL. The failure should show the current label/detail as `재고 확인 필요` / `고등어 기준보다 2개 부족합니다.` and missing `quantityLabel` / `quantityText`.

- [ ] **Step 3: Add display fields to the review signal type**

Modify `src/features/ledger/review-types.ts`:

```ts
export type LedgerReviewSignal = {
  id: string;
  label: string;
  detail: string;
  amount?: number;
  quantity?: number;
  quantityLabel?: string;
  quantityText?: string;
};
```

- [ ] **Step 4: Commit the RED test and type contract if the team prefers small commits**

```powershell
git add src/features/ledger/review-types.ts tests/unit/ledger-review.test.mjs
git commit -m "test: define sales estimate signal copy contract"
```

Skip this commit if the implementer is keeping one final commit for the work order.

---

## Task 2: Signal Copy And Display Metadata

**Files:**

- Modify: `src/features/ledger/review-signals.ts:24-86`
- Test: `tests/unit/ledger-review.test.mjs`

- [ ] **Step 1: Pass `lossQuantity` into the detail builder**

Change the call in `buildLedgerReviewSignals`:

```ts
const inventorySignal = buildInventorySignal(
  item,
  differenceQuantity,
  differenceAmount,
);

return [inventorySignal];
```

Add this helper below `buildLedgerReviewSignals`:

```ts
function buildInventorySignal(
  item: LedgerReviewSignalInventoryItem,
  differenceQuantity: number,
  differenceAmount: number,
): LedgerReviewSignal {
  const estimatedSalesQuantity = Math.abs(differenceQuantity);

  if (differenceQuantity < 0 && item.lossQuantity > 0) {
    return {
      id: `inventory-${item.productId}`,
      label: "판매 추정 확인",
      detail: `${item.productName}는 손실 ${item.lossQuantity}개를 제외한 뒤, 남은 재고를 기준으로 ${estimatedSalesQuantity}개 판매로 계산됩니다.`,
      quantity: differenceQuantity,
      quantityLabel: "판매 추정",
      quantityText: `${estimatedSalesQuantity}개`,
      amount: differenceAmount,
    };
  }

  const signal: LedgerReviewSignal = {
    id: `inventory-${item.productId}`,
    label: "재고 확인 필요",
    detail: buildInventorySignalDetail(item.productName, differenceQuantity),
    amount: differenceAmount,
  };

  if (differenceQuantity !== 0) {
    signal.quantity = differenceQuantity;
  }

  return signal;
}
```

Then simplify the existing loop body to use it:

```ts
return [buildInventorySignal(item, differenceQuantity, differenceAmount)];
```

- [ ] **Step 2: Preserve existing copy for non-loss inventory differences**

Keep `buildInventorySignalDetail` for these cases:

```ts
function buildInventorySignalDetail(
  productName: string,
  differenceQuantity: number,
) {
  if (differenceQuantity < 0) {
    return `${productName} 기준보다 ${Math.abs(differenceQuantity)}개 부족합니다.`;
  }

  if (differenceQuantity > 0) {
    return `${productName} 기준보다 ${differenceQuantity}개 많습니다.`;
  }

  return `${productName} 재고 금액 기준 확인이 필요합니다.`;
}
```

- [ ] **Step 3: Run unit test and verify GREEN**

Run:

```powershell
corepack pnpm test:unit:file tests/unit/ledger-review.test.mjs
```

Expected: PASS, including the new `판매 추정 확인` assertion.

- [ ] **Step 4: Commit**

```powershell
git add src/features/ledger/review-signals.ts src/features/ledger/review-types.ts tests/unit/ledger-review.test.mjs
git commit -m "fix: clarify loss-mixed sales estimate signals"
```

Skip if already committing all changes together.

---

## Task 3: Review Card Rendering

**Files:**

- Modify: `src/features/ledger/components/review-summary-client.tsx:467-478`
- Test: `tests/e2e/store-ledger-review.spec.ts`

- [ ] **Step 1: Write failing e2e expectations**

In `tests/e2e/store-ledger-review.spec.ts`, update the test around the warning section so it checks the card as a complete message:

```ts
await expect(warningSection).toContainText("판매 추정 확인");
await expect(warningSection).toContainText(
  "고등어는 손실 1개를 제외한 뒤, 남은 재고를 기준으로 2개 판매로 계산됩니다.",
);
await expect(warningSection).toContainText("판매 추정 2개");
await expect(warningSection).not.toContainText(
  "고등어 기준보다 2개 부족합니다.",
);
await expect(warningSection).not.toContainText("수량 -2개");
```

Keep the existing sensitive amount checks:

```ts
await expect(warningSection).not.toContainText("-2,000원");
await expect(warningSection).toContainText("손실 기록 있음");
await expect(warningSection).not.toContainText("금액 +1,000원");
```

- [ ] **Step 2: Run e2e and verify RED**

Run:

```powershell
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-review.spec.ts
```

Expected: FAIL before the component change. The failure should be about missing `판매 추정 2개` or still seeing `수량 -2개`.

- [ ] **Step 3: Render display label/text when present**

Modify `src/features/ledger/components/review-summary-client.tsx`:

```tsx
{
  signal.quantity !== undefined ? (
    <span>
      {signal.quantityLabel ?? "수량"}{" "}
      {signal.quantityText ?? formatSignedQuantity(signal.quantity)}
    </span>
  ) : null;
}
```

This keeps old cards unchanged while allowing the sales estimate card to say `판매 추정 2개`.

- [ ] **Step 4: Run e2e and verify GREEN**

Run:

```powershell
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-review.spec.ts
```

Expected: PASS. The first review test should show `판매 추정 확인`, the new detail sentence, and `판매 추정 2개`, without `수량 -2개`.

- [ ] **Step 5: Commit**

```powershell
git add src/features/ledger/components/review-summary-client.tsx tests/e2e/store-ledger-review.spec.ts
git commit -m "fix: show sales estimate quantity in review card"
```

Skip if already committing all changes together.

---

## Task 4: Response Shaping And Full Verification

**Files:**

- Optional Modify: `tests/unit/sensitive-response-shaping.test.mjs:135-142`
- Verify: `src/features/ledger/response-shaping.ts`

- [ ] **Step 1: Add response shaping coverage if not already covered by type/e2e**

In `tests/unit/sensitive-response-shaping.test.mjs`, update the sample signal:

```js
signals: [
  {
    id: "inventory-product-1",
    label: "판매 추정 확인",
    detail:
      "광어는 손실 1개를 제외한 뒤, 남은 재고를 기준으로 2개 판매로 계산됩니다.",
    quantity: -2,
    quantityLabel: "판매 추정",
    quantityText: "2개",
    amount: -2_000,
  },
],
```

Assert that `amount` is removed but display fields remain:

```js
assert.equal(shaped.signals[0].amount, undefined);
assert.equal(shaped.signals[0].quantity, -2);
assert.equal(shaped.signals[0].quantityLabel, "판매 추정");
assert.equal(shaped.signals[0].quantityText, "2개");
```

- [ ] **Step 2: Run focused unit tests**

Run:

```powershell
corepack pnpm test:unit:file tests/unit/ledger-review.test.mjs tests/unit/sensitive-response-shaping.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
corepack pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run the review e2e**

Run:

```powershell
node scripts/run-playwright-clean.mjs tests/e2e/store-ledger-review.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Run final fast checks**

Run:

```powershell
corepack pnpm lint
corepack pnpm test:unit:file tests/unit/ledger-review.test.mjs tests/unit/sensitive-response-shaping.test.mjs
git diff --check
```

Expected: all commands PASS. `git diff --check` may print CRLF warnings on Windows, but must not report whitespace errors.

- [ ] **Step 6: Final commit**

If previous tasks were not committed separately:

```powershell
git add src/features/ledger/review-types.ts src/features/ledger/review-signals.ts src/features/ledger/components/review-summary-client.tsx tests/unit/ledger-review.test.mjs tests/unit/sensitive-response-shaping.test.mjs tests/e2e/store-ledger-review.spec.ts
git commit -m "fix: clarify sales estimate review card"
```

If previous tasks were committed separately, run:

```powershell
git status --short
```

Expected: no uncommitted files.

---

## Acceptance Criteria

- 손실이 없는 정상 판매 품목은 지금처럼 `경고와 이상 후보`에 뜨지 않는다.
- 손실이 있는 부족 방향 품목은 `판매 추정 확인` 카드로 뜬다.
- 카드 본문은 `고등어는 손실 1개를 제외한 뒤, 남은 재고를 기준으로 2개 판매로 계산됩니다.`를 사용한다.
- 카드 하단은 `판매 추정 2개`로 표시한다.
- 지점장 화면에는 같은 카드에서 `수량 -2개`가 보이지 않는다.
- 매입 없는 부족, 초과 재고, 금액 기준 확인은 기존 `재고 확인 필요` 문구를 유지한다.
- `quantity: -2` 원시값은 내부 데이터로 보존한다.
- 지점장 응답에서는 기존처럼 민감 금액 `amount`가 제거된다.

## Risk Notes

- `quantity` 자체를 `2`로 바꾸지 않는다. 내부 계산값의 부호를 바꾸면 본사/리포트/테스트에서 의미가 뒤집힐 수 있다.
- `판매 추정 확인`은 손실이 있는 부족 방향에만 적용한다. 초과 재고는 판매가 아니므로 `재고 확인 필요`가 맞다.
- 이 작업은 표시 문구와 표시용 필드 추가만 한다. 재고 조정 저장 정책, 판매량 계산식, FIFO 계산식은 바꾸지 않는다.

## Self-Review

- Spec coverage: 손실 없는 정상 판매 면제, 손실 있는 판매 추정 확인, 하단 `수량 -2개` 제거, 원시값 보존, 민감 금액 제거를 모두 작업에 매핑했다.
- Placeholder scan: 이 문서에는 미정 항목이나 빈 지시가 없다.
- Type consistency: `quantityLabel`과 `quantityText`는 타입, 신호 생성, 컴포넌트 렌더링, 테스트에서 같은 이름으로 사용된다.
