"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Clock, AlarmClock, ClipboardList, User, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { href: "/dashboard/deadlines", icon: Clock, label: "Placements" },
  { href: "/dashboard/forms", icon: ClipboardList, label: "Forms" },
  { href: "/dashboard/profile", icon: User, label: "Profile" },
  { href: "/dashboard/reminders", icon: AlarmClock, label: "Reminders" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed top-0 inset-x-0 z-40 border-b border-white/10 bg-background/95 backdrop-blur-xl">
      <div className="flex items-center justify-around h-14 px-1">
        {items.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 py-1.5 text-[10px] transition-colors",
                active ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4", active && "drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]")} />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
