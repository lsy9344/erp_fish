"use server";

import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireStoreAccess } from "~/server/authz";
import {
  calculateInventoryAdjustment,
  calculateInventoryAmount,
  calculateSystemInventoryQuantity,
} from "~/server/calculations/inventory";
import { db } from "~/server/db";
import {
  ledgerInventoryAdjustmentSchema,
  ledgerInventorySchema,
  toFieldErrors,
  type LedgerInventoryAdjustmentInput,
  type LedgerInventoryInput,
} from "./schemas";
import { reconcileLedgerInventoryAdjustments } from "./adjustment-reconciliation";
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

function parseLedgerInventoryAdjustmentInput(
  input: unknown,
): ActionResult<LedgerInventoryAdjustmentInput> {
  const parsed = ledgerInventoryAdjustmentSchema.safeParse(input);

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

      if (before.status !== "IN_PROGRESS" && before.status !== "IN_REVIEW") {
        throw new Error("Ledger is not editable");
      }

      const editableLedger = await tx.dailyLedger.updateMany({
        where: {
          id: before.id,
          status: { in: ["IN_PROGRESS", "IN_REVIEW"] },
        },
        data: { updatedById: actor.user.id },
      });

      if (editableLedger.count !== 1) {
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

      await reconcileLedgerInventoryAdjustments(tx, before.id, actor.user.id);

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

export async function saveLedgerInventoryAdjustment(
  input: unknown,
): Promise<ActionResult<InventoryStepData>> {
  const parsed = parseLedgerInventoryAdjustmentInput(input);

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

      if (before.status === "HEADQUARTERS_CLOSED") {
        return actionError<InventoryStepData>(
          "LEDGER_CLOSED",
          "본사 마감된 장부는 원본 재고 조정으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.",
        );
      }

      if (before.status !== "IN_PROGRESS" && before.status !== "IN_REVIEW") {
        return actionError<InventoryStepData>(
          "LEDGER_NOT_EDITABLE",
          "저장에 실패했습니다. 다시 시도해 주세요.",
        );
      }

      const editableLedger = await tx.dailyLedger.updateMany({
        where: {
          id: before.id,
          status: { in: ["IN_PROGRESS", "IN_REVIEW"] },
        },
        data: { updatedById: actor.user.id },
      });

      if (editableLedger.count !== 1) {
        return actionError<InventoryStepData>(
          "LEDGER_NOT_EDITABLE",
          "저장에 실패했습니다. 다시 시도해 주세요.",
        );
      }

      const line = before.items.find(
        (item) => item.productId === parsed.data.productId,
      );

      if (!line) {
        return actionError<InventoryStepData>(
          "VALIDATION_ERROR",
          "품목을 확인해 주세요.",
          { productId: ["품목을 확인해 주세요."] },
        );
      }

      const beforeQuantity = calculateSystemInventoryQuantity({
        previousQuantity: line.previousQuantity,
        purchasedQuantity: line.purchasedQuantity,
        lossQuantity: line.lossQuantity,
      });
      const beforeAmount =
        beforeQuantity === null
          ? null
          : calculateInventoryAmount(beforeQuantity, line.unitPrice);

      if (beforeQuantity === null || beforeAmount === null) {
        return actionError<InventoryStepData>(
          "VALIDATION_ERROR",
          "재고 금액을 계산할 수 없습니다.",
          { actualQuantity: ["실제 재고 수량은 0 이상의 정수여야 합니다."] },
        );
      }

      const adjustment = calculateInventoryAdjustment({
        beforeQuantity,
        beforeAmount,
        afterQuantity: parsed.data.actualQuantity,
        unitPrice: line.unitPrice,
      });

      if (!adjustment) {
        return actionError<InventoryStepData>(
          "VALIDATION_ERROR",
          "재고 금액을 계산할 수 없습니다.",
          { actualQuantity: ["실제 재고 수량은 0 이상의 정수여야 합니다."] },
        );
      }

      if (adjustment.differenceQuantity === 0) {
        return actionError<InventoryStepData>(
          "VALIDATION_ERROR",
          "실제 재고 차이가 있을 때만 조정을 저장할 수 있습니다.",
          {
            actualQuantity: [
              "실제 재고 차이가 있을 때만 조정을 저장할 수 있습니다.",
            ],
          },
        );
      }

      const inventoryItem = await tx.ledgerInventoryItem.upsert({
        where: {
          dailyLedgerId_productId: {
            dailyLedgerId: before.id,
            productId: line.productId,
          },
        },
        create: {
          dailyLedgerId: before.id,
          productId: line.productId,
          productName: line.productName,
          productCategory: line.productCategory,
          productSpec: line.productSpec,
          unitPrice: line.unitPrice,
          previousQuantity: line.previousQuantity,
          purchasedQuantity: line.purchasedQuantity,
          currentQuantity: adjustment.afterQuantity,
          quantity: line.quantity,
          inventoryAmount: line.inventoryAmount,
          isModified: true,
          carryoverSource: line.carryoverSource,
          carryoverLedgerId: line.carryoverLedgerId,
          createdById: actor.user.id,
          updatedById: actor.user.id,
        },
        update: {
          productName: line.productName,
          productCategory: line.productCategory,
          productSpec: line.productSpec,
          unitPrice: line.unitPrice,
          previousQuantity: line.previousQuantity,
          purchasedQuantity: line.purchasedQuantity,
          currentQuantity: adjustment.afterQuantity,
          quantity: line.quantity,
          inventoryAmount: line.inventoryAmount,
          isModified: true,
          carryoverSource: line.carryoverSource,
          carryoverLedgerId: line.carryoverLedgerId,
          updatedById: actor.user.id,
        },
        select: {
          id: true,
        },
      });

      await tx.ledgerInventoryAdjustment.upsert({
        where: {
          dailyLedgerId_productId: {
            dailyLedgerId: before.id,
            productId: line.productId,
          },
        },
        create: {
          dailyLedgerId: before.id,
          productId: line.productId,
          ledgerInventoryItemId: inventoryItem.id,
          productName: line.productName,
          productCategory: line.productCategory,
          productSpec: line.productSpec,
          unitPrice: line.unitPrice,
          beforeQuantity: adjustment.beforeQuantity,
          beforeAmount: adjustment.beforeAmount,
          afterQuantity: adjustment.afterQuantity,
          afterAmount: adjustment.afterAmount,
          differenceQuantity: adjustment.differenceQuantity,
          differenceAmount: adjustment.differenceAmount,
          reason: parsed.data.reason,
          createdById: actor.user.id,
          updatedById: actor.user.id,
        },
        update: {
          ledgerInventoryItemId: inventoryItem.id,
          productName: line.productName,
          productCategory: line.productCategory,
          productSpec: line.productSpec,
          unitPrice: line.unitPrice,
          beforeQuantity: adjustment.beforeQuantity,
          beforeAmount: adjustment.beforeAmount,
          afterQuantity: adjustment.afterQuantity,
          afterAmount: adjustment.afterAmount,
          differenceQuantity: adjustment.differenceQuantity,
          differenceAmount: adjustment.differenceAmount,
          reason: parsed.data.reason,
          updatedById: actor.user.id,
        },
      });

      const after = await getInventoryStepDataInTx(
        tx,
        parsed.data.storeId,
        actor.user.id,
      );

      await writeAuditLog(tx, {
        action: "ledger.inventory_adjustment.saved",
        targetType: "DailyLedger",
        targetId: before.id,
        actorId: actor.user.id,
        before: line,
        after: after.items.find((item) => item.productId === line.productId),
        reason: parsed.data.reason,
      });

      return actionOk(after);
    });

    if (!result.ok) {
      return result;
    }

    revalidateInventoryPaths();

    return result;
  } catch {
    return mapStoreActionError();
  }
}
