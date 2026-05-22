import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { MobileBottomNav } from "@/components/dashboard/mobile-bottom-nav";
import { CommandPalette } from "@/components/command-palette";
import { ReminderToastPoller } from "@/components/reminder-toast-poller";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DashboardSidebar />
      <main className="lg:pl-64 min-h-screen pb-20 lg:pb-0">{children}</main>
      <MobileBottomNav />
      <CommandPalette />
      <ReminderToastPoller />
    </>
  );
}
