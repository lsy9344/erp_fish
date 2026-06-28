import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { PageHeader } from "~/components/page-header";
import { LongStockThresholdClient } from "~/features/dashboard/components/long-stock-threshold-client";
import { getLongStockThresholdsForHeadquarters } from "~/features/dashboard/long-stock-threshold-queries";
import { requireSettingsAccess } from "~/server/authz";

export default async function LongStockThresholdsPage() {
  const user = await requireSettingsAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const data = await getLongStockThresholdsForHeadquarters();

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <PageHeader
        title="장기재고 기준일"
        description="품목군별로 며칠 이상 남으면 장기재고로 볼지 관리합니다."
      />
      <LongStockThresholdClient data={data} />
    </HeadquartersShell>
  );
}
