"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenIcon, PackageIcon, TriangleAlertIcon } from "lucide-react";

import { cn } from "~/lib/utils";

// WO(2026-06-25): 판매한 가격 입력은 3단계 매입 화면으로 통합돼 별도 "판매한 가격" 메뉴를
// 기본 네비게이션에서 제거했다. 기존 /app/store-entry/sales-plan 링크는 매입 단계로 redirect한다.
const storeNavItems = [
  {
    label: "장부",
    href: "/app/store-entry",
    icon: BookOpenIcon,
  },
  {
    label: "재고",
    href: "/app/store-entry/inventory",
    icon: PackageIcon,
  },
  {
    label: "손실",
    href: "/app/store-entry/losses",
    icon: TriangleAlertIcon,
  },
];

type StoreManagerNavigationProps = {
  storeId?: string;
  variant: "top" | "bottom";
};

function getStoreScopedHref(href: string, storeId?: string) {
  if (!storeId) {
    return href;
  }

  const params = new URLSearchParams({ storeId });

  return `${href}?${params.toString()}`;
}

function isStoreNavItemActive(pathname: string, href: string) {
  if (href === "/app/store-entry") {
    return pathname === href;
  }

  return pathname.startsWith(href);
}

export function StoreManagerNavigation({
  storeId,
  variant,
}: StoreManagerNavigationProps) {
  const pathname = usePathname();

  if (variant === "top") {
    return (
      <nav
        className="hidden items-center gap-1 md:flex"
        aria-label="지점장 업무"
      >
        {storeNavItems.map((item) => {
          const isActive = isStoreNavItemActive(pathname, item.href);

          return (
            <Link
              key={item.label}
              href={getStoreScopedHref(item.href, storeId)}
              prefetch={false}
              data-active={isActive}
              aria-current={isActive ? "page" : undefined}
              data-unsaved-guard-nav="store-shell"
              className={cn(
                "text-muted-foreground hover:bg-primary/10 hover:text-primary inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium",
                isActive && "bg-primary/10 text-primary",
              )}
            >
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      className="bg-card fixed inset-x-0 bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgb(15_23_42/0.08)] md:hidden"
      aria-label="지점장 하단 업무"
    >
      <div className="grid min-h-14 grid-cols-3">
        {storeNavItems.map((item) => {
          const isActive = isStoreNavItemActive(pathname, item.href);

          return (
            <Link
              key={item.label}
              href={getStoreScopedHref(item.href, storeId)}
              prefetch={false}
              data-active={isActive}
              aria-current={isActive ? "page" : undefined}
              data-unsaved-guard-nav="store-shell"
              className={cn(
                "text-muted-foreground hover:bg-primary/10 hover:text-primary flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                isActive && "bg-primary/10 text-primary",
              )}
            >
              <item.icon className="size-5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
