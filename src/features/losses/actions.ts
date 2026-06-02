"use server";

import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { reconcileLedgerInventoryAdjustments } from "~/features/inventory/adjustment-reconciliation";
import { getInventoryStepDataInTx } from "~/features/inventory/queries";
import { writeAuditLog } from "~/server/audit";
import { requireStoreAccess } from "~/server/authz";
import { calculateSystemInventoryQuantity } from "~/server/calculations/inventory";
import { db } from "~/server/db";
import {
  ledgerLossesSchema,
  toFieldErrors,
  type LedgerLossesInput,
} from "./schemas";
import { getLossStepDataInTx } from "./queries";
import { type LossStepData } from "./types";

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

function mapStoreActionError(): ActionResult<never> {
  return actionError(
    "LEDGER_SAVE_FAILED",
    "저장에 실패했습니다. 다시 시도해 주세요.",
  );
}

function revalidateLossPaths() {
  revalidatePath("/app/store-entry/losses");
  revalidatePath("/app/store-entry/inventory");
  revalidatePath("/app/store-entry");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/reports/daily");
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
): Promise<ActionResult<LossStepData>> {
  const parsed = parseLedgerLossesInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const actor = await requireStoreAccess(parsed.data.storeId);

  try {
    const result = await db.$transaction(async (tx) => {
      const before = await getLossStepDataInTx(
        tx,
        parsed.data.storeId,
        actor.user.id,
      );
      const expectedUpdatedAt = new Date(parsed.data.ledgerUpdatedAt);

      if (
        Number.isNaN(expectedUpdatedAt.getTime()) ||
        before.updatedAt !== expectedUpdatedAt.toISOString()
      ) {
        return actionError<LossStepData>(
          "LEDGER_CONFLICT",
          "장부가 다른 화면에서 변경됐습니다. 새로고침 후 다시 시도해 주세요.",
        );
      }

      if (before.status === "HEADQUARTERS_CLOSED") {
        return actionError<LossStepData>(
          "LEDGER_CLOSED",
          "본사 마감된 장부는 원본 손실 입력으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.",
        );
      }

      if (before.status !== "IN_PROGRESS" && before.status !== "IN_REVIEW") {
        return actionError<LossStepData>(
          "LEDGER_NOT_EDITABLE",
          "저장에 실패했습니다. 다시 시도해 주세요.",
        );
      }

      const editableLedger = await tx.dailyLedger.updateMany({
        where: {
          id: before.id,
          status: { in: ["IN_PROGRESS", "IN_REVIEW"] },
          updatedAt: expectedUpdatedAt,
        },
        data: { updatedById: actor.user.id },
      });

      if (editableLedger.count !== 1) {
        return actionError<LossStepData>(
          "LEDGER_CONFLICT",
          "장부가 다른 화면에서 변경됐습니다. 새로고침 후 다시 시도해 주세요.",
        );
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
        const normalized = normalizeLossItem({
          loss,
          existing: existingById.get(loss.id),
          product: productsById.get(loss.productId),
          lossType: lossTypesById.get(loss.ledgerInputCodeId),
        });

        if (!normalized) {
          return actionError<LossStepData>(
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

      for (let index = 0; index < normalizedLosses.length; index += 1) {
        const loss = normalizedLosses[index]!;
        const line = inventoryLineByProductId.get(loss.productId);
        const availableAfterLoss = line
          ? calculateSystemInventoryQuantity({
              previousQuantity: line.previousQuantity,
              purchasedQuantity: line.purchasedQuantity,
              lossQuantity: lossQuantityByProductId.get(loss.productId) ?? 0,
            })
          : null;

        if (availableAfterLoss === null) {
          quantityErrors[`losses.${index}.quantity`] = [
            "손실 수량이 현재 재고 흐름보다 큽니다.",
          ];
        }
      }

      if (Object.keys(quantityErrors).length > 0) {
        return actionError<LossStepData>(
          "VALIDATION_ERROR",
          "입력값을 확인해 주세요.",
          quantityErrors,
        );
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

      return actionOk(after);
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
