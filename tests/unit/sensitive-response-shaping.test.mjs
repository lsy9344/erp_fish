import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

const root = process.cwd();
const sensitiveKeys = [
  "costOfGoodsSold",
  "grossProfit",
  "grossMarginRate",
  "operatingProfit",
  "productivity",
  "inventoryAmount",
  "unitPrice",
  "beforeAmount",
  "afterAmount",
  "differenceAmount",
  "lot",
  "fixedCost",
  "comparisonStore",
];

function assertProjectFile(...segments) {
  const filePath = path.join(root, ...segments);

  assert.ok(existsSync(filePath), `${segments.join("/")} should exist`);

  return filePath;
}

function readProjectFile(...segments) {
  return readFileSync(assertProjectFile(...segments), "utf8");
}

function assertNoSensitiveKeys(value, location = "payload") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoSensitiveKeys(item, `${location}[${index}]`),
    );
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    assert.equal(
      sensitiveKeys.some((sensitiveKey) => key.includes(sensitiveKey)),
      false,
      `${location}.${key} should not expose a sensitive field`,
    );
    assertNoSensitiveKeys(nestedValue, `${location}.${key}`);
  }
}

test("store manager response shaping recursively removes sensitive ledger metrics", async () => {
  const responseShapePath = assertProjectFile(
    "src",
    "features",
    "ledger",
    "response-shaping.ts",
  );
  const { toStoreManagerLedgerReviewStepData } = await import(
    pathToFileURL(responseShapePath).href
  );

  const safeReview = toStoreManagerLedgerReviewStepData({
    id: "ledger-1",
    storeId: "store-1",
    closingDate: "2026-06-10T00:00:00.000Z",
    status: "IN_PROGRESS",
    submittedById: null,
    submittedAt: null,
    summary: {
      totalSales: { value: 100_000 },
      costOfGoodsSold: { value: 30_000 },
      grossProfit: { value: 70_000 },
      grossMarginRate: { value: 0.7 },
      operatingProfit: { value: 60_000 },
      productivity: { value: 30_000 },
      inventoryAmount: { value: 8_000 },
      salesDifference: { value: 2_000 },
      paymentDifference: { value: 0 },
    },
    missingItems: [],
    warnings: [],
    signals: [
      {
        id: "inventory-product-1",
        label: "재고 차이",
        detail: "광어 실제 재고 차이",
        quantity: -2,
        amount: -2_000,
      },
    ],
  });

  assertNoSensitiveKeys(safeReview);
  assert.deepEqual(Object.keys(safeReview.summary), [
    "totalSales",
    "paymentDifference",
  ]);
  assert.deepEqual(safeReview.signals[0], {
    id: "inventory-product-1",
    label: "재고 차이",
    detail: "광어 실제 재고 차이",
    quantity: -2,
  });
});

test("store manager inventory and loss contracts define safe response types", () => {
  const inventoryTypes = readProjectFile("src", "features", "inventory", "types.ts");
  const lossTypes = readProjectFile("src", "features", "losses", "types.ts");
  const inventoryQueries = readProjectFile("src", "features", "inventory", "queries.ts");
  const lossQueries = readProjectFile("src", "features", "losses", "queries.ts");
  const inventoryActions = readProjectFile("src", "features", "inventory", "actions.ts");
  const lossActions = readProjectFile("src", "features", "losses", "actions.ts");

  assert.match(inventoryTypes, /StoreManagerInventoryStepData/);
  assert.match(inventoryTypes, /StoreManagerInventoryStepLine/);
  assert.match(lossTypes, /StoreManagerLossStepData/);
  assert.match(lossTypes, /StoreManagerLossLineItem/);
  assert.match(lossTypes, /StoreManagerLossLineItem[\s\S]*"unitPrice"/);
  assert.doesNotMatch(
    lossTypes,
    /StoreManagerLossLineItem[\s\S]*"unitPrice"\s*\|\s*"amount"/,
  );
  assert.match(
    lossTypes,
    /StoreManagerLossProductSummary[\s\S]*"amount"/,
  );
  assert.match(
    lossTypes,
    /StoreManagerLossSignalCandidate[\s\S]*"amount"\s*\|\s*"exceededAmount"/,
  );

  for (const source of [inventoryQueries, inventoryActions]) {
    assert.match(source, /toStoreManagerInventoryStepData/);
  }

  for (const source of [lossQueries, lossActions]) {
    assert.match(source, /toStoreManagerLossStepData/);
  }

  assert.match(
    lossQueries,
    /lossItems:\s*data\.lossItems\.map\(\(\{\s*unitPrice,\s*\.\.\.item\s*}\)/,
  );
  assert.match(
    lossQueries,
    /summary:\s*{[\s\S]*totalQuantity:\s*data\.summary\.totalQuantity[\s\S]*byProduct:\s*data\.summary\.byProduct\.map\(\(\{\s*amount,/,
  );
  assert.match(
    lossQueries,
    /signalCandidates:\s*data\.signalCandidates\.map\([\s\S]*\{\s*amount,\s*exceededAmount,/,
  );
});

test("authz semantic gates keep report view and export create separate", () => {
  const authz = readProjectFile("src", "server", "authz.ts");

  assert.match(
    authz,
    /requireReportAccess\(\)[\s\S]*PermissionAction\.REPORT_VIEW/,
  );
  assert.match(
    authz,
    /requireExportCreateAccess\(\)[\s\S]*PermissionAction\.EXPORT_CREATE/,
  );
  assert.doesNotMatch(
    authz,
    /function\s+requireExportCreateAccess\(\)[\s\S]*requireReportAccess\(/,
  );
  assert.match(
    authz,
    /hasActionPermission[\s\S]*permissionProfiles:\s*{\s*some:[\s\S]*actions:\s*{\s*some:\s*{\s*action/s,
  );
});
