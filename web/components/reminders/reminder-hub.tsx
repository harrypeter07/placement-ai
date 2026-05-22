"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlarmClock,
  Bell,
  Check,
  Clock,
  Flame,
  Loader2,
  Pause,
  Sparkles,
} from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

type DeadlineRef = {
  _id: string;
  company?: string;
  role?: string;
  deadline?: string;
};

type ReminderRow = {
  _id: string;
  title?: string;
  message?: string;
  aiSummary?: string;
  scheduledAt: string;
  status: string;
  priority: string;
  enabled: boolean;
  escalationLevel?: string;
  escalationCount?: number;
  reminderStyle?: string;
  aiSuggested?: boolean;
  deadlineId?: DeadlineRef | string;
};

const levelColors: Record<string, string> = {
  soft: "bg-slate-500/20 text-slate-300",
  normal: "bg-blue-500/20 text-blue-300",
  urgent: "bg-amber-500/20 text-amber-300",
  critical: "bg-red-500/20 text-red-300",
};

function msUntil(iso: string) {
  return new Date(iso).getTime() - Date.now();
}

function countdown(iso: string) {
  const ms = msUntil(iso);
  if (ms <= 0) return "Due now";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)}d left`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ReminderHub() {
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("active");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/reminders", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setReminders(d);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patchReminder(id: string, body: object) {
    const res = await fetch(`/api/reminders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) toast.error("Action failed");
    else {
      toast.success("Updated");
      load();
    }
  }

  const filtered = useMemo(() => {
    return reminders.filter((r) => {
      if (filter === "active") return r.status === "active" || r.status === "snoozed";
      if (filter === "completed") return r.status === "completed";
      return true;
    });
  }, [reminders, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, ReminderRow[]>();
    for (const r of filtered) {
      const dl = typeof r.deadlineId === "object" ? r.deadlineId : null;
      const key = dl?.company ? `${dl.company} — ${dl.role || "Role"}` : "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => msUntil(a[1][0].scheduledAt) - msUntil(b[1][0].scheduledAt));
  }, [filtered]);

  const stats = useMemo(() => {
    const active = reminders.filter((r) => r.status === "active" || r.status === "snoozed").length;
    const critical = reminders.filter((r) => r.escalationLevel === "critical" || r.priority === "critical").length;
    const dueSoon = reminders.filter((r) => msUntil(r.scheduledAt) > 0 && msUntil(r.scheduledAt) < 24 * 3_600_000).length;
    return { active, critical, dueSoon };
  }, [reminders]);

  return (
    <>
      <DashboardHeader title="Reminder Hub" />
      <main className="p-4 lg:p-8 space-y-6 max-w-4xl pb-8">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Active", value: stats.active, icon: Bell },
            { label: "Due <24h", value: stats.dueSoon, icon: Clock },
            { label: "Critical", value: stats.critical, icon: Flame },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="glass glow-border">
              <CardContent className="pt-4 pb-3 flex items-center gap-3">
                <Icon className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="glass border-primary/20">
          <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              AI escalation, push notifications, and calendar sync stay on — configure in{" "}
              <Link href="/dashboard/settings" className="text-primary underline">
                Settings
              </Link>
              .
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/deadlines?tab=reminders">
                <Sparkles className="h-4 w-4 mr-1" /> Placements view
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList className="bg-muted/40">
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="completed">Done</TabsTrigger>
          </TabsList>
          <TabsContent value={filter} className="mt-4 space-y-4">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : grouped.length === 0 ? (
              <Card className="glass">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <AlarmClock className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>No reminders here yet.</p>
                  <Button variant="glow" className="mt-4" asChild>
                    <Link href="/dashboard/deadlines">Add from placements</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              grouped.map(([group, items]) => (
                <Card key={group} className="glass overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{group}</CardTitle>
                    <CardDescription>Timeline — soonest first</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 p-0 pb-2">
                    <AnimatePresence>
                      {items
                        .sort((a, b) => msUntil(a.scheduledAt) - msUntil(b.scheduledAt))
                        .map((r, i) => {
                          const dl = typeof r.deadlineId === "object" ? r.deadlineId : null;
                          const level = r.escalationLevel || "normal";
                          return (
                            <motion.div
                              key={r._id}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.03 }}
                              className="flex gap-3 px-4 py-3 border-t border-white/5 items-start"
                            >
                              <div className="w-1 rounded-full bg-primary/40 self-stretch min-h-[48px]" />
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium text-sm truncate">{r.title || "Reminder"}</p>
                                  <Badge className={cn("text-[10px]", levelColors[level])}>{level}</Badge>
                                  {r.aiSuggested && (
                                    <Badge variant="outline" className="text-[10px]">
                                      AI
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                  {r.aiSummary || r.message}
                                </p>
                                <p className="text-xs text-primary mt-1 font-mono">
                                  {countdown(r.scheduledAt)} · {formatDate(r.scheduledAt)}
                                  {dl?.deadline ? ` · deadline ${formatDate(dl.deadline)}` : ""}
                                </p>
                              </div>
                              <div className="flex flex-col gap-1 shrink-0">
                                <Switch
                                  checked={r.enabled}
                                  onCheckedChange={(on) =>
                                    void patchReminder(r._id, on ? { action: "resume" } : { action: "pause" })
                                  }
                                />
                                <div className="flex gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    title="Snooze 1h"
                                    onClick={() => void patchReminder(r._id, { action: "snooze", snoozeMinutes: 60 })}
                                  >
                                    <Pause className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    title="Complete"
                                    onClick={() => void patchReminder(r._id, { action: "complete" })}
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Student productivity
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong className="text-foreground">Streak tip:</strong> Complete reminders on time to build your placement streak in Analytics.
            </p>
            <p>
              <strong className="text-foreground">Busy week:</strong> Check Calendar for overlapping deadlines.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button size="sm" variant="outline" asChild>
                <Link href="/dashboard/automation">AI automation</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/dashboard/resume">Resume prep</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
