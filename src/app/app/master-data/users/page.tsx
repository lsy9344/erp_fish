import { PermissionAction } from "../../../../../generated/prisma";
import { HeadquartersShell } from "~/components/headquarters-shell";
import { getHeadquartersNavigationItems } from "~/components/app-sidebar";
import { PageHeader } from "~/components/page-header";
import { UserManagementClient } from "~/features/master-data/components/user-management-client";
import {
  getUserManagementOptions,
  getUsersForHeadquarters,
  normalizeUserRoleFilter,
  normalizeUserStatusFilter,
} from "~/features/master-data/user-queries";
import {
  hasActionPermission,
  requireUserPermissionAccess,
} from "~/server/authz";

type UserManagementPageProps = {
  searchParams: Promise<{
    role?: string | string[];
    status?: string | string[];
  }>;
};

export default async function UserManagementPage({
  searchParams,
}: UserManagementPageProps) {
  const user = await requireUserPermissionAccess();
  const navigationItems = await getHeadquartersNavigationItems(user.id);
  const params = await searchParams;
  const filters = {
    role: normalizeUserRoleFilter(params.role),
    status: normalizeUserStatusFilter(params.status),
  };
  // 사용자 삭제는 MASTER_DATA_DELETE 권한이 있는 계정에만 노출한다.
  // deleteUserAccount가 서버에서 같은 권한을 다시 검사한다.
  const [users, options, canDelete] = await Promise.all([
    getUsersForHeadquarters(filters),
    getUserManagementOptions(),
    hasActionPermission(user.id, PermissionAction.MASTER_DATA_DELETE),
  ]);

  return (
    <HeadquartersShell
      userName={user.name ?? "본사 사용자"}
      userEmail={user.email ?? "headquarters"}
      navigationItems={navigationItems}
    >
      <PageHeader
        title="사용자/권한 관리"
        description="본사 사용자와 지점장 계정의 접근 범위를 관리합니다."
      />
      <UserManagementClient
        users={users}
        stores={options.stores}
        profiles={options.profiles}
        filters={filters}
        canDelete={canDelete}
      />
    </HeadquartersShell>
  );
}
