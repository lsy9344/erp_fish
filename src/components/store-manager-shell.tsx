import Link from "next/link";
import {
  BookOpenIcon,
  PackageIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { cn } from "~/lib/utils";

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

type StoreManagerShellProps = {
  userName: string;
  storeName?: string;
  storeId?: string;
  children: React.ReactNode;
};

function getStoreScopedHref(href: string, storeId?: string) {
  if (!storeId) {
    return href;
  }

  const params = new URLSearchParams({ storeId });

  return `${href}?${params.toString()}`;
}

export function StoreManagerShell({
  userName,
  storeName,
  storeId,
  children,
}: StoreManagerShellProps) {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">ERP Fish</p>
            <p className="truncate text-xs text-muted-foreground">
              {storeName ? `${storeName} · ${userName}` : userName}
            </p>
          </div>
          <nav className="hidden items-center gap-1 md:flex" aria-label="지점장 업무">
            {storeNavItems.map((item) => (
              <Link
                key={item.label}
                href={getStoreScopedHref(item.href, storeId)}
                className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
        {children}
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="지점장 하단 업무"
      >
        <div className="grid min-h-14 grid-cols-3">
          {storeNavItems.map((item) => (
            <Link
              key={item.label}
              href={getStoreScopedHref(item.href, storeId)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="size-5" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
