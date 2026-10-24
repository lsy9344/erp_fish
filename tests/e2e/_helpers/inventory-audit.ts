import { expect } from "@playwright/test";
import type { Prisma } from "../../../generated/prisma";

export function expectInventoryAuditSnapshot(
  snapshot: Prisma.JsonValue | null | undefined,
) {
  expect(snapshot).toMatchObject({
    id: expect.any(String),
    storeId: expect.any(String),
    version: expect.any(Number),
    status: expect.any(String),
    items: expect.any(Array),
  });
  expect(snapshot).not.toHaveProperty("manualProductOptions");

  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new Error("Expected an inventory audit snapshot object");
  }
  if (!Array.isArray(snapshot.items)) {
    throw new Error("Expected all inventory audit rows");
  }

  for (const item of snapshot.items) {
    for (const key of [
      "productId",
      "unitPrice",
      "currentQuantity",
      "quantity",
      "inventoryAmount",
      "fifoLots",
      "adjustment",
      "previousQuantityDetail.source",
      "previousQuantityDetail.resolvedQuantity",
      "previousQuantityDetail.sourceSnapshotId",
      "previousQuantityDetail.sourceLedgerId",
      "previousQuantityDetail.sourceQuantity",
      "previousQuantityDetail.message",
    ]) {
      expect(item).toHaveProperty(key);
    }
    expect(item).not.toHaveProperty("previousQuantityDetail.history");
  }
}
