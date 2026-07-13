# One-Decimal Stock Quantity Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 재고·매입·손실의 모든 신규 수량 입력과 업로드를 소수점 첫째 자리까지만 허용하고 실제 재고 엑셀 양식과 마감 후 정정도 같은 계약으로 맞춘다.

**Architecture:** `src/lib/validation.ts`가 신규 수량 입력의 한 자리 정밀도를 소유하고 수동 입력 스키마와 세 엑셀 파서가 이를 재사용한다. 기존 `Decimal(12,2)` 저장소와 두 자리 내부 계산은 과거 데이터 보존을 위해 유지하며, 마감 후 정정은 대상 종류를 확인해 재고·손실 수량만 소수를 허용한다. 추적된 XLSX는 기존 스타일을 유지한 채 수량 셀 형식과 데이터 검증만 바꾼다.

**Tech Stack:** TypeScript, Next.js 15, Zod, Prisma/PostgreSQL, Node test runner, Playwright, ExcelJS template builders, `@oai/artifact-tool`, pnpm

---

## File Map

- `src/lib/validation.ts`: 신규 수량의 최대값, 한 자리 검증, 한 자리 정규화.
- `src/features/inventory/schemas.ts`, `src/features/ledger/schemas.ts`, `src/features/losses/schemas.ts`, `src/features/losses/hq-edit-actions.ts`: 서버 입력 오류 문구와 공용 검증 사용.
- `src/features/inventory/components/inventory-step-client.tsx`, `src/features/ledger/components/purchase-step-client.tsx`, `src/features/losses/components/loss-step-client.tsx`: 화면 임시 합계/차이 계산에서 둘째 자리 입력을 유효값으로 오해하지 않게 함.
- `src/features/inventory/opening-import.ts`, `src/features/ledger/ecount-purchase-import.ts`, `src/features/ledger/ecount-supply-import.ts`: XLSX 수량 파싱 경계.
- `src/features/corrections/schemas.ts`, `src/features/corrections/actions.ts`, `src/features/corrections/components/correction-panel.tsx`, `src/server/calculations/ledger.ts`: 마감 후 대상별 정정 검증과 적용.
- `outputs/inventory_import_template/build-simple-inventory-template.mjs`, `outputs/inventory_import_template/build-inventory-template.mjs`, `outputs/inventory_import_template/과거_재고_간단_입력_양식.xlsx`: 실제 입력 양식 계약.
- `tests/unit/*.test.mjs`, `tests/e2e/*.spec.ts`: 입력·업로드·정정·재조회 회귀 검증.

### Task 1: 공용 한 자리 수량 정책과 수동 입력 경계

**Files:**

- Modify: `tests/unit/ledger-inventory.test.mjs`
- Modify: `tests/unit/ledger-purchase.test.mjs`
- Modify: `tests/unit/ledger-losses.test.mjs`
- Modify: `src/lib/validation.ts`
- Modify: `src/features/inventory/schemas.ts`
- Modify: `src/features/ledger/schemas.ts`
- Modify: `src/features/losses/schemas.ts`
- Modify: `src/features/losses/hq-edit-actions.ts`
- Modify: `src/features/inventory/components/inventory-step-client.tsx`
- Modify: `src/features/ledger/components/purchase-step-client.tsx`
- Modify: `src/features/losses/components/loss-step-client.tsx`

- [ ] **Step 1: 수동 입력 스키마의 실패 테스트를 한 자리 계약으로 바꾼다**

`tests/unit/ledger-inventory.test.mjs`의 재고 저장/조정 테스트는 `2.2`를 허용하고 `2.28`을 거부하게 한다.

```js
const parsedDecimal = ledgerInventorySchema.parse({
  ...payload,
  items: [{ productId: "product-1", currentQuantity: "2.2", quantity: "1.5" }],
});
assert.equal(parsedDecimal.items[0].currentQuantity, 2.2);
assert.equal(parsedDecimal.items[0].quantity, 1.5);

for (const value of [-1, "2.28", "1,000"]) {
  assert.equal(
    ledgerInventorySchema.safeParse({
      ...payload,
      items: [
        { productId: "product-1", currentQuantity: value, quantity: "1" },
      ],
    }).success,
    false,
  );
}
```

조정 테스트도 `actualQuantity: "2.2"` 통과, `"2.28"` 실패를 확인한다.

`tests/unit/ledger-purchase.test.mjs`는 다음 계약으로 바꾼다.

```js
const decimalQuantity = ledgerPurchaseSchema.parse({
  ...basePayload,
  purchases: [{ ...basePayload.purchases[0], quantity: "2.2" }],
});
assert.equal(decimalQuantity.purchases[0].quantity, 2.2);

const tooManyDecimalPlaces = ledgerPurchaseSchema.safeParse({
  ...basePayload,
  purchases: [{ ...basePayload.purchases[0], quantity: "2.28" }],
});
assert.equal(tooManyDecimalPlaces.success, false);
assert.deepEqual(tooManyDecimalPlaces.error.flatten().fieldErrors.purchases, [
  "수량은 0 이상이고 소수점 첫째 자리까지 입력할 수 있습니다.",
]);
```

`tests/unit/ledger-losses.test.mjs`는 `1.5` 통과를 유지하고 `1.55` 실패를 확인한다. 계산 함수의 기존 `2.28` 과거 데이터 사례는 입력 검증이 아니라 내부 계산 호환성 테스트이므로 유지한다.

- [ ] **Step 2: RED를 확인한다**

Run:

```powershell
pnpm test:unit:file tests/unit/ledger-inventory.test.mjs tests/unit/ledger-purchase.test.mjs tests/unit/ledger-losses.test.mjs
```

Expected: 기존 공용 파서가 `2.28`을 허용하고 오류 문구가 둘째 자리라고 표시해 새 assertion이 FAIL한다.

- [ ] **Step 3: 공용 입력 검증을 한 자리로 구현한다**

`src/lib/validation.ts`에서 저장 범위의 정수 자릿수를 유지하고 숫자 입력의 부동소수점 오차를 감안한다.

```ts
export const MAX_VALIDATION_DECIMAL = 9_999_999_999.9;

export function roundToOneDecimal(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function isNonNegativeDecimalInRange(
  value: number,
  max = MAX_VALIDATION_DECIMAL,
) {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    return false;
  }

  const scaled = value * 10;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;

  return Math.abs(scaled - Math.round(scaled)) <= tolerance;
}
```

`parseRequiredNonNegativeDecimal()`은 숫자와 문자열 모두 `roundToOneDecimal()`로 반환하고 문자열 정규식은 다음처럼 바꾼다.

```ts
if (/^\d+(?:\.\d)?$/.test(trimmed)) {
  const parsed = Number(trimmed);
  if (isNonNegativeDecimalInRange(parsed, max)) {
    return roundToOneDecimal(parsed);
  }
}
```

기존 `roundToTwoDecimals()`는 FIFO와 과거 두 자리 계산을 위해 유지한다.

- [ ] **Step 4: 스키마 오류 문구와 클라이언트 임시 파서를 맞춘다**

네 서버 파일의 수량 오류 문구를 다음 문구로 통일한다.

```ts
"수량은 0 이상이고 소수점 첫째 자리까지 입력할 수 있습니다.";
```

재고 전용 문구는 다음을 사용한다.

```ts
"재고 수량은 0 이상이고 소수점 첫째 자리까지 입력할 수 있습니다.";
"실제 재고 수량은 0 이상이고 소수점 첫째 자리까지 입력할 수 있습니다.";
```

세 클라이언트의 입력 문자열 정규식을 `/^\d+(?:\.\d)?$/`로 바꾼다. `inventory-step-client.tsx`의 `roundQuantity()`와 `hasAtMostTwoDecimals()`는 과거 두 자리 이월값과 내부 차이 계산을 위해 유지하고, `parseQuantityInput()`에서만 한 자리 정규식을 적용한다.

- [ ] **Step 5: GREEN을 확인한다**

Run:

```powershell
pnpm test:unit:file tests/unit/ledger-inventory.test.mjs tests/unit/ledger-purchase.test.mjs tests/unit/ledger-losses.test.mjs
pnpm typecheck
```

Expected: focused unit tests와 typecheck가 exit 0.

- [ ] **Step 6: 수동 입력 정책을 커밋한다**

```powershell
git add -- src/lib/validation.ts src/features/inventory/schemas.ts src/features/ledger/schemas.ts src/features/losses/schemas.ts src/features/losses/hq-edit-actions.ts src/features/inventory/components/inventory-step-client.tsx src/features/ledger/components/purchase-step-client.tsx src/features/losses/components/loss-step-client.tsx tests/unit/ledger-inventory.test.mjs tests/unit/ledger-purchase.test.mjs tests/unit/ledger-losses.test.mjs
git diff --cached --check
git commit -m "fix: limit stock quantities to one decimal"
```

### Task 2: 재고 시작·이카운트 XLSX 업로드 경계

**Files:**

- Modify: `tests/unit/inventory-opening-import.test.mjs`
- Modify: `tests/unit/ecount-purchase-import.test.mjs`
- Modify: `tests/unit/ecount-supply-import.test.mjs`
- Modify: `src/features/inventory/opening-import.ts`
- Modify: `src/features/ledger/ecount-purchase-import.ts`
- Modify: `src/features/ledger/ecount-supply-import.ts`

- [ ] **Step 1: 업로드 테스트를 한 자리 허용/둘째 자리 거부로 바꾼다**

재고 시작 업로드의 성공 행을 `2.2`와 `0.1`로 바꾸고 다음 결과를 확인한다.

```js
assert.equal(result.rows[0].quantity, 2.2);
assert.equal(result.totalQuantity, 2.3);
assert.equal(result.totalInventoryAmount, 453_950);
```

기존 거부 테스트 이름을 `parseInventoryOpeningWorkbook rejects quantities past one decimal`로 바꾸고 거부 입력을 `2.28`로 사용한다.

이카운트 매입·공급 성공 테스트의 `2.28`을 `2.2`로 바꾸고 합계/금액을 새 입력에 맞춘다. 각 파일에 `2.28` 행이 해당 파서 오류로 거부되는 테스트를 추가한다.

```js
assert.throws(
  () => parseEcountPurchaseWorkbook(workbook, options),
  (error) =>
    error instanceof EcountPurchaseImportError &&
    error.fieldErrors.file?.some((message) => message.includes("수량")),
);
```

공급 파서는 같은 형태로 `EcountSupplyImportError`와 행 수량 오류를 확인한다.

- [ ] **Step 2: RED를 확인한다**

Run:

```powershell
pnpm test:unit:file tests/unit/inventory-opening-import.test.mjs tests/unit/ecount-purchase-import.test.mjs tests/unit/ecount-supply-import.test.mjs
```

Expected: 세 파서가 여전히 `2.28`을 허용해 거부 테스트가 FAIL한다.

- [ ] **Step 3: 세 파서가 한 자리 정규화를 사용하게 한다**

각 파서에서 `roundToTwoDecimals` 입력 정규화를 `roundToOneDecimal`로 교체한다.

```ts
import {
  isNonNegativeDecimalInRange,
  roundToOneDecimal,
  roundToTwoDecimals,
} from "../../lib/validation.ts";
```

행의 수량 반환에는 `roundToOneDecimal(parsed)`를 사용한다. 합계는 과거 데이터 계산 호환성과 부동소수점 누적 오차 방지를 위해 기존 `roundToTwoDecimals()`를 유지해도 되지만, 신규 파싱 행 자체는 반드시 한 자리 검증을 통과해야 한다.

- [ ] **Step 4: GREEN을 확인하고 커밋한다**

Run:

```powershell
pnpm test:unit:file tests/unit/inventory-opening-import.test.mjs tests/unit/ecount-purchase-import.test.mjs tests/unit/ecount-supply-import.test.mjs
git diff --check
```

Expected: focused unit tests와 diff check가 exit 0.

```powershell
git add -- src/features/inventory/opening-import.ts src/features/ledger/ecount-purchase-import.ts src/features/ledger/ecount-supply-import.ts tests/unit/inventory-opening-import.test.mjs tests/unit/ecount-purchase-import.test.mjs tests/unit/ecount-supply-import.test.mjs
git commit -m "fix: validate one-decimal quantity uploads"
```

### Task 3: 마감 후 재고·손실 정정

**Files:**

- Modify: `tests/unit/ledger-corrections.test.mjs`
- Modify: `tests/unit/calculation-policy-gates.test.mjs`
- Modify: `tests/e2e/hq-ledger-corrections.spec.ts`
- Modify: `src/features/corrections/schemas.ts`
- Modify: `src/features/corrections/actions.ts`
- Modify: `src/features/corrections/components/correction-panel.tsx`
- Modify: `src/server/calculations/ledger.ts`

- [ ] **Step 1: 대상별 정정 실패 테스트를 작성한다**

`tests/unit/ledger-corrections.test.mjs`에서 다음 세 계약을 직접 파싱한다.

```js
const baseInput = {
  ledgerId: "ledger-1",
  targetId: "target-1",
  reason: "수량 확인",
};

assert.equal(
  correctionRecordSchema.safeParse({
    ...baseInput,
    targetType: "INVENTORY_ROW",
    fieldKey: "currentQuantity",
    correctedValue: { kind: "quantity", value: "1.5" },
  }).success,
  true,
);

assert.equal(
  correctionRecordSchema.safeParse({
    ...baseInput,
    targetType: "INVENTORY_ROW",
    fieldKey: "currentQuantity",
    correctedValue: { kind: "quantity", value: "1.25" },
  }).success,
  false,
);

assert.equal(
  correctionRecordSchema.safeParse({
    ...baseInput,
    targetType: "LEDGER_FIELD",
    fieldKey: "workerCount",
    correctedValue: { kind: "quantity", value: "1.5" },
  }).success,
  false,
);
```

`tests/unit/calculation-policy-gates.test.mjs`의 `inventory corrections discard stale FIFO amounts` 사례를 `latestAppliedValue: { kind: "quantity", value: 4.5 }`로 바꾸고, 재고 금액이 450원으로 다시 계산되는지 확인한다. 같은 파일에 `LEDGER_FIELD.workerCount`의 소수 정정값은 적용되지 않는 사례를 추가한다.

E2E는 기존 본사 마감 장부 정정 흐름에서 재고 수량을 `1.5`로 저장한 뒤 화면/요약에 반영되는지 확인하고 입력이 `inputmode="decimal"`인지 확인한다.

- [ ] **Step 2: RED를 확인한다**

Run:

```powershell
pnpm test:unit:file tests/unit/ledger-corrections.test.mjs tests/unit/calculation-policy-gates.test.mjs
```

Expected: 현재 정정 스키마와 overlay가 `1.5`를 정수 오류로 거부해 FAIL한다.

- [ ] **Step 3: 스키마를 값 종류와 대상으로 나눠 검증한다**

`correctionValueSchema`에서 `money`는 기존 정수 파서를, `quantity`는 공용 `parseRequiredNonNegativeDecimal()`을 사용한다. `correctionRecordSchema.superRefine()`은 `LEDGER_FIELD.workerCount`가 정수가 아니면 `correctedValue.value` 오류를 추가한다.

```ts
if (
  value.targetType === "LEDGER_FIELD" &&
  value.fieldKey === "workerCount" &&
  value.correctedValue.kind === "quantity" &&
  !Number.isSafeInteger(value.correctedValue.value)
) {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: "근무인원은 0 이상의 정수로 입력해 주세요.",
    path: ["correctedValue", "value"],
  });
}
```

- [ ] **Step 4: 액션과 계산 overlay에 같은 방어를 둔다**

`normalizeCorrectedValueForTarget()`에 `targetType`과 `fieldKey`를 전달한다. 재고/손실 수량이면 `isNonNegativeDecimalInRange()`, 근무인원과 금액이면 기존 `isValidCorrectionInteger()`를 사용한다.

`getCorrectionNumber()`는 기본적으로 정수를 요구하고, 재고/손실 호출부만 한 자리 수량을 허용하는 인자를 전달한다.

```ts
function getCorrectionNumber(
  value: unknown,
  kind: "money" | "quantity",
  allowDecimalQuantity = false,
) {
  // 공통 shape 확인 후
  if (
    allowDecimalQuantity
      ? !isNonNegativeDecimalInRange(value.value)
      : !Number.isSafeInteger(value.value)
  ) {
    return null;
  }
  return value.value;
}
```

재고와 손실의 `getCorrectionNumber(..., "quantity", true)` 호출만 소수를 적용하고 `workerCount` 호출은 기본값을 유지한다.

- [ ] **Step 5: 보정 화면의 키보드 모드를 대상에 맞춘다**

```tsx
inputMode={
  selectedTarget?.originalValue.kind === "text"
    ? "text"
    : selectedTarget?.originalValue.kind === "quantity" &&
        selectedTarget.targetType !== "LEDGER_FIELD"
      ? "decimal"
      : "numeric"
}
```

- [ ] **Step 6: GREEN을 확인하고 커밋한다**

Run:

```powershell
pnpm test:unit:file tests/unit/ledger-corrections.test.mjs tests/unit/calculation-policy-gates.test.mjs
pnpm typecheck
```

Expected: focused unit tests와 typecheck가 exit 0.

```powershell
git add -- src/features/corrections/schemas.ts src/features/corrections/actions.ts src/features/corrections/components/correction-panel.tsx src/server/calculations/ledger.ts tests/unit/ledger-corrections.test.mjs tests/unit/calculation-policy-gates.test.mjs tests/e2e/hq-ledger-corrections.spec.ts
git commit -m "fix: allow one-decimal stock corrections"
```

### Task 4: 실제 재고 XLSX 양식과 생성 스크립트

**Files:**

- Modify: `outputs/inventory_import_template/build-simple-inventory-template.mjs`
- Modify: `outputs/inventory_import_template/build-inventory-template.mjs`
- Modify: `outputs/inventory_import_template/과거_재고_간단_입력_양식.xlsx`
- Modify: `tests/unit/inventory-opening-import.test.mjs`
- Scratch only: `.tmp/codex-inventory-decimal/edit-template.mjs`

- [ ] **Step 1: 생성 스크립트 계약 실패 테스트를 추가한다**

`tests/unit/inventory-opening-import.test.mjs`에서 두 생성 스크립트를 읽고 다음 계약을 확인한다.

```js
assert.match(simpleTemplateSource, /소수점 첫째 자리/);
assert.match(simpleTemplateSource, /numFmt:\s*"#,##0\.0"/);
assert.match(simpleTemplateSource, /oneDecimalQuantityValidation/);
assert.match(fullTemplateSource, /소수점 첫째 자리/);
assert.match(fullTemplateSource, /oneDecimalQuantityValidation/);
```

- [ ] **Step 2: RED를 확인한다**

Run:

```powershell
pnpm test:unit:file tests/unit/inventory-opening-import.test.mjs
```

Expected: 현재 스크립트가 정수 안내와 `#,##0` 수량 형식을 사용해 FAIL한다.

- [ ] **Step 3: 두 생성 스크립트에서 수량과 금액 검증을 분리한다**

각 스크립트에 상대 참조 첫 셀을 받는 검증을 추가한다.

```js
function oneDecimalQuantityValidation(sheet, range, firstCell) {
  sheet.dataValidations.add(range, {
    type: "custom",
    allowBlank: true,
    formulae: [
      `OR(${firstCell}="",AND(ISNUMBER(${firstCell}),${firstCell}>=0,ROUND(${firstCell},1)=${firstCell}))`,
    ],
    showErrorMessage: true,
    errorTitle: "수량 확인",
    error: "수량은 0 이상이고 소수점 첫째 자리까지 입력해 주세요.",
  });
}
```

수량 열의 `numFmt`를 `#,##0.0`으로 바꾸고 수량 범위에 이 검증을 적용한다. 단가·금액·회수금액은 `wholeNumberValidation`/`addWholeNumberValidation`을 유지한다.

간단 양식:

```js
oneDecimalQuantityValidation(inventory, "F4:F2004", "F4");
wholeNumberValidation(inventory, "G4:G2004");
wholeNumberValidation(lots, "F4:F1004");
oneDecimalQuantityValidation(lots, "G4:G1004", "G4");
```

전체 양식은 재고 `H:K`, 입고별 수량 `J:K`, 매입 수량 `H`, 손실 수량 `I`에 한 자리 검증을 적용하고 단가/금액 열은 정수 검증으로 분리한다.

- [ ] **Step 4: `@oai/artifact-tool`로 추적 XLSX를 최소 수정한다**

번들 Node와 `@oai/artifact-tool`을 사용하는 하나의 scratch builder에서 기존 파일을 import한다. `작성방법!B6`의 안내 문구, `재고입력!F4:F2004`와 `입고별잔량_선택!G4:G1004`의 `#,##0.0` 형식과 한 자리 데이터 검증만 바꾸고 다른 스타일·수식·시트 구조는 유지한다.

출력은 먼저 `.tmp/codex-inventory-decimal/artifacts/과거_재고_간단_입력_양식.xlsx`에 저장하고 검증 후 추적 파일을 교체한다.

- [ ] **Step 5: XLSX 값·수식·시각 품질을 검증한다**

artifact-tool로 다음을 수행한다.

```js
await workbook.inspect({
  kind: "table,computedStyle",
  sheetId: "재고입력",
  range: "A1:K8",
  maxChars: 5000,
});
await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
});
```

`작성방법`, `재고입력`, `입고별잔량_선택`을 PNG로 렌더링하고 잘린 안내, 깨진 수식, 달라진 시트 구조가 없는지 확인한다.

- [ ] **Step 6: GREEN을 확인하고 커밋한다**

Run:

```powershell
pnpm test:unit:file tests/unit/inventory-opening-import.test.mjs
git diff --check
```

Expected: unit과 diff check가 exit 0이며 추적 XLSX와 두 builder만 의도대로 바뀐다.

```powershell
git add -- outputs/inventory_import_template/build-simple-inventory-template.mjs outputs/inventory_import_template/build-inventory-template.mjs 'outputs/inventory_import_template/과거_재고_간단_입력_양식.xlsx' tests/unit/inventory-opening-import.test.mjs
git commit -m "fix: allow one-decimal inventory template quantities"
```

### Task 5: E2E 회귀, 전체 검증, 통합과 푸시

**Files:**

- Modify: `tests/e2e/store-ledger-inventory.spec.ts`
- Modify: `tests/e2e/store-ledger-purchase.spec.ts`
- Modify: `tests/e2e/store-ledger-losses.spec.ts`
- Verify: `tests/e2e/ecount-supply-imports.spec.ts`
- Verify: `tests/e2e/hq-ledger-corrections.spec.ts`
- Verify: all files changed in Tasks 1–4

- [ ] **Step 1: 화면 E2E의 입력 경계 assertion을 한 자리로 바꾼다**

재고·매입·손실 E2E에서 `1.25`를 입력하면 원문 값이 보존되고 “소수점 첫째 자리까지” 오류가 표시되는지 확인한다. 기존 `inputmode="decimal"`과 접근성 assertion은 유지한다.

재고 시작 업로드 E2E의 `2.5` 저장·재조회·DB 보존 assertion은 한 자리 성공 회귀로 유지한다. 마감 후 정정 E2E는 Task 3에서 작성한 `1.5` 적용 사례를 포함한다.

- [ ] **Step 2: 관련 단위 테스트 전체를 실행한다**

Run:

```powershell
pnpm test:unit:file tests/unit/ledger-inventory.test.mjs tests/unit/ledger-purchase.test.mjs tests/unit/ledger-losses.test.mjs tests/unit/inventory-opening-import.test.mjs tests/unit/ecount-purchase-import.test.mjs tests/unit/ecount-supply-import.test.mjs tests/unit/ledger-corrections.test.mjs tests/unit/calculation-policy-gates.test.mjs
pnpm test:unit
```

Expected: focused tests와 전체 511개 이상 단위 테스트 failure 0.

- [ ] **Step 3: 정적 검증과 빌드를 실행한다**

Run:

```powershell
pnpm db:validate
pnpm check
pnpm build
git diff --check
```

Expected: 모든 명령 exit 0.

- [ ] **Step 4: 로컬 테스트 DB를 확인하고 관련 E2E를 실행한다**

`PLAYWRIGHT_DATABASE_URL`의 host가 `localhost`, DB 이름이 `erp_fish_e2e`인지 먼저 확인한다. 원격 또는 운영형 DB이면 실행하지 않는다.

```powershell
$env:PLAYWRIGHT_DATABASE_URL='postgresql://postgres:erp_fish_local_pw@localhost:5432/erp_fish_e2e'
pnpm exec playwright test tests/e2e/store-ledger-inventory.spec.ts tests/e2e/store-ledger-purchase.spec.ts tests/e2e/store-ledger-losses.spec.ts tests/e2e/ecount-supply-imports.spec.ts tests/e2e/hq-ledger-corrections.spec.ts
```

Expected: 관련 E2E failure 0.

- [ ] **Step 5: 최종 요구사항과 diff를 검토한다**

Checklist:

```text
- 재고·매입·손실 수동 입력은 1.5 허용, 1.25 거부
- 재고 시작·이카운트 업로드는 2.2 허용, 2.28 거부
- 재고·손실 정정은 1.5 허용, 근무인원은 정수 유지
- DB schema/migration은 바뀌지 않음
- 실제 XLSX 수량 형식/검증/안내가 한 자리 정책과 일치
- 사용자 미추적 고객 파일과 조사 문서는 커밋되지 않음
```

- [ ] **Step 6: E2E 변경을 커밋한다**

```powershell
git add -- tests/e2e/store-ledger-inventory.spec.ts tests/e2e/store-ledger-purchase.spec.ts tests/e2e/store-ledger-losses.spec.ts tests/e2e/ecount-supply-imports.spec.ts tests/e2e/hq-ledger-corrections.spec.ts
git diff --cached --check
git commit -m "test: cover one-decimal stock quantity flows"
```

- [ ] **Step 7: 원격 최신 상태를 확인하고 `feat/rev_02`에 반영한다**

```powershell
git fetch origin
git merge-base --is-ancestor origin/main codex/inventory-one-decimal
git merge-base --is-ancestor origin/feat/rev_02 codex/inventory-one-decimal
git -C C:\Code\Project\erp_fish merge --ff-only codex/inventory-one-decimal
git -C C:\Code\Project\erp_fish push -u origin feat/rev_02
```

Expected: 원격이 분기되지 않았고 feature push가 fast-forward로 성공한다. ancestry 확인이 실패하면 원격 최신 커밋을 격리 브랜치에 통합하고 전체 검증을 다시 실행한 뒤 진행한다.

- [ ] **Step 8: `main`에 fast-forward 병합하고 재검증·푸시한다**

```powershell
$mainWorktree='C:\Users\KimYS\.config\superpowers\worktrees\erp_fish\main-friendly-inventory-labels'
git -C $mainWorktree merge --ff-only origin/main
git -C $mainWorktree merge --ff-only feat/rev_02
pnpm --dir $mainWorktree test:unit
pnpm --dir $mainWorktree check
git -C $mainWorktree push origin main
```

Expected: 병합된 main에서도 unit/check failure 0이고 `origin/main`이 구현 HEAD와 같다.

- [ ] **Step 9: 격리 작업공간을 정리한다**

main push와 원격 SHA 확인 후 루트에서 실행한다.

```powershell
git worktree remove C:\Code\Project\erp_fish\.worktrees\inventory-one-decimal
git branch -d codex/inventory-one-decimal
```

Expected: 구현 커밋은 `feat/rev_02`, `main`, 원격에 남고 임시 로컬 브랜치와 worktree만 제거된다.
