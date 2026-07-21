"use server";

import type { Prisma } from "../../../generated/prisma/index.js";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireSettingsAccess } from "~/server/authz";
import { db } from "~/server/db";
import { revalidateMasterDataPaths } from "~/server/revalidation";
import {
  ANOMALY_THRESHOLD_SCOPE,
  anomalyThresholdFormSchema,
  storeReportMarginGapThresholdFormSchema,
  toAnomalyThresholdFieldErrors,
  toStoreReportMarginGapThresholdFieldErrors,
  type AnomalyThresholdFormInput,
  type StoreReportMarginGapThresholdFormInput,
} from "./threshold-schemas";
import {
  toAnomalyThresholdSettingsView,
  toStoreReportMarginGapThresholdView,
} from "./threshold-queries";

type AnomalyThresholdActionData = ReturnType<
  typeof toAnomalyThresholdSettingsView
>;
type StoreReportMarginGapThresholdActionData = ReturnType<
  typeof toStoreReportMarginGapThresholdView
>[];

const anomalyThresholdSelect = {
  id: true,
  scope: true,
  marginRateBps: true,
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

const storeReportMarginGapThresholdSelect = {
  id: true,
  name: true,
  reportMarginGapThresholdBps: true,
} as const;

type StoreReportMarginGapThresholdRecord = Prisma.StoreGetPayload<{
  select: typeof storeReportMarginGapThresholdSelect;
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

function parseStoreReportMarginGapThresholdInput(
  input: unknown,
): ActionResult<StoreReportMarginGapThresholdFormInput> {
  const parsed = storeReportMarginGapThresholdFormSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toStoreReportMarginGapThresholdFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function revalidateAnomalyThresholdPaths() {
  revalidateMasterDataPaths("anomaly-thresholds");
}

function isSameAnomalyThreshold(
  setting: AnomalyThresholdRecord,
  input: AnomalyThresholdFormInput,
) {
  return (
    setting.marginRateBps === input.marginRateBps &&
    setting.isActive === input.isActive
  );
}

function toAnomalyThresholdAuditValue(
  setting: AnomalyThresholdRecord | AnomalyThresholdFormInput,
) {
  return {
    targetName: "이상 신호 기준값",
    scope: ANOMALY_THRESHOLD_SCOPE,
    marginRateBps: setting.marginRateBps,
    isActive: setting.isActive,
  };
}

async function lockAnomalyThresholdSettings(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('anomaly_threshold_settings'))`;
}

async function lockStoreReportMarginGapThresholdSettings(
  tx: Prisma.TransactionClient,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('store_report_margin_gap_threshold_settings'))`;
}

function toStoreReportMarginGapThresholdAuditValue(
  store: StoreReportMarginGapThresholdRecord,
) {
  return {
    targetName: store.name,
    reportMarginGapThresholdBps: store.reportMarginGapThresholdBps,
  };
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
        marginRateBps: parsed.data.marginRateBps,
        // WO-01(2026-06-22): 재고 오차 허용 범위 제로화. DB 호환을 위해 컬럼은 유지하되 항상 0으로 고정한다.
        inventoryDifferenceQuantity: 0,
        isActive: parsed.data.isActive,
        updatedById: actor.id,
      },
      update: {
        marginRateBps: parsed.data.marginRateBps,
        inventoryDifferenceQuantity: 0,
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

export async function updateStoreReportMarginGapThresholdSettings(
  input: unknown,
): Promise<ActionResult<StoreReportMarginGapThresholdActionData>> {
  const actor = await requireSettingsAccess();
  const parsed = parseStoreReportMarginGapThresholdInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const result = await db.$transaction(async (tx) => {
    await lockStoreReportMarginGapThresholdSettings(tx);

    const storeIds = parsed.data.stores.map((store) => store.storeId);
    const existingStores = await tx.store.findMany({
      where: {
        id: { in: storeIds },
        isActive: true,
      },
      select: storeReportMarginGapThresholdSelect,
    });

    if (existingStores.length !== storeIds.length) {
      return { status: "scope-changed" as const };
    }

    const existingById = new Map(
      existingStores.map((store) => [store.id, store]),
    );
    const savedStores: StoreReportMarginGapThresholdRecord[] = [];
    let didUpdate = false;

    for (const inputStore of parsed.data.stores) {
      const existing = existingById.get(inputStore.storeId);

      if (!existing) {
        return { status: "scope-changed" as const };
      }

      if (
        existing.reportMarginGapThresholdBps ===
        inputStore.reportMarginGapThresholdBps
      ) {
        savedStores.push(existing);
        continue;
      }

      const updated = await tx.store.update({
        where: { id: existing.id },
        data: {
          reportMarginGapThresholdBps: inputStore.reportMarginGapThresholdBps,
          updatedById: actor.id,
        },
        select: storeReportMarginGapThresholdSelect,
      });

      await writeAuditLog(tx, {
        action: "threshold.updated",
        targetType: "Store",
        targetId: updated.id,
        actorId: actor.id,
        before: toStoreReportMarginGapThresholdAuditValue(existing),
        after: toStoreReportMarginGapThresholdAuditValue(updated),
        reason: parsed.data.reason,
      });

      savedStores.push(updated);
      didUpdate = true;
    }

    return {
      status: didUpdate ? ("updated" as const) : ("unchanged" as const),
      stores: savedStores,
    };
  });

  if (result.status === "scope-changed") {
    return actionError(
      "STORE_SCOPE_CHANGED",
      "활성 지점 구성이 변경되었습니다. 새로고침 후 다시 시도해 주세요.",
      { stores: ["활성 지점 정보를 새로고침해 주세요."] },
    );
  }

  if (result.status === "updated") {
    revalidateAnomalyThresholdPaths();
  }

  return actionOk(result.stores.map(toStoreReportMarginGapThresholdView));
}
