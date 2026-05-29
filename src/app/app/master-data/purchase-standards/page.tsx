import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { PurchaseStandardManagementClient } from "~/features/master-data/components/purchase-standard-management-client";
import { getActiveProductOptions } from "~/features/master-data/product-queries";
import {
  getPurchaseStandardsForHeadquarters,
  normalizePurchaseStandardStatusFilter,
} from "~/features/master-data/purchase-standard-queries";
import { requireHeadquartersUser } from "~/server/authz";

type PurchaseStandardManagementPageProps = {
  searchParams: Promise<{
    status?: string | string[];
  }>;
};

export default async function PurchaseStandardManagementPage({
  searchParams,
}: PurchaseStandardManagementPageProps) {
  const user = await requireHeadquartersUser();
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
    >
      <PageHeader
        title="매입 기준 관리"
        description="품목별 기준 단가와 참조 정보를 관리합니다."
      />
      <PurchaseStandardManagementClient
        standards={standards}
        products={products}
        filters={filters}
      />
    </HeadquartersShell>
  );
}
