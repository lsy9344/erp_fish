import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

const money = (value) => ({ kind: "money", value });
const quantity = (value) => ({ kind: "quantity", value });
const metric = (value) => ({ kind: "metric", value });

test("ledger review correction overlay applies latest payment, inventory, and loss values without mutating originals", async () => {
  const ledgerPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const {
    applyCorrectionValuesToLedgerReviewInput,
    calculateLedgerReviewSummary,
  } = await import(pathToFileURL(ledgerPath).href);
  const reviewInput = {
    totalSalesAmount: 100000,
    cashAmount: 40000,
    cardAmount: 50000,
    otherPaymentAmount: 10000,
    workerCount: 4,
    expenseTotal: 0,
    inventoryItems: [
      {
        id: "inventory-1",
        productName: "광어",
        previousQuantity: 10,
        purchasedQuantity: 5,
        currentQuantity: 8,
        quantity: 8,
        unitPrice: 1000,
        inventoryAmount: 8000,
      },
    ],
  };
  const lossItems = [
    {
      id: "loss-1",
      productId: "product-1",
      productName: "광어",
      quantity: 1,
      amount: 10000,
    },
  ];

  const result = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: "ledger-1",
    reviewInput,
    lossItems,
    corrections: [
      {
        targetType: "PAYMENT_FIELD",
        targetId: "ledger-1",
        fieldKey: "totalSalesAmount",
        latestAppliedValue: money(120000),
      },
      {
        targetType: "INVENTORY_ROW",
        targetId: "inventory-1",
        fieldKey: "currentQuantity",
        latestAppliedValue: quantity(6),
      },
      {
        targetType: "LOSS_ROW",
        targetId: "loss-1",
        fieldKey: "amount",
        latestAppliedValue: money(60000),
      },
    ],
  });

  assert.equal(reviewInput.totalSalesAmount, 100000);
  assert.equal(reviewInput.inventoryItems[0].currentQuantity, 8);
  assert.equal(lossItems[0].amount, 10000);
  assert.equal(result.reviewInput.totalSalesAmount, 120000);
  assert.equal(result.reviewInput.inventoryItems[0].currentQuantity, 6);
  assert.equal(result.lossItems[0].amount, 60000);
  assert.deepEqual([...result.appliedInventoryItemIds], ["inventory-1"]);
  assert.deepEqual([...result.appliedLossProductIds], []);
  assert.deepEqual(result.correctionState, {
    appliedCorrectionCount: 3,
    hasAppliedCorrections: true,
    hasUnappliedCorrections: false,
  });

  const summary = calculateLedgerReviewSummary({
    ...result.reviewInput,
    inventoryAdjustments: [],
    lossItems: result.lossItems,
  });

  assert.equal(summary.totalSales.value, 120000);
  assert.equal(summary.costOfGoodsSold.value, 9000);
  assert.equal(summary.grossProfit.value, 111000);
});

test("ledger review correction overlay exposes loss quantity product ids for adjustment recalculation", async () => {
  const ledgerPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { applyCorrectionValuesToLedgerReviewInput } = await import(
    pathToFileURL(ledgerPath).href
  );

  const result = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: "ledger-1",
    reviewInput: {
      totalSalesAmount: 100000,
      cashAmount: 40000,
      cardAmount: 50000,
      otherPaymentAmount: 10000,
      workerCount: 4,
      expenseTotal: 0,
      inventoryItems: [],
    },
    lossItems: [
      {
        id: "loss-1",
        productId: "product-1",
        productName: "광어",
        quantity: 1,
        amount: 10000,
      },
    ],
    corrections: [
      {
        targetType: "LOSS_ROW",
        targetId: "loss-1",
        fieldKey: "quantity",
        latestAppliedValue: quantity(3),
      },
    ],
  });

  assert.equal(result.lossItems[0].quantity, 3);
  assert.deepEqual([...result.appliedLossProductIds], ["product-1"]);
});

test("ledger review correction overlay marks unsupported calculated metric corrections for review", async () => {
  const ledgerPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { applyCorrectionValuesToLedgerReviewInput } = await import(
    pathToFileURL(ledgerPath).href
  );

  const result = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: "ledger-1",
    reviewInput: {
      totalSalesAmount: 100000,
      cashAmount: 40000,
      cardAmount: 50000,
      otherPaymentAmount: 10000,
      workerCount: 4,
      expenseTotal: 0,
      inventoryItems: [],
    },
    lossItems: [],
    corrections: [
      {
        targetType: "CALCULATED_METRIC",
        targetId: "ledger-1",
        fieldKey: "grossMarginRate",
        latestAppliedValue: metric("직접 보정"),
      },
    ],
  });

  assert.deepEqual(result.correctionState, {
    appliedCorrectionCount: 0,
    hasAppliedCorrections: false,
    hasUnappliedCorrections: true,
  });
});

test("ledger review correction overlay keeps purchase row corrections unapplied for report review", async () => {
  const ledgerPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { applyCorrectionValuesToLedgerReviewInput } = await import(
    pathToFileURL(ledgerPath).href
  );

  const result = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: "ledger-1",
    reviewInput: {
      totalSalesAmount: 100000,
      cashAmount: 40000,
      cardAmount: 50000,
      otherPaymentAmount: 10000,
      workerCount: 4,
      expenseTotal: 0,
      inventoryItems: [
        {
          id: "inventory-1",
          productName: "광어",
          previousQuantity: 10,
          purchasedQuantity: 5,
          currentQuantity: 8,
          quantity: 8,
          unitPrice: 1000,
          inventoryAmount: 8000,
        },
      ],
    },
    lossItems: [],
    corrections: [
      {
        targetType: "PURCHASE_ROW",
        targetId: "purchase-1",
        fieldKey: "quantity",
        latestAppliedValue: quantity(9),
      },
    ],
  });

  assert.equal(result.reviewInput.inventoryItems[0].purchasedQuantity, 5);
  assert.deepEqual([...result.appliedCorrectionKeys], []);
  assert.deepEqual([...result.unappliedCorrectionKeys], [
    "ledger-1:PURCHASE_ROW:purchase-1:quantity",
  ]);
  assert.deepEqual(result.correctionState, {
    appliedCorrectionCount: 0,
    hasAppliedCorrections: false,
    hasUnappliedCorrections: true,
  });
});

test("ledger review correction overlay does not claim unused inventory amount corrections were applied", async () => {
  const ledgerPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { applyCorrectionValuesToLedgerReviewInput } = await import(
    pathToFileURL(ledgerPath).href
  );

  const result = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: "ledger-1",
    reviewInput: {
      totalSalesAmount: 100000,
      cashAmount: 40000,
      cardAmount: 50000,
      otherPaymentAmount: 10000,
      workerCount: 4,
      expenseTotal: 0,
      inventoryItems: [
        {
          id: "inventory-1",
          productName: "광어",
          previousQuantity: 10,
          purchasedQuantity: 5,
          currentQuantity: 8,
          quantity: 8,
          unitPrice: 1000,
          inventoryAmount: 8000,
        },
      ],
    },
    lossItems: [],
    corrections: [
      {
        targetType: "INVENTORY_ROW",
        targetId: "inventory-1",
        fieldKey: "inventoryAmount",
        latestAppliedValue: money(12000),
      },
    ],
  });

  assert.equal(result.reviewInput.inventoryItems[0].inventoryAmount, 8000);
  assert.deepEqual(result.correctionState, {
    appliedCorrectionCount: 0,
    hasAppliedCorrections: false,
    hasUnappliedCorrections: true,
  });
});

test("ledger review correction overlay makes legacy quantity corrections affect current inventory calculations", async () => {
  const ledgerPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const {
    applyCorrectionValuesToLedgerReviewInput,
    calculateLedgerReviewSummary,
  } = await import(pathToFileURL(ledgerPath).href);

  const result = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: "ledger-1",
    reviewInput: {
      totalSalesAmount: 100000,
      cashAmount: 40000,
      cardAmount: 50000,
      otherPaymentAmount: 10000,
      workerCount: 4,
      expenseTotal: 0,
      inventoryItems: [
        {
          id: "inventory-1",
          productName: "광어",
          previousQuantity: 10,
          purchasedQuantity: 5,
          currentQuantity: 8,
          quantity: 8,
          unitPrice: 1000,
          inventoryAmount: 8000,
        },
      ],
    },
    corrections: [
      {
        targetType: "INVENTORY_ROW",
        targetId: "inventory-1",
        fieldKey: "quantity",
        latestAppliedValue: quantity(6),
      },
    ],
  });

  assert.equal(result.reviewInput.inventoryItems[0].currentQuantity, 6);
  assert.equal(result.reviewInput.inventoryItems[0].quantity, 6);
  assert.equal(
    calculateLedgerReviewSummary({
      ...result.reviewInput,
      inventoryAdjustments: [],
      lossItems: [],
    }).costOfGoodsSold.value,
    9000,
  );
  assert.equal(result.correctionState.hasUnappliedCorrections, false);
});

test("ledger review correction overlay applies expense amount corrections to operating profit", async () => {
  const ledgerPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const {
    applyCorrectionValuesToLedgerReviewInput,
    calculateLedgerReviewSummary,
  } = await import(pathToFileURL(ledgerPath).href);

  const result = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: "ledger-1",
    reviewInput: {
      totalSalesAmount: 100000,
      cashAmount: 10000,
      cardAmount: 50000,
      otherPaymentAmount: 10000,
      workerCount: 4,
      expenseTotal: 30000,
      inventoryItems: [
        {
          id: "inventory-1",
          productName: "광어",
          previousQuantity: 10,
          purchasedQuantity: 5,
          currentQuantity: 5,
          quantity: 5,
          unitPrice: 1000,
          inventoryAmount: 5000,
        },
      ],
    },
    expenseItems: [{ id: "expense-1", amount: 30000 }],
    corrections: [
      {
        targetType: "EXPENSE_ROW",
        targetId: "expense-1",
        fieldKey: "amount",
        latestAppliedValue: money(12000),
      },
    ],
  });

  assert.equal(result.reviewInput.expenseTotal, 12000);
  assert.equal(
    calculateLedgerReviewSummary({
      ...result.reviewInput,
      inventoryAdjustments: [],
      lossItems: [],
    }).operatingProfit.value,
    78000,
  );
  assert.deepEqual(result.correctionState, {
    appliedCorrectionCount: 1,
    hasAppliedCorrections: true,
    hasUnappliedCorrections: false,
  });
});

test("ledger review correction overlay rejects negative persisted numeric correction values", async () => {
  const ledgerPath = assertProjectFile(
    "src",
    "server",
    "calculations",
    "ledger.ts",
  );
  const { applyCorrectionValuesToLedgerReviewInput } = await import(
    pathToFileURL(ledgerPath).href
  );

  const result = applyCorrectionValuesToLedgerReviewInput({
    ledgerId: "ledger-1",
    reviewInput: {
      totalSalesAmount: 100000,
      cashAmount: 40000,
      cardAmount: 50000,
      otherPaymentAmount: 10000,
      workerCount: 4,
      expenseTotal: 0,
      inventoryItems: [],
    },
    corrections: [
      {
        targetType: "PAYMENT_FIELD",
        targetId: "ledger-1",
        fieldKey: "totalSalesAmount",
        latestAppliedValue: money(-1),
      },
      {
        targetType: "LEDGER_FIELD",
        targetId: "ledger-1",
        fieldKey: "workerCount",
        latestAppliedValue: quantity(-2),
      },
    ],
  });

  assert.equal(result.reviewInput.totalSalesAmount, 100000);
  assert.equal(result.reviewInput.workerCount, 4);
  assert.deepEqual(result.correctionState, {
    appliedCorrectionCount: 0,
    hasAppliedCorrections: false,
    hasUnappliedCorrections: true,
  });
});
