"use server";

import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import {
  assertStoreManagerClosingDateIsToday,
  getKstBusinessDate,
} from "~/features/ledger/date";
import { syncLedgerLossItemsWithSalesPricePlansInTx } from "~/features/losses/planned-price-sync";
import { writeAuditLog } from "~/server/audit";
import { requireStoreManagerLedgerEditAccess } from "~/server/authz";
import {
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
  ledgerInventoryStoreAccessSchema,
  ledgerInventorySchema,
  toFieldErrors,
  type LedgerInventoryAdjustmentInput,
  type LedgerInventoryInput,
  type LedgerInventoryStoreAccessInput,
} from "./schemas";
import {
  applyInventoryAdjustmentReasonsInTx,
  reconcileLedgerInventoryAdjustments,
} from "./adjustment-reconciliation";
import { refreshLedgerInventoryFifoLots } from "./fifo-lots";
import {
  buildManualInventoryRows,
  getManualInventoryUnitPriceErrors,
} from "./manual-inventory-rows";
import { shouldPersistInventoryLine } from "./inventory-persist-policy";
import {
  buildRequiredEntryGuardItems,
  getInventorySaveAdjustmentErrors,
  getRequiredCurrentQuantityErrors,
  missingLossReviewMessage,
  missingAdjustmentReasonMessage,
  missingRequiredCurrentQuantityMessage,
} from "./adjustment-save-guard";
import { persistLedgerInventoryCarryoverDetails } from "./carryover-detail-persistence";
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
import type { Prisma } from "../../../generated/prisma";

type InventoryItemWithPlannedPrice = LedgerInventoryInput["items"][number] & {
  plannedUnitPrice: number;
};

const invalidInventoryTargetMessage =
  "저장할 재고 품목이 현재 대상과 일치하지 않습니다. 새로고침 후 다시 시도해 주세요.";
const invalidInventoryAmountMessage =
  "재고금액을 계산할 수 없습니다. 수량과 매입단가를 확인해 주세요.";

function getInventoryTargetErrors(
  targetProductIds: ReadonlySet<string>,
  inputItems: InventoryItemWithPlannedPrice[],
  activeManualProductIds: ReadonlySet<string>,
) {
  const errors: Record<string, string[]> = {};
  const firstIndexByProductId = new Map<string, number>();

  inputItems.forEach((item, index) => {
    const firstIndex = firstIndexByProductId.get(item.productId);

    if (firstIndex !== undefined) {
      errors[`items.${index}.productId`] = ["같은 품목을 중복 저장할 수 없습니다."];
      return;
    }

    firstIndexByProductId.set(item.productId, index);

    if (
      !targetProductIds.has(item.productId) &&
      !activeManualProductIds.has(item.productId)
    ) {
      errors[`items.${index}.productId`] = ["선택 가능한 품목이 아닙니다."];
    }

    if (
      !targetProductIds.has(item.productId) &&
      item.currentQuantity === null &&
      item.quantity === null
    ) {
      errors[`items.${index}.currentQuantity`] = [
        "직접 추가한 품목의 재고 수량을 입력해 주세요.",
      ];
    }
  });

  for (const productId of targetProductIds) {
    if (!firstIndexByProductId.has(productId)) {
      errors.items = [invalidInventoryTargetMessage];
      break;
    }
  }

  return errors;
}

function getInventoryAmountErrors(
  beforeItems: Array<{
    productId: string;
    unitPrice: number;
    previousQuantity: number;
    purchasedQuantity: number;
    lossQuantity: number;
    currentQuantity: number | null;
    quantity: number | null;
  }>,
  inputItems: InventoryItemWithPlannedPrice[],
) {
  const beforeByProductId = new Map(
    beforeItems.map((item) => [item.productId, item]),
  );
  const errors: Record<string, string[]> = {};

  inputItems.forEach((item, index) => {
    const before = beforeByProductId.get(item.productId);
    const quantity = item.quantity ?? item.currentQuantity;
    const unitPrice = before?.unitPrice ?? item.unitPrice;

    if (
      quantity !== null &&
      unitPrice !== null &&
      calculateInventoryAmount(quantity, unitPrice) === null
    ) {
      errors[`items.${index}.quantity`] = [invalidInventoryAmountMessage];
    }

    if (before) {
      const systemQuantity =
        before.previousQuantity +
        before.purchasedQuantity -
        before.lossQuantity;

      if (
        systemQuantity >= 0 &&
        calculateInventoryAmount(systemQuantity, before.unitPrice) === null
      ) {
        errors[`items.${index}.currentQuantity`] = [
          invalidInventoryAmountMessage,
        ];
      }
    }
  });

  return errors;
}

async function upsertInventorySalesPricePlansInTx(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    businessDate: Date;
    items: InventoryItemWithPlannedPrice[];
    actorId: string;
  },
) {
  for (const item of input.items) {
    await tx.storeSalesPricePlan.upsert({
      where: {
        storeId_businessDate_productId: {
          storeId: input.storeId,
          businessDate: input.businessDate,
          productId: item.productId,
        },
      },
      update: {
        plannedUnitPrice: item.plannedUnitPrice,
        updatedById: input.actorId,
      },
      create: {
        storeId: input.storeId,
        businessDate: input.businessDate,
        productId: item.productId,
        plannedUnitPrice: item.plannedUnitPrice,
        createdById: input.actorId,
        updatedById: input.actorId,
      },
    });
  }
}

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
    data.items.map((item) => {
      const plannedUnitPrice = (
        item as typeof item & { plannedUnitPrice?: number | null }
      ).plannedUnitPrice;

      return [
        item.productName,
        `당일재고 ${item.currentQuantity ?? "-"} / 표시재고 ${item.quantity ?? "-"} / 판매계획가 ${plannedUnitPrice ?? "-"}`,
      ];
    }),
  );
}

function toInventoryClientValues(input: LedgerInventoryInput) {
  return Object.fromEntries(
    input.items.map((item) => {
      const plannedUnitPrice = (
        item as typeof item & { plannedUnitPrice?: number | null }
      ).plannedUnitPrice;

      return [
        item.productId,
        `당일재고 ${item.currentQuantity ?? "-"} / 표시재고 ${item.quantity ?? "-"} / 판매계획가 ${plannedUnitPrice ?? "-"}`,
      ];
    }),
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

function revalidateInventoryPaths() {
  revalidateStoreEntryPaths(["root", "inventory", "losses"]);
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

      // Lane A의 schema가 필수 plannedUnitPrice를 검증한다. 교차 lane 통합 전에도 이
      // 파일은 독립적으로 typecheck할 수 있도록 좁은 교차 타입으로만 표현한다.
      const inputItems = parsed.data.items as InventoryItemWithPlannedPrice[];
      const inputByProductId = new Map(
        inputItems.map((item) => [item.productId, item]),
      );
      const existingProductIds = new Set(
        before.items.map((item) => item.productId),
      );
      const manualProductIds = [
        ...new Set(
          inputItems
            .filter((item) => !existingProductIds.has(item.productId))
            .map((item) => item.productId),
        ),
      ];
      const activeManualProducts =
        manualProductIds.length === 0
          ? []
          : await tx.product.findMany({
              where: { id: { in: manualProductIds }, isActive: true },
              select: { id: true },
            });
      const targetErrors = getInventoryTargetErrors(
        existingProductIds,
        inputItems,
        new Set(activeManualProducts.map((product) => product.id)),
      );

      if (Object.keys(targetErrors).length > 0) {
        return actionError<StoreManagerInventoryStepData>(
          "VALIDATION_ERROR",
          invalidInventoryTargetMessage,
          targetErrors,
        );
      }

      const amountErrors = getInventoryAmountErrors(before.items, inputItems);

      if (Object.keys(amountErrors).length > 0) {
        return actionError<StoreManagerInventoryStepData>(
          "VALIDATION_ERROR",
          invalidInventoryAmountMessage,
          amountErrors,
        );
      }

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
        new Map(
          parsed.data.items.map((item) => [
            item.productId,
            item.adjustmentReason,
          ]),
        ),
      );

      if (Object.keys(adjustmentErrors).length > 0) {
        return actionError<StoreManagerInventoryStepData>(
          "VALIDATION_ERROR",
          missingAdjustmentReasonMessage,
          adjustmentErrors,
        );
      }

      const manualUnitPriceErrors = getManualInventoryUnitPriceErrors(
        existingProductIds,
        parsed.data.items,
      );
      const manualUnitPriceError = Object.values(manualUnitPriceErrors)[0]?.[0];

      if (manualUnitPriceError) {
        return actionError<StoreManagerInventoryStepData>(
          "VALIDATION_ERROR",
          manualUnitPriceError,
          manualUnitPriceErrors,
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
        const inputItem = inputByProductId.get(item.productId);
        const currentQuantity =
          inputItem?.currentQuantity ?? item.currentQuantity;
        const quantity = inputItem?.quantity ?? item.quantity;

        if (
          !shouldPersistInventoryLine(item, currentQuantity, quantity, {
            hasExplicitCurrentQuantityInput:
              inputItem?.currentQuantity !== null &&
              inputItem?.currentQuantity !== undefined,
          })
        ) {
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
        existingProductIds,
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

      // 지점장이 일반 저장과 함께 보낸 "고친 이유"로 조정 레코드를 만든다(차이 행 한정).
      await applyInventoryAdjustmentReasonsInTx(
        tx,
        before.id,
        new Map(
          parsed.data.items.map((item) => [
            item.productId,
            item.adjustmentReason,
          ]),
        ),
        actor.user.id,
      );

      await reconcileLedgerInventoryAdjustments(tx, before.id, actor.user.id);

      // WO-02(2026-06-22): 재고 마감 저장 후 FIFO lot snapshot과 inventoryAmount를 최신화한다.
      await refreshLedgerInventoryFifoLots(tx, before.id);

      const businessDate = getKstBusinessDate(parsed.data.closingDate);
      await upsertInventorySalesPricePlansInTx(tx, {
        storeId: parsed.data.storeId,
        businessDate,
        items: inputItems,
        actorId: actor.user.id,
      });
      await syncLedgerLossItemsWithSalesPricePlansInTx(tx, {
        storeId: parsed.data.storeId,
        businessDate,
        dailyLedgerId: before.id,
        productIds: inputItems.map((item) => item.productId),
        actorId: actor.user.id,
      });

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
    revalidateLedgerDetailPath(parsed.data.ledgerId);

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

  // 정책 반전(2026-06-28, client-review-checklist-2026-06-28.md §1): 시스템 재고 수량을
  // 직접 덮어쓰는 단독 재고조정(actualQuantity 오버라이드)은 본사 전용이다. 지점장 수정 요청은
  // 서버에서 거부한다. 본사는 saveHqLedgerInventoryAdjustment를 쓴다. 지점장 5단계 재고
  // 수량 입력(saveLedgerInventoryItems)과, 그 차이로 자동 생성되는 조정은 종전대로 허용된다.
  await requireStoreManagerLedgerEditAccess(access.data.storeId);
  return actionError(
    "FORBIDDEN",
    "재고 수량 조정은 본사에서만 할 수 있습니다.",
  );
}
