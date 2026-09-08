import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculatePreviousDaySalesQuantity,
  getLatestArrivalDate,
} from "../../src/features/inventory/previous-stock.ts";

test("previous-day sales use the previous ledger quantities and never go below zero", () => {
  assert.equal(
    calculatePreviousDaySalesQuantity({
      previousQuantity: 10,
      purchasedQuantity: 5,
      lossQuantity: 1,
      closingQuantity: 8,
    }),
    6,
  );
  assert.equal(
    calculatePreviousDaySalesQuantity({
      previousQuantity: 2,
      purchasedQuantity: 0,
      lossQuantity: 0,
      closingQuantity: 5,
    }),
    0,
  );
});

test("previous-day sales are unavailable when a required ledger value is missing", () => {
  assert.equal(
    calculatePreviousDaySalesQuantity({
      previousQuantity: 10,
      purchasedQuantity: null,
      lossQuantity: 0,
      closingQuantity: 8,
    }),
    null,
  );
});

test("last arrival date uses only the latest remaining FIFO source date", () => {
  const latest = getLatestArrivalDate([
    new Date("2026-08-01T00:00:00.000Z"),
    null,
    new Date("2026-08-07T00:00:00.000Z"),
  ]);

  assert.equal(latest?.toISOString(), "2026-08-07T00:00:00.000Z");
  assert.equal(getLatestArrivalDate([null, null]), null);
});
