import { LogoutButton } from "~/components/logout-button";
import { StoreManagerNavigation } from "~/components/store-manager-navigation";
import { APP_DISPLAY_NAME } from "~/lib/brand";

type StoreManagerShellProps = {
  userName: string;
  storeName?: string;
  storeId?: string;
  children: React.ReactNode;
};

export function StoreManagerShell({
  userName,
  storeName,
  storeId,
  children,
}: StoreManagerShellProps) {
  return (
    <div className="bg-background min-h-svh">
      <header className="bg-card/95 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <div className="min-w-0">
            <p className="text-primary truncate text-sm font-semibold">
              {APP_DISPLAY_NAME}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {storeName ? `${storeName} · ${userName}` : userName}
            </p>
          </div>
          <StoreManagerNavigation storeId={storeId} variant="top" />
          <div className="shrink-0">
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
        {children}
      </main>
      <StoreManagerNavigation storeId={storeId} variant="bottom" />
    </div>
  );
}
