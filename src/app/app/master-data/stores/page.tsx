import { PermissionAction } from "../../../../../generated/prisma";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { PageHeader } from "~/components/page-header";
import { StoreManagementClient } from "~/features/master-data/components/store-management-client";
import {
  getStoresForHeadquarters,
  normalizeStoreSearch,
  normalizeStoreStatusFilter,
} from "~/features/master-data/queries";
import { hasActionPermission, requireSettingsAccess } from "~/server/authz";

type StoreManagementPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
  }>;
};

export default async function StoreManagementPage({
  searchParams,
}: StoreManagementPageProps) {
  const user = await requireSettingsAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const params = await searchParams;
  const filters = {
    q: normalizeStoreSearch(params.q),
    status: normalizeStoreStatusFilter(params.status),
  };
  const stores = await getStoresForHeadquarters(filters);
  // 지점 삭제는 MASTER_DATA_DELETE 권한이 있는 계정에만 노출한다.
  // deleteStore가 서버에서 같은 권한을 다시 검사한다.
  const canDelete = await hasActionPermission(
    user.id,
    PermissionAction.MASTER_DATA_DELETE,
  );

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <PageHeader
        title="지점 관리"
        description="지점명과 활성 상태를 관리합니다."
      />
      <StoreManagementClient
        stores={stores}
        filters={filters}
        canDelete={canDelete}
      />
    </HeadquartersShell>
  );
}
