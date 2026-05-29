import { HeadquartersShell } from "~/components/headquarters-shell";
import { PageHeader } from "~/components/page-header";
import { StoreManagementClient } from "~/features/master-data/components/store-management-client";
import {
  getStoresForHeadquarters,
  normalizeStoreSearch,
  normalizeStoreStatusFilter,
} from "~/features/master-data/queries";
import { requireHeadquartersUser } from "~/server/authz";

type StoreManagementPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
  }>;
};

export default async function StoreManagementPage({
  searchParams,
}: StoreManagementPageProps) {
  const user = await requireHeadquartersUser();
  const params = await searchParams;
  const filters = {
    q: normalizeStoreSearch(params.q),
    status: normalizeStoreStatusFilter(params.status),
  };
  const stores = await getStoresForHeadquarters(filters);

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
    >
      <PageHeader
        title="지점 관리"
        description="지점명과 활성 상태를 관리합니다."
      />
      <StoreManagementClient stores={stores} filters={filters} />
    </HeadquartersShell>
  );
}
