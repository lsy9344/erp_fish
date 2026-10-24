import assert from "node:assert/strict";
import { test } from "node:test";

import { toInventoryAuditSnapshot } from "../../src/features/inventory/audit-snapshot.ts";
import { formatAuditChangeSummary } from "../../src/features/audit/audit-format.ts";
import { applyCorrectionOverlayToInventoryEditValues } from "../../src/features/corrections/edit-overlay.ts";
import {
  planOpeningCarryoverRepair,
  requireOpeningCarryoverAuditEvidence,
} from "../../src/features/inventory/opening-carryover-repair.ts";
import { withLedgerEditContext } from "../../src/server/audit.ts";
import { omitSensitiveFields } from "../../src/server/sensitive-fields.ts";

function makeSnapshot() {
  return {
    id: "ledger-audit-test",
    storeId: "store-audit-test",
    closingDate: "2026-10-24T00:00:00.000Z",
    updatedAt: "2026-10-24T03:00:00.000Z",
    version: 1,
    authorDisplayName: "시험 작성자",
    status: "IN_PROGRESS",
    stepCompletion: { inventory: false, losses: true },
    carryover: {
      status: "loaded",
      source: "OPENING_SNAPSHOT",
      message: "월초",
    },
    manualProductOptions: [{ productId: "unused", productName: "선택지" }],
    items: [
      {
        id: "product-test", // 미저장 월초 가상 행도 보존한다.
        productId: "product-test",
        productName: "시험 광어",
        productCategory: "활어",
        productSpec: "1kg",
        purchasePrice: {
          kind: "OPENING",
          yearMonth: "2026-10",
          unitPrice: 100,
        },
        plannedUnitPrice: 0,
        unitPrice: 100,
        previousQuantity: 8,
        purchasedQuantity: 0,
        conversionInQuantity: 0,
        conversionOutQuantity: 0,
        purchaseAmount: 0,
        lossQuantity: 0,
        lossAmount: 0,
        currentQuantity: 8,
        quantity: 8,
        inventoryAmount: 800,
        fifoLots: [
          {
            lotOriginKey: "opening:test",
            sourceType: "OPENING",
            sourceLedgerId: null,
            sourcePurchaseItemId: null,
            purchaseDate: null,
            sourceBusinessDate: "2026-10-01T00:00:00.000Z",
            unitPrice: 100,
            originalQuantity: 8,
            consumedQuantity: 0,
            lossQuantity: 0,
            soldQuantity: 0,
            conversionOutQuantity: 0,
            remainingQuantity: 8,
            originalAmount: 800,
            consumedAmount: 0,
            lossAmount: 0,
            soldAmount: 0,
            conversionOutAmount: 0,
            remainingAmount: 800,
            plannedUnitPrice: 0,
            plannedUnitPriceSource: null,
            expectedRevenue: 0,
            expectedProfit: -800,
            expectedMarginRate: null,
            sortOrder: 0,
          },
        ],
        carryoverSource: "OPENING_SNAPSHOT",
        carryoverStatus: "OPENING_CARRYOVER",
        carryoverLedgerId: null,
        previousQuantityDetail: {
          source: "OPENING_SNAPSHOT",
          status: "OPENING_CARRYOVER",
          resolvedQuantity: 8,
          sourceLedgerId: null,
          sourceLedgerClosingDate: null,
          sourceLedgerStatus: null,
          sourceYearMonth: "2026-10",
          sourceSnapshotId: "snapshot-test",
          sourcePreviousQuantity: 8,
          sourcePurchasedQuantity: null,
          sourceLossQuantity: null,
          sourceCurrentQuantity: null,
          sourceQuantity: 8,
          sourceSalesQuantity: 0,
          sourceLastArrivalDate: "2026-10-01T00:00:00.000Z",
          message: "월초 재고 근거",
          history: [
            {
              ledgerId: "old-ledger",
              closingDate: "2026-09-30T00:00:00.000Z",
              ledgerStatus: "HEADQUARTERS_CLOSED",
              previousQuantity: 8,
              purchasedQuantity: 0,
              lossQuantity: null,
              currentQuantity: 8,
              quantity: 8,
            },
          ],
        },
        isModified: false,
        adjustment: null,
      },
    ],
  };
}

function withoutScreenCopies(snapshot) {
  const { manualProductOptions, ...rest } = structuredClone(snapshot);
  void manualProductOptions;
  for (const item of rest.items) {
    delete item.previousQuantityDetail.history;
  }
  return rest;
}

function freezeDeep(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach(freezeDeep);
  }
  return value;
}

test("audit projection keeps every business field and all rows without changing the form data", () => {
  const input = makeSnapshot();
  input.items.push({
    ...structuredClone(input.items[0]),
    id: "saved-row",
    productId: "saved-product",
    currentQuantity: null,
    quantity: null,
    inventoryAmount: null,
    purchasePrice: null,
    plannedUnitPrice: null,
    fifoLots: [],
  });
  const original = structuredClone(input);
  const result = toInventoryAuditSnapshot(freezeDeep(input));

  assert.deepEqual(result, withoutScreenCopies(original));
  assert.deepEqual(input, original);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].id, result.items[0].productId);
  assert.equal(result.items[0].plannedUnitPrice, 0);
  assert.equal(result.items[0].isModified, false);
  assert.equal(result.items[1].currentQuantity, null);
  assert.equal(result.items[1].purchasePrice, null);
  assert.deepEqual(result.items[1].fifoLots, []);

  result.items[0].fifoLots[0].remainingQuantity = 0;
  result.stepCompletion.inventory = true;
  assert.deepEqual(input, original);
  assert.deepEqual(toInventoryAuditSnapshot({ ...input, items: [] }).items, []);
});

test("new screen-only fields cannot enter the audit through the top-level, item or carryover detail", () => {
  const input = makeSnapshot();
  input.newScreenCache = ["large screen cache"];
  input.items[0].newScreenCache = ["large item cache"];
  input.items[0].previousQuantityDetail.newScreenCache = ["large detail cache"];
  assert.deepEqual(
    toInventoryAuditSnapshot(input),
    withoutScreenCopies(makeSnapshot()),
  );
});

test("legacy missing detail scalars stay missing in JSON while zero and null stay intact", () => {
  const input = makeSnapshot();
  delete input.items[0].previousQuantityDetail.sourceSalesQuantity;
  delete input.items[0].previousQuantityDetail.sourceLastArrivalDate;
  delete input.items[0].previousQuantityDetail.history;
  const json = JSON.parse(JSON.stringify(toInventoryAuditSnapshot(input)));
  assert.deepEqual(json, withoutScreenCopies(input));
});

test("previous-ledger provenance, decimal quantities and conversion lots survive projection", () => {
  const input = makeSnapshot();
  const item = input.items[0];
  item.carryoverSource = "PREVIOUS_SAVED_LEDGER";
  item.carryoverStatus = "REVIEW_REQUIRED";
  item.carryoverLedgerId = "previous-ledger";
  item.purchasePrice = {
    kind: "CARRYOVER",
    businessDate: "2026-10-23T00:00:00.000Z",
    unitPrice: 250,
  };
  item.previousQuantity = 1.25;
  item.purchasedQuantity = 2.5;
  item.conversionInQuantity = 0.25;
  item.conversionOutQuantity = 0.5;
  item.lossQuantity = 0.75;
  item.currentQuantity = 2.75;
  Object.assign(item.previousQuantityDetail, {
    source: "PREVIOUS_SAVED_LEDGER",
    status: "REVIEW_REQUIRED",
    resolvedQuantity: 1.25,
    sourceLedgerId: "previous-ledger",
    sourceLedgerClosingDate: "2026-10-23T00:00:00.000Z",
    sourceLedgerStatus: "IN_REVIEW",
    sourceYearMonth: null,
    sourceSnapshotId: null,
    sourcePreviousQuantity: 2.25,
    sourcePurchasedQuantity: 3.5,
    sourceLossQuantity: 0.75,
    sourceCurrentQuantity: 1.25,
    sourceQuantity: 1.5,
    sourceSalesQuantity: 3.75,
    sourceLastArrivalDate: "2026-10-22T00:00:00.000Z",
  });
  item.fifoLots.push({
    ...item.fifoLots[0],
    lotOriginKey: "conversion:test",
    sourceType: "CONVERSION",
    sourceLedgerId: input.id,
    sourceBusinessDate: input.closingDate,
    remainingQuantity: 0.25,
    remainingAmount: 25,
    sortOrder: 1,
  });
  assert.deepEqual(toInventoryAuditSnapshot(input), withoutScreenCopies(input));
});

test("old and compact audits produce the same summary before and after redaction", () => {
  const before = makeSnapshot();
  const after = structuredClone(before);
  after.version++;
  after.items[0].currentQuantity = 9;
  after.items[0].quantity = 9;
  after.items[0].inventoryAmount = 900;
  after.items[0].isModified = true;
  after.items[0].adjustment = {
    id: "adjustment-test",
    beforeQuantity: 8,
    beforeAmount: 800,
    afterQuantity: 9,
    afterAmount: 900,
    differenceQuantity: 1,
    differenceAmount: 100,
    amountStatus: "POLICY_UNCONFIRMED",
    reason: "실사 재고 차이",
    createdByName: "시험 작성자",
    createdAt: before.updatedAt,
    updatedAt: before.updatedAt,
  };
  const compactBefore = toInventoryAuditSnapshot(before);
  const compactAfter = toInventoryAuditSnapshot(after);
  assert.deepEqual(compactAfter.items[0].adjustment, after.items[0].adjustment);
  assert.notEqual(formatAuditChangeSummary(before, after), "-");
  for (const redact of [(value) => value, omitSensitiveFields]) {
    assert.equal(
      formatAuditChangeSummary(redact(compactBefore), redact(compactAfter)),
      formatAuditChangeSummary(redact(before), redact(after)),
    );
  }
});

test("first before.items remains valid opening-repair evidence with an identical business plan", () => {
  const input = makeSnapshot();
  const plan = (before) => {
    const evidence = requireOpeningCarryoverAuditEvidence({
      audit: { actorId: "test-actor", before },
      ledger: { id: input.id, storeId: input.storeId, storeName: "시험 지점" },
      closingDate: new Date(input.closingDate),
    });
    return planOpeningCarryoverRepair({
      auditItems: evidence.auditItems,
      currentItems: [],
      snapshots: [
        {
          id: "snapshot-test",
          productId: "product-test",
          yearMonth: "2026-10",
          quantity: 8,
        },
      ],
    });
  };
  const normalizePlan = (value) => ({
    ...value,
    creates: value.creates.map((item) => {
      const { history, ...detail } = item.previousQuantityDetail;
      void history;
      return { ...item, previousQuantityDetail: detail };
    }),
  });
  assert.equal(plan(toInventoryAuditSnapshot(input)).creates.length, 1);
  assert.deepEqual(
    normalizePlan(plan(toInventoryAuditSnapshot(input))),
    normalizePlan(plan(input)),
  );
});

test("HQ projection retains effective correction values and closed-edit context", () => {
  const input = makeSnapshot();
  input.status = "HEADQUARTERS_CLOSED";
  const effective = applyCorrectionOverlayToInventoryEditValues(input, [
    {
      dailyLedgerId: input.id,
      targetType: "INVENTORY_ROW",
      targetId: input.items[0].id,
      fieldKey: "currentQuantity",
      latestAppliedValue: { kind: "quantity", value: 0, label: "당일재고" },
    },
  ]);
  const result = withLedgerEditContext(toInventoryAuditSnapshot(effective), {
    ledgerStatusAtEdit: input.status,
    closedEdit: true,
  });
  assert.equal(result.items[0].currentQuantity, 0);
  assert.equal(input.items[0].currentQuantity, 8);
  assert.equal(result.ledgerStatusAtEdit, "HEADQUARTERS_CLOSED");
  assert.equal(result.closedEdit, true);
  assert.equal("manualProductOptions" in result, false);
});

test("40 items with 30-ledger history and 300 product choices reduce UTF-8 audit bytes by at least 70%", (t) => {
  const before = makeSnapshot();
  const template = before.items[0];
  before.items = Array.from({ length: 40 }, (_, index) => ({
    ...structuredClone(template),
    id: `product-${index}`,
    productId: `product-${index}`,
    previousQuantityDetail: {
      ...template.previousQuantityDetail,
      history: Array.from({ length: 30 }, (_, day) => ({
        ...template.previousQuantityDetail.history[0],
        ledgerId: `past-ledger-${day}`,
        closingDate: new Date(Date.UTC(2026, 8, day + 1)).toISOString(),
      })),
    },
  }));
  before.manualProductOptions = Array.from({ length: 300 }, (_, index) => ({
    productId: `choice-${index}`,
    productName: `시험 선택 품목 ${index}`,
    productCategory: "활어",
    productSpec: "1kg",
    purchasePrice: template.purchasePrice,
    plannedUnitPrice: null,
    source: "UNGROUNDED",
  }));
  const after = structuredClone(before);
  after.version++;
  after.items[0].currentQuantity = 7;
  after.items[0].quantity = 7;
  after.items[0].inventoryAmount = 700;
  const originalBytes = Buffer.byteLength(
    JSON.stringify({ before, after }),
    "utf8",
  );
  const compactBytes = Buffer.byteLength(
    JSON.stringify({
      before: toInventoryAuditSnapshot(before),
      after: toInventoryAuditSnapshot(after),
    }),
    "utf8",
  );
  const reductionPercent = 100 * (1 - compactBytes / originalBytes);
  t.diagnostic(
    JSON.stringify({ originalBytes, compactBytes, reductionPercent }),
  );
  assert.ok(
    reductionPercent >= 70,
    `${reductionPercent.toFixed(2)}% reduction`,
  );
  assert.deepEqual(
    toInventoryAuditSnapshot(before),
    withoutScreenCopies(before),
  );
});
