"use server";

import { z } from "zod";

import type { Prisma } from "../../../generated/prisma";
import {
  supersedeActiveCorrectionsForTargetsInTx,
  type ActiveCorrectionSupersedeTarget,
} from "~/features/corrections/actions";
import { getActiveCorrectionsForLedgerInTx } from "~/features/corrections/queries";
import { reconcileLedgerInventoryAdjustments } from "~/features/inventory/adjustment-reconciliation";
import { refreshLedgerInventoryFifoLots } from "~/features/inventory/fifo-lots";
import { getInventoryStepDataByLedgerIdInTx } from "~/features/inventory/queries";
import {
  invalidateCarryoverDependentsInTx,
  updateHqLedgerMutationTokenInTx,
} from "~/features/ledger/hq-mutation";
import {
  calculatePlannedPriceLossAmount,
  recoveredAmountError,
  isValidKrwInteger,
} from "~/features/losses/amount";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import {
  getLedgerConflictMetaInTx,
  ledgerConflictErrorFromMeta,
} from "~/features/ledger/conflicts";
import {
  getLedgerEditBlockReason,
  isLedgerEditableByHeadquarters,
} from "~/features/ledger/status-policy";
import { writeAuditLog } from "~/server/audit";
import {
  hasLedgerClosedEditAccess,
  requireLedgerHqEditAccess,
  requireHeadquartersStoreScope,
} from "~/server/authz";
import { calculateSystemInventoryQuantity } from "~/server/calculations/inventory";
import { db } from "~/server/db";
import {
  consumeStoredLossQuantity,
  getLossQuantityIdentity,
  isNonNegativeTwoDecimalInRange,
  parseRequiredNonNegativeTwoDecimal,
} from "~/lib/validation";
import {
  revalidateDashboardAndReports,
  revalidateLedgerDetailPath,
  revalidateStoreEntryPaths,
} from "~/server/revalidation";
import { getLossStepDataByLedgerIdInTx } from "./queries";
import { getLossQuantityErrorMessage } from "./quantity-error";
import { toFieldErrors } from "./schemas";
import { lossTerms } from "./terms";
import { type LossStepData } from "./types";

type ActiveProduct = {
  id: string;
  name: string;
  category: string;
  spec: string;
};

type ActiveLossType = {
  id: string;
  name: string;
};

type ExistingLossItem = LossStepData["lossItems"][number];
type ResolvedLossInput = HqLedgerLossesInput["losses"][number] & {
  quantity: number;
};

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
  recoveredAmount: number;
  amount: number;
  usedPlannedPrice: boolean;
  reason: string;
};

function isValidInteger(value: number) {
  return isValidKrwInteger(value);
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
      value === null
        ? null
        : parseRequiredNonNegativeTwoDecimal(
            value,
            context,
            lossTerms.quantityInvalid,
          ),
    ),
  recoveredAmount: z
    .unknown()
    .transform((value, context) =>
      parseRequiredInteger(value, context, recoveredAmountError),
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
      message: lossTerms.reasonRequired,
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
      if (loss.quantity === null && !loss.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: lossTerms.quantityInvalid,
          path: ["losses", index, "quantity"],
        });
      }

      if (
        typeof loss.quantity !== "number" ||
        typeof loss.recoveredAmount !== "number" ||
        !isNonNegativeTwoDecimalInRange(loss.quantity) ||
        !isValidInteger(loss.recoveredAmount)
      ) {
        return;
      }

      if (loss.quantity === 0 && loss.recoveredAmount === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: lossTerms.positiveValueRequired,
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
  revalidateLedgerDetailPath(ledgerId);
  revalidateStoreEntryPaths();
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

function notEditableError(status: LossStepData["status"]): ActionResult<never> {
  const reason = getLedgerEditBlockReason(status, "loss-entry");

  return actionError(reason.code, reason.message);
}

function ensureTargetLossData(
  data: LossStepData | null,
  storeId: string,
  allowClosedEdit: boolean,
): ActionResult<LossStepData> {
  if (data?.storeId !== storeId) {
    return notFoundError();
  }

  if (!isLedgerEditableByHeadquarters(data.status, allowClosedEdit)) {
    return notEditableError(data.status);
  }

  return actionOk(data);
}

async function getHqLossMutationActor() {
  const user = await requireLedgerHqEditAccess();
  const allowClosedEdit = await hasLedgerClosedEditAccess(user.id);

  return { user, allowClosedEdit };
}

function toLossConflictValues(data: LossStepData) {
  return Object.fromEntries(
    data.lossItems.map((item, index) => [
      `손실 ${index + 1}`,
      `${item.productName} / ${item.lossTypeName} / ${lossTerms.quantity} ${item.quantity}개 / ${lossTerms.recoveredAmount} ${item.recoveredAmount}원 / ${item.reason}`,
    ]),
  );
}

function toLossClientValues(input: HqLedgerLossesInput) {
  return Object.fromEntries(
    input.losses.map((item, index) => [
      `손실 ${index + 1}`,
      `${item.productId} / ${item.ledgerInputCodeId} / ${lossTerms.quantity} ${item.quantity}개 / ${lossTerms.recoveredAmount} ${item.recoveredAmount}원 / ${item.reason}`,
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

function normalizeLossItem({
  loss,
  existing,
  product,
  lossType,
}: {
  loss: ResolvedLossInput;
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
      recoveredAmount: loss.recoveredAmount,
      amount: existing.amount,
      usedPlannedPrice: existing.usedPlannedPrice,
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
    // 가격 정책 전환(2026-06-24): 품목 마스터 단가를 손실 단가로 쓰지 않는다.
    // 실제 단가/금액은 판매한 가격이 있을 때만 아래에서 채운다(없으면 0·미산정).
    unitPrice: 0,
    lossTypeName: lossType.name,
    quantity: loss.quantity,
    recoveredAmount: loss.recoveredAmount,
    amount: 0,
    usedPlannedPrice: false,
    reason: loss.reason,
  };
}

function getChangedLossQuantityProductIds(
  before: ExistingLossItem[],
  after: NormalizedLossItem[],
) {
  const beforeById = new Map(before.map((item) => [item.id, item]));
  const afterById = new Map(
    after
      .filter((item): item is NormalizedLossItem & { id: string } =>
        Boolean(item.id),
      )
      .map((item) => [item.id, item]),
  );
  const affectedProductIds = new Set<string>();

  for (const item of before) {
    const next = afterById.get(item.id);

    if (
      next?.productId !== item.productId ||
      next?.quantity !== item.quantity
    ) {
      affectedProductIds.add(item.productId);
      if (next) affectedProductIds.add(next.productId);
    }
  }

  for (const item of after) {
    if (!item.id || !beforeById.has(item.id)) {
      affectedProductIds.add(item.productId);
    }
  }

  return [...affectedProductIds].sort();
}

function hasLossAmountInputChange(
  before: ExistingLossItem[],
  after: NormalizedLossItem[],
) {
  const beforeById = new Map(before.map((item) => [item.id, item]));

  return after.some((item) => {
    const existing = item.id ? beforeById.get(item.id) : undefined;

    return (
      existing?.recoveredAmount !== item.recoveredAmount ||
      existing?.unitPrice !== item.unitPrice ||
      existing?.amount !== item.amount
    );
  });
}

function calculatedMetricCorrectionTargets(
  ledgerId: string,
  fieldKeys: Array<"grossMarginRate" | "salesDifference" | "lossAmount">,
): ActiveCorrectionSupersedeTarget[] {
  return fieldKeys.map((fieldKey) => ({
    targetType: "CALCULATED_METRIC",
    targetId: ledgerId,
    fieldKey,
  }));
}

function getActiveLossCorrectionValues(
  records: Awaited<ReturnType<typeof getActiveCorrectionsForLedgerInTx>>,
) {
  const amountByTargetId = new Map<string, number>();
  const quantityByTargetId = new Map<string, number>();
  const reasonByTargetId = new Map<string, string>();

  for (const record of records) {
    if (record.targetType !== "LOSS_ROW") {
      continue;
    }

    const correctedValue = record.correctedValue;

    if (
      !correctedValue ||
      typeof correctedValue !== "object" ||
      Array.isArray(correctedValue)
    ) {
      continue;
    }

    if (
      record.fieldKey === "reason" &&
      correctedValue.kind === "text" &&
      (typeof correctedValue.value === "string" ||
        correctedValue.value === null) &&
      !reasonByTargetId.has(record.targetId)
    ) {
      reasonByTargetId.set(record.targetId, correctedValue.value ?? "");
      continue;
    }

    if (record.fieldKey !== "amount" && record.fieldKey !== "quantity") {
      continue;
    }

    if (typeof correctedValue.value !== "number") {
      continue;
    }

    if (
      record.fieldKey === "amount" &&
      correctedValue.kind === "money" &&
      isValidInteger(correctedValue.value) &&
      !amountByTargetId.has(record.targetId)
    ) {
      amountByTargetId.set(record.targetId, correctedValue.value);
    }

    if (
      record.fieldKey === "quantity" &&
      correctedValue.kind === "quantity" &&
      isNonNegativeTwoDecimalInRange(correctedValue.value) &&
      !quantityByTargetId.has(record.targetId)
    ) {
      quantityByTargetId.set(record.targetId, correctedValue.value);
    }
  }

  return { amountByTargetId, quantityByTargetId, reasonByTargetId };
}

function applyActiveLossCorrectionsToAuditSnapshot(
  data: LossStepData,
  corrections: ReturnType<typeof getActiveLossCorrectionValues>,
): LossStepData {
  return {
    ...data,
    lossItems: data.lossItems.map((item) => ({
      ...item,
      quantity: corrections.quantityByTargetId.get(item.id) ?? item.quantity,
      amount: corrections.amountByTargetId.get(item.id) ?? item.amount,
      reason: corrections.reasonByTargetId.get(item.id) ?? item.reason,
    })),
  };
}

export async function saveHqLedgerLosses(
  input: unknown,
): Promise<ActionResult<LossStepData>> {
  const parsed = parseHqLossesInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const actor = await getHqLossMutationActor();
  const { ledgerId } = parsed.data;
  await requireHeadquartersStoreScope(parsed.data.storeId);
  let invalidatedTargetLedgerIds: string[] = [];

  try {
    const result = await db.$transaction<ActionResult<LossStepData>>(
      async (tx) => {
        const beforeResult = ensureTargetLossData(
          await getLossStepDataByLedgerIdInTx(tx, ledgerId),
          parsed.data.storeId,
          actor.allowClosedEdit,
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

        const activeLossCorrectionValues = getActiveLossCorrectionValues(
          await getActiveCorrectionsForLedgerInTx(tx, ledgerId),
        );
        const effectiveBefore = applyActiveLossCorrectionsToAuditSnapshot(
          before,
          activeLossCorrectionValues,
        );

        const productIds = [
          ...new Set(parsed.data.losses.map((loss) => loss.productId)),
        ];
        const lossTypeIds = [
          ...new Set(parsed.data.losses.map((loss) => loss.ledgerInputCodeId)),
        ];
        const [products, lossTypes, salesPricePlans] = await Promise.all([
          tx.product.findMany({
            where: { id: { in: productIds }, isActive: true },
            select: {
              id: true,
              name: true,
              category: true,
              spec: true,
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
          tx.storeSalesPricePlan.findMany({
            where: {
              storeId: before.storeId,
              businessDate: new Date(before.closingDate),
              productId: { in: productIds },
            },
            select: {
              productId: true,
              plannedUnitPrice: true,
            },
          }),
        ]);
        const productsById = new Map(
          products.map((product) => [product.id, product]),
        );
        const lossTypesById = new Map(
          lossTypes.map((lossType) => [lossType.id, lossType]),
        );
        const plannedUnitPriceByProductId = new Map(
          salesPricePlans.map((plan) => [
            plan.productId,
            plan.plannedUnitPrice,
          ]),
        );
        const existingById = new Map(
          before.lossItems.map((lossItem) => [lossItem.id, lossItem]),
        );
        const storedQuantityById = new Map(
          before.lossItems.map((lossItem) => [
            lossItem.id,
            {
              quantity: lossItem.quantity,
              identity: getLossQuantityIdentity(lossItem),
            },
          ]),
        );
        const consumedStoredLossIds = new Set<string>();
        const normalizedLosses: NormalizedLossItem[] = [];

        for (let index = 0; index < parsed.data.losses.length; index += 1) {
          const loss = parsed.data.losses[index]!;
          const existing = existingById.get(loss.id);
          const quantity = consumeStoredLossQuantity(
            loss.id,
            loss.quantity,
            loss,
            storedQuantityById,
            consumedStoredLossIds,
          );

          if (quantity === null) {
            return actionError<LossStepData>(
              "VALIDATION_ERROR",
              "입력값을 확인해 주세요.",
              {
                [`losses.${index}.quantity`]: [lossTerms.quantityInvalid],
              },
            );
          }

          const normalized = normalizeLossItem({
            loss: { ...loss, quantity },
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

          // 가격 정책 전환(2026-06-24): 판매한 가격이 있을 때만 손실액을 산정한다.
          // 계획이 없으면 품목 마스터 단가로 폴백하지 않고 단가/금액을 미산정(0)으로 둔다.
          const usedPlannedPrice = plannedUnitPriceByProductId.has(
            normalized.productId,
          );

          if (usedPlannedPrice) {
            const plannedUnitPrice = plannedUnitPriceByProductId.get(
              normalized.productId,
            )!;

            normalized.unitPrice = plannedUnitPrice;
            normalized.amount = calculatePlannedPriceLossAmount({
              plannedUnitPrice,
              quantity: normalized.quantity,
              recoveredAmount: normalized.recoveredAmount,
            });
          } else {
            normalized.unitPrice = 0;
            normalized.amount = 0;
          }

          normalized.usedPlannedPrice = usedPlannedPrice;
          if (normalized.id) {
            normalized.amount =
              activeLossCorrectionValues.amountByTargetId.get(normalized.id) ??
              normalized.amount;
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

        const fifoAffectedProductIds = getChangedLossQuantityProductIds(
          before.lossItems,
          normalizedLosses,
        );
        const hasAmountInputChange = hasLossAmountInputChange(
          before.lossItems,
          normalizedLosses,
        );

        const updated = await updateHqLedgerMutationTokenInTx(tx, {
          ledgerId,
          expectedUpdatedAt,
          actorId: actor.user.id,
          allowClosedEdit: actor.allowClosedEdit,
        });

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
            recoveredAmount: loss.recoveredAmount,
            amount: loss.amount,
            usedPlannedPrice: loss.usedPlannedPrice,
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

        if (fifoAffectedProductIds.length > 0) {
          await reconcileLedgerInventoryAdjustments(
            tx,
            before.id,
            actor.user.id,
          );

          // 손실 수량 또는 품목이 바뀐 경우에만 FIFO와 미래 이월 근거를 무효화한다.
          await refreshLedgerInventoryFifoLots(tx, before.id);
          const invalidation = await invalidateCarryoverDependentsInTx(tx, {
            sourceLedgerId: before.id,
            productIds: fifoAffectedProductIds,
            actorId: actor.user.id,
            reason: parsed.data.reason,
          });
          invalidatedTargetLedgerIds = invalidation.targetLedgerIds;
        }

        const after = await getLossStepDataByLedgerIdInTx(tx, ledgerId);

        if (!after) {
          return notFoundError();
        }

        const calculatedMetricFieldKeys =
          fifoAffectedProductIds.length > 0
            ? (["grossMarginRate", "salesDifference", "lossAmount"] as const)
            : hasAmountInputChange
              ? (["salesDifference", "lossAmount"] as const)
              : [];
        const supersededCorrectionCount =
          await supersedeActiveCorrectionsForTargetsInTx(tx, {
            dailyLedgerId: before.id,
            supersededById: actor.user.id,
            targets: [
              ...before.lossItems.map((item) => ({
                targetType: "LOSS_ROW" as const,
                targetId: item.id,
              })),
              ...calculatedMetricCorrectionTargets(before.id, [
                ...calculatedMetricFieldKeys,
              ]),
            ],
          });

        await writeAuditLog(tx, {
          action: "ledger.hq.losses.saved",
          targetType: "DailyLedger",
          targetId: before.id,
          actorId: actor.user.id,
          before: {
            ...effectiveBefore,
            ledgerStatusAtEdit: before.status,
            closedEdit: before.status === "HEADQUARTERS_CLOSED",
            hqEditContext: {
              closedLedgerEdit: before.status === "HEADQUARTERS_CLOSED",
              supersededCorrectionCount: 0,
              fifoAffectedProductIds: [],
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
            },
          },
          reason: parsed.data.reason,
        });

        return actionOk(after);
      },
    );

    if (result.ok) {
      revalidateHqLossPaths(ledgerId);
      invalidatedTargetLedgerIds.forEach(revalidateLedgerDetailPath);
    }

    return result;
  } catch {
    return mapHqActionError();
  }
}
