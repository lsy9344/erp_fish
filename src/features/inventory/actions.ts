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
import {
  getInventoryStepDataInTx,
  toStoreManagerInventoryStepData,
} from "./queries";
import { type StoreManagerInventoryStepData } from "./types";

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

function mapLedgerConflictError(): ActionResult<never> {
  return actionError(
    "LEDGER_CONFLICT",
    "장부가 다른 곳에서 변경됐습니다. 새로고침 후 다시 시도해 주세요.",
  );
}

function originalAdjustmentBlockedError(
  status: "HEADQUARTERS_CLOSED" | "HOLIDAY",
): ActionResult<never> {
  const message =
    status === "HOLIDAY"
      ? "휴무 장부는 원본 재고 조정으로 수정할 수 없습니다. 정정 기록을 사용해 주세요."
      : "본사 마감된 장부는 원본 재고 조정으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.";

  return actionError("LEDGER_CLOSED", message);
}

function inventoryBasisUnavailableError<T>(): ActionResult<T> {
  return actionError(
    "VALIDATION_ERROR",
    "재고 기준을 계산할 수 없습니다. 기준 확인 필요 상태입니다.",
    {
      actualQuantity: [
        "시스템 기준 수량을 계산할 수 없어 조정을 저장할 수 없습니다.",
      ],
    },
  );
}

function revalidateInventoryPaths() {
  revalidatePath("/app/store-entry/inventory");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/reports/daily");
  revalidatePath("/app/reports/monthly");
}

export async function saveLedgerInventoryItems(
  input: unknown,
): Promise<ActionResult<StoreManagerInventoryStepData>> {
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
        parsed.data.closingDate,
        actor.user.id,
      );

      if (
        before.id !== parsed.data.ledgerId ||
        before.version !== parsed.data.version
      ) {
        throw new Error("LEDGER_CONFLICT");
      }

      if (before.status !== "IN_PROGRESS" && before.status !== "IN_REVIEW") {
        throw new Error("Ledger is not editable");
      }

      const editableLedger = await tx.dailyLedger.updateMany({
        where: {
          id: before.id,
          version: parsed.data.version,
          status: { in: ["IN_PROGRESS", "IN_REVIEW"] },
        },
        data: { updatedById: actor.user.id, version: { increment: 1 } },
      });

      if (editableLedger.count !== 1) {
        throw new Error("LEDGER_CONFLICT");
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
              carryoverStatus: item.carryoverStatus,
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
        parsed.data.closingDate,
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

    return actionOk(toStoreManagerInventoryStepData(result));
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "LEDGER_CONFLICT") {
      return mapLedgerConflictError();
    }

    return mapStoreActionError();
  }
}

export async function saveLedgerInventoryAdjustment(
  input: unknown,
): Promise<ActionResult<StoreManagerInventoryStepData>> {
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
        parsed.data.closingDate,
        actor.user.id,
      );

      if (
        before.id !== parsed.data.ledgerId ||
        before.version !== parsed.data.version
      ) {
        return mapLedgerConflictError();
      }

      if (
        before.status === "HEADQUARTERS_CLOSED" ||
        before.status === "HOLIDAY"
      ) {
        return originalAdjustmentBlockedError(before.status);
      }

      if (before.status !== "IN_PROGRESS" && before.status !== "IN_REVIEW") {
        return actionError<StoreManagerInventoryStepData>(
          "LEDGER_NOT_EDITABLE",
          "저장에 실패했습니다. 다시 시도해 주세요.",
        );
      }

      const line = before.items.find(
        (item) => item.productId === parsed.data.productId,
      );

      if (!line) {
        return actionError<StoreManagerInventoryStepData>(
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
        return inventoryBasisUnavailableError<StoreManagerInventoryStepData>();
      }

      const adjustment = calculateInventoryAdjustment({
        beforeQuantity,
        beforeAmount,
        afterQuantity: parsed.data.actualQuantity,
        unitPrice: line.unitPrice,
      });

      if (!adjustment) {
        return inventoryBasisUnavailableError<StoreManagerInventoryStepData>();
      }

      if (adjustment.differenceQuantity === 0) {
        return actionError<StoreManagerInventoryStepData>(
          "VALIDATION_ERROR",
          "실제 재고 차이가 있을 때만 조정을 저장할 수 있습니다.",
          {
            actualQuantity: [
              "실제 재고 차이가 있을 때만 조정을 저장할 수 있습니다.",
            ],
          },
        );
      }

      const editableLedger = await tx.dailyLedger.updateMany({
        where: {
          id: before.id,
          version: parsed.data.version,
          status: { in: ["IN_PROGRESS", "IN_REVIEW"] },
        },
        data: { updatedById: actor.user.id, version: { increment: 1 } },
      });

      if (editableLedger.count !== 1) {
        return mapLedgerConflictError();
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
          inventoryAmount: adjustment.afterAmount,
          isModified: true,
          carryoverSource: line.carryoverSource,
          carryoverStatus: line.carryoverStatus,
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
          inventoryAmount: adjustment.afterAmount,
          isModified: true,
          carryoverSource: line.carryoverSource,
          carryoverStatus: line.carryoverStatus,
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
          amountStatus: "POLICY_UNCONFIRMED",
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
          amountStatus: "POLICY_UNCONFIRMED",
          reason: parsed.data.reason,
          updatedById: actor.user.id,
        },
      });

      const after = await getInventoryStepDataInTx(
        tx,
        parsed.data.storeId,
        parsed.data.closingDate,
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

      return actionOk(toStoreManagerInventoryStepData(after));
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
