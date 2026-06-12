"use server";

import { revalidatePath } from "next/cache";

import type { Prisma } from "../../../generated/prisma/index.js";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireSettingsAccess } from "~/server/authz";
import { db } from "~/server/db";
import {
  ANOMALY_THRESHOLD_SCOPE,
  anomalyThresholdFormSchema,
  toAnomalyThresholdFieldErrors,
  type AnomalyThresholdFormInput,
} from "./threshold-schemas";
import { toAnomalyThresholdSettingsView } from "./threshold-queries";

type AnomalyThresholdActionData = ReturnType<
  typeof toAnomalyThresholdSettingsView
>;

const anomalyThresholdSelect = {
  id: true,
  scope: true,
  salesDropRateBps: true,
  grossMarginDropBps: true,
  salesDifferenceAmount: true,
  lossAmount: true,
  inventoryDifferenceQuantity: true,
  isActive: true,
  updatedAt: true,
  updatedBy: {
    select: {
      name: true,
      email: true,
    },
  },
} as const;

type AnomalyThresholdRecord = Prisma.AnomalyThresholdSettingGetPayload<{
  select: typeof anomalyThresholdSelect;
}>;

function parseAnomalyThresholdInput(
  input: unknown,
): ActionResult<AnomalyThresholdFormInput> {
  const parsed = anomalyThresholdFormSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toAnomalyThresholdFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function revalidateAnomalyThresholdPaths() {
  revalidatePath("/app/master-data/anomaly-thresholds");
  revalidatePath("/app/dashboard");
  revalidatePath("/app/reports/daily");
  revalidatePath("/app/reports/comparison");
  revalidatePath("/app/reports/monthly");
}

function isSameAnomalyThreshold(
  setting: AnomalyThresholdRecord,
  input: AnomalyThresholdFormInput,
) {
  return (
    setting.salesDropRateBps === input.salesDropRateBps &&
    setting.grossMarginDropBps === input.grossMarginDropBps &&
    setting.salesDifferenceAmount === input.salesDifferenceAmount &&
    setting.lossAmount === input.lossAmount &&
    setting.inventoryDifferenceQuantity === input.inventoryDifferenceQuantity &&
    setting.isActive === input.isActive
  );
}

function toAnomalyThresholdAuditValue(
  setting: AnomalyThresholdRecord | AnomalyThresholdFormInput,
) {
  return {
    targetName: "이상 신호 기준값",
    scope: ANOMALY_THRESHOLD_SCOPE,
    salesDropRateBps: setting.salesDropRateBps,
    grossMarginDropBps: setting.grossMarginDropBps,
    salesDifferenceAmount: setting.salesDifferenceAmount,
    lossAmount: setting.lossAmount,
    inventoryDifferenceQuantity: setting.inventoryDifferenceQuantity,
    isActive: setting.isActive,
  };
}

async function lockAnomalyThresholdSettings(
  tx: Prisma.TransactionClient,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('anomaly_threshold_settings'))`;
}

export async function updateAnomalyThresholdSettings(
  input: unknown,
): Promise<ActionResult<AnomalyThresholdActionData>> {
  const actor = await requireSettingsAccess();
  const parsed = parseAnomalyThresholdInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const result = await db.$transaction(async (tx) => {
    await lockAnomalyThresholdSettings(tx);

    const existing = await tx.anomalyThresholdSetting.findUnique({
      where: { scope: ANOMALY_THRESHOLD_SCOPE },
      select: anomalyThresholdSelect,
    });

    if (existing && isSameAnomalyThreshold(existing, parsed.data)) {
      return { status: "unchanged" as const, setting: existing };
    }

    const updated = await tx.anomalyThresholdSetting.upsert({
      where: { scope: ANOMALY_THRESHOLD_SCOPE },
      create: {
        scope: ANOMALY_THRESHOLD_SCOPE,
        salesDropRateBps: parsed.data.salesDropRateBps,
        grossMarginDropBps: parsed.data.grossMarginDropBps,
        salesDifferenceAmount: parsed.data.salesDifferenceAmount,
        lossAmount: parsed.data.lossAmount,
        inventoryDifferenceQuantity: parsed.data.inventoryDifferenceQuantity,
        isActive: parsed.data.isActive,
        updatedById: actor.id,
      },
      update: {
        salesDropRateBps: parsed.data.salesDropRateBps,
        grossMarginDropBps: parsed.data.grossMarginDropBps,
        salesDifferenceAmount: parsed.data.salesDifferenceAmount,
        lossAmount: parsed.data.lossAmount,
        inventoryDifferenceQuantity: parsed.data.inventoryDifferenceQuantity,
        isActive: parsed.data.isActive,
        updatedById: actor.id,
      },
      select: anomalyThresholdSelect,
    });

    await writeAuditLog(tx, {
      action: "threshold.updated",
      targetType: "AnomalyThresholdSetting",
      targetId: updated.id,
      actorId: actor.id,
      before: existing ? toAnomalyThresholdAuditValue(existing) : null,
      after: toAnomalyThresholdAuditValue(updated),
      reason: parsed.data.reason,
    });

    return { status: "updated" as const, setting: updated };
  });

  if (result.status === "updated") {
    revalidateAnomalyThresholdPaths();
  }

  return actionOk(toAnomalyThresholdSettingsView(result.setting));
}
