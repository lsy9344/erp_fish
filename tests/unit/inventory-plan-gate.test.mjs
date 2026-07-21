import assert from "node:assert/strict";
import test from "node:test";

import { getInventoryPlanGate } from "../../src/features/ledger/inventory-plan-gate.ts";

test("inventory plan gate compares product-id sets rather than row counts", () => {
  const gate = getInventoryPlanGate({
    targetProductIds: ["A", "B"],
    persistedInventoryProductIds: ["A", "B"],
    plannedProductIds: ["A", "C"],
  });

  assert.equal(gate.complete, false);
  assert.deepEqual(gate.missingInventoryProductIds, []);
  assert.deepEqual(gate.missingPlanProductIds, ["B"]);
});

test("inventory plan gate requires both inventory and plan for every target", () => {
  const gate = getInventoryPlanGate({
    targetProductIds: ["B", "A", "A"],
    persistedInventoryProductIds: ["B", "A"],
    plannedProductIds: ["A", "B", "outside"],
  });

  assert.equal(gate.complete, true);
  assert.deepEqual(gate.targetProductIds, ["A", "B"]);
});

test("inventory plan gate is incomplete when there are no target products", () => {
  assert.equal(
    getInventoryPlanGate({
      targetProductIds: [],
      persistedInventoryProductIds: [],
      plannedProductIds: ["outside"],
    }).complete,
    false,
  );
});
