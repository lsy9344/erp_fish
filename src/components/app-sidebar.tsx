import Link from "next/link";
import {
  HomeIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  TrendingUpIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";

const navigationItems = [
  { label: "홈", href: "/app/dashboard", icon: HomeIcon },
  {
    label: "리포트",
    href: "/app/master-data/history",
    icon: TrendingUpIcon,
  },
  {
    label: "기준정보",
    href: "/app/master-data/stores",
    icon: SlidersHorizontalIcon,
  },
  {
    label: "품목 마스터",
    href: "/app/master-data/products",
    icon: SlidersHorizontalIcon,
  },
  {
    label: "매입 기준",
    href: "/app/master-data/purchase-standards",
    icon: SlidersHorizontalIcon,
  },
  {
    label: "코드 관리",
    href: "/app/master-data/codes",
    icon: SlidersHorizontalIcon,
  },
  {
    label: "사용자/권한",
    href: "/app/master-data/users",
    icon: SlidersHorizontalIcon,
  },
  {
    label: "변경 이력",
    href: "/app/master-data/history",
    icon: SlidersHorizontalIcon,
  },
  {
    label: "설정",
    href: "/app/master-data/users",
    icon: SettingsIcon,
  },
];

type AppSidebarProps = {
  userName: string;
  userEmail: string;
};

export function AppSidebar({ userName, userEmail }: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex flex-col gap-0.5 px-2 py-1.5">
          <span className="truncate text-sm font-semibold">ERP Fish</span>
          <span className="text-muted-foreground truncate text-xs">
            본사 업무
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>메뉴</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton asChild tooltip={item.label}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex flex-col gap-0.5 px-2 py-1.5 text-xs">
          <span className="truncate font-medium">{userName}</span>
          <span className="text-muted-foreground truncate">{userEmail}</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
