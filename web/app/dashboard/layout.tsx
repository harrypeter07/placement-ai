import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { ReminderToastPoller } from "@/components/reminder-toast-poller";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DashboardSidebar />
      <main className="lg:pl-64 min-h-screen">{children}</main>
      <CommandPalette />
      <ReminderToastPoller />
    </>
  );
}
