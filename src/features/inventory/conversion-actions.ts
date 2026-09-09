"use server";

import { z } from "zod";

import type { Prisma } from "../../../generated/prisma";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { decimalToNumber } from "~/lib/decimal";
import { roundToTwoDecimals } from "~/lib/validation";
import {
  assertStoreManagerClosingDateIsToday,
  getKstLedgerDateParam,
} from "~/features/ledger/date";
import { editableLedgerStatuses } from "~/features/ledger/status-policy";
import {
  ledgerInventoryConversionSchema,
  ledgerInventoryStoreAccessSchema,
  toFieldErrors,
  type LedgerInventoryConversionInput,
} from "~/features/inventory/schemas";
import {
  getInventoryStepDataByLedgerIdInTx,
  toStoreManagerInventoryStepDataInTx,
} from "~/features/inventory/queries";
import { applyInventoryFormDisplayPolicy } from "~/features/inventory/inventory-zero-stock-display";
import {
  calculateInventoryTransferCostAmount,
  refreshLedgerInventoryFifoLots,
} from "~/features/inventory/fifo-lots";
import { reconcileLedgerInventoryAdjustments } from "~/features/inventory/adjustment-reconciliation";
import { toFrozenConversionProductName } from "~/features/inventory/conversion-product";
import type {
  InventoryStepData,
  StoreManagerInventoryStepData,
} from "~/features/inventory/types";
import { writeAuditLog } from "~/server/audit";
import {
  requireHeadquartersStoreScope,
  requireLedgerHqEditContext,
  requireStoreManagerLedgerEditAccess,
} from "~/server/authz";
import { db } from "~/server/db";
import {
  revalidateDashboardAndReports,
  revalidateLedgerDetailPath,
  revalidateMasterDataPaths,
  revalidateStoreEntryPaths,
} from "~/server/revalidation";

const hqReasonSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "본사 수정 사유를 입력해 주세요.")
      .max(500, "본사 수정 사유는 500자 이하여야 합니다."),
  );

type ConversionActor = {
  userId: string;
  auditAction: string;
  reason: string | null;
};

function parseConversionInput(input: unknown) {
  const parsed = ledgerInventoryConversionSchema.safeParse(input);

  return parsed.success
    ? actionOk(parsed.data)
    : actionError<LedgerInventoryConversionInput>(
        "VALIDATION_ERROR",
        "전환할 품목과 수량을 확인해 주세요.",
        toFieldErrors(parsed.error),
      );
}

function conversionError<T>(message: string, field?: string): ActionResult<T> {
  return actionError(
    "VALIDATION_ERROR",
    message,
    field ? { [field]: [message] } : undefined,
  );
}

function revalidateConversionPaths(ledgerId: string) {
  revalidateStoreEntryPaths(["root", "inventory"]);
  revalidateLedgerDetailPath(ledgerId);
  revalidateDashboardAndReports();
  revalidateMasterDataPaths("products");
}

async function convertInventoryInTx(
  tx: Prisma.TransactionClient,
  input: LedgerInventoryConversionInput,
  actor: ConversionActor,
): Promise<ActionResult<InventoryStepData>> {
  const ledger = await tx.dailyLedger.findUnique({
    where: { id: input.ledgerId },
    select: {
      id: true,
      storeId: true,
      closingDate: true,
      status: true,
      version: true,
    },
  });

  if (ledger?.storeId !== input.storeId) {
    return actionError("LEDGER_NOT_FOUND", "장부를 찾을 수 없습니다.");
  }

  if (getKstLedgerDateParam(ledger.closingDate) !== input.closingDate) {
    return conversionError("장부 영업일을 확인해 주세요.", "closingDate");
  }

  if (
    ledger.version !== input.version ||
    !editableLedgerStatuses.includes(
      ledger.status as (typeof editableLedgerStatuses)[number],
    )
  ) {
    return actionError(
      "LEDGER_CONFLICT",
      "다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요.",
    );
  }

  const [sourceItem, sourceLots] = await Promise.all([
    tx.ledgerInventoryItem.findUnique({
      where: {
        dailyLedgerId_productId: {
          dailyLedgerId: ledger.id,
          productId: input.sourceProductId,
        },
      },
    }),
    tx.ledgerInventoryFifoLot.findMany({
      where: {
        dailyLedgerId: ledger.id,
        productId: input.sourceProductId,
        remainingQuantity: { gt: 0 },
      },
      select: {
        lotOriginKey: true,
        sourceBusinessDate: true,
        unitPrice: true,
        remainingQuantity: true,
        remainingAmount: true,
        sortOrder: true,
      },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  if (sourceItem?.productCategory !== "생물") {
    return conversionError(
      "생물 재고 품목을 확인해 주세요.",
      "sourceProductId",
    );
  }

  const sourceBefore = decimalToNumber(
    sourceItem.currentQuantity ?? sourceItem.quantity ?? 0,
  );
  const sourceAfter = roundToTwoDecimals(sourceBefore - input.quantity);

  if (sourceAfter < 0) {
    return conversionError(
      `전환 수량은 현재 재고 ${sourceBefore}개를 넘을 수 없습니다.`,
      "quantity",
    );
  }

  let remainingToAllocate = input.quantity;
  const allocations: Array<{
    sourceLotOriginKey: string;
    sourceBusinessDate: Date | null;
    unitCost: number;
    quantity: number;
    costAmount: number;
    sortOrder: number;
  }> = [];

  for (const lot of sourceLots) {
    if (remainingToAllocate <= 0) break;

    const quantity = roundToTwoDecimals(
      Math.min(decimalToNumber(lot.remainingQuantity), remainingToAllocate),
    );
    const costAmount = calculateInventoryTransferCostAmount({
      quantity,
      availableQuantity: decimalToNumber(lot.remainingQuantity),
      availableAmount: lot.remainingAmount,
    });

    if (quantity <= 0 || costAmount === null) continue;

    allocations.push({
      sourceLotOriginKey: lot.lotOriginKey,
      sourceBusinessDate: lot.sourceBusinessDate,
      unitCost: lot.unitPrice,
      quantity,
      costAmount,
      sortOrder: allocations.length,
    });
    remainingToAllocate = roundToTwoDecimals(remainingToAllocate - quantity);
  }

  if (remainingToAllocate > 0 || allocations.length === 0) {
    return conversionError(
      "저장된 재고 흐름이 부족합니다. 재고를 먼저 저장한 뒤 다시 시도해 주세요.",
      "quantity",
    );
  }

  const totalCost = allocations.reduce(
    (sum, allocation) => sum + allocation.costAmount,
    0,
  );
  const updated = await tx.dailyLedger.updateMany({
    where: {
      id: ledger.id,
      version: input.version,
      status: { in: [...editableLedgerStatuses] },
    },
    data: { updatedById: actor.userId, version: { increment: 1 } },
  });

  if (updated.count !== 1) {
    return actionError(
      "LEDGER_CONFLICT",
      "다른 변경이 먼저 저장되었습니다. 새로고침 후 다시 시도해 주세요.",
    );
  }

  const targetIdentity = {
    name: toFrozenConversionProductName(sourceItem.productName),
    category: "냉동",
    spec: sourceItem.productSpec,
  };
  const targetWhere = { name_category_spec: targetIdentity };
  const createdTargetProduct = await tx.product.createMany({
    data: {
      ...targetIdentity,
      defaultUnitPrice: null,
      isActive: true,
      updatedById: actor.userId,
    },
    skipDuplicates: true,
  });
  const targetProduct = await tx.product.findUniqueOrThrow({
    where: targetWhere,
    select: {
      id: true,
      name: true,
      category: true,
      spec: true,
      defaultUnitPrice: true,
      isActive: true,
    },
  });

  if (createdTargetProduct.count === 1) {
    await writeAuditLog(tx, {
      action: "product.created",
      targetType: "Product",
      targetId: targetProduct.id,
      actorId: actor.userId,
      before: null,
      after: {
        name: targetProduct.name,
        category: targetProduct.category,
        spec: targetProduct.spec,
        defaultUnitPrice: targetProduct.defaultUnitPrice,
        isActive: targetProduct.isActive,
      },
      reason: "생물 재고 냉동 전환 자동 품목 생성",
    });
  }

  const targetItem = await tx.ledgerInventoryItem.findUnique({
    where: {
      dailyLedgerId_productId: {
        dailyLedgerId: ledger.id,
        productId: targetProduct.id,
      },
    },
  });
  const targetBefore = targetItem
    ? decimalToNumber(targetItem.currentQuantity ?? targetItem.quantity ?? 0)
    : 0;
  const targetAfter = roundToTwoDecimals(targetBefore + input.quantity);
  const targetUnitPrice = Math.round(totalCost / input.quantity);

  await tx.ledgerInventoryItem.update({
    where: { id: sourceItem.id },
    data: {
      currentQuantity: sourceAfter,
      quantity: sourceAfter,
      isModified: true,
      updatedById: actor.userId,
    },
  });

  if (targetItem) {
    await tx.ledgerInventoryItem.update({
      where: { id: targetItem.id },
      data: {
        currentQuantity: targetAfter,
        quantity: targetAfter,
        isModified: true,
        updatedById: actor.userId,
      },
    });
  } else {
    await tx.ledgerInventoryItem.create({
      data: {
        dailyLedgerId: ledger.id,
        productId: targetProduct.id,
        productName: targetProduct.name,
        productCategory: targetProduct.category,
        productSpec: targetProduct.spec,
        unitPrice: targetUnitPrice,
        previousQuantity: 0,
        currentQuantity: targetAfter,
        quantity: targetAfter,
        inventoryAmount: totalCost,
        isModified: true,
        carryoverSource: "CONVERSION",
        carryoverStatus: "CARRYOVER_EMPTY",
        createdById: actor.userId,
        updatedById: actor.userId,
      },
    });
  }

  const conversion = await tx.ledgerInventoryConversion.create({
    data: {
      dailyLedgerId: ledger.id,
      sourceProductId: sourceItem.productId,
      targetProductId: targetProduct.id,
      quantity: input.quantity,
      sourceQuantityBefore: sourceBefore,
      sourceQuantityAfter: sourceAfter,
      targetQuantityBefore: targetBefore,
      targetQuantityAfter: targetAfter,
      createdById: actor.userId,
      allocations: { create: allocations },
    },
  });

  await refreshLedgerInventoryFifoLots(tx, ledger.id);
  await reconcileLedgerInventoryAdjustments(tx, ledger.id, actor.userId);

  const after = await getInventoryStepDataByLedgerIdInTx(tx, ledger.id);

  if (!after) {
    return actionError("LEDGER_NOT_FOUND", "장부를 찾을 수 없습니다.");
  }

  await writeAuditLog(tx, {
    action: actor.auditAction,
    targetType: "LedgerInventoryConversion",
    targetId: conversion.id,
    actorId: actor.userId,
    before: {
      sourceProductId: sourceItem.productId,
      sourceQuantity: sourceBefore,
      targetProductId: targetProduct.id,
      targetQuantity: targetBefore,
    },
    after: {
      quantity: input.quantity,
      sourceQuantity: sourceAfter,
      targetQuantity: targetAfter,
      transferredCostAmount: totalCost,
    },
    reason: actor.reason,
  });

  return actionOk(after);
}

export async function convertLedgerInventoryToFrozen(
  input: unknown,
): Promise<ActionResult<StoreManagerInventoryStepData>> {
  const access = ledgerInventoryStoreAccessSchema.safeParse(input);

  if (!access.success) {
    return actionError(
      "VALIDATION_ERROR",
      "지점을 확인해 주세요.",
      toFieldErrors(access.error),
    );
  }

  const actor = await requireStoreManagerLedgerEditAccess(access.data.storeId);
  const parsed = parseConversionInput(input);

  if (!parsed.ok) return parsed;

  const dateGuard = assertStoreManagerClosingDateIsToday(
    parsed.data.closingDate,
  );

  if (!dateGuard.ok) {
    return actionError(dateGuard.code, dateGuard.message);
  }

  try {
    const result = await db.$transaction(
      (tx) =>
        convertInventoryInTx(tx, parsed.data, {
          userId: actor.user.id,
          auditAction: "ledger.inventory.converted",
          reason: null,
        }),
      { timeout: 60_000 },
    );

    if (!result.ok) return result;

    const data = await db.$transaction((tx) =>
      toStoreManagerInventoryStepDataInTx(
        tx,
        applyInventoryFormDisplayPolicy(result.data),
      ),
    );
    revalidateConversionPaths(parsed.data.ledgerId);
    return actionOk(data);
  } catch {
    return actionError(
      "LEDGER_SAVE_FAILED",
      "냉동 전환에 실패했습니다. 다시 시도해 주세요.",
    );
  }
}

export async function convertHqLedgerInventoryToFrozen(
  input: unknown,
): Promise<ActionResult<InventoryStepData>> {
  const parsed = parseConversionInput(input);
  const reason = hqReasonSchema.safeParse(
    typeof input === "object" && input !== null && "reason" in input
      ? input.reason
      : undefined,
  );

  if (!parsed.ok) return parsed;
  if (!reason.success) {
    return actionError("VALIDATION_ERROR", "본사 수정 사유를 입력해 주세요.", {
      reason: reason.error.issues.map((issue) => issue.message),
    });
  }

  const actor = await requireLedgerHqEditContext();
  await requireHeadquartersStoreScope(parsed.data.storeId);

  try {
    const result = await db.$transaction(
      (tx) =>
        convertInventoryInTx(tx, parsed.data, {
          userId: actor.user.id,
          auditAction: "ledger.hq.inventory.converted",
          reason: reason.data,
        }),
      { timeout: 60_000 },
    );

    if (result.ok) revalidateConversionPaths(parsed.data.ledgerId);
    return result;
  } catch {
    return actionError(
      "LEDGER_SAVE_FAILED",
      "냉동 전환에 실패했습니다. 다시 시도해 주세요.",
    );
  }
}
