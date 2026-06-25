import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { PageHeader } from "~/components/page-header";
import { ProductManagementClient } from "~/features/master-data/components/product-management-client";
import {
  getProductsForHeadquarters,
  normalizeProductCategoryFilter,
  normalizeProductSearch,
  normalizeProductStatusFilter,
} from "~/features/master-data/product-queries";
import { requireSettingsAccess } from "~/server/authz";

export const dynamic = "force-dynamic";

type ProductManagementPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
    status?: string | string[];
  }>;
};

export default async function ProductManagementPage({
  searchParams,
}: ProductManagementPageProps) {
  const user = await requireSettingsAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const params = await searchParams;
  const filters = {
    q: normalizeProductSearch(params.q),
    category: normalizeProductCategoryFilter(params.category),
    status: normalizeProductStatusFilter(params.status),
  };
  const products = await getProductsForHeadquarters(filters);

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <PageHeader
        title="품목 마스터"
        description="품목명, 구분, 규격, 참고 단가와 활성 상태를 관리합니다."
      />
      <ProductManagementClient products={products} filters={filters} />
    </HeadquartersShell>
  );
}
