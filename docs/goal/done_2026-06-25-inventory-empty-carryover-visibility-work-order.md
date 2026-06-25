# Inventory Empty Carryover Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전일 장부나 월초 스냅샷이 없는 지점에서, 매입/손실/저장 이력이 없는 활성 품목을 재고 표에 자동으로 펼쳐 보이지 않게 한다. 사용자가 `갑오징어 12미 = 0개 재고`처럼 오해하지 않도록, 기본 표에는 근거가 있는 품목만 보이고 필요할 때만 직접 추가하게 한다.

**Architecture:** 재고 4단계의 서버 조회 로직에서 "표시할 품목"과 "직접 추가할 수 있는 활성 품목"을 분리한다. 기본 표는 기존 저장 행, 당일 매입, 당일 손실, 전일/월초 근거가 있는 품목만 받는다. 숨겨진 활성 품목은 별도 옵션으로 내려서 UI의 명시적 추가 동작으로만 표에 넣는다.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, Neon Postgres, Vitest/Node unit tests, Playwright E2E.

---

## 배경

현재 `src/features/inventory/queries.ts`의 최종 fallback은 전일 장부와 월초 스냅샷이 모두 없을 때도 모든 활성 품목을 `이월 공백`, 수량 `0`으로 만든다.

이 동작 때문에 진수산 계정의 2026-06-25 장부에서 `갑오징어 12미`처럼 해당 지점의 매입도, 이월도, 저장 재고도 없는 품목이 재고 표에 보인다. 사용자는 이 행을 실제 재고 0개로 오해할 수 있다.

확인된 현재 상태:

- 진수산 2026-06-25 `갑오징어 12미` 매입 내역 없음.
- 진수산 2026-06-25 해당 품목 재고 저장 행 없음.
- 진수산 이전 장부와 월초 스냅샷 근거 없음.
- 해당 품목은 활성 상품이므로 fallback 로직 때문에만 표에 표시됨.
- 같은 품목의 구로참수산 매입 6개는 있으나 진수산에는 적용되면 안 됨.

## 결정

기본 재고 표에는 "근거 있는 품목"만 표시한다.

표시 근거는 다음 중 하나다.

- 이미 저장된 재고 행이 있다.
- 당일 매입이 있다.
- 당일 손실이 있다.
- 전일 장부나 월초 스냅샷에서 넘어온 수량 또는 단가 근거가 있다.
- 사용자가 화면에서 직접 품목을 추가했다.

전일 장부와 월초 스냅샷이 없는 상태 자체는 계속 알려야 한다. 다만 모든 활성 품목마다 `이월 공백 0` 행을 만들지 말고, 화면 상단 안내로만 보여준다.

## 범위

### 포함

- 재고 4단계 조회 결과에서 무근거 활성 품목 자동 표시 제거.
- 매입/손실/저장 이력이 있는 품목은 계속 표시.
- 숨겨진 활성 품목을 사용자가 직접 추가할 수 있는 UI 추가.
- `이월 공백`의 의미를 행 단위가 아니라 상태 안내로 정리.
- 관련 unit/E2E 테스트 기대값 수정.

### 제외

- Neon DB 데이터 일괄 삭제 또는 정리.
- 기존 저장된 실제 재고 행 삭제.
- FIFO 원가 계산 정책 변경.
- 이카운트 업로드/커밋 로직 변경.

## 사용자 기준 동작

- 진수산 2026-06-25에 `갑오징어 12미` 매입, 손실, 기존 재고, 이월 근거가 없으면 기본 재고 표에 보이지 않는다.
- 사용자가 `갑오징어 12미`를 실제로 입력해야 한다면 `품목 추가`에서 직접 선택한다.
- 직접 추가한 행은 사용자가 수량을 입력하기 전까지 실제 재고 0개처럼 보이지 않는다.
- 당일 매입이 있는 품목은 전일 근거가 없어도 표에 보인다.
- 기존에 저장된 재고 행은 수량이 0이어도 보인다. 저장된 데이터는 사용자가 확인하거나 수정해야 하기 때문이다.

## 구현 계획

- [ ] `src/features/inventory/types.ts`에 직접 추가용 옵션 타입을 추가한다.

```ts
export type InventoryManualProductOption = {
  productId: string;
  productName: string;
  specification: string | null;
  category: ProductCategory;
  unit: string | null;
};
```

- [ ] 같은 파일의 `InventoryStepData`에 `manualProductOptions`를 추가한다.

```ts
export type InventoryStepData = {
  ledger: InventoryLedgerSummary;
  items: InventoryStepLine[];
  manualProductOptions: InventoryManualProductOption[];
  carryover: InventoryCarryoverSummary;
  products: InventoryProductOption[];
  saveState: InventorySaveState;
  canEdit: boolean;
};
```

- [ ] `src/features/inventory/queries.ts`에서 활성 품목 fallback을 "표시 행 생성"이 아니라 "직접 추가 옵션 생성"으로 옮긴다.

현재 문제 지점:

```ts
return {
  status: InventoryCarryoverStatus.CARRYOVER_EMPTY,
  source: InventoryCarryoverSource.MANUAL,
  message: "전일 장부나 월초 스냅샷이 없어 이월 공백 상태입니다. 당일 재고를 직접 입력해주세요.",
  bases: await getActiveProductBases(tx, {
    carryoverStatus: InventoryCarryoverStatus.CARRYOVER_EMPTY,
  }),
};
```

변경 방향:

```ts
return {
  status: InventoryCarryoverStatus.CARRYOVER_EMPTY,
  source: InventoryCarryoverSource.MANUAL,
  message: "전일 장부나 월초 스냅샷이 없습니다. 오늘 매입, 손실, 저장 품목만 표시합니다. 추가 재고는 품목 추가로 입력해주세요.",
  bases: [],
};
```

- [ ] `mergeExistingInventoryLines`가 저장 행 뒤에 모든 활성 품목을 다시 붙이지 않게 한다.

현재 흐름은 저장 행이 있어도 `getActiveProductBases(tx)`를 호출해서 모든 활성 품목을 추가 후보로 만든다. 이 부분을 제거하고, 당일 매입/손실로 생기는 품목만 보강한다.

변경 기준:

- 기존 저장 행: 유지.
- 구매 집계에만 있는 품목: 추가 표시.
- 손실 집계에만 있는 품목: 추가 표시.
- 아무 근거 없는 활성 품목: 표시하지 않음.

- [ ] `queries.ts`에 직접 추가 옵션 생성 helper를 만든다.

```ts
async function getManualProductOptions(
  tx: Prisma.TransactionClient,
  visibleProductIds: ReadonlySet<string>,
): Promise<InventoryManualProductOption[]> {
  const products = await tx.product.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }, { specification: "asc" }],
    select: {
      id: true,
      name: true,
      specification: true,
      category: true,
      unit: true,
    },
  });

  return products
    .filter((product) => !visibleProductIds.has(product.id))
    .map((product) => ({
      productId: product.id,
      productName: product.name,
      specification: product.specification,
      category: product.category,
      unit: product.unit,
    }));
}
```

- [ ] `getInventoryStepDataForLedgerInTx`에서 최종 `items` 기준으로 `manualProductOptions`를 채운다.

```ts
const visibleProductIds = new Set(items.map((item) => item.productId));
const manualProductOptions = await getManualProductOptions(tx, visibleProductIds);
```

반환값에 `manualProductOptions`를 포함한다.

- [ ] `src/features/inventory/components/inventory-step-client.tsx`에 `품목 추가` 컨트롤을 추가한다.

UI 원칙:

- 재고 표 위쪽 도구 영역에 작은 select + 추가 버튼으로 둔다.
- 기본 표에는 숨겨진 품목명이 보이지 않는다.
- 선택 후 추가해야만 행이 생긴다.
- 추가 행의 현재 재고 입력값은 빈 값으로 시작한다.
- 추가 행의 상태 배지는 `직접 추가` 또는 기존 `이월 공백`보다 덜 오해되는 문구를 쓴다.

권장 상태명:

- 화면 문구: `직접 입력`
- 안내 문구: `근거 없음`

- [ ] 직접 추가 행을 만드는 클라이언트 helper를 추가한다.

기준:

- `id`는 기존 synthetic 행 규칙처럼 `productId`를 사용한다.
- `currentQuantityInput`은 `"0"`이 아니라 `""`로 시작한다.
- 저장 시 빈 값은 기존 validation 흐름에서 입력 요구 또는 0 처리 기준을 명확히 따른다. 사용자가 입력하지 않은 빈 행은 저장 대상이 되면 안 된다.

- [ ] 직접 추가만 하고 값을 입력하지 않은 행은 저장하지 않도록 확인한다.

현재 `src/features/inventory/inventory-persist-policy.ts`는 synthetic 행에서 수량이 원래 값과 같으면 저장하지 않는다. 빈 값 UI를 추가할 때 이 정책이 깨지지 않는지 확인한다.

필요하면 클라이언트 submit payload 생성부에서 빈 직접 추가 행을 제외한다.

## 테스트 계획

- [ ] `tests/unit/ledger-inventory.test.mjs`의 기존 기대값을 수정한다.

수정할 성격의 테스트:

- "전일 장부/월초 스냅샷이 없으면 모든 활성 품목을 표시한다" 기대를 제거한다.
- "전일 장부/월초 스냅샷이 없어도 당일 매입 품목은 표시한다" 기대를 추가한다.
- "무근거 활성 품목은 `manualProductOptions`에만 들어간다" 기대를 추가한다.
- "기존 저장 재고 행은 0이어도 표시한다" 기대를 추가한다.

- [ ] `tests/e2e/store-ledger-inventory.spec.ts`의 기존 `이월 공백` 시나리오를 수정한다.

기존 기대:

- 활성 품목이 표에 자동 표시됨.

새 기대:

- 무근거 활성 품목은 표에 보이지 않음.
- 상단 안내에 전일/월초 근거가 없다는 문구가 보임.
- `품목 추가`에서 선택하면 표에 행이 추가됨.
- 입력 후 저장하면 재조회 시 저장 행으로 보임.

- [ ] 이카운트 매입과 연결된 품목은 계속 보이는지 E2E 또는 unit에서 확인한다.

예시 기대:

- 당일 매입 6개가 있는 지점/품목은 전일 근거가 없어도 표에 보인다.
- 다른 지점의 매입은 현재 지점 재고 표에 영향을 주지 않는다.

## 검증 명령

아래 명령을 순서대로 실행한다.

```powershell
corepack pnpm test:unit:file tests/unit/ledger-inventory.test.mjs
```

```powershell
node scripts\run-playwright-clean.mjs tests/e2e/store-ledger-inventory.spec.ts
```

```powershell
corepack pnpm typecheck
```

가능하면 실제 브라우저에서도 확인한다.

```powershell
corepack pnpm dev
```

수동 확인 경로:

1. 진수산 아이디로 로그인한다.
2. 2026-06-25 장부의 재고 4단계로 이동한다.
3. `갑오징어 12미`가 기본 표에 없는지 확인한다.
4. `품목 추가`에서 `갑오징어 12미`를 선택해 직접 행을 추가할 수 있는지 확인한다.
5. 당일 매입이 있는 품목은 기본 표에 계속 보이는지 확인한다.

## 완료 기준

- 진수산의 무근거 `갑오징어 12미`는 기본 재고 표에 보이지 않는다.
- 사용자가 직접 추가하지 않은 무근거 활성 품목은 수량 0으로 보이지 않는다.
- 당일 매입, 당일 손실, 기존 저장 재고, 전일/월초 근거가 있는 품목은 계속 보인다.
- 직접 추가 UI를 통해 숨겨진 활성 품목을 입력할 수 있다.
- 빈 직접 추가 행이 잘못 저장되지 않는다.
- 위 검증 명령이 통과한다.

## 배포 전 주의

기존 DB에 이미 저장된 0개 재고 행은 이 변경만으로 숨기지 않는다. 저장된 행은 사용자 입력 또는 이전 저장 결과이므로 기본적으로 보존한다.

만약 운영 DB에 fallback 때문에 저장된 0개 행이 이미 대량으로 있다면, 별도 정리 쿼리를 검토해야 한다. 이 문서의 구현 범위에는 포함하지 않는다.
