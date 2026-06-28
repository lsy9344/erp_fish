"use server";

import type { Prisma } from "../../../generated/prisma/index.js";
import { actionError, actionOk, type ActionResult } from "~/lib/action-result";
import { writeAuditLog } from "~/server/audit";
import { requireSettingsAccess } from "~/server/authz";
import { db } from "~/server/db";
import { revalidateMasterDataPaths } from "~/server/revalidation";
import {
  longStockThresholdFormSchema,
  toLongStockThresholdFieldErrors,
  type LongStockThresholdFormInput,
} from "./long-stock-threshold-schemas";
import {
  toLongStockThresholdSettingView,
  type LongStockThresholdSettingView,
} from "./long-stock-threshold-queries";

const longStockThresholdSelect = {
  id: true,
  category: true,
  thresholdDays: true,
  isActive: true,
  updatedAt: true,
  updatedBy: { select: { name: true, email: true } },
} as const;

type LongStockThresholdRecord = Prisma.LongStockThresholdSettingGetPayload<{
  select: typeof longStockThresholdSelect;
}>;

function parseInput(
  input: unknown,
): ActionResult<LongStockThresholdFormInput> {
  const parsed = longStockThresholdFormSchema.safeParse(input);

  if (!parsed.success) {
    return actionError(
      "VALIDATION_ERROR",
      "입력값을 확인해 주세요.",
      toLongStockThresholdFieldErrors(parsed.error),
    );
  }

  return actionOk(parsed.data);
}

function toAuditValue(
  setting: Pick<
    LongStockThresholdRecord,
    "category" | "thresholdDays" | "isActive"
  >,
) {
  return {
    targetName: `장기재고 기준일 · ${setting.category}`,
    category: setting.category,
    thresholdDays: setting.thresholdDays,
    isActive: setting.isActive,
  };
}

// WO-13(2026-06-28): 품목군별 장기재고 기준일을 등록/수정한다. category가 primary 키이므로
// upsert로 한 분류당 한 행을 유지한다. 본사 전용(SETTINGS_MANAGE), 감사 로그 필수.
export async function upsertLongStockThresholdSetting(
  input: unknown,
): Promise<ActionResult<LongStockThresholdSettingView>> {
  const actor = await requireSettingsAccess();
  const parsed = parseInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const { category, thresholdDays, isActive, reason } = parsed.data;

  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('long_stock_threshold_settings'))`;

    const existing = await tx.longStockThresholdSetting.findUnique({
      where: { category },
      select: longStockThresholdSelect,
    });

    const updated = await tx.longStockThresholdSetting.upsert({
      where: { category },
      create: { category, thresholdDays, isActive, updatedById: actor.id },
      update: { thresholdDays, isActive, updatedById: actor.id },
      select: longStockThresholdSelect,
    });

    await writeAuditLog(tx, {
      action: existing
        ? "long_stock_threshold.updated"
        : "long_stock_threshold.created",
      targetType: "LongStockThresholdSetting",
      targetId: updated.id,
      actorId: actor.id,
      before: existing ? toAuditValue(existing) : null,
      after: toAuditValue(updated),
      reason,
    });

    return updated;
  });

  revalidateMasterDataPaths("long-stock-thresholds");

  return actionOk(toLongStockThresholdSettingView(result));
}
