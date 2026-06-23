import { requireReportAccess, requireSettingsAccess } from "~/server/authz";
import { db } from "~/server/db";
import { normalizeAnomalyThresholdSignalSettings } from "~/server/calculations/anomaly";
import {
  ANOMALY_THRESHOLD_SCOPE,
  formatBpsAsPercent,
} from "./threshold-schemas";

export type AnomalyThresholdSettingsView = {
  id: string;
  scope: string;
  scopeLabel: string;
  marginRateBps: number;
  isActive: boolean;
  statusLabel: string;
  updatedAt: string;
  updatedByName: string;
  formValues: {
    marginRate: string;
  };
};

type AnomalyThresholdRecord = {
  id: string;
  scope: string;
  marginRateBps: number;
  isActive: boolean;
  updatedAt: Date;
  updatedBy: {
    name: string | null;
    email: string | null;
  } | null;
};

const anomalyThresholdSelect = {
  id: true,
  scope: true,
  marginRateBps: true,
  isActive: true,
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
    scopeLabel: "전체 지점",
    marginRateBps: setting.marginRateBps,
    isActive: setting.isActive,
    statusLabel: setting.isActive ? "활성" : "비활성",
    updatedAt: setting.updatedAt.toISOString(),
    updatedByName:
      setting.updatedBy?.name ?? setting.updatedBy?.email ?? "시스템",
    formValues: {
      marginRate: formatBpsAsPercent(setting.marginRateBps),
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
      marginRateBps: true,
      isActive: true,
    },
  });

  return normalizeAnomalyThresholdSignalSettings(setting);
}
