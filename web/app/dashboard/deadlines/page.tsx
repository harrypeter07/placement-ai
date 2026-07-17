"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  ExternalLink,
  AlarmClock,
  Calendar,
  RefreshCw,
  Pause,
  Play,
  Trash2,
  Sparkles,
} from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { LoadingButton } from "@/components/ui/loading-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatRelative, getUrgencyLevel } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDashboardCache } from "@/store/use-dashboard-cache";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import type { DeadlineStatus } from "@/types";

interface Deadline {
  _id: string;
  company: string;
  role: string;
  deadline: string;
  status: DeadlineStatus;
  eligibility: string;
  links: string[];
  notes?: string;
  sourceMessageText?: string;
}

interface PopulatedDeadline {
  _id: string;
  company: string;
  role: string;
  deadline: string;
}

interface ReminderRow {
  _id: string;
  scheduledAt: string;
  status: string;
  priority: string;
  title?: string;
  message?: string;
  aiSuggested?: boolean;
  deadlineId?: PopulatedDeadline | string;
}

const statusColors: Record<DeadlineStatus, "default" | "success" | "warning" | "critical" | "secondary"> = {
  applied: "success",
  pending: "secondary",
  missed: "critical",
  rejected: "critical",
  oa_scheduled: "warning",
  interview_scheduled: "success",
};

function deadlineLabel(r: ReminderRow) {
  const d = r.deadlineId;
  if (d && typeof d === "object" && "company" in d) return `${d.company} — ${d.role}`;
  return "Deadline";
}

function PlacementsContent() {
  const cache = useDashboardCache();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("urgency");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ company: "", role: "", deadline: "", notes: "" });
  const [savingDeadline, setSavingDeadline] = useState(false);
  const [syncingCal, setSyncingCal] = useState(false);
  const [reminderActionId, setReminderActionId] = useState<string | null>(null);

  const deadlineFetcher = useCallback(async () => {
    const params = new URLSearchParams({ sort });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (search) params.set("search", search);
    const res = await fetch(`/api/deadlines?${params}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }, [sort, statusFilter, search]);

  const {
    data: deadlines,
    loading: loadingDl,
    refreshing: refreshingDl,
    refresh: refreshDeadlines,
  } = useCachedFetch<Deadline[]>({
    key: `deadlines-${sort}-${statusFilter}-${search}`,
    fetcher: deadlineFetcher,
    getCached: () => cache.getDeadlines() as Deadline[] | null,
    setCached: (d) => cache.setDeadlines(d),
    isFresh: () => cache.isDeadlinesFresh(),
    pollMs: 120_000,
  });

  const {
    data: reminders,
    loading: loadingRm,
    refreshing: refreshingRm,
    refresh: refreshReminders,
  } = useCachedFetch<ReminderRow[]>({
    key: "reminders",
    fetcher: async () => {
      const res = await fetch("/api/reminders");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    getCached: () => cache.getReminders() as ReminderRow[] | null,
    setCached: (d) => cache.setReminders(d),
    isFresh: () => cache.isRemindersFresh(),
    pollMs: 90_000,
  });



  async function updateStatus(id: string, status: DeadlineStatus) {
    setReminderActionId(id);
    try {
      const res = await fetch(`/api/deadlines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Update failed");
      toast.success("Status updated");
      cache.invalidateDeadlines();
      await refreshDeadlines();
    } catch {
      toast.error("Could not update status");
    } finally {
      setReminderActionId(null);
    }
  }

  async function createDeadline(e: React.FormEvent) {
    e.preventDefault();
    setSavingDeadline(true);
    try {
      const res = await fetch("/api/deadlines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Deadline added");
      setOpen(false);
      setForm({ company: "", role: "", deadline: "", notes: "" });
      cache.invalidateDeadlines();
      cache.invalidateCalendar();
      await refreshDeadlines();
    } catch {
      toast.error("Failed to add deadline");
    } finally {
      setSavingDeadline(false);
    }
  }

  async function syncCalendar() {
    setSyncingCal(true);
    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      toast.success(data.message || "Synced to Google Calendar");
      cache.invalidateCalendar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncingCal(false);
    }
  }

  async function reminderAct(id: string, body: object) {
    setReminderActionId(id);
    try {
      const res = await fetch(`/api/reminders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Updated");
      cache.invalidateReminders();
      await refreshReminders();
    } catch {
      toast.error("Could not update reminder");
    } finally {
      setReminderActionId(null);
    }
  }

  async function removeReminder(id: string) {
    if (!confirm("Delete this reminder?")) return;
    setReminderActionId(id);
    try {
      const res = await fetch(`/api/reminders/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      toast.success("Removed");
      cache.invalidateReminders();
      await refreshReminders();
    } catch {
      toast.error("Delete failed");
    } finally {
      setReminderActionId(null);
    }
  }

  const customReminders = useMemo(() => {
    return reminders?.filter((r) => {
      if (r.status === "completed" || r.status === "cancelled") return false;
      const dl = typeof r.deadlineId === "object" ? r.deadlineId : null;
      return !dl && !r.deadlineId;
    }) || [];
  }, [reminders]);

  const dlList = deadlines || [];

  return (
    <>
      <DashboardHeader title="Placements" />
      <main className="p-4 lg:p-8 space-y-6 max-w-5xl">
        <div className="flex flex-wrap gap-2 justify-between items-center">
          <p className="text-sm text-muted-foreground max-w-xl">
            Deadlines and reminders in one place — synced with{" "}
            <Link href="/dashboard/calendar" className="text-primary underline">
              Calendar
            </Link>{" "}
            and Telegram insights.
          </p>
          <ToolbarButtons
            refreshing={refreshingDl || refreshingRm}
            onRefresh={async () => {
              await Promise.all([refreshDeadlines(), refreshReminders()]);
            }}
            onSyncCal={syncCalendar}
            syncingCal={syncingCal}
          />
        </div>

        <DeadlineFilters
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          sort={sort}
          setSort={setSort}
          open={open}
          setOpen={setOpen}
          form={form}
          setForm={setForm}
          onSubmit={createDeadline}
          saving={savingDeadline}
        />

        {loadingDl && !dlList.length ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : dlList.length === 0 ? (
          <Card className="glass">
            <CardContent className="py-12 text-center text-muted-foreground">
              No deadlines. Add one or enable Telegram monitoring in Notifications.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {dlList.map((d) => {
              const urgency = getUrgencyLevel(d.deadline);
              // Find matching alarms/reminders for this deadline
              const deadlineReminders = reminders?.filter((r) => {
                if (r.status === "completed" || r.status === "cancelled") return false;
                const dl = typeof r.deadlineId === "object" ? r.deadlineId : null;
                return dl ? dl._id === d._id : r.deadlineId === d._id;
              }) || [];

              return (
                <Card key={d._id} className="glass glow-border">
                  <CardContent className="p-4 flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground text-base">{d.company}</h3>
                          <Badge variant={statusColors[d.status]}>{d.status.replace("_", " ")}</Badge>
                          <Badge variant={urgency === "critical" ? "critical" : "outline"}>
                            {formatRelative(d.deadline)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{d.role}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Due {formatDate(d.deadline)}
                        </p>
                        {d.sourceMessageText && (
                          <div className="mt-2 text-[11px] text-muted-foreground bg-black/10 p-2.5 rounded-lg border border-white/5 whitespace-pre-wrap max-h-24 overflow-y-auto">
                            <strong className="text-foreground">Source Message:</strong>
                            <p className="mt-1 font-mono opacity-85 leading-relaxed">{d.sourceMessageText}</p>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <Select
                          value={d.status}
                          onValueChange={(v) => updateStatus(d._id, v as DeadlineStatus)}
                          disabled={reminderActionId === d._id}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.keys(statusColors).map((s) => (
                              <SelectItem key={s} value={s}>
                                {s.replace("_", " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {d.links?.[0] && (
                          <Button variant="outline" size="icon" asChild>
                            <a href={d.links[0]} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Inline alarms/reminders list for this deadline */}
                    {deadlineReminders.length > 0 && (
                      <div className="pt-3 border-t border-white/5 space-y-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <AlarmClock className="h-3 w-3 text-primary animate-pulse" /> Scheduled call alarms
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {deadlineReminders.map((r) => {
                            const date = new Date(r.scheduledAt);
                            const dayName = date.toLocaleDateString("en-IN", { weekday: 'short' }); // e.g. Mon
                            const dateStr = date.toLocaleDateString("en-IN", { day: 'numeric', month: 'short' }); // e.g. 17 Jul
                            const timeStr = date.toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit', hour12: false }); // e.g. 09:00

                            return (
                              <div
                                key={r._id}
                                className={cn(
                                  "flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-mono transition-all duration-200",
                                  r.status === "active"
                                    ? "bg-primary/5 border-primary/20 text-foreground"
                                    : "bg-white/[0.01] border-white/5 text-muted-foreground line-through opacity-40"
                                )}
                              >
                                <span>{dayName}, {dateStr} {timeStr}</span>
                                
                                <LoadingButton
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5 hover:bg-white/10 shrink-0 text-muted-foreground hover:text-foreground"
                                  loading={reminderActionId === r._id}
                                  title={r.status === "paused" ? "Resume" : "Pause"}
                                  onClick={() => void reminderAct(r._id, { status: r.status === "paused" ? "active" : "paused" })}
                                >
                                  {r.status === "paused" ? <Play className="h-2.5 w-2.5" /> : <Pause className="h-2.5 w-2.5" />}
                                </LoadingButton>

                                <LoadingButton
                                  size="icon"
                                  variant="ghost"
                                  className="h-5 w-5 hover:bg-red-500/10 hover:text-red-400 shrink-0"
                                  loading={reminderActionId === r._id}
                                  title="Delete Alert"
                                  onClick={() => void removeReminder(r._id)}
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </LoadingButton>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Custom / General Alarms Section */}
        {!loadingRm && customReminders.length > 0 && (
          <div className="mt-8 space-y-3 pt-6 border-t border-white/10">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <AlarmClock className="h-4 w-4 text-primary animate-bounce" /> Custom Alarms & Reminders
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {customReminders.map((r) => {
                const date = new Date(r.scheduledAt);
                const dateText = `${date.toLocaleDateString("en-IN", { weekday: 'short', day: 'numeric', month: 'short' })} @ ${date.toLocaleTimeString("en-IN", { hour: '2-digit', minute: '2-digit', hour12: false })}`;

                return (
                  <Card key={r._id} className="glass">
                    <CardContent className="p-4 flex justify-between items-center gap-3">
                      <div>
                        <p className="font-semibold text-sm text-foreground">{r.title || "Custom Alarm"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{r.message}</p>
                        <p className="text-[10px] font-mono text-muted-foreground mt-1.5">
                          {dateText} · {r.status}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <LoadingButton
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0"
                          loading={reminderActionId === r._id}
                          onClick={() => void reminderAct(r._id, { status: r.status === "paused" ? "active" : "paused" })}
                        >
                          {r.status === "paused" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                        </LoadingButton>
                        <LoadingButton
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 hover:text-red-400"
                          loading={reminderActionId === r._id}
                          onClick={() => void removeReminder(r._id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </LoadingButton>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

function ToolbarButtons({
  refreshing,
  onRefresh,
  onSyncCal,
  syncingCal,
}: {
  refreshing: boolean;
  onRefresh: () => Promise<void>;
  onSyncCal: () => Promise<void>;
  syncingCal: boolean;
}) {
  return (
    <div className="flex gap-2">
      <LoadingButton variant="outline" size="sm" loading={refreshing} onClick={() => void onRefresh()}>
        <RefreshCw className="h-4 w-4 mr-1" /> Refresh
      </LoadingButton>
      <LoadingButton variant="outline" size="sm" loading={syncingCal} onClick={() => void onSyncCal()}>
        <Calendar className="h-4 w-4 mr-1" /> Sync calendar
      </LoadingButton>
    </div>
  );
}

function DeadlineFilters({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  sort,
  setSort,
  open,
  setOpen,
  form,
  setForm,
  onSubmit,
  saving,
}: {
  search: string;
  setSearch: (s: string) => void;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  sort: string;
  setSort: (s: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  form: { company: string; role: string; deadline: string; notes: string };
  setForm: (f: { company: string; role: string; deadline: string; notes: string }) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search companies..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="past">Past / Missed</SelectItem>
          {Object.keys(statusColors).map((s) => (
            <SelectItem key={s} value={s}>
              {s.replace("_", " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={sort} onValueChange={setSort}>
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="urgency">By Urgency</SelectItem>
          <SelectItem value="deadline">By Date</SelectItem>
          <SelectItem value="company">By Company</SelectItem>
        </SelectContent>
      </Select>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="glow">
            <Plus className="h-4 w-4 mr-2" /> Add deadline
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add deadline</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label>Company</Label>
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Role</Label>
              <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} required />
            </div>
            <div>
              <Label>Deadline</Label>
              <Input
                type="datetime-local"
                value={form.deadline}
                onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <LoadingButton type="submit" variant="glow" className="w-full" loading={saving} loadingText="Saving…">
              Save
            </LoadingButton>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PlacementsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 m-8 rounded-xl" />}>
      <PlacementsContent />
    </Suspense>
  );
}
