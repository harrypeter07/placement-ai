"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard, Clock, Calendar, Bell, CheckCircle, FileText,
  BarChart3, Settings, Sparkles, LogOut, Menu, X, AlarmClock, Zap, PhoneCall, Smartphone, ClipboardList, User
} from "lucide-react";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppStore } from "@/store/use-app-store";

const icons: Record<string, React.ElementType> = {
  LayoutDashboard, Clock, Calendar, Bell, CheckCircle, FileText, BarChart3, Settings, AlarmClock, Zap, Sparkles, PhoneCall, ClipboardList, User
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
        <div className="space-y-1 mb-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-xs bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("open-pwa-install-banner"));
            }}
          >
            <Smartphone className="h-3.5 w-3.5 mr-2" /> Install App (PWA)
          </Button>
        </div>
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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-slate-950/80 backdrop-blur-xl px-4 lg:px-8 shadow-lg">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="lg:hidden text-purple-300" onClick={() => setSidebarOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-base font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-purple-300 bg-clip-text text-transparent">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Live Status Indicators */}
        <div className="hidden md:flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[11px] font-mono">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            Form AI Active
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-300 text-[11px] font-mono">
            <Sparkles className="h-3 w-3 text-purple-400" />
            Telegram Ingestion
          </span>
        </div>

        {/* Quick Action CTA Shortcuts */}
        <Link href="/dashboard/forms">
          <Button size="sm" variant="glow" className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5 h-8 px-3">
            <ClipboardList className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Auto-Fill Form</span>
          </Button>
        </Link>

        {/* Command Search Trigger */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCommandOpen(true)}
          className="hidden sm:flex border-white/10 bg-white/5 hover:bg-white/10 text-xs h-8 gap-2"
        >
          <span className="text-muted-foreground">Search</span>
          <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border border-white/10 bg-black/40 px-1.5 font-mono text-[10px] font-medium text-purple-300">
            ⌘K
          </kbd>
        </Button>
      </div>
    </header>
  );
}
