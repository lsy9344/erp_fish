"use server";

import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireStoreAccess } from "~/server/authz";
import { calculateInventoryAmount } from "~/server/calculations/inventory";
import { db } from "~/server/db";
import {
  ledgerInventorySchema,
  toFieldErrors,
  type LedgerInventoryInput,
} from "./schemas";
import { getInventoryStepDataInTx } from "./queries";
import { type InventoryStepData } from "./types";

function parseLedgerInventoryInput(
  input: unknown,
): ActionResult<LedgerInventoryInput> {
  const parsed = ledgerInventorySchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function mapStoreActionError(): ActionResult<never> {
  return actionError(
    "LEDGER_SAVE_FAILED",
    "저장에 실패했습니다. 다시 시도해 주세요.",
  );
}

function revalidateInventoryPaths() {
  revalidatePath("/app/store-entry/inventory");
  revalidatePath("/app/dashboard");
}

export async function saveLedgerInventoryItems(
  input: unknown,
): Promise<ActionResult<InventoryStepData>> {
  const parsed = parseLedgerInventoryInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const actor = await requireStoreAccess(parsed.data.storeId);

  try {
    const result = await db.$transaction(async (tx) => {
      const before = await getInventoryStepDataInTx(
        tx,
        parsed.data.storeId,
        actor.user.id,
      );

      if (before.status !== "IN_PROGRESS") {
        throw new Error("Ledger is not editable");
      }

      const inputByProductId = new Map(
        parsed.data.items.map((item) => [item.productId, item]),
      );

      await tx.ledgerInventoryItem.deleteMany({
        where: { dailyLedgerId: before.id },
      });

      if (before.items.length > 0) {
        await tx.ledgerInventoryItem.createMany({
          data: before.items.map((item) => {
            const currentQuantity =
              inputByProductId.get(item.productId)?.currentQuantity ??
              item.currentQuantity;
            const quantity =
              inputByProductId.get(item.productId)?.quantity ?? item.quantity;
            const inventoryAmount = calculateInventoryAmount(
              quantity,
              item.unitPrice,
            );

            return {
              dailyLedgerId: before.id,
              productId: item.productId,
              productName: item.productName,
              productCategory: item.productCategory,
              productSpec: item.productSpec,
              unitPrice: item.unitPrice,
              previousQuantity: item.previousQuantity,
              purchasedQuantity: item.purchasedQuantity,
              currentQuantity,
              quantity,
              inventoryAmount,
              isModified:
                (currentQuantity !== null &&
                  currentQuantity !== item.previousQuantity) ||
                (quantity !== null && quantity !== item.previousQuantity),
              carryoverSource: item.carryoverSource,
              carryoverLedgerId: item.carryoverLedgerId,
              createdById: actor.user.id,
              updatedById: actor.user.id,
            };
          }),
        });
      }

      const after = await getInventoryStepDataInTx(
        tx,
        parsed.data.storeId,
        actor.user.id,
      );

      await writeAuditLog(tx, {
        action: "ledger.inventory.saved",
        targetType: "DailyLedger",
        targetId: before.id,
        actorId: actor.user.id,
        before,
        after,
      });

      return after;
    });

    revalidateInventoryPaths();

    return actionOk(result);
  } catch {
    return mapStoreActionError();
  }
}
