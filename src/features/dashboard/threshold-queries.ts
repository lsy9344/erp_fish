import { requireReportAccess, requireSettingsAccess } from "~/server/authz";
import { db } from "~/server/db";
import { normalizeAnomalyThresholdSignalSettings } from "~/server/calculations/anomaly";
import {
  ANOMALY_THRESHOLD_SCOPE,
  formatBpsAsPercent,
  formatIntegerInput,
} from "./threshold-schemas";

export type AnomalyThresholdSettingsView = {
  id: string;
  scope: string;
  salesDropRateBps: number;
  grossMarginDropBps: number;
  salesDifferenceAmount: number;
  lossAmount: number;
  inventoryDifferenceQuantity: number;
  updatedAt: string;
  updatedByName: string;
  formValues: {
    salesDropRate: string;
    grossMarginDropRate: string;
    salesDifferenceAmount: string;
    lossAmount: string;
    inventoryDifferenceQuantity: string;
  };
};

type AnomalyThresholdRecord = {
  id: string;
  scope: string;
  salesDropRateBps: number;
  grossMarginDropBps: number;
  salesDifferenceAmount: number;
  lossAmount: number;
  inventoryDifferenceQuantity: number;
  updatedAt: Date;
  updatedBy: {
    name: string | null;
    email: string | null;
  } | null;
};

const anomalyThresholdSelect = {
  id: true,
  scope: true,
  salesDropRateBps: true,
  grossMarginDropBps: true,
  salesDifferenceAmount: true,
  lossAmount: true,
  inventoryDifferenceQuantity: true,
  updatedAt: true,
  updatedBy: {
    select: {
      name: true,
      email: true,
    },
  },
} as const;

export function toAnomalyThresholdSettingsView(
  setting: AnomalyThresholdRecord,
): AnomalyThresholdSettingsView {
  return {
    id: setting.id,
    scope: setting.scope,
    salesDropRateBps: setting.salesDropRateBps,
    grossMarginDropBps: setting.grossMarginDropBps,
    salesDifferenceAmount: setting.salesDifferenceAmount,
    lossAmount: setting.lossAmount,
    inventoryDifferenceQuantity: setting.inventoryDifferenceQuantity,
    updatedAt: setting.updatedAt.toISOString(),
    updatedByName: setting.updatedBy?.name ?? setting.updatedBy?.email ?? "시스템",
    formValues: {
      salesDropRate: formatBpsAsPercent(setting.salesDropRateBps),
      grossMarginDropRate: formatBpsAsPercent(setting.grossMarginDropBps),
      salesDifferenceAmount: formatIntegerInput(setting.salesDifferenceAmount),
      lossAmount: formatIntegerInput(setting.lossAmount),
      inventoryDifferenceQuantity: formatIntegerInput(
        setting.inventoryDifferenceQuantity,
      ),
    },
  };
}

export async function getAnomalyThresholdSettingsForHeadquarters() {
  await requireSettingsAccess();

  const setting = await db.anomalyThresholdSetting.findUnique({
    where: { scope: ANOMALY_THRESHOLD_SCOPE },
    select: anomalyThresholdSelect,
  });

  return setting ? toAnomalyThresholdSettingsView(setting) : null;
}

export async function getAnomalyThresholdSettingsForSignals() {
  await requireReportAccess();

  const setting = await db.anomalyThresholdSetting.findUnique({
    where: { scope: ANOMALY_THRESHOLD_SCOPE },
    select: {
      salesDropRateBps: true,
      grossMarginDropBps: true,
      salesDifferenceAmount: true,
      lossAmount: true,
      inventoryDifferenceQuantity: true,
    },
  });

  return normalizeAnomalyThresholdSignalSettings(setting);
}
