import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { PageHeader } from "~/components/page-header";
import { AnomalyThresholdSettingsClient } from "~/features/dashboard/components/anomaly-threshold-settings-client";
import { StoreReportMarginGapThresholdSettingsClient } from "~/features/dashboard/components/store-report-margin-gap-threshold-settings-client";
import {
  getAnomalyThresholdSettingsForHeadquarters,
  getStoreReportMarginGapThresholdsForHeadquarters,
} from "~/features/dashboard/threshold-queries";
import { requireSettingsAccess } from "~/server/authz";

export default async function AnomalyThresholdSettingsPage() {
  const user = await requireSettingsAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const [settings, storeThresholds] = await Promise.all([
    getAnomalyThresholdSettingsForHeadquarters(),
    getStoreReportMarginGapThresholdsForHeadquarters(),
  ]);

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <PageHeader
        title="이상 신호 기준값"
        description="전역 최소 마진률과 지점별 리포트 마진 차이 기준을 설정합니다."
      />
      <div className="flex flex-col gap-6">
        <StoreReportMarginGapThresholdSettingsClient stores={storeThresholds} />
        <AnomalyThresholdSettingsClient settings={settings} />
      </div>
    </HeadquartersShell>
  );
}
