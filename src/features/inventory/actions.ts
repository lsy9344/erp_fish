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
  ledgerStoreManagerInventorySchema,
  toFieldErrors,
  type LedgerInventoryAdjustmentInput,
  type LedgerStoreManagerInventoryInput,
  type LedgerInventoryStoreAccessInput,
} from "./schemas";
import {
  applyInventoryAdjustmentReasonsInTx,
  reconcileLedgerInventoryAdjustments,
} from "./adjustment-reconciliation";
import {
  getLedgerInventoryFifoAmountErrorProductIdsInTx,
  refreshLedgerInventoryFifoLots,
} from "./fifo-lots";
import {
  buildManualInventoryRows,
  getManualInventoryUnitPriceErrors,
} from "./manual-inventory-rows";
import { upsertInventorySalesPricePlansInTx } from "./sales-price-persistence";
import { shouldPersistInventoryLine } from "./inventory-persist-policy";
import {
  getInventorySaveAdjustmentErrors,
  getInventorySaveRequiredEntryErrors,
  missingLossReviewMessage,
  missingAdjustmentReasonMessage,
  missingRequiredCurrentQuantityMessage,
} from "./adjustment-save-guard";
import { persistLedgerInventoryCarryoverDetails } from "./carryover-detail-persistence";
import {
  applyInventoryFormDisplayPolicy,
  isHiddenZeroStockInventoryItem,
} from "./inventory-zero-stock-display.ts";
import {
  getInventoryStepDataByLedgerIdInTx,
  getInventoryStepDataInTx,
  toStoreManagerInventoryStepDataInTx,
} from "./queries";
import { buildInventoryConflictServerValues } from "./sales-price-carryover.ts";
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

type InventoryItemWithPlannedPrice =
  LedgerStoreManagerInventoryInput["items"][number];

const invalidInventoryTargetMessage =
  "저장할 재고 품목이 현재 대상과 일치하지 않습니다. 새로고침 후 다시 시도해 주세요.";
const invalidInventoryAmountMessage =
  "재고금액을 계산할 수 없습니다. 수량과 매입단가를 확인해 주세요.";

function getInventoryTargetErrors(
  targetProductIds: ReadonlySet<string>,
  inputItems: InventoryItemWithPlannedPrice[],
  activeManualProductIds: ReadonlySet<string>,
  // 표시 정책으로 숨긴 0재고 품목은 폼에 없어 미제출이 정상이다.
  omittableProductIds: ReadonlySet<string> = new Set(),
) {
  const errors: Record<string, string[]> = {};
  const firstIndexByProductId = new Map<string, number>();

  inputItems.forEach((item, index) => {
    const firstIndex = firstIndexByProductId.get(item.productId);

    if (firstIndex !== undefined) {
      errors[`items.${index}.productId`] = [
        "같은 품목을 중복 저장할 수 없습니다.",
      ];
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
    if (
      !firstIndexByProductId.has(productId) &&
      !omittableProductIds.has(productId)
    ) {
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
      const systemQuantity = calculateSystemInventoryQuantity({
        previousQuantity: before.previousQuantity,
        purchasedQuantity: before.purchasedQuantity,
        lossQuantity: before.lossQuantity,
      });

      if (
        systemQuantity !== null &&
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

function parseLedgerInventoryInput(
  input: unknown,
): ActionResult<LedgerStoreManagerInventoryInput> {
  const parsed = ledgerStoreManagerInventorySchema.safeParse(input);

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
  return buildInventoryConflictServerValues(data.items);
}

function toInventoryClientValues(input: LedgerStoreManagerInventoryInput) {
  return Object.fromEntries(
    input.items.map((item) => [
      item.productId,
      `당일재고 ${item.currentQuantity ?? "-"} / 표시재고 ${item.quantity ?? "-"} / 판매한 가격 ${item.plannedUnitPrice}`,
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
  input: LedgerStoreManagerInventoryInput | LedgerInventoryAdjustmentInput,
): Promise<ActionResult<never>> {
  const snapshot = await db.$transaction(async (tx) => {
    const current = await getInventoryStepDataByLedgerIdInTx(
      tx,
      input.ledgerId,
    );
    const meta = await getLedgerConflictMetaInTx(tx, input.ledgerId);

    return {
      data: current
        ? await toStoreManagerInventoryStepDataInTx(
            tx,
            applyInventoryFormDisplayPolicy(current),
          )
        : null,
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
        ? toInventoryClientValues(input as LedgerStoreManagerInventoryInput)
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

  // 저장 체감 시간은 배포 환경에 따라 자릿수가 다르다. 프로덕션 함수는 iad1, Neon은
  // us-east-1로 같은 리전이라 쿼리당 수 ms지만, 한국에서 띄운 로컬 dev 서버는 원격 DB에
  // 쿼리당 약 200~400ms를 낸다(= 이 저장 경로 65쿼리로 20초대). 어느 쪽이 사용자 체감인지
  // 로그 없이는 알 수 없어 단계 시간을 남긴다. Vercel 런타임 로그에서 확인한다.
  const startedAt = Date.now();
  let beforeReadMs = 0;

  try {
    const result = await db.$transaction(
      async (tx) => {
        const before = await getInventoryStepDataInTx(
          tx,
          parsed.data.storeId,
          parsed.data.closingDate,
          actor.user.id,
        );
        beforeReadMs = Date.now() - startedAt;

        if (
          before.id !== parsed.data.ledgerId ||
          before.version !== parsed.data.version
        ) {
          throw new Error("LEDGER_CONFLICT");
        }

        if (!isLedgerEditable(before.status)) {
          throw originalInventoryBlockedError(before.status);
        }

        const inputItems = parsed.data.items;
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
          new Set(
            before.items
              .filter(isHiddenZeroStockInventoryItem)
              .map((item) => item.productId),
          ),
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
        // 오류 인덱스는 제출 품목 순서에 맞추고, 미제출 필수 품목도 차단한다.
        const requiredEntryErrors = getInventorySaveRequiredEntryErrors(
          before.items,
          inputItems,
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

        const beforeByProductId = new Map(
          before.items.map((item) => [item.productId, item]),
        );
        const adjustmentErrors = getInventorySaveAdjustmentErrors(
          inputItems.map((inputItem) => {
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

            return {
              productId: beforeItem.productId,
              previousQuantity: beforeItem.previousQuantity,
              purchasedQuantity: beforeItem.purchasedQuantity,
              lossQuantity: beforeItem.lossQuantity,
              carryoverSource: beforeItem.carryoverSource,
              carryoverStatus: beforeItem.carryoverStatus,
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
        const manualUnitPriceError = Object.values(
          manualUnitPriceErrors,
        )[0]?.[0];

        if (manualUnitPriceError) {
          return actionError<StoreManagerInventoryStepData>(
            "VALIDATION_ERROR",
            manualUnitPriceError,
            manualUnitPriceErrors,
          );
        }

        // CAS 전에 최종 저장 행을 확정한다. 이후 validation이 실패해도 version/재고/계획/
        // 손실/audit 중 어느 것도 변경되지 않는다.
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
              inventoryAmount: calculateInventoryAmount(
                quantity,
                item.unitPrice,
              ),
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
        const manualRows = await buildManualInventoryRows(
          tx,
          before.id,
          existingProductIds,
          inputItems,
          actor.user.id,
        );
        rowsToPersist.push(...manualRows);

        const businessDate = getKstBusinessDate(parsed.data.closingDate);
        const fifoPreflight =
          await getLedgerInventoryFifoAmountErrorProductIdsInTx(
            tx,
            before.id,
            businessDate,
            rowsToPersist,
          );

        if (fifoPreflight.invalidProductIds.length > 0) {
          const invalidProductIds = new Set(fifoPreflight.invalidProductIds);
          const fifoAmountErrors = Object.fromEntries(
            inputItems.flatMap((item, index) =>
              invalidProductIds.has(item.productId)
                ? [[`items.${index}.quantity`, [invalidInventoryAmountMessage]]]
                : [],
            ),
          );

          return actionError<StoreManagerInventoryStepData>(
            "VALIDATION_ERROR",
            invalidInventoryAmountMessage,
            fifoAmountErrors,
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
        await refreshLedgerInventoryFifoLots(
          tx,
          before.id,
          fifoPreflight.snapshotsByProductId,
        );

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

        // Audit keeps exact-date values. Store-manager form response applies the
        // zero-stock display policy so hidden rows do not reappear after save.
        return toStoreManagerInventoryStepDataInTx(
          tx,
          applyInventoryFormDisplayPolicy(after),
        );
      },
      // 벌크 쓰기로 왕복을 120→65회로 줄인 뒤에도 41품목 장부 실측이 24.5초다(원격
      // Neon, 왕복 약 190ms). 전역 기본값 30s와 5.5초 차이라 품목이 조금만 늘어도 다시
      // P2028로 죽는다. db.ts 주석의 안내대로 이 호출만 넉넉히 올려 실패 모드를 없앤다.
      // ponytail: 남은 24.5초 중 14.9초가 before/after 재조회 두 번(44쿼리)이다. 근본
      // 개선은 queries.ts의 매입이력 스캔(비활성 품목 303개까지 344 productId를 하한
      // 날짜 없이 조회)을 좁히고, after 재조회+감사 로그를 트랜잭션 밖으로 빼는 것.
      { timeout: 60_000 },
    );

    if ("ok" in result) {
      return result;
    }

    console.info(
      `[inventory.save] ledger=${parsed.data.ledgerId} items=${parsed.data.items.length} beforeRead=${beforeReadMs}ms total=${Date.now() - startedAt}ms`,
    );

    revalidateInventoryPaths();
    revalidateLedgerDetailPath(parsed.data.ledgerId);

    return actionOk(result);
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
