import { AppSidebar } from "~/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";

type HeadquartersShellProps = {
  userName: string;
  userEmail: string;
  children: React.ReactNode;
};

export function HeadquartersShell({
  userName,
  userEmail,
  children,
}: HeadquartersShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar userName={userName} userEmail={userEmail} />
      <SidebarInset>
        <div className="flex min-h-svh flex-col">
          <div className="flex h-12 items-center border-b px-4">
            <SidebarTrigger />
          </div>
          <div className="flex flex-1 flex-col gap-6 p-6">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
