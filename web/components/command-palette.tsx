"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Clock,
  Calendar,
  Bell,
  FileText,
  BarChart3,
  Settings,
  Search,
  AlarmClock,
  Zap,
} from "lucide-react";
import { useAppStore } from "@/store/use-app-store";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

export function CommandPalette() {
  const router = useRouter();
  const { commandOpen, setCommandOpen } = useAppStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [commandOpen, setCommandOpen]);

  const icons: Record<string, React.ElementType> = {
    LayoutDashboard,
    Clock,
    Calendar,
    Bell,
    FileText,
    BarChart3,
    Settings,
    AlarmClock,
    Zap,
  };

  if (!commandOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCommandOpen(false)} />
      <div className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 px-4">
        <Command className="glass-strong rounded-xl border shadow-2xl overflow-hidden">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              placeholder="Search pages, actions..."
              className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>
            <Command.Group heading="Navigation">
              {siteConfig.dashboard.student.map((item) => {
                const Icon = icons[item.icon] || LayoutDashboard;
                return (
                  <Command.Item
                    key={item.href}
                    onSelect={() => {
                      router.push(item.href);
                      setCommandOpen(false);
                    }}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm aria-selected:bg-accent"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.title}
                  </Command.Item>
                );
              })}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
