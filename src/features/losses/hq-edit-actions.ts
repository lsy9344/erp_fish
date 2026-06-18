"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Prisma } from "../../../generated/prisma";
import { reconcileLedgerInventoryAdjustments } from "~/features/inventory/adjustment-reconciliation";
import { getInventoryStepDataByLedgerIdInTx } from "~/features/inventory/queries";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import {
  getLedgerConflictMetaInTx,
  ledgerConflictErrorFromMeta,
} from "~/features/ledger/conflicts";
import { writeAuditLog } from "~/server/audit";
import {
  requireLedgerHqEditAccess,
  requireHeadquartersStoreScope,
} from "~/server/authz";
import { calculateSystemInventoryQuantity } from "~/server/calculations/inventory";
import { db } from "~/server/db";
import { getLossStepDataByLedgerIdInTx } from "./queries";
import { getLossQuantityErrorMessage } from "./quantity-error";
import { toFieldErrors } from "./schemas";
import { type LossStepData } from "./types";

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

const MAX_KRW_INTEGER = 2_147_483_647;

function isValidInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_KRW_INTEGER;
}

function parseRequiredInteger(
  value: unknown,
  context: z.RefinementCtx,
  errorMessage: string,
) {
  if (typeof value === "number" && isValidInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);

      if (isValidInteger(parsed)) {
        return parsed;
      }
    }
  }

  context.addIssue({ code: z.ZodIssueCode.custom, message: errorMessage });

  return z.NEVER;
}

const requiredIdSchema = (message: string) =>
  z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, message));

const hqLedgerLossItemSchema = z.object({
  id: z
    .unknown()
    .transform((value) => (typeof value === "string" ? value.trim() : "")),
  productId: requiredIdSchema("품목을 선택해 주세요."),
  ledgerInputCodeId: requiredIdSchema("손실 유형을 선택해 주세요."),
  quantity: z
    .unknown()
    .transform((value, context) =>
      parseRequiredInteger(value, context, "수량은 0 이상의 정수여야 합니다."),
    ),
  amount: z
    .unknown()
    .transform((value, context) =>
      parseRequiredInteger(
        value,
        context,
        "손실 금액은 0원 이상의 정수여야 합니다.",
      ),
    ),
  reason: z.unknown().transform((value, context) => {
    if (typeof value === "string") {
      const trimmed = value.trim();

      if (trimmed.length > 0 && trimmed.length <= 500) {
        return trimmed;
      }
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "사유/특이사항을 입력해 주세요.",
    });

    return z.NEVER;
  }),
});

const hqLedgerLossesSchema = z
  .object({
    storeId: requiredIdSchema("지점을 확인해 주세요."),
    ledgerUpdatedAt: requiredIdSchema("장부 상태를 확인해 주세요."),
    losses: z.array(hqLedgerLossItemSchema),
  })
  .superRefine((value, context) => {
    value.losses.forEach((loss, index) => {
      if (
        typeof loss.quantity !== "number" ||
        typeof loss.amount !== "number" ||
        !isValidInteger(loss.quantity) ||
        !isValidInteger(loss.amount)
      ) {
        return;
      }

      if (loss.quantity === 0 && loss.amount === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "수량 또는 손실액 중 하나는 0보다 커야 합니다.",
          path: ["losses", index, "quantity"],
        });
      }
    });
  });

type HqLedgerLossesInput = z.infer<typeof hqLedgerLossesSchema>;

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

const ledgerIdInputSchema = z.object({
  ledgerId: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "장부를 확인해 주세요.")),
});

function parseHqLossesInput(
  input: unknown,
): ActionResult<HqLedgerLossesInput & { ledgerId: string; reason: string }> {
  const parsed = hqLedgerLossesSchema.safeParse(input);
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
    reason: parsedReason.data.reason,
  });
}

function revalidateHqLossPaths(ledgerId: string) {
  revalidatePath(`/app/ledgers/${ledgerId}`);
  revalidatePath("/app/dashboard");
  revalidatePath("/app/store-entry");
  revalidatePath("/app/store-entry/inventory");
  revalidatePath("/app/store-entry/losses");
  revalidatePath("/app/reports/daily");
  revalidatePath("/app/reports/comparison");
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

function notEditableError(status: LossStepData["status"]): ActionResult<never> {
  if (status === "HEADQUARTERS_CLOSED") {
    return actionError(
      "LEDGER_CLOSED",
      "본사 마감된 장부는 원본 손실 입력으로 수정할 수 없습니다. 정정 기록을 사용해 주세요.",
    );
  }

  if (status === "HOLIDAY") {
    return actionError(
      "LEDGER_NOT_EDITABLE",
      "휴무 장부는 원본 손실 입력으로 수정할 수 없습니다.",
    );
  }

  return actionError("LEDGER_NOT_EDITABLE", "수정할 수 없는 장부 상태입니다.");
}

function ensureTargetLossData(
  data: LossStepData | null,
  storeId: string,
): ActionResult<LossStepData> {
  if (data?.storeId !== storeId) {
    return notFoundError();
  }

  if (data.status !== "IN_PROGRESS" && data.status !== "IN_REVIEW") {
    return notEditableError(data.status);
  }

  return actionOk(data);
}

function toLossConflictValues(data: LossStepData) {
  return Object.fromEntries(
    data.lossItems.map((item, index) => [
      `손실 ${index + 1}`,
      `${item.productName} / ${item.lossTypeName} / ${item.quantity}개 / ${item.amount}원 / ${item.reason}`,
    ]),
  );
}

function toLossClientValues(input: HqLedgerLossesInput) {
  return Object.fromEntries(
    input.losses.map((item, index) => [
      `손실 ${index + 1}`,
      `${item.productId} / ${item.ledgerInputCodeId} / ${item.quantity}개 / ${item.amount}원 / ${item.reason}`,
    ]),
  );
}

async function hqLossConflictError<T = never>(
  tx: Prisma.TransactionClient,
  input: HqLedgerLossesInput & { ledgerId: string },
): Promise<ActionResult<T>> {
  const [current, meta] = await Promise.all([
    getLossStepDataByLedgerIdInTx(tx, input.ledgerId),
    getLedgerConflictMetaInTx(tx, input.ledgerId),
  ]);

  return ledgerConflictErrorFromMeta<T>({
    meta,
    ledgerId: input.ledgerId,
    section: "losses",
    clientToken: input.ledgerUpdatedAt,
    serverToken:
      current?.updatedAt ?? meta?.updatedAt.toISOString() ?? "unknown",
    clientValues: toLossClientValues(input),
    serverValues: current ? toLossConflictValues(current) : {},
    lastModifiedAt: current?.updatedAt,
    reloadRequired: true,
    hqEditing: true,
  });
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

function normalizeLossItem({
  loss,
  existing,
  product,
  lossType,
}: {
  loss: HqLedgerLossesInput["losses"][number];
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

export async function saveHqLedgerLosses(
  input: unknown,
): Promise<ActionResult<LossStepData>> {
  const parsed = parseHqLossesInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const actor = { user: await requireLedgerHqEditAccess() };
  const { ledgerId } = parsed.data;
  await requireHeadquartersStoreScope(parsed.data.storeId);

  try {
    const result = await db.$transaction<ActionResult<LossStepData>>(
      async (tx) => {
        const beforeResult = ensureTargetLossData(
          await getLossStepDataByLedgerIdInTx(tx, ledgerId),
          parsed.data.storeId,
        );

        if (!beforeResult.ok) {
          return beforeResult;
        }

        const before = beforeResult.data;
        const expectedUpdatedAt = new Date(parsed.data.ledgerUpdatedAt);

        if (
          Number.isNaN(expectedUpdatedAt.getTime()) ||
          before.updatedAt !== expectedUpdatedAt.toISOString()
        ) {
          return await hqLossConflictError<LossStepData>(tx, parsed.data);
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

        const inventoryData = await getInventoryStepDataByLedgerIdInTx(
          tx,
          ledgerId,
        );

        if (!inventoryData) {
          return notFoundError();
        }

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
          return actionError<LossStepData>(
            "VALIDATION_ERROR",
            firstQuantityError ?? "입력값을 확인해 주세요.",
            quantityErrors,
          );
        }

        const updated = await markEditableLedgerInTx(
          tx,
          ledgerId,
          expectedUpdatedAt,
          actor.user.id,
        );

        if (!updated) {
          return await hqLossConflictError<LossStepData>(tx, parsed.data);
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

        const after = await getLossStepDataByLedgerIdInTx(tx, ledgerId);

        if (!after) {
          return notFoundError();
        }

        await writeAuditLog(tx, {
          action: "ledger.hq.losses.saved",
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
      revalidateHqLossPaths(ledgerId);
    }

    return result;
  } catch {
    return mapHqActionError();
  }
}
