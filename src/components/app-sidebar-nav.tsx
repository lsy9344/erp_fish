"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HomeIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  TrendingUpIcon,
} from "lucide-react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { cn } from "~/lib/utils";

type AppSidebarIcon = "home" | "reports" | "master-data" | "settings";

export type AppSidebarNavigationItem = {
  label: string;
  href: string;
  icon: AppSidebarIcon;
};

const iconByKey = {
  home: HomeIcon,
  reports: TrendingUpIcon,
  "master-data": SlidersHorizontalIcon,
  settings: SettingsIcon,
};

type AppSidebarNavProps = {
  navigationItems: readonly AppSidebarNavigationItem[];
};

export function AppSidebarNav({ navigationItems }: AppSidebarNavProps) {
  const pathname = usePathname();

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupLabel className="px-1.5 text-xs font-semibold">
        메뉴
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {navigationItems.map((item) => {
            const Icon = iconByKey[item.icon];
            const isActive = isNavigationItemActive(pathname, item);

            return (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.label}
                  isActive={isActive}
                  className={cn(
                    "h-11 rounded-lg px-3 font-medium",
                    isActive &&
                      "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-sm",
                  )}
                >
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function isNavigationItemActive(
  pathname: string,
  item: AppSidebarNavigationItem,
) {
  if (item.label === "설정") {
    return false;
  }

  if (item.href === "/app/dashboard") {
    return pathname === item.href || pathname.startsWith("/app/ledgers/");
  }

  if (item.href.startsWith("/app/reports")) {
    return pathname.startsWith("/app/reports");
  }

  if (item.href === "/app/master-data/stores") {
    return pathname === item.href;
  }

  return pathname === item.href;
}
