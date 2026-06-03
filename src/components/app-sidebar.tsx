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

const navigationItems = [
  { label: "홈", href: "/app/dashboard", icon: "home" },
  {
    label: "리포트",
    href: "/app/reports/daily",
    icon: "reports",
  },
  {
    label: "기준정보",
    href: "/app/master-data/stores",
    icon: "master-data",
  },
  {
    label: "품목 마스터",
    href: "/app/master-data/products",
    icon: "master-data",
  },
  {
    label: "매입 기준",
    href: "/app/master-data/purchase-standards",
    icon: "master-data",
  },
  {
    label: "이상 신호 기준값",
    href: "/app/master-data/anomaly-thresholds",
    icon: "master-data",
  },
  {
    label: "코드 관리",
    href: "/app/master-data/codes",
    icon: "master-data",
  },
  {
    label: "사용자/권한",
    href: "/app/master-data/users",
    icon: "master-data",
  },
  {
    label: "변경 이력",
    href: "/app/master-data/history",
    icon: "master-data",
  },
  {
    label: "설정",
    href: "/app/master-data/users",
    icon: "settings",
  },
] satisfies AppSidebarNavigationItem[];

type AppSidebarProps = {
  userName: string;
  userEmail: string;
};

export function AppSidebar({ userName, userEmail }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" className="border-sidebar-border bg-sidebar">
      <SidebarHeader className="border-sidebar-border border-b p-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold shadow-sm">
            EF
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <span className="text-primary block truncate text-base font-semibold">
              ERP Fish
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
