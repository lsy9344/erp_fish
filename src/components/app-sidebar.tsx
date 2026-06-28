import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "~/components/ui/sidebar";
import { LogoutButton } from "~/components/logout-button";
import {
  AppSidebarNav,
  type AppSidebarNavigationItem,
} from "~/components/app-sidebar-nav";
import { PermissionAction } from "../../generated/prisma";
import { hasActionPermission } from "~/server/authz";
import { APP_DISPLAY_NAME } from "~/lib/brand";

type PermissionAwareNavigationItem = AppSidebarNavigationItem & {
  requiredAction: PermissionAction;
};

const headquartersNavigationItems = [
  {
    label: "홈",
    href: "/app/dashboard",
    icon: "home",
    requiredAction: PermissionAction.REPORT_VIEW,
  },
  {
    label: "리포트",
    href: "/app/reports/daily",
    icon: "reports",
    requiredAction: PermissionAction.REPORT_VIEW,
  },
  {
    label: "본사 지출",
    href: "/app/headquarters-expenses",
    icon: "expenses",
    requiredAction: PermissionAction.SETTINGS_MANAGE,
  },
  {
    label: "기준정보",
    href: "/app/master-data/stores",
    icon: "master-data",
    requiredAction: PermissionAction.SETTINGS_MANAGE,
  },
  {
    label: "품목 마스터",
    href: "/app/master-data/products",
    icon: "master-data",
    requiredAction: PermissionAction.SETTINGS_MANAGE,
  },
  {
    label: "이카운트 업로드",
    href: "/app/ecount-imports",
    icon: "expenses",
    requiredAction: PermissionAction.UPLOAD_PREVIEW,
  },
  {
    // DEPRECATED(2026-06-24): 매입 기준 단계적 비활성화. 참고 단가 조회 수준으로만 유지한다.
    label: "품목 참고 단가",
    href: "/app/master-data/purchase-standards",
    icon: "master-data",
    requiredAction: PermissionAction.SETTINGS_MANAGE,
  },
  {
    label: "이상 신호 기준값",
    href: "/app/master-data/anomaly-thresholds",
    icon: "master-data",
    requiredAction: PermissionAction.SETTINGS_MANAGE,
  },
  {
    // WO-13(2026-06-28): 품목군별 장기재고 기준일 관리.
    label: "장기재고 기준일",
    href: "/app/master-data/long-stock-thresholds",
    icon: "master-data",
    requiredAction: PermissionAction.SETTINGS_MANAGE,
  },
  {
    label: "코드 관리",
    href: "/app/master-data/codes",
    icon: "master-data",
    requiredAction: PermissionAction.SETTINGS_MANAGE,
  },
  {
    label: "사용자/권한",
    href: "/app/master-data/users",
    icon: "master-data",
    requiredAction: PermissionAction.USER_PERMISSION_MANAGE,
  },
  {
    label: "변경 이력",
    href: "/app/master-data/history",
    icon: "master-data",
    requiredAction: PermissionAction.SETTINGS_MANAGE,
  },
] satisfies PermissionAwareNavigationItem[];

export async function filterHeadquartersNavigationItems(userId: string) {
  const allowedActions = new Set(
    (
      await Promise.all(
        Object.values(PermissionAction).map(async (action) => ({
          action,
          allowed: await hasActionPermission(userId, action),
        })),
      )
    )
      .filter(({ allowed }) => allowed)
      .map(({ action }) => action),
  );

  return headquartersNavigationItems
    .filter((item) => allowedActions.has(item.requiredAction))
    .map(({ requiredAction: _requiredAction, ...item }) => item);
}

export async function getHeadquartersNavigationItems(userId: string) {
  return filterHeadquartersNavigationItems(userId);
}

type AppSidebarProps = {
  userName: string;
  userEmail: string;
  navigationItems: AppSidebarNavigationItem[];
};

export function AppSidebar({
  userName,
  userEmail,
  navigationItems,
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" className="border-sidebar-border bg-sidebar">
      <SidebarHeader className="border-sidebar-border border-b p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold shadow-sm">
            EF
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="text-primary block truncate text-base font-semibold">
              {APP_DISPLAY_NAME}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              본사 업무
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-3 py-4">
        <AppSidebarNav navigationItems={navigationItems} />
      </SidebarContent>
      <SidebarFooter className="border-sidebar-border border-t p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5 text-sm group-data-[collapsible=icon]:hidden">
            <span className="truncate font-medium">{userName}</span>
            <span className="text-muted-foreground truncate">{userEmail}</span>
          </div>
          <LogoutButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
