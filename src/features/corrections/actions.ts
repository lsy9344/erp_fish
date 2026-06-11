"use server";

import { revalidatePath } from "next/cache";

import { Prisma } from "../../../generated/prisma";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireCorrectionCreateAccess, requireHeadquartersLedgerScope } from "~/server/authz";
import { db } from "~/server/db";
import {
  correctionRecordSchema,
  toFieldErrors,
  type CorrectionRecordInput,
} from "./schemas";
import {
  buildCorrectionTargetKey,
  getLatestCorrectionByTargetInTx,
} from "./queries";
import type { CorrectionValue, CreateCorrectionRecordResult } from "./types";

const MAX_CORRECTION_INTEGER = 2_147_483_647;

const ledgerFieldKinds: Record<string, CorrectionValue["kind"]> = {
  workerCount: "quantity",
  workMemo: "text",
};

const paymentFieldKinds: Record<string, CorrectionValue["kind"]> = {
  totalSalesAmount: "money",
  cashAmount: "money",
  cardAmount: "money",
  otherPaymentAmount: "money",
};

const expenseFieldKinds: Record<string, CorrectionValue["kind"]> = {
  amount: "money",
  memo: "text",
};

const purchaseFieldKinds: Record<string, CorrectionValue["kind"]> = {
  unitPrice: "money",
  quantity: "quantity",
  amount: "money",
  referenceInfo: "text",
};

const inventoryFieldKinds: Record<string, CorrectionValue["kind"]> = {
  currentQuantity: "quantity",
  quantity: "quantity",
  inventoryAmount: "money",
};

const lossFieldKinds: Record<string, CorrectionValue["kind"]> = {
  quantity: "quantity",
  amount: "money",
  reason: "text",
};

const calculatedMetricKinds: Record<string, CorrectionValue["kind"]> = {
  grossMarginRate: "metric",
  salesDifference: "metric",
  lossAmount: "metric",
};

const ledgerFieldLabels: Record<string, string> = {
  workerCount: "근무인원",
  workMemo: "근무 메모",
};

const paymentFieldLabels: Record<string, string> = {
  totalSalesAmount: "총매출",
  cashAmount: "현금",
  cardAmount: "카드",
  otherPaymentAmount: "기타 결제수단",
};

const expenseFieldLabels: Record<string, string> = {
  amount: "금액",
  memo: "메모",
};

const purchaseFieldLabels: Record<string, string> = {
  unitPrice: "단가",
  quantity: "수량",
  amount: "금액",
  referenceInfo: "참고 정보",
};

const inventoryFieldLabels: Record<string, string> = {
  currentQuantity: "현재고",
  quantity: "수량",
  inventoryAmount: "재고 금액",
};

const lossFieldLabels: Record<string, string> = {
  quantity: "수량",
  amount: "금액",
  reason: "사유",
};

const calculatedMetricLabels: Record<string, string> = {
  grossMarginRate: "마진율",
  salesDifference: "매출 차이",
  lossAmount: "손실",
};

function parseCorrectionRecordInput(
  input: unknown,
): ActionResult<CorrectionRecordInput> {
  const parsed = correctionRecordSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function asCorrectionValue(
  kind: CorrectionValue["kind"],
  value: number | string | null,
  label?: string,
): CorrectionValue {
  return { kind, value, label };
}

function targetRowLabel(
  prefix: string,
  name: string | null,
  fieldLabel: string,
  targetId: string,
) {
  const base = name?.trim() ? name.trim() : "이름 없음";
  const shortId = targetId.slice(0, 8);

  return `${prefix} · ${base} · ${fieldLabel} · ${shortId}`;
}

function withServerLabel(
  correctedValue: CorrectionValue,
  originalValue: CorrectionValue,
): CorrectionValue {
  return { ...correctedValue, label: originalValue.label };
}

function unsupportedTargetError(): ActionResult<never> {
  return actionError(
    "UNSUPPORTED_CORRECTION_TARGET",
    "정정 대상을 확인해 주세요.",
  );
}

function correctionValueShapeError(): ActionResult<never> {
  return actionError("INVALID_CORRECTION_VALUE", "정정값을 확인해 주세요.", {
    "correctedValue.value": ["정정값 형식을 확인해 주세요."],
  });
}

function ledgerNotFoundError(): ActionResult<never> {
  return actionError("LEDGER_NOT_FOUND", "장부를 찾을 수 없습니다.");
}

function ledgerNotClosedError(): ActionResult<never> {
  return actionError(
    "LEDGER_NOT_CLOSED",
    "본사 마감된 장부에만 정정 기록을 추가할 수 있습니다.",
  );
}

function mapCorrectionActionError(): ActionResult<never> {
  return actionError(
    "CORRECTION_SAVE_FAILED",
    "정정 기록 저장에 실패했습니다. 다시 시도해 주세요.",
  );
}

function isValidCorrectionInteger(value: unknown) {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_CORRECTION_INTEGER
  );
}

function normalizeCorrectedValueForTarget(
  originalValue: CorrectionValue,
  correctedValue: CorrectionValue,
): ActionResult<CorrectionValue> {
  if (correctedValue.kind !== originalValue.kind) {
    return correctionValueShapeError();
  }

  if (correctedValue.kind === "money" || correctedValue.kind === "quantity") {
    if (!isValidCorrectionInteger(correctedValue.value)) {
      return correctionValueShapeError();
    }

    return actionOk(correctedValue);
  }

  if (correctedValue.kind === "text") {
    if (
      correctedValue.value !== null &&
      typeof correctedValue.value !== "string"
    ) {
      return correctionValueShapeError();
    }

    return actionOk(correctedValue);
  }

  if (
    correctedValue.value !== null &&
    typeof correctedValue.value !== "string" &&
    typeof correctedValue.value !== "number"
  ) {
    return correctionValueShapeError();
  }

  return actionOk(correctedValue);
}

async function lockCorrectionTargetInTx(
  tx: Prisma.TransactionClient,
  input: Parameters<typeof buildCorrectionTargetKey>[0],
) {
  const lockKey = buildCorrectionTargetKey(input);

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
}

function revalidateCorrectionPaths(ledgerId: string) {
  revalidatePath(`/app/ledgers/${ledgerId}`);
  revalidatePath("/app/dashboard");
  revalidatePath("/app/reports/daily");
  revalidatePath("/app/reports/comparison");
  revalidatePath("/app/reports/monthly");
}

function revalidateCorrectionPathsBestEffort(ledgerId: string) {
  try {
    revalidateCorrectionPaths(ledgerId);
  } catch {
    // The correction is already committed; avoid reporting a false failure.
  }
}

async function resolveOriginalCorrectionValue(
  tx: Prisma.TransactionClient,
  input: Pick<
    CorrectionRecordInput,
    "ledgerId" | "targetType" | "targetId" | "fieldKey"
  >,
): Promise<ActionResult<CorrectionValue>> {
  if (input.targetType === "LEDGER_FIELD") {
    if (input.targetId !== input.ledgerId) {
      return unsupportedTargetError();
    }

    const kind = ledgerFieldKinds[input.fieldKey];

    if (!kind) {
      return unsupportedTargetError();
    }

    const ledger = await tx.dailyLedger.findUnique({
      where: { id: input.ledgerId },
      select: {
        workerCount: true,
        workMemo: true,
      },
    });

    if (!ledger) {
      return ledgerNotFoundError();
    }

    return actionOk(
      asCorrectionValue(
        kind,
        ledger[input.fieldKey as keyof typeof ledger] ?? null,
        ledgerFieldLabels[input.fieldKey] ?? input.fieldKey,
      ),
    );
  }

  if (input.targetType === "PAYMENT_FIELD") {
    if (input.targetId !== input.ledgerId) {
      return unsupportedTargetError();
    }

    const kind = paymentFieldKinds[input.fieldKey];

    if (!kind) {
      return unsupportedTargetError();
    }

    const ledger = await tx.dailyLedger.findUnique({
      where: { id: input.ledgerId },
      select: {
        totalSalesAmount: true,
        cashAmount: true,
        cardAmount: true,
        otherPaymentAmount: true,
      },
    });

    if (!ledger) {
      return ledgerNotFoundError();
    }

    return actionOk(
      asCorrectionValue(
        kind,
        ledger[input.fieldKey as keyof typeof ledger] ?? null,
        paymentFieldLabels[input.fieldKey] ?? input.fieldKey,
      ),
    );
  }

  if (input.targetType === "EXPENSE_ROW") {
    const kind = expenseFieldKinds[input.fieldKey];

    if (!kind) {
      return unsupportedTargetError();
    }

    const row = await tx.ledgerExpense.findFirst({
      where: { id: input.targetId, dailyLedgerId: input.ledgerId },
      select: {
        amount: true,
        memo: true,
        ledgerInputCode: { select: { name: true } },
      },
    });

    if (!row) {
      return unsupportedTargetError();
    }

    const values = {
      amount: row.amount,
      memo: row.memo,
    };

    return actionOk(
      asCorrectionValue(
        kind,
        values[input.fieldKey as keyof typeof values] ?? null,
        targetRowLabel(
          "비용",
          row.ledgerInputCode.name,
          expenseFieldLabels[input.fieldKey] ?? input.fieldKey,
          input.targetId,
        ),
      ),
    );
  }

  if (input.targetType === "PURCHASE_ROW") {
    const kind = purchaseFieldKinds[input.fieldKey];

    if (!kind) {
      return unsupportedTargetError();
    }

    const row = await tx.ledgerPurchaseItem.findFirst({
      where: { id: input.targetId, dailyLedgerId: input.ledgerId },
      select: {
        unitPrice: true,
        quantity: true,
        amount: true,
        referenceInfo: true,
        productName: true,
      },
    });

    if (!row) {
      return unsupportedTargetError();
    }

    const values = {
      unitPrice: row.unitPrice,
      quantity: row.quantity,
      amount: row.amount,
      referenceInfo: row.referenceInfo,
    };

    return actionOk(
      asCorrectionValue(
        kind,
        values[input.fieldKey as keyof typeof values] ?? null,
        targetRowLabel(
          "매입",
          row.productName,
          purchaseFieldLabels[input.fieldKey] ?? input.fieldKey,
          input.targetId,
        ),
      ),
    );
  }

  if (input.targetType === "INVENTORY_ROW") {
    const kind = inventoryFieldKinds[input.fieldKey];

    if (!kind) {
      return unsupportedTargetError();
    }

    const row = await tx.ledgerInventoryItem.findFirst({
      where: { id: input.targetId, dailyLedgerId: input.ledgerId },
      select: {
        currentQuantity: true,
        quantity: true,
        inventoryAmount: true,
        productName: true,
      },
    });

    if (!row) {
      return unsupportedTargetError();
    }

    const values = {
      currentQuantity: row.currentQuantity,
      quantity: row.quantity,
      inventoryAmount: row.inventoryAmount,
    };

    return actionOk(
      asCorrectionValue(
        kind,
        values[input.fieldKey as keyof typeof values] ?? null,
        targetRowLabel(
          "재고",
          row.productName,
          inventoryFieldLabels[input.fieldKey] ?? input.fieldKey,
          input.targetId,
        ),
      ),
    );
  }

  if (input.targetType === "LOSS_ROW") {
    const kind = lossFieldKinds[input.fieldKey];

    if (!kind) {
      return unsupportedTargetError();
    }

    const row = await tx.ledgerLossItem.findFirst({
      where: { id: input.targetId, dailyLedgerId: input.ledgerId },
      select: {
        quantity: true,
        amount: true,
        reason: true,
        productName: true,
      },
    });

    if (!row) {
      return unsupportedTargetError();
    }

    const values = {
      quantity: row.quantity,
      amount: row.amount,
      reason: row.reason,
    };

    return actionOk(
      asCorrectionValue(
        kind,
        values[input.fieldKey as keyof typeof values] ?? null,
        targetRowLabel(
          "손실",
          row.productName,
          lossFieldLabels[input.fieldKey] ?? input.fieldKey,
          input.targetId,
        ),
      ),
    );
  }

  if (input.targetType === "CALCULATED_METRIC") {
    if (
      input.targetId !== input.ledgerId ||
      !calculatedMetricKinds[input.fieldKey]
    ) {
      return unsupportedTargetError();
    }

    return actionOk(
      asCorrectionValue(
        "metric",
        null,
        calculatedMetricLabels[input.fieldKey] ?? input.fieldKey,
      ),
    );
  }

  return unsupportedTargetError();
}

export async function createCorrectionRecord(
  input: unknown,
): Promise<ActionResult<CreateCorrectionRecordResult>> {
  const actor = { user: await requireCorrectionCreateAccess() };
  const parsed = parseCorrectionRecordInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const { ledgerId } = parsed.data;
  await requireHeadquartersLedgerScope(ledgerId);

  try {
    const result = await db.$transaction<
      ActionResult<CreateCorrectionRecordResult>
    >(
      async (tx) => {
        const ledger = await tx.dailyLedger.findUnique({
          where: { id: ledgerId, status: "HEADQUARTERS_CLOSED" },
          select: { id: true, status: true },
        });

        if (!ledger) {
          const existing = await tx.dailyLedger.findUnique({
            where: { id: ledgerId },
            select: { status: true },
          });

          return existing ? ledgerNotClosedError() : ledgerNotFoundError();
        }

        const originalValue = await resolveOriginalCorrectionValue(
          tx,
          parsed.data,
        );

        if (!originalValue.ok) {
          return originalValue;
        }

        const correctedValue = normalizeCorrectedValueForTarget(
          originalValue.data,
          parsed.data.correctedValue,
        );

        if (!correctedValue.ok) {
          return correctedValue;
        }

        await lockCorrectionTargetInTx(tx, {
          dailyLedgerId: ledgerId,
          targetType: parsed.data.targetType,
          targetId: parsed.data.targetId,
          fieldKey: parsed.data.fieldKey,
        });

        const latest = await getLatestCorrectionByTargetInTx(tx, {
          dailyLedgerId: ledgerId,
          targetType: parsed.data.targetType,
          targetId: parsed.data.targetId,
          fieldKey: parsed.data.fieldKey,
        });
        const correctedValueData = withServerLabel(
          correctedValue.data,
          originalValue.data,
        );
        const previousAppliedValue =
          latest?.correctedValue ?? originalValue.data;
        const correction = await tx.correctionRecord.create({
          data: {
            dailyLedgerId: ledgerId,
            targetType: parsed.data.targetType,
            targetId: parsed.data.targetId,
            fieldKey: parsed.data.fieldKey,
            originalValue: originalValue.data,
            previousAppliedValue,
            correctedValue: correctedValueData,
            reason: parsed.data.reason,
            createdById: actor.user.id,
          },
          select: {
            id: true,
            dailyLedgerId: true,
            targetType: true,
            targetId: true,
            fieldKey: true,
            correctedValue: true,
            reason: true,
            createdAt: true,
          },
        });

        await writeAuditLog(tx, {
          action: "correction.created",
          targetType: "CorrectionRecord",
          targetId: correction.id,
          actorId: actor.user.id,
          before: {
            targetType: parsed.data.targetType,
            targetId: parsed.data.targetId,
            fieldKey: parsed.data.fieldKey,
            value: previousAppliedValue,
          },
          after: {
            correctionId: correction.id,
            targetType: correction.targetType,
            targetId: correction.targetId,
            fieldKey: correction.fieldKey,
            originalValue: originalValue.data,
            previousAppliedValue,
            correctedValue: correction.correctedValue,
          },
          reason: parsed.data.reason,
        });

        return actionOk({
          ...correction,
          createdAt: correction.createdAt.toISOString(),
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (result.ok) {
      revalidateCorrectionPathsBestEffort(ledgerId);
    }

    return result;
  } catch {
    return mapCorrectionActionError();
  }
}
