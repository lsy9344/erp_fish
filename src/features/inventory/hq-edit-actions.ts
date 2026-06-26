"use server";

import { z } from "zod";

import type { Prisma } from "../../../generated/prisma";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import {
  requireLedgerHqEditAccess,
  requireHeadquartersStoreScope,
} from "~/server/authz";
import {
  calculateInventoryAdjustment,
  calculateInventoryAmount,
  calculateSystemInventoryQuantity,
} from "~/server/calculations/inventory";
import { db } from "~/server/db";
import {
  revalidateDashboardAndReports,
  revalidateLedgerDetailPath,
  revalidateStoreEntryPaths,
} from "~/server/revalidation";
import {
  getLedgerConflictMetaInTx,
  ledgerConflictErrorFromMeta,
} from "~/features/ledger/conflicts";
import {
  editableLedgerStatuses,
  getLedgerEditBlockReason,
  isLedgerEditable,
} from "~/features/ledger/status-policy";
import {
  buildRequiredEntryGuardItems,
  getInventorySaveAdjustmentErrors,
  getRequiredCurrentQuantityErrors,
  missingAdjustmentReasonMessage,
  missingRequiredCurrentQuantityMessage,
} from "./adjustment-save-guard";
import { reconcileLedgerInventoryAdjustments } from "./adjustment-reconciliation";
import { refreshLedgerInventoryFifoLots } from "./fifo-lots";
import { buildManualInventoryRows } from "./manual-inventory-rows";
import { shouldPersistInventoryLine } from "./inventory-persist-policy";
import {
  persistLedgerInventoryCarryoverDetail,
  persistLedgerInventoryCarryoverDetails,
} from "./carryover-detail-persistence";
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

const hqEditReasonSchema = z.object({
  reason: z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, "본사 수정 사유를 입력해 주세요.")
        .max(500, "본사 수정 사유는 500자 이하여야 합니다."),
    ),
});

function parseHqInventoryInput<T>(
  input: unknown,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): ActionResult<
  T & { ledgerId: string; ledgerUpdatedAt: string; reason: string }
> {
  const parsed = schema.safeParse(input);
  const parsedLedgerId = ledgerIdInputSchema.safeParse(input);
  const parsedReason = hqEditReasonSchema.safeParse(input);

  if (!parsed.success || !parsedLedgerId.success || !parsedReason.success) {
    return actionError("VALIDATION_ERROR", "입력값을 확인해 주세요.", {
      ...(!parsed.success ? toFieldErrors(parsed.error) : {}),
      ...(!parsedLedgerId.success ? toFieldErrors(parsedLedgerId.error) : {}),
      ...(!parsedReason.success ? toFieldErrors(parsedReason.error) : {}),
    });
  }

  return actionOk({
    ...parsed.data,
    ledgerId: parsedLedgerId.data.ledgerId,
    ledgerUpdatedAt: parsedLedgerId.data.ledgerUpdatedAt,
    reason: parsedReason.data.reason,
  });
}

function revalidateHqInventoryPaths(ledgerId: string) {
  revalidateLedgerDetailPath(ledgerId);
  revalidateStoreEntryPaths(["root", "inventory"]);
  revalidateDashboardAndReports();
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

type HqInventoryConflictSection = "inventory" | "inventory-adjustment";

type HqInventoryConflictInput =
  | (LedgerInventoryInput & { ledgerId: string; ledgerUpdatedAt: string })
  | (LedgerInventoryAdjustmentInput & {
      ledgerId: string;
      ledgerUpdatedAt: string;
    });

function toInventoryConflictValues(data: InventoryStepData) {
  return Object.fromEntries(
    data.items.map((item) => [
      item.productName,
      `당일재고 ${item.currentQuantity ?? "-"} / 표시재고 ${item.quantity ?? "-"}`,
    ]),
  );
}

function toInventoryClientValues(input: HqInventoryConflictInput) {
  if ("items" in input) {
    return Object.fromEntries(
      input.items.map((item) => [
        item.productId,
        `당일재고 ${item.currentQuantity ?? "-"} / 표시재고 ${item.quantity ?? "-"}`,
      ]),
    );
  }

  return {
    productId: input.productId,
    actualQuantity: input.actualQuantity,
    reason: input.reason,
  };
}

async function hqInventoryConflictError<T = never>(
  tx: Prisma.TransactionClient,
  section: HqInventoryConflictSection,
  input: HqInventoryConflictInput,
): Promise<ActionResult<T>> {
  const [current, meta] = await Promise.all([
    getInventoryStepDataByLedgerIdInTx(tx, input.ledgerId),
    getLedgerConflictMetaInTx(tx, input.ledgerId),
  ]);

  return ledgerConflictErrorFromMeta<T>({
    meta,
    ledgerId: input.ledgerId,
    section,
    clientToken: input.ledgerUpdatedAt,
    serverToken:
      current?.updatedAt ?? meta?.updatedAt.toISOString() ?? "unknown",
    clientValues: toInventoryClientValues(input),
    serverValues: current ? toInventoryConflictValues(current) : {},
    lastModifiedAt: current?.updatedAt,
    reloadRequired: true,
    hqEditing: true,
  });
}

function notEditableError(
  status: InventoryStepData["status"],
): ActionResult<never> {
  const reason = getLedgerEditBlockReason(status, "inventory-adjustment");

  return actionError(reason.code, reason.message);
}

function ensureTargetInventory(
  data: InventoryStepData | null,
  storeId: string,
): ActionResult<InventoryStepData> {
  if (data?.storeId !== storeId) {
    return notFoundError();
  }

  if (!isLedgerEditable(data.status)) {
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
      status: { in: [...editableLedgerStatuses] },
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
    return await db.$transaction((tx) =>
      hqInventoryConflictError(tx, "inventory", parsed.data),
    );
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
        const inputByProductId = new Map(
          parsed.data.items.map((item) => [item.productId, item]),
        );

        // 매입·손실 품목의 당일재고 미입력을 서버에서도 막는다(버전 증가 전 검증).
        const requiredEntryErrors = getRequiredCurrentQuantityErrors(
          buildRequiredEntryGuardItems(before.items, inputByProductId),
        );

        if (Object.keys(requiredEntryErrors).length > 0) {
          return actionError<InventoryStepData>(
            "VALIDATION_ERROR",
            missingRequiredCurrentQuantityMessage,
            requiredEntryErrors,
          );
        }

        // 지점장 저장과 동일하게 서버에서도 조정 사유를 강제한다. 면제(매입 정상 판매,
        // 직접 추가 첫 입력) 밖의 기준재고 차이는 매칭 조정 레코드 없이 저장되면 막는다.
        // 버전 증가(markEditableLedgerInTx) 전에 검증해, 차단 시 빈 저장으로 버전만
        // 올라가지 않게 한다.
        const adjustmentErrors = getInventorySaveAdjustmentErrors(
          before.items.map((item) => ({
            productId: item.productId,
            previousQuantity: item.previousQuantity,
            purchasedQuantity: item.purchasedQuantity,
            lossQuantity: item.lossQuantity,
            carryoverSource: item.carryoverSource,
            carryoverStatus: item.carryoverStatus,
            carryoverLedgerId: item.carryoverLedgerId,
            currentQuantity:
              inputByProductId.get(item.productId)?.currentQuantity ??
              item.currentQuantity,
          })),
          before.items
            .filter((item) => item.adjustment !== null)
            .map((item) => ({
              productId: item.productId,
              afterQuantity: item.adjustment!.afterQuantity,
            })),
        );

        if (Object.keys(adjustmentErrors).length > 0) {
          return actionError<InventoryStepData>(
            "VALIDATION_ERROR",
            missingAdjustmentReasonMessage,
            adjustmentErrors,
          );
        }

        const updated = await markEditableLedgerInTx(
          tx,
          ledgerId,
          expectedUpdatedAt,
          actor.user.id,
        );

        if (!updated) {
          return await hqInventoryConflictError(tx, "inventory", parsed.data);
        }

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

        // "품목 추가"로 넣은(before.items에 없는) 입력 행도 값이 있으면 저장한다.
        const manualRows = await buildManualInventoryRows(
          tx,
          before.id,
          new Set(before.items.map((item) => item.productId)),
          parsed.data.items,
          actor.user.id,
        );

        rowsToPersist.push(...manualRows);

        if (rowsToPersist.length > 0) {
          await tx.ledgerInventoryItem.createMany({
            data: rowsToPersist,
          });
          await persistLedgerInventoryCarryoverDetails(
            tx,
            before.id,
            before.items.filter((item) =>
              rowsToPersist.some((row) => row.productId === item.productId),
            ),
          );
        }

        await reconcileLedgerInventoryAdjustments(tx, before.id, actor.user.id);

        // WO-02(2026-06-22): 본사 재고 마감 수정 후에도 FIFO lot snapshot과 inventoryAmount를 최신화한다.
        await refreshLedgerInventoryFifoLots(tx, before.id);

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
    return await db.$transaction((tx) =>
      hqInventoryConflictError(tx, "inventory-adjustment", parsed.data),
    );
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
          return await hqInventoryConflictError(
            tx,
            "inventory-adjustment",
            parsed.data,
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

        await persistLedgerInventoryCarryoverDetail(
          tx,
          inventoryItem.id,
          line.previousQuantityDetail,
        );

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

        // WO-02(2026-06-22): 본사 재고 조정 저장 후에도 FIFO lot snapshot과 inventoryAmount를 최신화한다.
        await refreshLedgerInventoryFifoLots(tx, before.id);

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
