"use server";

import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { reconcileLedgerInventoryAdjustments } from "~/features/inventory/adjustment-reconciliation";
import { getInventoryStepDataInTx } from "~/features/inventory/queries";
import { writeAuditLog } from "~/server/audit";
import { requireStoreManagerLedgerEditAccess } from "~/server/authz";
import { calculateSystemInventoryQuantity } from "~/server/calculations/inventory";
import { db } from "~/server/db";
import {
  revalidateDashboardAndReports,
  revalidateStoreEntryPaths,
} from "~/server/revalidation";
import {
  ledgerLossesSchema,
  ledgerLossesStoreAccessSchema,
  toFieldErrors,
  type LedgerLossesInput,
  type LedgerLossesStoreAccessInput,
} from "./schemas";
import { getLossStepDataInTx, toStoreManagerLossStepData } from "./queries";
import { getLossQuantityErrorMessage } from "./quantity-error";
import { type LossStepData, type StoreManagerLossStepData } from "./types";
import {
  getLedgerConflictMetaInTx,
  ledgerConflictErrorFromMeta,
} from "~/features/ledger/conflicts";
import {
  editableLedgerStatuses,
  getLedgerEditBlockReason,
  isLedgerEditable,
} from "~/features/ledger/status-policy";

function parseLedgerLossesInput(
  input: unknown,
): ActionResult<LedgerLossesInput> {
  const parsed = ledgerLossesSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function parseLedgerLossesStoreAccessInput(
  input: unknown,
): ActionResult<LedgerLossesStoreAccessInput> {
  const parsed = ledgerLossesStoreAccessSchema.safeParse(input);

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

function originalLossBlockedError(status: string): ActionResult<never> {
  const reason = getLedgerEditBlockReason(status, "loss-entry");

  return actionError(reason.code, reason.message);
}

function toLossConflictValues(data: StoreManagerLossStepData) {
  return Object.fromEntries(
    data.lossItems.map((item, index) => [
      `손실 ${index + 1}`,
      `${item.productName} / ${item.lossTypeName} / ${item.quantity}개 / ${item.reason}`,
    ]),
  );
}

function toLossClientValues(input: LedgerLossesInput) {
  return Object.fromEntries(
    input.losses.map((item, index) => [
      `손실 ${index + 1}`,
      `${item.productId} / ${item.ledgerInputCodeId} / ${item.quantity}개 / ${item.reason}`,
    ]),
  );
}

function revalidateLossPaths() {
  revalidateStoreEntryPaths(["losses", "inventory", "root"]);
  revalidateDashboardAndReports();
}

type ActiveProduct = {
  id: string;
  name: string;
  category: string;
  spec: string;
  defaultUnitPrice: number;
};

type ActiveLossType = {
  id: string;
  name: string;
};

type ExistingLossItem = LossStepData["lossItems"][number];

type NormalizedLossItem = {
  id: string | null;
  productId: string;
  ledgerInputCodeId: string;
  productName: string;
  productCategory: string;
  productSpec: string;
  unitPrice: number;
  lossTypeName: string;
  quantity: number;
  amount: number;
  reason: string;
};

function normalizeLossItem({
  loss,
  existing,
  product,
  lossType,
}: {
  loss: LedgerLossesInput["losses"][number];
  existing: ExistingLossItem | undefined;
  product: ActiveProduct | undefined;
  lossType: ActiveLossType | undefined;
}): NormalizedLossItem | null {
  const preservesExistingSnapshot =
    existing?.productId === loss.productId &&
    existing.ledgerInputCodeId === loss.ledgerInputCodeId;

  if (preservesExistingSnapshot) {
    return {
      id: existing.id,
      productId: existing.productId,
      ledgerInputCodeId: existing.ledgerInputCodeId,
      productName: existing.productName,
      productCategory: existing.productCategory,
      productSpec: existing.productSpec,
      unitPrice: existing.unitPrice,
      lossTypeName: existing.lossTypeName,
      quantity: loss.quantity,
      amount: loss.amount,
      reason: loss.reason,
    };
  }

  if (!product || !lossType) {
    return null;
  }

  return {
    id: existing?.id ?? null,
    productId: product.id,
    ledgerInputCodeId: lossType.id,
    productName: product.name,
    productCategory: product.category,
    productSpec: product.spec,
    unitPrice: product.defaultUnitPrice,
    lossTypeName: lossType.name,
    quantity: loss.quantity,
    amount: loss.amount,
    reason: loss.reason,
  };
}

export async function saveLedgerLosses(
  input: unknown,
): Promise<ActionResult<StoreManagerLossStepData>> {
  const access = parseLedgerLossesStoreAccessInput(input);

  if (!access.ok) {
    return access;
  }

  const actor = await requireStoreManagerLedgerEditAccess(access.data.storeId);

  const parsed = parseLedgerLossesInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const before = await getLossStepDataInTx(
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
        return ledgerConflictErrorFromMeta<StoreManagerLossStepData>({
          meta,
          ledgerId: parsed.data.ledgerId,
          section: "losses",
          clientToken: parsed.data.version,
          clientValues: toLossClientValues(parsed.data),
          serverValues: toLossConflictValues(
            toStoreManagerLossStepData(before),
          ),
          reloadRequired: true,
        });
      }

      if (!isLedgerEditable(before.status)) {
        return originalLossBlockedError(before.status);
      }

      const productIds = [
        ...new Set(parsed.data.losses.map((loss) => loss.productId)),
      ];
      const lossTypeIds = [
        ...new Set(parsed.data.losses.map((loss) => loss.ledgerInputCodeId)),
      ];
      const [products, lossTypes] = await Promise.all([
        tx.product.findMany({
          where: { id: { in: productIds }, isActive: true },
          select: {
            id: true,
            name: true,
            category: true,
            spec: true,
            defaultUnitPrice: true,
          },
        }),
        tx.ledgerInputCode.findMany({
          where: {
            id: { in: lossTypeIds },
            group: "LOSS_TYPE",
            isActive: true,
          },
          select: { id: true, name: true },
        }),
      ]);
      const productsById = new Map(
        products.map((product) => [product.id, product]),
      );
      const lossTypesById = new Map(
        lossTypes.map((lossType) => [lossType.id, lossType]),
      );
      const existingById = new Map(
        before.lossItems.map((lossItem) => [lossItem.id, lossItem]),
      );
      const normalizedLosses: NormalizedLossItem[] = [];

      for (let index = 0; index < parsed.data.losses.length; index += 1) {
        const loss = parsed.data.losses[index]!;
        const existing = existingById.get(loss.id);

        const normalized = normalizeLossItem({
          loss,
          existing,
          product: productsById.get(loss.productId),
          lossType: lossTypesById.get(loss.ledgerInputCodeId),
        });

        if (!normalized) {
          return actionError<StoreManagerLossStepData>(
            "VALIDATION_ERROR",
            "입력값을 확인해 주세요.",
            {
              [`losses.${index}.productId`]: ["품목을 확인해 주세요."],
              [`losses.${index}.ledgerInputCodeId`]: [
                "손실 유형을 확인해 주세요.",
              ],
            },
          );
        }

        normalizedLosses.push(normalized);
      }

      const inventoryData = await getInventoryStepDataInTx(
        tx,
        parsed.data.storeId,
        parsed.data.closingDate,
        actor.user.id,
      );
      const inventoryLineByProductId = new Map(
        inventoryData.items.map((item) => [item.productId, item]),
      );
      const lossQuantityByProductId = new Map<string, number>();

      for (const loss of normalizedLosses) {
        lossQuantityByProductId.set(
          loss.productId,
          (lossQuantityByProductId.get(loss.productId) ?? 0) + loss.quantity,
        );
      }

      const quantityErrors: Record<string, string[]> = {};
      let firstQuantityError: string | null = null;

      for (let index = 0; index < normalizedLosses.length; index += 1) {
        const loss = normalizedLosses[index]!;
        const line = inventoryLineByProductId.get(loss.productId);
        const requestedLossQuantity =
          lossQuantityByProductId.get(loss.productId) ?? 0;
        const availableAfterLoss = line
          ? calculateSystemInventoryQuantity({
              previousQuantity: line.previousQuantity,
              purchasedQuantity: line.purchasedQuantity,
              lossQuantity: requestedLossQuantity,
            })
          : null;

        if (availableAfterLoss === null) {
          const message = getLossQuantityErrorMessage({
            productName: loss.productName,
            productSpec: loss.productSpec,
            previousQuantity: line?.previousQuantity ?? null,
            purchasedQuantity: line?.purchasedQuantity ?? null,
            requestedLossQuantity,
          });

          firstQuantityError ??= message;
          quantityErrors[`losses.${index}.quantity`] = [message];
        }
      }

      if (Object.keys(quantityErrors).length > 0) {
        return actionError<StoreManagerLossStepData>(
          "VALIDATION_ERROR",
          firstQuantityError ?? "입력값을 확인해 주세요.",
          quantityErrors,
        );
      }

      const editableLedger = await tx.dailyLedger.updateMany({
        where: {
          id: before.id,
          status: { in: [...editableLedgerStatuses] },
          version: parsed.data.version,
        },
        data: { updatedById: actor.user.id, version: { increment: 1 } },
      });

      if (editableLedger.count !== 1) {
        const meta = await getLedgerConflictMetaInTx(tx, before.id);
        return ledgerConflictErrorFromMeta<StoreManagerLossStepData>({
          meta,
          ledgerId: parsed.data.ledgerId,
          section: "losses",
          clientToken: parsed.data.version,
          clientValues: toLossClientValues(parsed.data),
          serverValues: toLossConflictValues(
            toStoreManagerLossStepData(before),
          ),
          reloadRequired: true,
        });
      }

      const existingIdsToKeep = normalizedLosses
        .map((loss) => loss.id)
        .filter((id): id is string => id !== null && existingById.has(id));

      await tx.ledgerLossItem.deleteMany({
        where:
          existingIdsToKeep.length > 0
            ? { dailyLedgerId: before.id, id: { notIn: existingIdsToKeep } }
            : { dailyLedgerId: before.id },
      });

      for (const loss of normalizedLosses) {
        const data = {
          productId: loss.productId,
          ledgerInputCodeId: loss.ledgerInputCodeId,
          productName: loss.productName,
          productCategory: loss.productCategory,
          productSpec: loss.productSpec,
          unitPrice: loss.unitPrice,
          lossTypeName: loss.lossTypeName,
          quantity: loss.quantity,
          amount: loss.amount,
          reason: loss.reason,
          updatedById: actor.user.id,
        };

        if (loss.id && existingById.has(loss.id)) {
          await tx.ledgerLossItem.update({
            where: { id: loss.id },
            data,
          });
          continue;
        }

        await tx.ledgerLossItem.create({
          data: {
            dailyLedgerId: before.id,
            ...data,
            createdById: actor.user.id,
          },
        });
      }

      await reconcileLedgerInventoryAdjustments(tx, before.id, actor.user.id);

      const after = await getLossStepDataInTx(
        tx,
        parsed.data.storeId,
        parsed.data.closingDate,
        actor.user.id,
      );

      await writeAuditLog(tx, {
        action: "ledger.losses.saved",
        targetType: "DailyLedger",
        targetId: before.id,
        actorId: actor.user.id,
        before,
        after,
      });

      return actionOk(toStoreManagerLossStepData(after));
    });

    if (!result.ok) {
      return result;
    }

    revalidateLossPaths();

    return result;
  } catch {
    return mapStoreActionError();
  }
}
