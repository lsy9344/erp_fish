import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { PageHeader } from "~/components/page-header";
import { PurchaseStandardManagementClient } from "~/features/master-data/components/purchase-standard-management-client";
import { getActiveProductOptions } from "~/features/master-data/product-queries";
import {
  getPurchaseStandardsForHeadquarters,
  normalizePurchaseStandardStatusFilter,
} from "~/features/master-data/purchase-standard-queries";
import { requireSettingsAccess } from "~/server/authz";

export const dynamic = "force-dynamic";

type PurchaseStandardManagementPageProps = {
  searchParams: Promise<{
    status?: string | string[];
  }>;
};

export default async function PurchaseStandardManagementPage({
  searchParams,
}: PurchaseStandardManagementPageProps) {
  const user = await requireSettingsAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const params = await searchParams;
  const filters = {
    status: normalizePurchaseStandardStatusFilter(params.status),
  };
  const [standards, products] = await Promise.all([
    getPurchaseStandardsForHeadquarters(filters),
    getActiveProductOptions(),
  ]);

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <PageHeader
        title="품목 참고 단가"
        description="품목별 참고 단가입니다. 이카운트 출고/입고 단가는 본사 이카운트 업로드에서 관리합니다."
      />
      <PurchaseStandardManagementClient
        standards={standards}
        products={products}
        filters={filters}
      />
    </HeadquartersShell>
  );
}
