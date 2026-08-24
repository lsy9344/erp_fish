import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const inventoryActionUrl = new URL(
  "../../src/features/inventory/actions.ts",
  import.meta.url,
);
const lossSyncUrl = new URL(
  "../../src/features/losses/planned-price-sync.ts",
  import.meta.url,
);
const salesPricePersistenceUrl = new URL(
  "../../src/features/inventory/sales-price-persistence.ts",
  import.meta.url,
);
const hqInventoryActionUrl = new URL(
  "../../src/features/inventory/hq-edit-actions.ts",
  import.meta.url,
);

test("inventory save owns one CAS and atomically patches lot plans before FIFO loss allocation", async () => {
  const source = await readFile(inventoryActionUrl, "utf8");
  const transaction = source.slice(
    source.indexOf("const result = await db.$transaction"),
    source.indexOf('if ("ok" in result)'),
  );

  assert.match(transaction, /getInventoryTargetErrors\(/);
  assert.match(transaction, /getInventoryAmountErrors\(/);
  assert.match(
    transaction,
    /getLedgerInventoryFifoAmountErrorProductIdsInTx\(/,
  );
  assert.match(transaction, /dailyLedger\.updateMany\(/);
  assert.match(transaction, /version:\s*\{\s*increment:\s*1\s*\}/);
  assert.equal(
    (transaction.match(/version:\s*\{\s*increment:\s*1\s*\}/g) ?? []).length,
    1,
  );
  assert.match(transaction, /upsertInventorySalesPricePlansInTx\(/);
  assert.match(transaction, /upsertLedgerLotSalesPricePlansInTx\(/);
  assert.match(transaction, /refreshLedgerInventoryFifoLots\(/);
  assert.match(transaction, /dailyLedgerId:\s*before\.id/);
  assert.match(transaction, /action:\s*"ledger\.inventory\.saved"/);
  assert.ok(
    transaction.indexOf("getInventoryTargetErrors(") <
      transaction.indexOf("dailyLedger.updateMany("),
    "target validation must finish before the CAS mutation",
  );
  assert.ok(
    transaction.indexOf("getInventoryAmountErrors(") <
      transaction.indexOf("dailyLedger.updateMany("),
    "amount bounds must be validated before the CAS mutation",
  );
  assert.ok(
    transaction.indexOf("getLedgerInventoryFifoAmountErrorProductIdsInTx(") <
      transaction.indexOf("dailyLedger.updateMany("),
    "FIFO amount bounds must be validated before the CAS mutation",
  );
  assert.ok(
    transaction.indexOf("upsertLedgerLotSalesPricePlansInTx(") <
      transaction.indexOf("refreshLedgerInventoryFifoLots("),
    "loss allocations must read the newly upserted lot prices",
  );
});

test("store inventory action uses the manager-only validated schema", async () => {
  const source = await readFile(inventoryActionUrl, "utf8");

  assert.match(source, /ledgerStoreManagerInventorySchema\.safeParse\(input\)/);
  assert.match(source, /LedgerStoreManagerInventoryInput/);
  assert.doesNotMatch(source, /as InventoryItemWithPlannedPrice\[\]/);
  assert.match(source, /판매한 가격 \$\{item\.plannedUnitPrice/);
});

test("inventory plan persistence is patch-only and preserves plan metadata", async () => {
  // DESIGN.md D6/F6: 벌크 저장 helper는 순수 모듈로 분리되어 지점장 저장과 본사
  // 마감 편집이 공유한다. 품목별 반복 저장은 만들지 않는다.
  const helper = await readFile(salesPricePersistenceUrl, "utf8");
  const actionsSource = await readFile(inventoryActionUrl, "utf8");
  const hqActionsSource = await readFile(hqInventoryActionUrl, "utf8");

  assert.match(
    helper,
    /export async function upsertInventorySalesPricePlansInTx/,
  );
  assert.match(
    actionsSource,
    /import \{ upsertInventorySalesPricePlansInTx \} from "\.\/sales-price-persistence"/,
  );
  assert.match(
    hqActionsSource,
    /import \{[\s\S]*?upsertInventorySalesPricePlansInTx,[\s\S]*?\} from "\.\/sales-price-persistence"/,
  );
  // DESIGN.md D6: 본사 마감 편집 경로는 판매가격 쓰기 게이트를 통과한 항목만 저장한다.
  assert.match(hqActionsSource, /getSalesPriceWriteGateDecision\(/);
  // 양쪽 모두 품목별 upsert가 아닌 공유 벌크 helper를 호출한다.
  assert.doesNotMatch(actionsSource, /storeSalesPricePlan\.upsert\(/);
  assert.doesNotMatch(hqActionsSource, /storeSalesPricePlan\.upsert\(/);

  assert.doesNotMatch(helper, /storeSalesPricePlan\.delete/);

  // 왕복 수를 품목 수와 분리하려고 per-item upsert를 벌크 UPDATE로 바꿨다. patch-only
  // 계약은 SET 목록으로 지켜진다 — plannedUnitPrice/updatedById/updatedAt만 건드린다.
  const setClause = helper.slice(
    helper.indexOf('UPDATE "StoreSalesPricePlan"'),
    helper.indexOf("WHERE plan."),
  );

  assert.match(
    setClause,
    /SET "plannedUnitPrice" = source\."plannedUnitPrice"/,
  );
  assert.match(setClause, /"updatedById" =/);
  assert.match(setClause, /"updatedAt" = now\(\)/);
  assert.doesNotMatch(setClause, /"memo"/);
  assert.doesNotMatch(setClause, /"createdById"/);
  assert.doesNotMatch(setClause, /"createdAt"/);
});

test("planned price loss sync updates derived fields without ledger metadata side effects", async () => {
  const source = await readFile(lossSyncUrl, "utf8");

  assert.match(source, /ledgerLossItem\.update\(/);
  assert.match(source, /const unchanged =/);
  assert.doesNotMatch(source, /dailyLedger\.(?:update|updateMany)\(/);
  assert.doesNotMatch(source, /lossReviewedAt:\s*null/);
  assert.doesNotMatch(source, /lossReviewedById:\s*null/);
  assert.doesNotMatch(source, /version:\s*\{\s*increment:/);
  assert.match(source, /dailyLedgerId:\s*input\.dailyLedgerId/);
});

test("inventory plan save revalidates every consumer path", async () => {
  const source = await readFile(inventoryActionUrl, "utf8");
  const helper = source.slice(
    source.indexOf("function revalidateInventoryPaths"),
    source.indexOf("export async function saveLedgerInventoryItems"),
  );

  assert.match(
    helper,
    /revalidateStoreEntryPaths\(\["root",\s*"inventory",\s*"losses"\]\)/,
  );
  assert.match(helper, /revalidateDashboardAndReports\(\)/);
  assert.match(source, /revalidateLedgerDetailPath\(parsed\.data\.ledgerId\)/);
});

test("sales price write gate follows the shared HQ ledger status policy", async () => {
  const { getSalesPriceWriteGateDecision, salesPriceWriteForbiddenMessage } =
    await import(salesPricePersistenceUrl.href);

  // 가격이 없는 저장은 게이트와 무관하게 통과한다.
  assert.deepEqual(
    getSalesPriceWriteGateDecision({
      hasPlannedPriceInput: false,
      closedEditAllowed: false,
      ledgerStatus: "IN_PROGRESS",
    }),
    { ok: true },
  );

  // 진행·검토 장부는 기본 장부 수정 권한으로 통과한다.
  for (const ledgerStatus of ["IN_PROGRESS", "IN_REVIEW"]) {
    assert.deepEqual(
      getSalesPriceWriteGateDecision({
        hasPlannedPriceInput: true,
        closedEditAllowed: false,
        ledgerStatus,
      }),
      { ok: true },
    );
  }

  // 마감 편집 권한 + 마감 장부도 통과.
  assert.deepEqual(
    getSalesPriceWriteGateDecision({
      hasPlannedPriceInput: true,
      closedEditAllowed: true,
      ledgerStatus: "HEADQUARTERS_CLOSED",
    }),
    { ok: true },
  );

  // 권한 없는 사용자(HQ_STAFF 등)는 마감 장부에서도 거부.
  const forbidden = getSalesPriceWriteGateDecision({
    hasPlannedPriceInput: true,
    closedEditAllowed: false,
    ledgerStatus: "HEADQUARTERS_CLOSED",
  });
  assert.equal(forbidden.ok, false);
  assert.equal(forbidden.code, "LEDGER_NOT_EDITABLE");
  assert.equal(forbidden.message, salesPriceWriteForbiddenMessage);

  // 휴무 장부는 추가 권한이 있어도 거부.
  const holiday = getSalesPriceWriteGateDecision({
    hasPlannedPriceInput: true,
    closedEditAllowed: true,
    ledgerStatus: "HOLIDAY",
  });
  assert.equal(holiday.ok, false);
  assert.equal(holiday.code, "LEDGER_NOT_EDITABLE");
});
