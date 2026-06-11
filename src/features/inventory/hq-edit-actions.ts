"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "../../../generated/prisma";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireLedgerHqEditAccess, requireHeadquartersStoreScope } from "~/server/authz";
import {
  calculateInventoryAdjustment,
  calculateInventoryAmount,
  calculateSystemInventoryQuantity,
} from "~/server/calculations/inventory";
import { db } from "~/server/db";
import { reconcileLedgerInventoryAdjustments } from "./adjustment-reconciliation";
import { getInventoryStepDataByLedgerIdInTx } from "./queries";
import {
  ledgerInventoryAdjustmentSchema,
  ledgerInventorySchema,
  toFieldErrors,
  type LedgerInventoryAdjustmentInput,
  type LedgerInventoryInput,
} from "./schemas";
import { type InventoryStepData } from "./types";

const ledgerIdInputSchema = z.object({
  ledgerId: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "장부를 확인해 주세요.")),
  ledgerUpdatedAt: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "장부 상태를 확인해 주세요.")),
});

function parseHqInventoryInput<T>(
  input: unknown,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): ActionResult<T & { ledgerId: string; ledgerUpdatedAt: string }> {
  const parsed = schema.safeParse(input);
  const parsedLedgerId = ledgerIdInputSchema.safeParse(input);

  if (!parsed.success || !parsedLedgerId.success) {
    return actionError("VALIDATION_ERROR", "입력값을 확인해 주세요.", {
      ...(!parsed.success ? toFieldErrors(parsed.error) : {}),
      ...(!parsedLedgerId.success ? toFieldErrors(parsedLedgerId.error) : {}),
    });
  }

  return actionOk({
    ...parsed.data,
    ledgerId: parsedLedgerId.data.ledgerId,
    ledgerUpdatedAt: parsedLedgerId.data.ledgerUpdatedAt,
  });
}

function revalidateHqInventoryPaths(ledgerId: string) {
  revalidatePath(`/app/ledgers/${ledgerId}`);
  revalidatePath("/app/dashboard");
  revalidatePath("/app/store-entry");
  revalidatePath("/app/store-entry/inventory");
  revalidatePath("/app/reports/daily");
  revalidatePath("/app/reports/monthly");
}

function mapHqActionError(): ActionResult<never> {
  return actionError(
    "LEDGER_SAVE_FAILED",
    "저장에 실패했습니다. 다시 시도해 주세요.",
  );
}

function notFoundError(): ActionResult<never> {
  return actionError("LEDGER_NOT_FOUND", "장부를 찾을 수 없습니다.");
}

function conflictError(): ActionResult<never> {
  return actionError(
    "LEDGER_CONFLICT",
    "장부가 다른 화면에서 변경됐습니다. 새로고침 후 다시 시도해 주세요.",
  );
}

function notEditableError(
  status: InventoryStepData["status"],
): ActionResult<never> {
  if (status === "HEADQUARTERS_CLOSED") {
    return actionError(
      "LEDGER_CLOSED",
      "본사 마감된 장부는 원본 재고 조정으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.",
    );
  }

  if (status === "HOLIDAY") {
    return actionError(
      "LEDGER_NOT_EDITABLE",
      "휴무 장부는 원본 재고 조정으로 수정할 수 없습니다.",
    );
  }

  return actionError("LEDGER_NOT_EDITABLE", "수정할 수 없는 장부 상태입니다.");
}

function ensureTargetInventory(
  data: InventoryStepData | null,
  storeId: string,
): ActionResult<InventoryStepData> {
  if (data?.storeId !== storeId) {
    return notFoundError();
  }

  if (data.status !== "IN_PROGRESS" && data.status !== "IN_REVIEW") {
    return notEditableError(data.status);
  }

  return actionOk(data);
}

async function markEditableLedgerInTx(
  tx: Prisma.TransactionClient,
  ledgerId: string,
  expectedUpdatedAt: Date,
  actorId: string,
) {
  const updated = await tx.dailyLedger.updateMany({
    where: {
      id: ledgerId,
      status: { in: ["IN_PROGRESS", "IN_REVIEW"] },
      updatedAt: expectedUpdatedAt,
    },
    data: { updatedById: actorId },
  });

  return updated.count === 1;
}

function parseExpectedUpdatedAt(value: string): Date | null {
  const expectedUpdatedAt = new Date(value);

  return Number.isNaN(expectedUpdatedAt.getTime()) ? null : expectedUpdatedAt;
}

function shouldPersistInventoryLine(
  item: InventoryStepData["items"][number],
  currentQuantity: number | null,
  quantity: number | null,
) {
  return (
    item.id !== item.productId ||
    currentQuantity !== item.currentQuantity ||
    quantity !== item.quantity
  );
}

export async function saveHqLedgerInventoryItems(
  input: unknown,
): Promise<ActionResult<InventoryStepData>> {
  const parsed = parseHqInventoryInput<LedgerInventoryInput>(
    input,
    ledgerInventorySchema,
  );

  if (!parsed.ok) {
    return parsed;
  }

  const actor = { user: await requireLedgerHqEditAccess() };
  const { ledgerId } = parsed.data;
  await requireHeadquartersStoreScope(parsed.data.storeId);
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsed.data.ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return conflictError();
  }

  try {
    const result = await db.$transaction<ActionResult<InventoryStepData>>(
      async (tx) => {
        const beforeResult = ensureTargetInventory(
          await getInventoryStepDataByLedgerIdInTx(tx, ledgerId),
          parsed.data.storeId,
        );

        if (!beforeResult.ok) {
          return beforeResult;
        }

        const before = beforeResult.data;
        const updated = await markEditableLedgerInTx(
          tx,
          ledgerId,
          expectedUpdatedAt,
          actor.user.id,
        );

        if (!updated) {
          return conflictError();
        }

        const inputByProductId = new Map(
          parsed.data.items.map((item) => [item.productId, item]),
        );

        await tx.ledgerInventoryItem.deleteMany({
          where: { dailyLedgerId: before.id },
        });

        const rowsToPersist = before.items.flatMap((item) => {
          const currentQuantity =
            inputByProductId.get(item.productId)?.currentQuantity ??
            item.currentQuantity;
          const quantity =
            inputByProductId.get(item.productId)?.quantity ?? item.quantity;

          if (!shouldPersistInventoryLine(item, currentQuantity, quantity)) {
            return [];
          }

          const inventoryAmount = calculateInventoryAmount(
            quantity,
            item.unitPrice,
          );

          return [
            {
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
            },
          ];
        });

        if (rowsToPersist.length > 0) {
          await tx.ledgerInventoryItem.createMany({
            data: rowsToPersist,
          });
        }

        await reconcileLedgerInventoryAdjustments(tx, before.id, actor.user.id);

        const after = await getInventoryStepDataByLedgerIdInTx(tx, ledgerId);

        if (!after) {
          return notFoundError();
        }

        await writeAuditLog(tx, {
          action: "ledger.hq.inventory.saved",
          targetType: "DailyLedger",
          targetId: before.id,
          actorId: actor.user.id,
          before,
          after,
        });

        return actionOk(after);
      },
    );

    if (result.ok) {
      revalidateHqInventoryPaths(ledgerId);
    }

    return result;
  } catch {
    return mapHqActionError();
  }
}

export async function saveHqLedgerInventoryAdjustment(
  input: unknown,
): Promise<ActionResult<InventoryStepData>> {
  const parsed = parseHqInventoryInput<LedgerInventoryAdjustmentInput>(
    input,
    ledgerInventoryAdjustmentSchema,
  );

  if (!parsed.ok) {
    return parsed;
  }

  const actor = { user: await requireLedgerHqEditAccess() };
  const { ledgerId } = parsed.data;
  await requireHeadquartersStoreScope(parsed.data.storeId);
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsed.data.ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return conflictError();
  }

  try {
    const result = await db.$transaction<ActionResult<InventoryStepData>>(
      async (tx) => {
        const beforeResult = ensureTargetInventory(
          await getInventoryStepDataByLedgerIdInTx(tx, ledgerId),
          parsed.data.storeId,
        );

        if (!beforeResult.ok) {
          return beforeResult;
        }

        const before = beforeResult.data;
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
            "재고 기준을 계산할 수 없습니다. 기준 확인 필요 상태입니다.",
            {
              actualQuantity: [
                "시스템 기준 수량을 계산할 수 없어 조정을 저장할 수 없습니다.",
              ],
            },
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
            "재고 기준을 계산할 수 없습니다. 기준 확인 필요 상태입니다.",
            {
              actualQuantity: [
                "시스템 기준 수량을 계산할 수 없어 조정을 저장할 수 없습니다.",
              ],
            },
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

        const updated = await markEditableLedgerInTx(
          tx,
          ledgerId,
          expectedUpdatedAt,
          actor.user.id,
        );

        if (!updated) {
          return conflictError();
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

        const after = await getInventoryStepDataByLedgerIdInTx(tx, ledgerId);

        if (!after) {
          return notFoundError();
        }

        await writeAuditLog(tx, {
          action: "ledger.hq.inventory_adjustment.saved",
          targetType: "DailyLedger",
          targetId: before.id,
          actorId: actor.user.id,
          before: line,
          after: after.items.find((item) => item.productId === line.productId),
          reason: parsed.data.reason,
        });

        return actionOk(after);
      },
    );

    if (result.ok) {
      revalidateHqInventoryPaths(ledgerId);
    }

    return result;
  } catch {
    return mapHqActionError();
  }
}
