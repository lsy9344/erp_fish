import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function readProjectFile(...segments) {
  return readFileSync(path.join(root, ...segments), "utf8");
}

const schemaPath = path.join(
  root,
  "src",
  "features",
  "inventory",
  "schemas.ts",
);

function parseItems(items) {
  return import(pathToFileURL(schemaPath).href).then(
    ({ ledgerInventorySchema, ledgerStoreManagerInventorySchema }) => ({
      hq: ledgerInventorySchema.safeParse({
        storeId: "store",
        ledgerId: "ledger",
        closingDate: "2026-08-01",
        version: 1,
        items,
      }),
      storeManager: ledgerStoreManagerInventorySchema.safeParse({
        storeId: "store",
        ledgerId: "ledger",
        closingDate: "2026-08-01",
        version: 1,
        items,
      }),
    }),
  );
}

// DESIGN.md D6: 본사 재고 편집 payload의 plannedUnitPrice는 optional이다.
// 0원은 유효값, 빈칸/미전송은 null(변경 없음), 음수/소수는 오류다.
test("HQ inventory schema treats plannedUnitPrice as optional with 0 valid and blank as null", async () => {
  const { hq } = await parseItems([
    { productId: "p1", plannedUnitPrice: 0 },
    { productId: "p2", plannedUnitPrice: "" },
    { productId: "p3" },
    { productId: "p4", plannedUnitPrice: "1500" },
  ]);

  assert.equal(hq.success, true, JSON.stringify(hq.error?.issues ?? []));
  assert.deepEqual(
    hq.data.items.map((item) => item.plannedUnitPrice),
    [0, null, null, 1500],
  );
});

test("HQ inventory schema rejects negative or fractional plannedUnitPrice", async () => {
  for (const invalid of [-1, 1.5, "-3", "1.5"]) {
    const { hq } = await parseItems([
      { productId: "p1", plannedUnitPrice: invalid },
    ]);

    assert.equal(hq.success, false, `${invalid} should be rejected`);
    assert.match(
      hq.error.issues[0].message,
      /판매한 가격은 0원 이상의 정수여야 합니다/,
    );
  }
});

test("store manager inventory schema still requires plannedUnitPrice", async () => {
  const { storeManager } = await parseItems([
    { productId: "p1", currentQuantity: 1, quantity: 1 },
  ]);

  assert.equal(storeManager.success, false);
  assert.match(
    storeManager.error.issues[0].message,
    /판매한 가격은 0원 이상의 정수여야 합니다/,
  );

  const valid = await parseItems([
    { productId: "p1", currentQuantity: 1, quantity: 1, plannedUnitPrice: 900 },
  ]);
  assert.equal(valid.storeManager.success, true);
});

// DESIGN.md D6: 본사 마감 편집 저장은 장부 closingDate를 판매가 businessDate로
// 쓰고, 값이 온 품목만 저장하며, 손실 재산정에 actor 문맥 상태를 전달한다.
test("HQ inventory save persists sales prices keyed by ledger closingDate", () => {
  const source = readProjectFile(
    "src",
    "features",
    "inventory",
    "hq-edit-actions.ts",
  );

  assert.match(source, /upsertInventorySalesPricePlansInTx\(tx, \{/);
  assert.match(
    source,
    /item\.plannedUnitPrice === null \|\| item\.plannedUnitPrice === undefined/,
    "items without a submitted price must be skipped, not deleted",
  );
  assert.match(
    source,
    /const businessDate = new Date\(before\.closingDate\)/,
    "sales price businessDate must be the ledger closingDate",
  );
  assert.match(source, /businessDate,/);
  assert.match(
    source,
    /syncLedgerLossItemsWithSalesPricePlansInTx\(tx, \{[\s\S]*?ledgerStatuses:\s*getEditableLedgerStatusesForActor\(actor\)/,
    "loss recalculation must include actor-aware editable statuses",
  );
  // 빈칸은 키 자체를 보내지 않는다는 클라이언트 계약과 맞물려 서버는 delete하지 않는다.
  assert.doesNotMatch(source, /storeSalesPricePlan\.delete/);
});

test("inventory client exposes the price input to closed-edit masters without duplicate display", () => {
  const source = readProjectFile(
    "src",
    "features",
    "inventory",
    "components",
    "inventory-step-client.tsx",
  );

  assert.match(
    source,
    /const plannedUnitPriceEditable = isStoreManagerMode \|\| closedEditAllowed/,
  );
  assert.match(source, /\{plannedUnitPriceEditable \? \(/);
  // 입력과 읽기 전용 output은 동시에 표시되지 않는다.
  assert.match(source, /\{!plannedUnitPriceEditable &&/);
  // 본사 마감 편집은 값이 있을 때만 plannedUnitPrice를 전송한다(빈칸=변경 없음).
  assert.match(source, /closedEditAllowed && rawPlannedUnitPrice !== ""/);
  // "모든 품목 판매가 필수" 게이트는 지점장 모드에서만 적용된다.
  assert.match(
    source,
    /function validateRequiredPlannedUnitPrices\(\) \{\s*if \(!isStoreManagerMode\) \{\s*return true;/,
  );
});
