import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function correction(targetType, targetId, fieldKey, kind, value) {
  return {
    targetType,
    targetId,
    fieldKey,
    latestAppliedValue: { kind, value },
  };
}

test("HQ edit overlay preserves absent text and applies explicit null corrections", async () => {
  const { applyActiveCorrectionsToLedgerEditData } = await import(
    pathToFileURL(
      path.join(
        root,
        "src",
        "features",
        "ledger",
        "edit-correction-overlay.ts",
      ),
    ).href
  );
  const ledger = {
    id: "ledger-1",
    totalSalesAmount: 100,
    carryoverSalesAmount: 10,
    operatingSalesAmount: 110,
    cashAmount: 40,
    cardAmount: 50,
    otherPaymentAmount: 10,
    paymentDifferenceAmount: 0,
    workerCount: 2,
    workMemo: "기존 근무 메모",
    expenseItems: [
      {
        id: "expense-1",
        ledgerInputCodeId: "code-1",
        ledgerInputCodeName: "식비",
        amount: 10,
        memo: "지울 메모",
      },
      {
        id: "expense-2",
        ledgerInputCodeId: "code-2",
        ledgerInputCodeName: "교통비",
        amount: 20,
        memo: "유지 메모",
      },
    ],
    expenseTotal: 30,
    grossProfit: 80,
    productivity: 55,
  };

  const overlaid = applyActiveCorrectionsToLedgerEditData(ledger, [
    correction("PAYMENT_FIELD", "ledger-1", "cashAmount", "money", 45),
    correction("LEDGER_FIELD", "ledger-1", "workMemo", "text", null),
    correction("EXPENSE_ROW", "expense-1", "amount", "money", 15),
    correction("EXPENSE_ROW", "expense-1", "memo", "text", null),
  ]);

  assert.equal(overlaid.cashAmount, 45);
  assert.equal(overlaid.workMemo, null, "explicit null must clear work memo");
  assert.equal(overlaid.expenseItems[0].memo, null);
  assert.equal(
    overlaid.expenseItems[1].memo,
    "유지 메모",
    "an absent correction must not be treated as explicit null",
  );
  assert.equal(overlaid.expenseTotal, 35);
  assert.equal(overlaid.grossProfit, 75);
});

test("HQ edit overlay includes supported inventory and loss fields", async () => {
  const {
    applyActiveCorrectionsToInventoryEditData,
    applyActiveCorrectionsToLossEditData,
  } = await import(
    pathToFileURL(
      path.join(
        root,
        "src",
        "features",
        "ledger",
        "edit-correction-overlay.ts",
      ),
    ).href
  );
  const inventory = {
    items: [
      { id: "inventory-1", currentQuantity: null, quantity: null },
      { id: "inventory-2", currentQuantity: null, quantity: null },
    ],
  };
  const losses = {
    lossItems: [
      {
        id: "loss-1",
        productId: "product-1",
        productName: "광어",
        quantity: 1,
        amount: 100,
        reason: "기존 사유",
      },
    ],
    summary: { totalQuantity: 1, totalAmount: 100, byProduct: [] },
  };
  const corrections = [
    correction(
      "INVENTORY_ROW",
      "inventory-1",
      "currentQuantity",
      "quantity",
      2.5,
    ),
    correction("LOSS_ROW", "loss-1", "quantity", "quantity", 1.25),
    correction("LOSS_ROW", "loss-1", "amount", "money", 125),
    correction("LOSS_ROW", "loss-1", "reason", "text", "폐기"),
  ];

  const overlaidInventory = applyActiveCorrectionsToInventoryEditData(
    inventory,
    corrections,
  );
  const overlaidLosses = applyActiveCorrectionsToLossEditData(
    losses,
    corrections,
  );

  assert.equal(overlaidInventory.items[0].currentQuantity, 2.5);
  assert.equal(
    overlaidInventory.items[1].currentQuantity,
    null,
    "missing inventory correction must preserve nullable quantity",
  );
  assert.deepEqual(
    {
      quantity: overlaidLosses.lossItems[0].quantity,
      amount: overlaidLosses.lossItems[0].amount,
      reason: overlaidLosses.lossItems[0].reason,
    },
    { quantity: 1.25, amount: 125, reason: "폐기" },
  );
});

test("closed-edit permission migration idempotently backfills owner and HQ admin", () => {
  const migration = readFileSync(
    path.join(
      root,
      "prisma",
      "migrations",
      "20260731120000_add_ledger_closed_edit_permission",
      "migration.sql",
    ),
    "utf8",
  );

  assert.match(migration, /INSERT INTO "PermissionProfileAction"/);
  assert.match(migration, /WHERE "code" IN \('OWNER', 'HQ_ADMIN'\)/);
  assert.match(migration, /ON CONFLICT \("profileId", "action"\) DO NOTHING/);
});
