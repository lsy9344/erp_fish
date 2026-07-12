# Inventory Opening Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 재고 엑셀의 미등록 품목을 자동 생성하고, 기존 재고 장부가 있는 업로드는 원자적으로 거부하며, 월초 스냅샷이 장부 저장 후에도 유지되게 한다.

**Architecture:** 현재 브랜치를 `main` 위로 재배치해 검증된 이월 보존 수정과 복구 도구를 재사용한다. 기존 `uploadInventoryOpeningSnapshots` 트랜잭션 안에서 품목을 정확 키로 재사용/생성하고, 대상일 장부 충돌이 있으면 트랜잭션 전체를 실패시킨다. 실제 xlsx Playwright 테스트가 품목 생성부터 스냅샷과 장부 저장까지 전체 흐름을 검증한다.

**Tech Stack:** Next.js Server Actions, TypeScript, Prisma/PostgreSQL, Node test runner, Playwright, pnpm

## Global Constraints

- 기존 장부 재고는 업로드로 자동 덮어쓰지 않는다.
- 충돌이 하나라도 있으면 파일 전체를 반영하지 않는다.
- 비활성 품목은 자동 재활성화하지 않는다.
- 엑셀 재고 단가는 `Product.defaultUnitPrice`로 복사하지 않는다.
- 품목 생성, 품목 감사, 스냅샷 저장, 업로드 감사는 하나의 DB 트랜잭션으로 처리한다.
- 사용자 제공 미추적 엑셀과 조사 문서는 커밋하지 않는다.
- 새 의존성을 추가하지 않는다.

---

### Task 1: 기준 브랜치 동기화와 베이스라인 검증

**Files:**
- Preserve: `docs/reference_from_customer/temp_1783022688907.-511901230.xlsx`
- Preserve: `_bmad-output/implementation-artifacts/investigations/historical-inventory-upload-investigation.md`
- Verify: `src/features/inventory/inventory-persist-policy.ts`
- Verify: `tests/e2e/store-ledger-inventory.spec.ts`

**Interfaces:**
- Consumes: 현재 `feat/rev_02`의 설계/계획 커밋과 로컬 `main`의 19개 후속 커밋
- Produces: `main` 위에 설계/계획 커밋이 놓인 깨끗한 구현 기준선

- [ ] **Step 1: 미추적 사용자 파일과 브랜치 관계를 재확인한다**

Run:

```powershell
git status --short
git merge-base HEAD main
git rev-list --left-right --count HEAD...main
```

Expected: 사용자 파일 2개만 미추적이며, merge-base가 기존 구현 커밋을 가리키고 `main`은 그 이후 검증된 코드 기준선이다.

- [ ] **Step 2: 문서 커밋을 `main` 위로 재배치한다**

Run:

```powershell
git rebase main
```

Expected: 충돌 없이 완료되고 사용자 미추적 파일은 그대로 남는다.

- [ ] **Step 3: 검증된 이월 보존 수정이 들어왔는지 확인한다**

Run:

```powershell
rg -n "groundedCarryoverSources|OPENING_SNAPSHOT" src/features/inventory/inventory-persist-policy.ts tests/unit/ledger-inventory.test.mjs
corepack pnpm test:unit:file tests/unit/inventory-opening-import.test.mjs
corepack pnpm exec node --experimental-strip-types --test tests/unit/ledger-inventory.test.mjs
```

Expected: 관련 소스와 회귀 테스트가 존재하고 모든 focused unit test가 PASS한다.

---

### Task 2: 미등록 품목 자동 생성 — RED/GREEN

**Files:**
- Modify: `tests/e2e/ecount-supply-imports.spec.ts`
- Modify: `tests/unit/inventory-opening-import.test.mjs`
- Modify: `src/features/inventory/opening-import-actions.ts`
- Modify: `src/features/ledger/components/ecount-supply-upload-client.tsx`

**Interfaces:**
- Consumes: `parseInventoryOpeningWorkbook()`의 `InventoryOpeningImportRow[]`, `writeAuditLog()`, Prisma `Product.name_category_spec`
- Produces: `matchRows(tx, rows, actorId) -> { matchedRows, errors, productCreatedCount }`; `InventoryOpeningUploadResult.productCreatedCount: number`

- [ ] **Step 1: 실제 xlsx 자동 품목 생성 실패 테스트를 작성한다**

`tests/e2e/ecount-supply-imports.spec.ts`에 Prisma client, 재고 workbook builder, 정리 코드를 추가하고 다음 시나리오를 작성한다.

```ts
test("재고 업로드는 미등록 품목을 한 번 생성하고 월초 스냅샷에 연결한다", async ({
  page,
}, testInfo) => {
  const suffix = `${testInfo.workerIndex}-${Date.now()}`;
  const productName = `E2E 자동재고품목 ${suffix}`;
  const inventoryDate = getPreviousKstDateString();
  const workbook = createInventoryOpeningWorkbook([
    [inventoryDate, "강남점", productName, "1kg", "냉동", 2.5, 12000],
    [inventoryDate, "홍대점", productName, "1kg", "냉동", 1, 12000],
  ]);

  await login(page, "hq@example.com");
  await page.goto("/app/ecount-imports");
  await page.locator('input[name="inventoryFile"]').setInputFiles({
    name: `inventory-${suffix}.xlsx`,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: workbook,
  });
  await page.getByRole("button", { name: "재고 업로드" }).click();

  await expect(page.getByText("자동 추가 품목 1개")).toBeVisible();
  const product = await prisma.product.findUnique({
    where: {
      name_category_spec: { name: productName, category: "냉동", spec: "1kg" },
    },
  });
  expect(product).toMatchObject({ isActive: true, defaultUnitPrice: null });
  expect(
    await prisma.inventoryOpeningSnapshot.count({
      where: { productId: product!.id },
    }),
  ).toBe(2);
  expect(
    await prisma.auditLog.count({
      where: {
        action: "product.created",
        targetId: product!.id,
        reason: "재고 스냅샷 업로드 미등록 품목 자동 생성",
      },
    }),
  ).toBe(1);
});
```

정리 함수는 테스트 이름 prefix로 snapshot/audit/product를 역참조 순서대로 삭제한다.

- [ ] **Step 2: RED를 확인한다**

Run:

```powershell
$env:PLAYWRIGHT_DATABASE_URL='postgresql://postgres:erp_fish_local_pw@localhost:5432/erp_fish_e2e'; corepack pnpm exec playwright test tests/e2e/ecount-supply-imports.spec.ts -g "미등록 품목"
```

Expected: 업로드가 `품목을 찾을 수 없습니다`로 실패하거나 `자동 추가 품목 1개`가 없어 FAIL한다.

- [ ] **Step 3: 단위 wiring 테스트도 먼저 실패하게 만든다**

`tests/unit/inventory-opening-import.test.mjs`의 wiring 테스트에 다음 계약을 추가한다.

```js
assert.match(actionSource, /productCreatedCount/);
assert.match(actionSource, /product\.create/);
assert.match(actionSource, /action:\s*"product\.created"/);
assert.match(
  actionSource,
  /재고 스냅샷 업로드 미등록 품목 자동 생성/,
);
assert.match(actionSource, /defaultUnitPrice:\s*null/);
```

Run:

```powershell
corepack pnpm test:unit:file tests/unit/inventory-opening-import.test.mjs
```

Expected: 새 계약 중 하나 이상이 없어 FAIL한다.

- [ ] **Step 4: `matchRows`에 최소 자동 생성 로직을 구현한다**

`src/features/inventory/opening-import-actions.ts`에서 전체 품목을 조회하고 `isActive`를 선택한다. `matchRows`에 `actorId`를 전달하고 없는 품목을 같은 트랜잭션에서 생성한다.

```ts
async function matchRows(
  tx: Prisma.TransactionClient,
  rows: InventoryOpeningImportRow[],
  actorId: string,
) {
  const [stores, products] = await Promise.all([
    tx.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    }),
    tx.product.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        spec: true,
        isActive: true,
      },
    }),
  ]);
  const storeByName = new Map(stores.map((store) => [store.name, store]));
  const productByKey = new Map(
    products.map((product) => [
      productKey(product.name, product.category, product.spec),
      product,
    ]),
  );
  const matchedRows: MatchedInventoryOpeningRow[] = [];
  const errors: string[] = [];
  const seenRows = new Map<string, number>();
  let productCreatedCount = 0;

  for (const row of rows) {
    const store = storeByName.get(row.storeName);

    if (!store) {
      errors.push(`${row.rowNumber}행 지점명 "${row.storeName}"을 찾을 수 없습니다.`);
      continue;
    }

    const key = productKey(
      row.productName,
      row.productCategory,
      row.productSpec,
    );
    let product = productByKey.get(key);

    if (product && !product.isActive) {
      errors.push(
        `${row.rowNumber}행 품목 "${row.productName}" / "${row.productCategory}" / "${row.productSpec}"은 비활성 상태입니다.`,
      );
      continue;
    }

    if (!product) {
      product = await tx.product.create({
        data: {
          name: row.productName,
          category: row.productCategory,
          spec: row.productSpec,
          defaultUnitPrice: null,
          isActive: true,
          updatedById: actorId,
        },
        select: {
          id: true,
          name: true,
          category: true,
          spec: true,
          isActive: true,
        },
      });
      productByKey.set(key, product);
      productCreatedCount += 1;
      await writeAuditLog(tx, {
        action: "product.created",
        targetType: "Product",
        targetId: product.id,
        actorId,
        before: null,
        after: {
          name: product.name,
          category: product.category,
          spec: product.spec,
          defaultUnitPrice: null,
          isActive: true,
        },
        reason: "재고 스냅샷 업로드 미등록 품목 자동 생성",
      });
    }

    // 기존 matchedRow/중복 검사 로직을 그대로 수행한다.
  }

  return { matchedRows, errors, productCreatedCount };
}
```

호출부는 `matchRows(tx, parsed.rows, actor.id)`로 바꾸고 summary에 `productCreatedCount`를 넣는다.

- [ ] **Step 5: UI에 자동 추가 품목 수를 표시한다**

`src/features/ledger/components/ecount-supply-upload-client.tsx`의 결과 요약에 다음 블록을 추가한다.

```tsx
<div>
  <dt className="text-muted-foreground">자동 추가 품목</dt>
  <dd className="font-medium tabular-nums">
    {inventoryResult.productCreatedCount}개
  </dd>
</div>
```

성공 toast는 다음처럼 품목 수를 포함한다.

```ts
toast.success(
  `재고 스냅샷 ${result.data.importedCount}건을 반영했습니다. 자동 추가 품목 ${result.data.productCreatedCount}개`,
);
```

- [ ] **Step 6: GREEN을 확인한다**

Run:

```powershell
corepack pnpm test:unit:file tests/unit/inventory-opening-import.test.mjs
$env:PLAYWRIGHT_DATABASE_URL='postgresql://postgres:erp_fish_local_pw@localhost:5432/erp_fish_e2e'; corepack pnpm exec playwright test tests/e2e/ecount-supply-imports.spec.ts -g "미등록 품목"
```

Expected: unit과 E2E가 PASS하고 품목 1개, snapshot 2개, `product.created` 감사 1개가 확인된다.

- [ ] **Step 7: 자동 품목 생성 변경을 커밋한다**

```powershell
git add -- src/features/inventory/opening-import-actions.ts src/features/ledger/components/ecount-supply-upload-client.tsx tests/unit/inventory-opening-import.test.mjs tests/e2e/ecount-supply-imports.spec.ts
git commit -m "feat: create products from inventory uploads"
```

---

### Task 3: 기존 장부 충돌을 전체 거부 — RED/GREEN

**Files:**
- Modify: `tests/e2e/ecount-supply-imports.spec.ts`
- Modify: `tests/unit/inventory-opening-import.test.mjs`
- Modify: `src/features/inventory/opening-import-actions.ts`
- Modify: `src/features/ledger/components/ecount-supply-upload-client.tsx`

**Interfaces:**
- Consumes: `getNextInventoryLedgerDate()`, 대상별 `{ storeId, closingDate }`, `InventoryOpeningImportError`
- Produces: 기존 재고 장부가 있으면 `ActionResult`의 `VALIDATION_ERROR`와 지점·날짜별 `fieldErrors.file`

- [ ] **Step 1: 기존 장부 불변 실패 테스트를 작성한다**

```ts
test("재고 업로드는 작성된 대상일 장부를 덮어쓰지 않고 파일 전체를 거부한다", async ({
  page,
}, testInfo) => {
  const suffix = `${testInfo.workerIndex}-${Date.now()}`;
  const product = await seedInventoryProduct(`E2E 기존장부 ${suffix}`);
  const ledger = await seedTargetInventoryLedger({
    storeId: "store-gangnam",
    product,
    quantity: 7,
  });
  const workbook = createInventoryOpeningWorkbook([
    [getPreviousKstDateString(), "강남점", product.name, product.spec, product.category, 2, 12000],
  ]);

  await login(page, "hq@example.com");
  await page.goto("/app/ecount-imports");
  await page.locator('input[name="inventoryFile"]').setInputFiles({
    name: `inventory-conflict-${suffix}.xlsx`,
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: workbook,
  });
  await page.getByRole("button", { name: "재고 업로드" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "강남점의 대상일 재고 장부가 이미 작성되어 있습니다",
  );
  const savedItem = await prisma.ledgerInventoryItem.findUnique({
    where: {
      dailyLedgerId_productId: {
        dailyLedgerId: ledger.id,
        productId: product.id,
      },
    },
  });
  expect(Number(savedItem?.quantity)).toBe(7);
  expect(
    await prisma.inventoryOpeningSnapshot.count({
      where: { storeId: "store-gangnam", productId: product.id },
    }),
  ).toBe(0);
});
```

- [ ] **Step 2: RED를 확인한다**

Run:

```powershell
$env:PLAYWRIGHT_DATABASE_URL='postgresql://postgres:erp_fish_local_pw@localhost:5432/erp_fish_e2e'; corepack pnpm exec playwright test tests/e2e/ecount-supply-imports.spec.ts -g "작성된 대상일 장부"
```

Expected: 현재 `main` 동작은 스냅샷을 저장하고 경고만 하므로 FAIL한다.

- [ ] **Step 3: 충돌 시 트랜잭션 오류를 던지도록 구현한다**

`existingLedgers` 조회에서 지점명과 날짜를 선택하고 결과가 있으면 upsert 전에 실패시킨다.

```ts
const existingLedgers = await tx.dailyLedger.findMany({
  where: {
    OR: ledgerTargets,
    ledgerInventoryItems: { some: {} },
  },
  select: {
    closingDate: true,
    store: { select: { name: true } },
  },
  orderBy: [{ store: { name: "asc" } }, { closingDate: "asc" }],
});

if (existingLedgers.length > 0) {
  throw new InventoryOpeningImportError(
    "기존 재고 장부를 먼저 확인해 주세요.",
    {
      file: existingLedgers.map(
        (ledger) =>
          `${ledger.store.name}의 ${ledger.closingDate.toISOString().slice(0, 10)} 대상일 재고 장부가 이미 작성되어 있습니다.`,
      ),
    },
  );
}
```

`InventoryOpeningUploadResult`에서 `existingLedgerCount`, `existingLedgerStoreNames`를 제거하고 UI의 기존 “스냅샷만 갱신” 성공 안내도 제거한다.

- [ ] **Step 4: unit wiring 계약을 갱신한다**

```js
assert.match(actionSource, /기존 재고 장부를 먼저 확인해 주세요/);
assert.match(actionSource, /ledgerInventoryItems:\s*{\s*some:\s*{}/);
assert.doesNotMatch(clientSource, /스냅샷만 갱신했습니다/);
```

- [ ] **Step 5: GREEN을 확인한다**

Run:

```powershell
corepack pnpm test:unit:file tests/unit/inventory-opening-import.test.mjs
$env:PLAYWRIGHT_DATABASE_URL='postgresql://postgres:erp_fish_local_pw@localhost:5432/erp_fish_e2e'; corepack pnpm exec playwright test tests/e2e/ecount-supply-imports.spec.ts -g "작성된 대상일 장부"
```

Expected: 오류 문구가 보이고 기존 장부 수량 7과 snapshot 0건이 유지되어 PASS한다.

- [ ] **Step 6: 충돌 거부 변경을 커밋한다**

```powershell
git add -- src/features/inventory/opening-import-actions.ts src/features/ledger/components/ecount-supply-upload-client.tsx tests/unit/inventory-opening-import.test.mjs tests/e2e/ecount-supply-imports.spec.ts
git commit -m "fix: reject inventory uploads for written ledgers"
```

---

### Task 4: 전체 회귀 검증과 푸시

**Files:**
- Verify: `src/features/inventory/opening-import-actions.ts`
- Verify: `src/features/inventory/inventory-persist-policy.ts`
- Verify: `src/features/ledger/components/ecount-supply-upload-client.tsx`
- Verify: `tests/unit/inventory-opening-import.test.mjs`
- Verify: `tests/unit/ledger-inventory.test.mjs`
- Verify: `tests/e2e/ecount-supply-imports.spec.ts`
- Verify: `tests/e2e/store-ledger-inventory.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–3의 구현과 테스트
- Produces: 검증된 `feat/rev_02` 원격 브랜치

- [ ] **Step 1: 정적·단위 검증을 실행한다**

```powershell
corepack pnpm check
corepack pnpm test:unit
corepack pnpm db:validate
```

Expected: 모든 명령 exit 0, unit failure 0.

- [ ] **Step 2: 안전한 로컬 E2E DB에서 관련 전체 흐름을 실행한다**

먼저 DB 이름과 호스트가 로컬 `erp_fish_e2e`인지 확인한다. 운영/원격 DB이면 실행하지 않는다.

```powershell
$env:PLAYWRIGHT_DATABASE_URL='postgresql://postgres:erp_fish_local_pw@localhost:5432/erp_fish_e2e'
corepack pnpm exec playwright test tests/e2e/ecount-supply-imports.spec.ts tests/e2e/store-ledger-inventory.spec.ts
```

Expected: 관련 E2E failure 0. 자동 품목 생성, 충돌 거부, 변경 없는 이월 저장이 모두 PASS한다.

- [ ] **Step 3: 코드 리뷰를 수행하고 발견 사항을 수정한다**

검토 기준:

```text
- 새 품목이 동일 키로 한 번만 생성되는가
- 비활성 품목이 재활성화되지 않는가
- 충돌 오류가 snapshot upsert보다 먼저 발생하는가
- 오류 시 product/audit/snapshot이 모두 rollback되는가
- 기존 장부와 사용자 미추적 파일이 변하지 않는가
```

- [ ] **Step 4: 최종 diff와 커밋 상태를 확인한다**

```powershell
git diff --check
git status --short
git log --oneline --decorate -8
```

Expected: 미추적 사용자 파일 2개 외 작업 트리가 깨끗하고 구현 커밋이 문서 커밋 위에 존재한다.

- [ ] **Step 5: 현재 브랜치를 푸시한다**

```powershell
git push origin feat/rev_02
```

Expected: push 성공, 원격 `origin/feat/rev_02`가 로컬 HEAD와 같다.
