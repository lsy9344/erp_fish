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

test("inventory save owns one CAS and atomically patches plans before derived loss sync", async () => {
  const source = await readFile(inventoryActionUrl, "utf8");
  const transaction = source.slice(
    source.indexOf("const result = await db.$transaction"),
    source.indexOf("if (\"ok\" in result)"),
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
    (transaction.match(/version:\s*\{\s*increment:\s*1\s*\}/g) ?? [])
      .length,
    1,
  );
  assert.match(transaction, /upsertInventorySalesPricePlansInTx\(/);
  assert.match(transaction, /syncLedgerLossItemsWithSalesPricePlansInTx\(/);
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
    transaction.indexOf("upsertInventorySalesPricePlansInTx(") <
      transaction.indexOf("syncLedgerLossItemsWithSalesPricePlansInTx("),
    "loss snapshots must read the newly upserted planned prices",
  );
});

test("store inventory action uses the manager-only validated schema", async () => {
  const source = await readFile(inventoryActionUrl, "utf8");

  assert.match(source, /ledgerStoreManagerInventorySchema\.safeParse\(input\)/);
  assert.match(source, /LedgerStoreManagerInventoryInput/);
  assert.doesNotMatch(source, /as InventoryItemWithPlannedPrice\[\]/);
  assert.match(source, /판매계획가 \$\{item\.plannedUnitPrice/);
});

test("inventory plan persistence is patch-only and preserves plan metadata", async () => {
  const source = await readFile(inventoryActionUrl, "utf8");
  const helper = source.slice(
    source.indexOf("async function upsertInventorySalesPricePlansInTx"),
    source.indexOf("function parseLedgerInventoryInput"),
  );

  assert.match(helper, /storeSalesPricePlan\.upsert\(/);
  assert.doesNotMatch(helper, /storeSalesPricePlan\.delete/);
  assert.match(helper, /update:\s*\{\s*plannedUnitPrice:/);
  assert.doesNotMatch(helper, /update:\s*\{[^}]*memo:/s);
  assert.doesNotMatch(helper, /update:\s*\{[^}]*createdById:/s);
  assert.doesNotMatch(helper, /update:\s*\{[^}]*createdAt:/s);
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
