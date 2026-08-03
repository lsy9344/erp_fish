"use server";

import { z } from "zod";

import type { Prisma } from "../../../generated/prisma";
import {
  supersedeActiveCorrectionsForTargetsInTx,
  type ActiveCorrectionSupersedeTarget,
} from "~/features/corrections/actions";
import { getActiveCorrectionsForLedgerInTx } from "~/features/corrections/queries";
import { syncLedgerLossItemsWithSalesPricePlansInTx } from "~/features/losses/planned-price-sync";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { decimalToNumber, nullableDecimalToNumber } from "~/lib/decimal";
import { writeAuditLog } from "~/server/audit";
import {
  hasLedgerClosedEditAccess,
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
  getLedgerEditBlockReason,
  isLedgerEditableByHeadquarters,
} from "~/features/ledger/status-policy";
import {
  invalidateCarryoverDependentsInTx,
  updateHqLedgerMutationTokenInTx,
} from "~/features/ledger/hq-mutation";
import {
  getInventorySaveAdjustmentErrors,
  getInventorySaveRequiredEntryErrors,
  missingAdjustmentReasonMessage,
  missingRequiredCurrentQuantityMessage,
} from "./adjustment-save-guard";
import {
  applyInventoryAdjustmentReasonsInTx,
  reconcileLedgerInventoryAdjustments,
} from "./adjustment-reconciliation";
import { upsertInventorySalesPricePlansInTx } from "./actions";
import { refreshLedgerInventoryFifoLots } from "./fifo-lots";
import {
  buildManualInventoryRows,
  getManualInventoryUnitPriceErrors,
} from "./manual-inventory-rows";
import {
  getInventoryQuantityRelation,
  shouldPersistInventoryLine,
} from "./inventory-persist-policy";
import { applyInventoryFormDisplayPolicy } from "./inventory-zero-stock-display.ts";
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
import {
  type InventoryCarryoverDetailView,
  type InventoryStepData,
} from "./types";

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
  const formCurrent = current ? applyInventoryFormDisplayPolicy(current) : null;

  return ledgerConflictErrorFromMeta<T>({
    meta,
    ledgerId: input.ledgerId,
    section,
    clientToken: input.ledgerUpdatedAt,
    serverToken:
      formCurrent?.updatedAt ?? meta?.updatedAt.toISOString() ?? "unknown",
    clientValues: toInventoryClientValues(input),
    serverValues: formCurrent ? toInventoryConflictValues(formCurrent) : {},
    lastModifiedAt: formCurrent?.updatedAt,
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
  allowClosedEdit: boolean,
): ActionResult<InventoryStepData> {
  if (data?.storeId !== storeId) {
    return notFoundError();
  }

  if (!isLedgerEditableByHeadquarters(data.status, allowClosedEdit)) {
    return notEditableError(data.status);
  }

  return actionOk(data);
}

async function getHqInventoryMutationActor() {
  const user = await requireLedgerHqEditAccess();
  const allowClosedEdit = await hasLedgerClosedEditAccess(user.id);

  return { user, allowClosedEdit };
}

function getChangedInventoryProductIds(
  before: InventoryStepData,
  after: InventoryStepData,
  forcedProductIds: Iterable<string> = [],
) {
  function fingerprints(data: InventoryStepData) {
    return new Map(
      data.items.map((item) => [
        item.productId,
        JSON.stringify({
          unitPrice: item.unitPrice,
          previousQuantity: item.previousQuantity,
          purchasedQuantity: item.purchasedQuantity,
          lossQuantity: item.lossQuantity,
          currentQuantity: item.currentQuantity,
          quantity: item.quantity,
          inventoryAmount: item.inventoryAmount,
          carryoverSource: item.carryoverSource,
          carryoverStatus: item.carryoverStatus,
          carryoverLedgerId: item.carryoverLedgerId,
          fifoLots: item.fifoLots.map((lot) => ({
            sourceType: lot.sourceType,
            sourceLedgerId: lot.sourceLedgerId,
            sourcePurchaseItemId: lot.sourcePurchaseItemId,
            sourceBusinessDate: lot.sourceBusinessDate,
            unitPrice: lot.unitPrice,
            originalQuantity: lot.originalQuantity,
            consumedQuantity: lot.consumedQuantity,
            remainingQuantity: lot.remainingQuantity,
            originalAmount: lot.originalAmount,
            consumedAmount: lot.consumedAmount,
            remainingAmount: lot.remainingAmount,
            sortOrder: lot.sortOrder,
          })),
        }),
      ]),
    );
  }

  const beforeByProductId = fingerprints(before);
  const afterByProductId = fingerprints(after);
  const forcedProductIdSet = new Set(forcedProductIds);

  return [
    ...new Set([
      ...beforeByProductId.keys(),
      ...afterByProductId.keys(),
      ...forcedProductIdSet,
    ]),
  ]
    .filter(
      (productId) =>
        forcedProductIdSet.has(productId) ||
        beforeByProductId.get(productId) !== afterByProductId.get(productId),
    )
    .sort();
}

function inventoryCalculatedMetricTargets(
  ledgerId: string,
  changed: boolean,
): ActiveCorrectionSupersedeTarget[] {
  if (!changed) return [];

  return ["grossMarginRate", "salesDifference"].map((fieldKey) => ({
    targetType: "CALCULATED_METRIC" as const,
    targetId: ledgerId,
    fieldKey,
  }));
}

function priceCalculatedMetricTargets(
  ledgerId: string,
  changed: boolean,
): ActiveCorrectionSupersedeTarget[] {
  if (!changed) return [];

  return ["salesDifference", "lossAmount"].map((fieldKey) => ({
    targetType: "CALCULATED_METRIC" as const,
    targetId: ledgerId,
    fieldKey,
  }));
}

function adjustmentCalculatedMetricTargets(
  ledgerId: string,
  changed: boolean,
): ActiveCorrectionSupersedeTarget[] {
  if (!changed) return [];

  return ["grossMarginRate", "salesDifference"].map((fieldKey) => ({
    targetType: "CALCULATED_METRIC" as const,
    targetId: ledgerId,
    fieldKey,
  }));
}

type AcknowledgedCarryover = {
  previousQuantity: number;
  carryoverSource: "PREVIOUS_CLOSED_LEDGER";
  carryoverStatus: "PREVIOUS_CARRYOVER";
  detail: InventoryCarryoverDetailView;
};

type ActiveLedgerCorrections = Awaited<
  ReturnType<typeof getActiveCorrectionsForLedgerInTx>
>;

function getActiveInventoryCorrectionNumber(
  records: ActiveLedgerCorrections,
  targetId: string,
  fieldKey: "currentQuantity" | "quantity",
) {
  const correctedValue = records.find(
    (record) =>
      record.targetType === "INVENTORY_ROW" &&
      record.targetId === targetId &&
      record.fieldKey === fieldKey,
  )?.correctedValue;

  if (
    !correctedValue ||
    typeof correctedValue !== "object" ||
    Array.isArray(correctedValue)
  ) {
    return undefined;
  }

  return typeof correctedValue.value === "number"
    ? correctedValue.value
    : undefined;
}

function applyActiveInventoryCorrections(
  data: InventoryStepData,
  records: ActiveLedgerCorrections,
): InventoryStepData {
  return {
    ...data,
    items: data.items.map((item) => ({
      ...item,
      currentQuantity:
        getActiveInventoryCorrectionNumber(
          records,
          item.id,
          "currentQuantity",
        ) ?? item.currentQuantity,
      quantity:
        getActiveInventoryCorrectionNumber(records, item.id, "quantity") ??
        item.quantity,
    })),
  };
}

async function resolveAcknowledgedCarryoversInTx(
  tx: Prisma.TransactionClient,
  before: InventoryStepData,
  productIds: string[],
): Promise<ActionResult<Map<string, AcknowledgedCarryover>>> {
  const acknowledgedProductIds = [...new Set(productIds)];

  if (acknowledgedProductIds.length === 0) {
    return actionOk(new Map());
  }

  const beforeByProductId = new Map(
    before.items.map((item) => [item.productId, item]),
  );
  const invalidProductId = acknowledgedProductIds.find((productId) => {
    const item = beforeByProductId.get(productId);

    return (
      item?.carryoverStatus !== "CARRYOVER_RECHECK_REQUIRED" ||
      !item.carryoverLedgerId
    );
  });

  if (invalidProductId) {
    return actionError(
      "VALIDATION_ERROR",
      "이월 재확인 대상을 확인해 주세요.",
      {
        acknowledgedCarryoverProductIds: [
          "현재 이월 재확인 상태인 품목만 확인 처리할 수 있습니다.",
        ],
      },
    );
  }

  const sourceLedgerIds = [
    ...new Set(
      acknowledgedProductIds.map(
        (productId) => beforeByProductId.get(productId)!.carryoverLedgerId!,
      ),
    ),
  ];
  const [sourceItems, sourceLosses] = await Promise.all([
    tx.ledgerInventoryItem.findMany({
      where: {
        dailyLedgerId: { in: sourceLedgerIds },
        productId: { in: acknowledgedProductIds },
      },
      select: {
        dailyLedgerId: true,
        productId: true,
        previousQuantity: true,
        purchasedQuantity: true,
        currentQuantity: true,
        quantity: true,
        dailyLedger: {
          select: { id: true, closingDate: true, status: true },
        },
      },
    }),
    tx.ledgerLossItem.findMany({
      where: {
        dailyLedgerId: { in: sourceLedgerIds },
        productId: { in: acknowledgedProductIds },
      },
      select: { dailyLedgerId: true, productId: true, quantity: true },
    }),
  ]);
  const sourceItemByKey = new Map(
    sourceItems.map((item) => [
      `${item.dailyLedgerId}:${item.productId}`,
      item,
    ]),
  );
  const lossQuantityByKey = new Map<string, number>();

  sourceLosses.forEach((loss) => {
    const key = `${loss.dailyLedgerId}:${loss.productId}`;
    lossQuantityByKey.set(
      key,
      (lossQuantityByKey.get(key) ?? 0) + decimalToNumber(loss.quantity),
    );
  });

  const resolved = new Map<string, AcknowledgedCarryover>();

  for (const productId of acknowledgedProductIds) {
    const current = beforeByProductId.get(productId)!;
    const sourceLedgerId = current.carryoverLedgerId!;
    const source = sourceItemByKey.get(`${sourceLedgerId}:${productId}`);

    if (source?.dailyLedger.status !== "HEADQUARTERS_CLOSED") {
      return actionError(
        "VALIDATION_ERROR",
        "새 이월 근거를 확정할 수 없습니다.",
        {
          acknowledgedCarryoverProductIds: [
            "원천 장부가 본사 마감 상태인지 확인해 주세요.",
          ],
        },
      );
    }

    const previousQuantity =
      nullableDecimalToNumber(source.currentQuantity) ??
      nullableDecimalToNumber(source.quantity) ??
      0;

    resolved.set(productId, {
      previousQuantity,
      carryoverSource: "PREVIOUS_CLOSED_LEDGER",
      carryoverStatus: "PREVIOUS_CARRYOVER",
      detail: {
        ...current.previousQuantityDetail,
        source: "PREVIOUS_CLOSED_LEDGER",
        status: "PREVIOUS_CARRYOVER",
        resolvedQuantity: previousQuantity,
        sourceLedgerId: source.dailyLedger.id,
        sourceLedgerClosingDate: source.dailyLedger.closingDate.toISOString(),
        sourceLedgerStatus: source.dailyLedger.status,
        sourceYearMonth: null,
        sourceSnapshotId: null,
        sourcePreviousQuantity: decimalToNumber(source.previousQuantity),
        sourcePurchasedQuantity: decimalToNumber(source.purchasedQuantity),
        sourceLossQuantity:
          lossQuantityByKey.get(`${sourceLedgerId}:${productId}`) ?? 0,
        sourceCurrentQuantity: nullableDecimalToNumber(source.currentQuantity),
        sourceQuantity: nullableDecimalToNumber(source.quantity),
        message: "수정된 원천 장부의 이월 재고를 확인하고 다시 계산했습니다.",
      },
    });
  }

  return actionOk(resolved);
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

  const actor = await getHqInventoryMutationActor();
  const { ledgerId } = parsed.data;
  await requireHeadquartersStoreScope(parsed.data.storeId);
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsed.data.ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return await db.$transaction((tx) =>
      hqInventoryConflictError(tx, "inventory", parsed.data),
    );
  }

  let invalidatedTargetLedgerIds: string[] = [];

  try {
    const result = await db.$transaction<ActionResult<InventoryStepData>>(
      async (tx) => {
        const beforeResult = ensureTargetInventory(
          await getInventoryStepDataByLedgerIdInTx(tx, ledgerId),
          parsed.data.storeId,
          actor.allowClosedEdit,
        );

        if (!beforeResult.ok) {
          return beforeResult;
        }

        const before = beforeResult.data;
        const effectiveBefore = applyActiveInventoryCorrections(
          before,
          await getActiveCorrectionsForLedgerInTx(tx, ledgerId),
        );

        if (before.updatedAt !== expectedUpdatedAt.toISOString()) {
          return await hqInventoryConflictError(tx, "inventory", parsed.data);
        }

        const acknowledgedResult = await resolveAcknowledgedCarryoversInTx(
          tx,
          before,
          parsed.data.acknowledgedCarryoverProductIds,
        );

        if (!acknowledgedResult.ok) {
          return acknowledgedResult;
        }

        const acknowledgedCarryovers = acknowledgedResult.data;

        const inputByProductId = new Map(
          parsed.data.items.map((item) => [item.productId, item]),
        );
        const deletedProductIds = new Set(parsed.data.deletedProductIds);
        const persistedProductIds = new Set(
          before.items
            .filter((item) => item.id !== item.productId)
            .map((item) => item.productId),
        );
        const invalidDeletedProductIds = parsed.data.deletedProductIds.filter(
          (productId) =>
            !persistedProductIds.has(productId) ||
            inputByProductId.has(productId),
        );

        if (invalidDeletedProductIds.length > 0) {
          return actionError<InventoryStepData>(
            "VALIDATION_ERROR",
            "삭제할 기존 재고 행을 확인해 주세요.",
            {
              deletedProductIds: [
                "저장된 재고 행만 삭제할 수 있으며 삭제 행은 입력 목록에 함께 보낼 수 없습니다.",
              ],
            },
          );
        }
        const existingProductIds = new Set(
          before.items.map((item) => item.productId),
        );

        // 매입·손실 품목의 당일재고 미입력을 서버에서도 막는다(버전 증가 전 검증).
        // 오류 인덱스는 제출 품목 순서에 맞추고, 미제출 필수 품목도 차단한다.
        const requiredEntryErrors = getInventorySaveRequiredEntryErrors(
          before.items,
          parsed.data.items,
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
        const beforeByProductId = new Map(
          before.items.map((item) => [item.productId, item]),
        );
        const adjustmentErrors = getInventorySaveAdjustmentErrors(
          parsed.data.items.map((inputItem) => {
            const beforeItem = beforeByProductId.get(inputItem.productId);

            if (!beforeItem) {
              return {
                productId: inputItem.productId,
                previousQuantity: 0,
                purchasedQuantity: 0,
                lossQuantity: 0,
                carryoverSource: "MANUAL",
                carryoverStatus: "CARRYOVER_EMPTY",
                carryoverLedgerId: null,
                currentQuantity: inputItem.currentQuantity,
              };
            }

            const acknowledged = acknowledgedCarryovers.get(
              inputItem.productId,
            );

            return {
              productId: beforeItem.productId,
              previousQuantity:
                acknowledged?.previousQuantity ?? beforeItem.previousQuantity,
              purchasedQuantity: beforeItem.purchasedQuantity,
              lossQuantity: beforeItem.lossQuantity,
              carryoverSource:
                acknowledged?.carryoverSource ?? beforeItem.carryoverSource,
              carryoverStatus:
                acknowledged?.carryoverStatus ?? beforeItem.carryoverStatus,
              carryoverLedgerId: beforeItem.carryoverLedgerId,
              currentQuantity:
                inputItem.currentQuantity ?? beforeItem.currentQuantity,
            };
          }),
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
          return actionError<InventoryStepData>(
            "VALIDATION_ERROR",
            missingAdjustmentReasonMessage,
            adjustmentErrors,
          );
        }

        const manualUnitPriceErrors = getManualInventoryUnitPriceErrors(
          existingProductIds,
          parsed.data.items,
        );
        const manualUnitPriceError = Object.values(
          manualUnitPriceErrors,
        )[0]?.[0];

        if (manualUnitPriceError) {
          return actionError<InventoryStepData>(
            "VALIDATION_ERROR",
            manualUnitPriceError,
            manualUnitPriceErrors,
          );
        }

        const updated = await updateHqLedgerMutationTokenInTx(tx, {
          ledgerId,
          expectedUpdatedAt,
          actorId: actor.user.id,
          allowClosedEdit: actor.allowClosedEdit,
        });

        if (!updated) {
          return await hqInventoryConflictError(tx, "inventory", parsed.data);
        }

        await tx.ledgerInventoryItem.deleteMany({
          where: { dailyLedgerId: before.id },
        });

        const rowsToPersist = before.items.flatMap((item) => {
          if (deletedProductIds.has(item.productId)) {
            return [];
          }

          const inputItem = inputByProductId.get(item.productId);
          const acknowledged = acknowledgedCarryovers.get(item.productId);
          const effectiveItem = acknowledged
            ? {
                ...item,
                previousQuantity: acknowledged.previousQuantity,
                carryoverSource: acknowledged.carryoverSource,
                carryoverStatus: acknowledged.carryoverStatus,
              }
            : item;
          const currentQuantity =
            inputItem?.currentQuantity ?? item.currentQuantity;
          const quantity = inputItem?.quantity ?? item.quantity;

          if (
            !shouldPersistInventoryLine(
              effectiveItem,
              currentQuantity,
              quantity,
              {
                hasExplicitCurrentQuantityInput:
                  inputItem?.currentQuantity !== null &&
                  inputItem?.currentQuantity !== undefined,
              },
            )
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
              previousQuantity: effectiveItem.previousQuantity,
              purchasedQuantity: item.purchasedQuantity,
              currentQuantity,
              quantity,
              inventoryAmount,
              isModified:
                (currentQuantity !== null &&
                  currentQuantity !== effectiveItem.previousQuantity) ||
                (quantity !== null &&
                  quantity !== effectiveItem.previousQuantity),
              carryoverSource: effectiveItem.carryoverSource,
              carryoverStatus: effectiveItem.carryoverStatus,
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

        if (deletedProductIds.size > 0) {
          await tx.ledgerInventoryAdjustment.deleteMany({
            where: {
              dailyLedgerId: before.id,
              productId: { in: [...deletedProductIds] },
            },
          });
        }

        if (rowsToPersist.length > 0) {
          await tx.ledgerInventoryItem.createMany({
            data: rowsToPersist,
          });
          await persistLedgerInventoryCarryoverDetails(
            tx,
            before.id,
            before.items
              .filter((item) =>
                rowsToPersist.some((row) => row.productId === item.productId),
              )
              .map((item) => {
                const acknowledged = acknowledgedCarryovers.get(item.productId);

                return acknowledged
                  ? {
                      ...item,
                      previousQuantity: acknowledged.previousQuantity,
                      carryoverSource: acknowledged.carryoverSource,
                      carryoverStatus: acknowledged.carryoverStatus,
                      previousQuantityDetail: acknowledged.detail,
                    }
                  : item;
              }),
          );
        }

        const salesPriceItems = parsed.data.items.flatMap((item) =>
          item.plannedUnitPrice === null
            ? []
            : [
                {
                  productId: item.productId,
                  plannedUnitPrice: item.plannedUnitPrice,
                },
              ],
        );
        const { changedProductIds: priceChangedProductIds } =
          await upsertInventorySalesPricePlansInTx(tx, {
            storeId: before.storeId,
            businessDate: new Date(before.closingDate),
            items: salesPriceItems,
            actorId: actor.user.id,
          });
        const lossPriceSync = await syncLedgerLossItemsWithSalesPricePlansInTx(
          tx,
          {
            storeId: before.storeId,
            businessDate: new Date(before.closingDate),
            dailyLedgerId: before.id,
            productIds: priceChangedProductIds,
            actorId: actor.user.id,
            allowClosedEdit: actor.allowClosedEdit,
          },
        );

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

        // WO-02(2026-06-22): 본사 재고 마감 수정 후에도 FIFO lot snapshot과 inventoryAmount를 최신화한다.
        await refreshLedgerInventoryFifoLots(tx, before.id);

        const after = await getInventoryStepDataByLedgerIdInTx(tx, ledgerId);

        if (!after) {
          return notFoundError();
        }

        const fifoAffectedProductIds = getChangedInventoryProductIds(
          before,
          after,
          parsed.data.acknowledgedCarryoverProductIds,
        );
        const invalidation = await invalidateCarryoverDependentsInTx(tx, {
          sourceLedgerId: before.id,
          productIds: fifoAffectedProductIds,
          actorId: actor.user.id,
          reason: parsed.data.reason,
        });
        invalidatedTargetLedgerIds = invalidation.targetLedgerIds;
        const supersededCorrectionCount =
          await supersedeActiveCorrectionsForTargetsInTx(tx, {
            dailyLedgerId: before.id,
            supersededById: actor.user.id,
            targets: [
              ...before.items.map((item) => ({
                targetType: "INVENTORY_ROW" as const,
                targetId: item.id,
              })),
              ...inventoryCalculatedMetricTargets(
                before.id,
                fifoAffectedProductIds.length > 0,
              ),
              ...priceCalculatedMetricTargets(
                before.id,
                lossPriceSync.changedProductIds.length > 0,
              ),
            ],
          });

        await writeAuditLog(tx, {
          action: "ledger.hq.inventory.saved",
          targetType: "DailyLedger",
          targetId: before.id,
          actorId: actor.user.id,
          before: {
            ...effectiveBefore,
            ledgerStatusAtEdit: before.status,
            closedEdit: before.status === "HEADQUARTERS_CLOSED",
            hqEditContext: {
              closedLedgerEdit: before.status === "HEADQUARTERS_CLOSED",
            },
          },
          after: {
            ...after,
            ledgerStatusAtEdit: before.status,
            closedEdit: before.status === "HEADQUARTERS_CLOSED",
            hqEditContext: {
              closedLedgerEdit: after.status === "HEADQUARTERS_CLOSED",
              supersededCorrectionCount,
              fifoAffectedProductIds,
              priceChangedProductIds,
              lossPriceChangedProductIds: lossPriceSync.changedProductIds,
              deletedProductIds: [...deletedProductIds],
              acknowledgedCarryoverProductIds:
                parsed.data.acknowledgedCarryoverProductIds,
            },
          },
          reason: parsed.data.reason,
        });

        return actionOk(applyInventoryFormDisplayPolicy(after));
      },
    );

    if (result.ok) {
      revalidateHqInventoryPaths(ledgerId);
      invalidatedTargetLedgerIds.forEach(revalidateLedgerDetailPath);
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

  const actor = await getHqInventoryMutationActor();
  const { ledgerId } = parsed.data;
  await requireHeadquartersStoreScope(parsed.data.storeId);
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsed.data.ledgerUpdatedAt);

  if (!expectedUpdatedAt) {
    return await db.$transaction((tx) =>
      hqInventoryConflictError(tx, "inventory-adjustment", parsed.data),
    );
  }

  let invalidatedTargetLedgerIds: string[] = [];

  try {
    const result = await db.$transaction<ActionResult<InventoryStepData>>(
      async (tx) => {
        const beforeResult = ensureTargetInventory(
          await getInventoryStepDataByLedgerIdInTx(tx, ledgerId),
          parsed.data.storeId,
          actor.allowClosedEdit,
        );

        if (!beforeResult.ok) {
          return beforeResult;
        }

        const before = beforeResult.data;
        const effectiveBefore = applyActiveInventoryCorrections(
          before,
          await getActiveCorrectionsForLedgerInTx(tx, ledgerId),
        );
        const line = before.items.find(
          (item) => item.productId === parsed.data.productId,
        );
        const effectiveLine = effectiveBefore.items.find(
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

        if (
          getInventoryQuantityRelation({
            previousQuantity: line.previousQuantity,
            purchasedQuantity: line.purchasedQuantity,
            lossQuantity: line.lossQuantity,
            currentQuantity: parsed.data.actualQuantity,
          }) !== "OVERSTOCK"
        ) {
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

        const updated = await updateHqLedgerMutationTokenInTx(tx, {
          ledgerId,
          expectedUpdatedAt,
          actorId: actor.user.id,
          allowClosedEdit: actor.allowClosedEdit,
        });

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

        const fifoAffectedProductIds =
          line.currentQuantity !== adjustment.afterQuantity
            ? [line.productId]
            : [];
        const invalidation = await invalidateCarryoverDependentsInTx(tx, {
          sourceLedgerId: before.id,
          productIds: fifoAffectedProductIds,
          actorId: actor.user.id,
          reason: parsed.data.reason,
        });
        invalidatedTargetLedgerIds = invalidation.targetLedgerIds;
        const supersededCorrectionCount =
          await supersedeActiveCorrectionsForTargetsInTx(tx, {
            dailyLedgerId: before.id,
            supersededById: actor.user.id,
            targets: [
              {
                targetType: "INVENTORY_ROW",
                targetId: line.id,
              },
              ...adjustmentCalculatedMetricTargets(
                before.id,
                fifoAffectedProductIds.length > 0,
              ),
            ],
          });
        const afterLine = after.items.find(
          (item) => item.productId === line.productId,
        );

        await writeAuditLog(tx, {
          action: "ledger.hq.inventory_adjustment.saved",
          targetType: "DailyLedger",
          targetId: before.id,
          actorId: actor.user.id,
          before: {
            ...(effectiveLine ?? line),
            ledgerStatusAtEdit: before.status,
            closedEdit: before.status === "HEADQUARTERS_CLOSED",
            hqEditContext: {
              closedLedgerEdit: before.status === "HEADQUARTERS_CLOSED",
            },
          },
          after: afterLine
            ? {
                ...afterLine,
                ledgerStatusAtEdit: before.status,
                closedEdit: before.status === "HEADQUARTERS_CLOSED",
                hqEditContext: {
                  closedLedgerEdit: after.status === "HEADQUARTERS_CLOSED",
                  supersededCorrectionCount,
                  fifoAffectedProductIds,
                },
              }
            : null,
          reason: parsed.data.reason,
        });

        return actionOk(applyInventoryFormDisplayPolicy(after));
      },
    );

    if (result.ok) {
      revalidateHqInventoryPaths(ledgerId);
      invalidatedTargetLedgerIds.forEach(revalidateLedgerDetailPath);
    }

    return result;
  } catch {
    return mapHqActionError();
  }
}
