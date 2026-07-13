"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard, Clock, Calendar, Bell, CheckCircle, FileText,
  BarChart3, Settings, Sparkles, LogOut, Menu, X, AlarmClock, Zap, PhoneCall
} from "lucide-react";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppStore } from "@/store/use-app-store";

const icons: Record<string, React.ElementType> = {
  LayoutDashboard, Clock, Calendar, Bell, CheckCircle, FileText, BarChart3, Settings, AlarmClock, Zap, Sparkles, PhoneCall
};

export function DashboardSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { sidebarOpen, setSidebarOpen } = useAppStore();

  const nav = session?.user?.role === "admin"
    ? siteConfig.dashboard.admin
    : siteConfig.dashboard.student;

  const content = (
    <motion.div className="flex h-full flex-col">
      <Link href="/dashboard" className="flex items-center gap-2 p-6 border-b border-white/5">
        <Sparkles className="h-5 w-5 text-primary" />
        <span className="font-bold">PlaceMint</span>
      </Link>
      <nav className="flex-1 space-y-1 p-4">
        {nav.map((item) => {
          const Icon = icons[item.icon] || LayoutDashboard;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all",
                active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>
      <motion.div className="border-t border-white/5 p-4">
        <motion.div className="flex items-center gap-3 mb-4">
          <Avatar className="h-9 w-9">
            <AvatarImage src={session?.user?.image || ""} />
            <AvatarFallback>{session?.user?.name?.[0] || "U"}</AvatarFallback>
          </Avatar>
          <motion.div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{session?.user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
          </motion.div>
        </motion.div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={async () => {
            try {
              await signOut({ callbackUrl: "/", redirect: true });
            } catch {
              window.location.assign("/");
            }
          }}
        >
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </motion.div>
    </motion.div>
  );

  return (
    <>
      <aside className="hidden lg:flex w-64 flex-col border-r border-white/5 glass-strong fixed inset-y-0 left-0 z-40">
        {content}
      </aside>
      {sidebarOpen && (
        <motion.div className="lg:hidden fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 glass-strong border-r">
            <Button variant="ghost" size="icon" className="absolute right-2 top-2" onClick={() => setSidebarOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
            {content}
          </aside>
        </motion.div>
      )}
    </>
  );
}

export function DashboardHeader({ title }: { title: string }) {
  const { setSidebarOpen, setCommandOpen } = useAppStore();
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-white/5 bg-background/80 backdrop-blur-xl px-4 lg:px-8">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
        <Menu className="h-5 w-5" />
      </Button>
      <h1 className="text-lg font-semibold flex-1">{title}</h1>
      <Button variant="outline" size="sm" onClick={() => setCommandOpen(true)} className="hidden sm:flex">
        <span className="text-muted-foreground mr-2">Search</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">⌘K</kbd>
      </Button>
    </header>
  );
}
