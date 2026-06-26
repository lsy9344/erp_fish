"use server";

import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { assertStoreManagerClosingDateIsToday } from "~/features/ledger/date";
import { writeAuditLog } from "~/server/audit";
import { requireStoreManagerLedgerEditAccess } from "~/server/authz";
import {
  calculateInventoryAdjustment,
  calculateInventoryAmount,
  calculateSystemInventoryQuantity,
} from "~/server/calculations/inventory";
import { db } from "~/server/db";
import {
  revalidateDashboardAndReports,
  revalidateStoreEntryPaths,
} from "~/server/revalidation";
import {
  ledgerInventoryAdjustmentSchema,
  ledgerInventoryStoreAccessSchema,
  ledgerInventorySchema,
  toFieldErrors,
  type LedgerInventoryAdjustmentInput,
  type LedgerInventoryInput,
  type LedgerInventoryStoreAccessInput,
} from "./schemas";
import { reconcileLedgerInventoryAdjustments } from "./adjustment-reconciliation";
import { refreshLedgerInventoryFifoLots } from "./fifo-lots";
import { buildManualInventoryRows } from "./manual-inventory-rows";
import { shouldPersistInventoryLine } from "./inventory-persist-policy";
import {
  buildRequiredEntryGuardItems,
  getInventorySaveAdjustmentErrors,
  getRequiredCurrentQuantityErrors,
  missingLossReviewMessage,
  missingAdjustmentReasonMessage,
  missingRequiredCurrentQuantityMessage,
} from "./adjustment-save-guard";
import {
  persistLedgerInventoryCarryoverDetail,
  persistLedgerInventoryCarryoverDetails,
} from "./carryover-detail-persistence";
import {
  getInventoryStepDataByLedgerIdInTx,
  getInventoryStepDataInTx,
  toStoreManagerInventoryStepData,
} from "./queries";
import { type StoreManagerInventoryStepData } from "./types";
import {
  getLedgerConflictMetaInTx,
  ledgerConflictErrorFromMeta,
} from "~/features/ledger/conflicts";
import {
  editableLedgerStatuses,
  getLedgerEditBlockReason,
  isLedgerEditable,
} from "~/features/ledger/status-policy";

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

function parseLedgerInventoryStoreAccessInput(
  input: unknown,
): ActionResult<LedgerInventoryStoreAccessInput> {
  const parsed = ledgerInventoryStoreAccessSchema.safeParse(input);

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

class OriginalInventoryBlockedError extends Error {
  constructor(
    readonly code: "LEDGER_CLOSED" | "LEDGER_NOT_EDITABLE",
    message: string,
  ) {
    super(message);
  }
}

function originalInventoryBlockedError(status: string) {
  const reason = getLedgerEditBlockReason(status, "inventory-adjustment");

  return new OriginalInventoryBlockedError(reason.code, reason.message);
}

function toInventoryConflictValues(data: StoreManagerInventoryStepData) {
  return Object.fromEntries(
    data.items.map((item) => [
      item.productName,
      `당일재고 ${item.currentQuantity ?? "-"} / 표시재고 ${item.quantity ?? "-"}`,
    ]),
  );
}

function toInventoryClientValues(input: LedgerInventoryInput) {
  return Object.fromEntries(
    input.items.map((item) => [
      item.productId,
      `당일재고 ${item.currentQuantity ?? "-"} / 표시재고 ${item.quantity ?? "-"}`,
    ]),
  );
}

function toInventoryAdjustmentClientValues(
  input: LedgerInventoryAdjustmentInput,
) {
  return {
    productId: input.productId,
    actualQuantity: input.actualQuantity,
    reason: input.reason,
  };
}

async function mapLedgerConflictError(
  section: "inventory" | "inventory-adjustment",
  input: LedgerInventoryInput | LedgerInventoryAdjustmentInput,
): Promise<ActionResult<never>> {
  const snapshot = await db.$transaction(async (tx) => {
    const current = await getInventoryStepDataByLedgerIdInTx(
      tx,
      input.ledgerId,
    );
    const meta = await getLedgerConflictMetaInTx(tx, input.ledgerId);

    return {
      data: current ? toStoreManagerInventoryStepData(current) : null,
      meta,
    };
  });

  return ledgerConflictErrorFromMeta({
    meta: snapshot.meta,
    ledgerId: input.ledgerId,
    section,
    clientToken: input.version,
    clientValues:
      section === "inventory"
        ? toInventoryClientValues(input as LedgerInventoryInput)
        : toInventoryAdjustmentClientValues(
            input as LedgerInventoryAdjustmentInput,
          ),
    serverValues: snapshot.data ? toInventoryConflictValues(snapshot.data) : {},
    reloadRequired: true,
  });
}

function originalAdjustmentBlockedError(status: string): ActionResult<never> {
  const reason = getLedgerEditBlockReason(status, "inventory-adjustment");

  return actionError(reason.code, reason.message);
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
  revalidateStoreEntryPaths(["inventory"]);
  revalidateDashboardAndReports();
}

export async function saveLedgerInventoryItems(
  input: unknown,
): Promise<ActionResult<StoreManagerInventoryStepData>> {
  const access = parseLedgerInventoryStoreAccessInput(input);

  if (!access.ok) {
    return access;
  }

  const actor = await requireStoreManagerLedgerEditAccess(access.data.storeId);

  const parsed = parseLedgerInventoryInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const dateGuard = assertStoreManagerClosingDateIsToday(
    parsed.data.closingDate,
  );

  if (!dateGuard.ok) {
    return actionError(dateGuard.code, dateGuard.message);
  }

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

      if (!isLedgerEditable(before.status)) {
        throw originalInventoryBlockedError(before.status);
      }

      const inputByProductId = new Map(
        parsed.data.items.map((item) => [item.productId, item]),
      );

      // 매입·손실 품목의 당일재고 미입력을 서버에서도 막는다(UI 우회·직접 호출 방어).
      const requiredEntryErrors = getRequiredCurrentQuantityErrors(
        buildRequiredEntryGuardItems(before.items, inputByProductId),
      );

      if (Object.keys(requiredEntryErrors).length > 0) {
        return actionError<StoreManagerInventoryStepData>(
          "VALIDATION_ERROR",
          missingRequiredCurrentQuantityMessage,
          requiredEntryErrors,
        );
      }

      const lossReview = await tx.dailyLedger.findUnique({
        where: { id: before.id },
        select: { lossReviewedAt: true },
      });

      if (!lossReview?.lossReviewedAt) {
        return actionError<StoreManagerInventoryStepData>(
          "VALIDATION_ERROR",
          missingLossReviewMessage,
        );
      }

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
        return actionError<StoreManagerInventoryStepData>(
          "VALIDATION_ERROR",
          missingAdjustmentReasonMessage,
          adjustmentErrors,
        );
      }

      const editableLedger = await tx.dailyLedger.updateMany({
        where: {
          id: before.id,
          version: parsed.data.version,
          status: { in: [...editableLedgerStatuses] },
        },
        data: { updatedById: actor.user.id, version: { increment: 1 } },
      });

      if (editableLedger.count !== 1) {
        throw new Error("LEDGER_CONFLICT");
      }

      await tx.ledgerInventoryItem.deleteMany({
        where: { dailyLedgerId: before.id },
      });

      // 미입력(빈칸) 행은 currentQuantity/quantity가 null로 직렬화되는데, 무조건
      // 재기록하면 기존 저장값을 null로 덮어써 다음 날 전일재고 이월이 0이 된다.
      // 본사 경로와 동일하게 shouldPersistInventoryLine 가드로 변경/기존 행만 기록한다.
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

      // WO-02(2026-06-22): 재고 마감 저장 후 FIFO lot snapshot과 inventoryAmount를 최신화한다.
      await refreshLedgerInventoryFifoLots(tx, before.id);

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

    if ("ok" in result) {
      return result;
    }

    revalidateInventoryPaths();

    return actionOk(toStoreManagerInventoryStepData(result));
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "LEDGER_CONFLICT") {
      return await mapLedgerConflictError("inventory", parsed.data);
    }

    if (error instanceof OriginalInventoryBlockedError) {
      return actionError(error.code, error.message);
    }

    return mapStoreActionError();
  }
}

export async function saveLedgerInventoryAdjustment(
  input: unknown,
): Promise<ActionResult<StoreManagerInventoryStepData>> {
  const access = parseLedgerInventoryStoreAccessInput(input);

  if (!access.ok) {
    return access;
  }

  const actor = await requireStoreManagerLedgerEditAccess(access.data.storeId);

  const parsed = parseLedgerInventoryAdjustmentInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const dateGuard = assertStoreManagerClosingDateIsToday(
    parsed.data.closingDate,
  );

  if (!dateGuard.ok) {
    return actionError(dateGuard.code, dateGuard.message);
  }

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
        const meta = await getLedgerConflictMetaInTx(tx, before.id);
        return ledgerConflictErrorFromMeta<StoreManagerInventoryStepData>({
          meta,
          ledgerId: parsed.data.ledgerId,
          section: "inventory-adjustment",
          clientToken: parsed.data.version,
          clientValues: toInventoryAdjustmentClientValues(parsed.data),
          serverValues: toInventoryConflictValues(
            toStoreManagerInventoryStepData(before),
          ),
          reloadRequired: true,
        });
      }

      if (!isLedgerEditable(before.status)) {
        return originalAdjustmentBlockedError(before.status);
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
          status: { in: [...editableLedgerStatuses] },
        },
        data: { updatedById: actor.user.id, version: { increment: 1 } },
      });

      if (editableLedger.count !== 1) {
        const meta = await getLedgerConflictMetaInTx(tx, before.id);
        return ledgerConflictErrorFromMeta<StoreManagerInventoryStepData>({
          meta,
          ledgerId: parsed.data.ledgerId,
          section: "inventory-adjustment",
          clientToken: parsed.data.version,
          clientValues: toInventoryAdjustmentClientValues(parsed.data),
          serverValues: toInventoryConflictValues(
            toStoreManagerInventoryStepData(before),
          ),
          reloadRequired: true,
        });
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

      // WO-02(2026-06-22): 재고 조정 저장 후 FIFO lot snapshot과 inventoryAmount를 최신화한다.
      await refreshLedgerInventoryFifoLots(tx, before.id);

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
