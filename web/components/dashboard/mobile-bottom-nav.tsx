"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Clock, Bell, AlarmClock, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { href: "/dashboard/deadlines", icon: Clock, label: "Placements" },
  { href: "/dashboard/reminders", icon: AlarmClock, label: "Reminders" },
  { href: "/dashboard/notifications", icon: Bell, label: "Alerts" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/10 bg-background/90 backdrop-blur-xl safe-area-pb">
      <div className="flex items-center justify-around h-16 px-1">
        {items.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 py-2 text-[10px] transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]")} />
              <span className="font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
