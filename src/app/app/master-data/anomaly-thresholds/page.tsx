import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { AnomalyThresholdSettingsClient } from "~/features/dashboard/components/anomaly-threshold-settings-client";
import { getAnomalyThresholdSettingsForHeadquarters } from "~/features/dashboard/threshold-queries";
import { requireHeadquartersUser } from "~/server/authz";

export default async function AnomalyThresholdSettingsPage() {
  const user = await requireHeadquartersUser();
  const settings = await getAnomalyThresholdSettingsForHeadquarters();

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
    >
      <PageHeader
        title="이상 신호 기준값"
        description="본사 관제판에서 사용할 전역 이상 신호 기준값을 설정합니다."
      />
      <AnomalyThresholdSettingsClient settings={settings} />
    </HeadquartersShell>
  );
}
