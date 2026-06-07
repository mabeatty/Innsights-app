import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { DashboardHeaderInline } from "@/components/dashboard/DashboardHeaderInline";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b px-4 bg-card gap-3">
            <SidebarTrigger />
            <DashboardHeaderInline />
            <NotificationBell />
          </header>
          <main className="flex-1 p-6 overflow-y-auto overflow-x-hidden min-w-0">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
