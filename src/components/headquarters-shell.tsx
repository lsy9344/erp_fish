import { AppSidebar } from "~/components/app-sidebar";
import type { AppSidebarNavigationItem } from "~/components/app-sidebar-nav";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";

type HeadquartersShellProps = {
  userName: string;
  userEmail: string;
  navigationItems?: AppSidebarNavigationItem[];
  children: React.ReactNode;
};

export function HeadquartersShell({
  userName,
  userEmail,
  navigationItems = [],
  children,
}: HeadquartersShellProps) {
  return (
    <SidebarProvider className="bg-background">
      <AppSidebar
        userName={userName}
        userEmail={userEmail}
        navigationItems={navigationItems}
      />
      <SidebarInset className="bg-background">
        <div className="bg-background flex min-h-svh min-w-0 flex-col">
          <div className="bg-card/95 sticky top-0 z-20 flex h-14 items-center border-b px-4 backdrop-blur md:hidden">
            <SidebarTrigger />
          </div>
          <div className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-1 flex-col gap-6 px-4 py-5 md:px-6 lg:px-10 lg:py-8">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
