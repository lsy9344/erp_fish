import { requireSettingsAccess } from "~/server/authz";
import { db } from "~/server/db";

// WO-13(2026-06-28): 품목군별 장기재고 기준일 조회.
export type LongStockThresholdSettingView = {
  id: string;
  category: string;
  thresholdDays: number;
  isActive: boolean;
  statusLabel: string;
  updatedAt: string;
  updatedByName: string;
};

export type LongStockThresholdsScreenData = {
  settings: LongStockThresholdSettingView[];
  // 품목 마스터에 존재하지만 활성 기준일이 없는 분류(= "기준 확인 필요").
  unconfiguredCategories: string[];
};

type LongStockThresholdRecord = {
  id: string;
  category: string;
  thresholdDays: number;
  isActive: boolean;
  updatedAt: Date;
  updatedBy: { name: string | null; email: string | null } | null;
};

const longStockThresholdSelect = {
  id: true,
  category: true,
  thresholdDays: true,
  isActive: true,
  updatedAt: true,
  updatedBy: { select: { name: true, email: true } },
} as const;

export function toLongStockThresholdSettingView(
  setting: LongStockThresholdRecord,
): LongStockThresholdSettingView {
  return {
    id: setting.id,
    category: setting.category,
    thresholdDays: setting.thresholdDays,
    isActive: setting.isActive,
    statusLabel: setting.isActive ? "활성" : "비활성",
    updatedAt: setting.updatedAt.toISOString(),
    updatedByName:
      setting.updatedBy?.name ?? setting.updatedBy?.email ?? "시스템",
  };
}

export async function getLongStockThresholdsForHeadquarters(): Promise<LongStockThresholdsScreenData> {
  await requireSettingsAccess();

  const [settings, productCategories] = await Promise.all([
    db.longStockThresholdSetting.findMany({
      orderBy: [{ category: "asc" }],
      select: longStockThresholdSelect,
    }),
    db.product.findMany({
      where: { isActive: true },
      distinct: ["category"],
      select: { category: true },
    }),
  ]);

  const configuredActive = new Set(
    settings.filter((s) => s.isActive).map((s) => s.category),
  );
  const unconfiguredCategories = productCategories
    .map((p) => p.category)
    .filter((category) => category && !configuredActive.has(category))
    .sort((a, b) => a.localeCompare(b, "ko-KR"));

  return {
    settings: settings.map(toLongStockThresholdSettingView),
    unconfiguredCategories,
  };
}

// 활성 기준일을 category → days 맵으로 반환한다(알림/리포트 장기재고 판정에 쓴다).
// 기준이 없는 분류는 맵에 없으며, 호출부에서 "기준 확인 필요"로 처리한다.
export async function getActiveLongStockThresholdDaysByCategory(): Promise<
  Map<string, number>
> {
  const settings = await db.longStockThresholdSetting.findMany({
    where: { isActive: true },
    select: { category: true, thresholdDays: true },
  });

  return new Map(settings.map((s) => [s.category, s.thresholdDays]));
}
