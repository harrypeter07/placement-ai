import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { CommandPalette } from "@/components/command-palette";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DashboardSidebar />
      <main className="lg:pl-64 min-h-screen">{children}</main>
      <CommandPalette />
    </>
  );
}
