"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useDashboardCache } from "@/store/use-dashboard-cache";
import { LoadingButton } from "@/components/ui/loading-button";

type CalSource = "placemint" | "google";

interface CalEvent {
  id: string;
  source: CalSource;
  title: string;
  start: string;
  end?: string;
  status?: string;
  googleEventId?: string | null;
  htmlLink?: string | null;
  description?: string | null;
  location?: string | null;
  allDay?: boolean;
  company?: string;
  role?: string;
  eligibility?: string;
  notes?: string;
  links?: string[];
  isGlobal?: boolean;
  userId?: string | null;
}

/** Map event start to calendar cell (fixes all-day / timezone off-by-one). */
function dayKeyForEvent(start: string) {
  const s = start.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s.slice(0, 10);
  return format(d, "yyyy-MM-dd");
}

function formatTime(iso: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return "All day";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

function toDateInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return format(d, "yyyy-MM-dd");
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [merged, setMerged] = useState<CalEvent[]>([]);
  const [googleCount, setGoogleCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [googleFetchError, setGoogleFetchError] = useState<string | null>(null);
  const [fetchCounts, setFetchCounts] = useState<{
    googleFromApi: number;
    deadlines: number;
    merged: number;
  } | null>(null);
  const [timeZone, setTimeZone] = useState("Asia/Kolkata");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const cache = useDashboardCache();

  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    return t;
  });

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailEvent, setDetailEvent] = useState<CalEvent | null>(null);
  const [editMode, setEditMode] = useState(false);

  const [addGoogleOpen, setAddGoogleOpen] = useState(false);
  const [addDeadlineOpen, setAddDeadlineOpen] = useState(false);

  const gridRange = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 0 });
    return { start, end };
  }, [viewMonth]);

  const gridDays = useMemo(
    () => eachDayOfInterval({ start: gridRange.start, end: gridRange.end }),
    [gridRange]
  );

  const rangeKey = useMemo(
    () => `${gridRange.start.toISOString()}_${gridRange.end.toISOString()}`,
    [gridRange.start, gridRange.end]
  );

  const applyPayload = useCallback((d: Record<string, unknown>) => {
    setMerged(Array.isArray(d.merged) ? (d.merged as CalEvent[]) : []);
    setGoogleCount(Array.isArray(d.googleEvents) ? d.googleEvents.length : 0);
    setConnected(!!d.connected);
    setGoogleFetchError(typeof d.googleFetchError === "string" ? d.googleFetchError : null);
    if (typeof d.timeZone === "string" && d.timeZone) setTimeZone(d.timeZone);
    if (d.counts && typeof d.counts === "object") {
      const c = d.counts as Record<string, number>;
      setFetchCounts({
        googleFromApi: Number(c.googleFromApi) || 0,
        deadlines: Number(c.deadlines) || 0,
        merged: Number(c.merged) || 0,
      });
    }
  }, []);

  const load = useCallback(
    async (background = false) => {
      const cached = cache.getCalendar(rangeKey);
      if (cached && !background) {
        applyPayload(cached);
        setLoading(false);
      } else if (!background && !cached) {
        setLoading(true);
      } else if (background) {
        setRefreshing(true);
      }

      const from = gridRange.start.toISOString();
      const to = gridRange.end.toISOString();
      try {
        const res = await fetch(
          `/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { cache: "no-store" }
        );
        const d = await res.json();
        cache.setCalendar(rangeKey, d);
        applyPayload(d);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [gridRange.start, gridRange.end, rangeKey, cache, applyPayload]
  );

  useEffect(() => {
    const cached = cache.getCalendar(rangeKey);
    if (cached && cache.isCalendarFresh(rangeKey)) {
      applyPayload(cached);
      setLoading(false);
      void load(true);
    } else if (cached) {
      applyPayload(cached);
      void load(true);
    } else {
      void load(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  useEffect(() => {
    if (sessionStatus === "authenticated") void load(true);
  }, [sessionStatus, load]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of merged) {
      const k = dayKeyForEvent(e.start);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    }
    return map;
  }, [merged]);

  const selectedKey = format(selectedDay, "yyyy-MM-dd");
  const selectedDayEvents = eventsByDay.get(selectedKey) || [];

  const canEditDeadline = (e: CalEvent) =>
    e.source === "placemint" &&
    !e.isGlobal &&
    !!e.userId &&
    !!session?.user?.id &&
    session.user.id === e.userId;

  async function sync() {
    const res = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync" }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(data.message || "Synced");
      cache.invalidateCalendar();
      await load(true);
    } else {
      toast.error(data.error || "Sync failed");
    }
  }

  function openEvent(e: CalEvent) {
    setDetailEvent(e);
    setEditMode(false);
    setDetailOpen(true);
  }

  return (
    <>
      <DashboardHeader title="Calendar" />
      <main className="p-4 lg:p-8 space-y-6 max-w-6xl mx-auto">
        <Card
          className={cn(
            "glass overflow-hidden border transition-colors",
            connected && !googleFetchError ? "border-emerald-500/40 bg-emerald-500/5" : "border-border"
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarIcon className="h-5 w-5 text-primary" /> Calendar
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              {connected && !googleFetchError ? (
                <Badge variant="success" className="gap-1">
                  Google connected
                  {googleCount > 0 ? ` · ${googleCount} events this view` : ""}
                </Badge>
              ) : googleFetchError ? (
                <Badge variant="destructive">Calendar error</Badge>
              ) : (
                <Badge variant="secondary">Google not connected</Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                TZ {timeZone}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0">
            <p className="text-sm text-muted-foreground">
              Month view shows <strong>Placemint deadlines</strong> and your <strong>Google primary</strong> calendar
              (synced deadline copies are deduplicated). Connect Google to add and edit Google events here; deadlines
              stay linked to the{" "}
              <Link href="/dashboard/deadlines" className="text-primary underline underline-offset-2">
                Deadlines
              </Link>{" "}
              module.
            </p>
            {googleFetchError && (
              <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                {googleFetchError} Click <strong>Reconnect Google</strong> below.
              </p>
            )}
            {connected && !googleFetchError && fetchCounts && fetchCounts.merged === 0 && (
              <p className="text-sm text-muted-foreground rounded-md border px-3 py-2 bg-muted/30">
                No events in <strong>{format(viewMonth, "MMMM yyyy")}</strong> yet. We read your Google{" "}
                <strong>Primary</strong> calendar only — events on other calendars won&apos;t appear. Use{" "}
                <strong>Add Google event</strong> or <strong>Add deadline</strong>, or move to the month where your
                events are scheduled.
                {fetchCounts.googleFromApi === 0 && fetchCounts.deadlines === 0 ? (
                  <>
                    {" "}
                    If you added events in the Google app, try <strong>Refresh</strong> or{" "}
                    <strong>Reconnect Google</strong> (one time after app updates).
                  </>
                ) : null}
              </p>
            )}
            {fetchCounts && fetchCounts.merged > 0 && (
              <p className="text-xs text-muted-foreground">
                Loaded {fetchCounts.merged} event(s) for this view
                {fetchCounts.googleFromApi > 0 ? ` · ${fetchCounts.googleFromApi} from Google` : ""}
                {fetchCounts.deadlines > 0 ? ` · ${fetchCounts.deadlines} deadline(s)` : ""}.
              </p>
            )}
            <div className="flex flex-wrap gap-2 items-center">
              {!connected ? (
                <Button variant="glow" onClick={() => signIn("google", { callbackUrl: "/dashboard/calendar" })}>
                  <Link2 className="h-4 w-4 mr-2" /> Connect Google
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => signIn("google", { callbackUrl: "/dashboard/calendar" })}>
                  <Link2 className="h-4 w-4 mr-2" /> Reconnect Google
                </Button>
              )}
              <LoadingButton variant="outline" loading={refreshing} onClick={() => void load(true)}>
                <RefreshCw className="h-4 w-4 mr-2" /> Refresh
              </LoadingButton>
              <Button variant="outline" onClick={sync} disabled={!connected}>
                <RefreshCw className="h-4 w-4 mr-2" /> Sync deadlines to Google
              </Button>
              <Button variant="secondary" onClick={() => setAddDeadlineOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Add deadline
              </Button>
              <Button variant="glow" disabled={!connected || !!googleFetchError} onClick={() => setAddGoogleOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Add Google event
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="icon" onClick={() => setViewMonth((m) => addMonths(m, -1))} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-xl font-semibold tabular-nums min-w-[10rem] text-center">{format(viewMonth, "MMMM yyyy")}</h2>
              <Button variant="outline" size="icon" onClick={() => setViewMonth((m) => addMonths(m, 1))} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const t = new Date();
                  setViewMonth(startOfMonth(t));
                  const n = new Date(t);
                  n.setHours(12, 0, 0, 0);
                  setSelectedDay(n);
                }}
              >
                Today
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <Skeleton className="h-[420px] w-full rounded-xl" />
            ) : (
              <>
                <div className="grid grid-cols-7 gap-px rounded-lg border bg-border overflow-hidden text-xs sm:text-sm">
                  {WEEKDAYS.map((w) => (
                    <div key={w} className="bg-muted/80 px-1 py-2 text-center font-medium text-muted-foreground">
                      {w}
                    </div>
                  ))}
                  {gridDays.map((d) => {
                    const key = format(d, "yyyy-MM-dd");
                    const list = eventsByDay.get(key) || [];
                    const inMonth = isSameMonth(d, viewMonth);
                    const today = isToday(d);
                    return (
                      <button
                        type="button"
                        key={key}
                        onClick={() => setSelectedDay(d)}
                        className={cn(
                          "min-h-[92px] sm:min-h-[110px] text-left p-1 sm:p-1.5 bg-background transition-colors hover:bg-muted/40",
                          !inMonth && "opacity-40",
                          today && "ring-1 ring-inset ring-primary/50 bg-primary/5",
                          format(selectedDay, "yyyy-MM-dd") === key && "bg-primary/10"
                        )}
                      >
                        <div className={cn("font-semibold tabular-nums mb-1", today && "text-primary")}>{d.getDate()}</div>
                        <div className="space-y-0.5">
                          {list.slice(0, 3).map((e) => (
                            <div
                              key={`${e.source}-${e.id}`}
                              role="button"
                              tabIndex={0}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openEvent(e);
                              }}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter" || ev.key === " ") {
                                  ev.preventDefault();
                                  ev.stopPropagation();
                                  openEvent(e);
                                }
                              }}
                              className={cn(
                                "truncate rounded px-0.5 py-0.5 text-[10px] sm:text-[11px] cursor-pointer hover:opacity-90",
                                e.source === "google" ? "bg-blue-500/25 text-blue-900 dark:text-blue-100" : "bg-amber-500/25 text-amber-950 dark:text-amber-100"
                              )}
                            >
                              {e.title}
                            </div>
                          ))}
                          {list.length > 3 && (
                            <div className="text-[10px] text-muted-foreground pl-0.5">+{list.length - 3} more</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded bg-blue-500/40" /> Google
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded bg-amber-500/40" /> Placemint deadline
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Events on {formatDate(selectedDay)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            {selectedDayEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No events on this day.</p>
            ) : (
              <ul className="space-y-2">
                {selectedDayEvents.map((e) => (
                  <li key={`${e.source}-${e.id}`}>
                    <button
                      type="button"
                      onClick={() => openEvent(e)}
                      className={cn(
                        "w-full text-left rounded-lg border px-3 py-2 text-sm flex flex-wrap justify-between gap-2 hover:bg-muted/30",
                        e.source === "google" ? "border-blue-500/25 bg-blue-500/5" : "border-amber-500/25 bg-amber-500/5"
                      )}
                    >
                      <div>
                        <span className="font-medium">{e.title}</span>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatTime(e.start)}
                          {e.end && e.source === "google" ? ` – ${formatTime(e.end)}` : null}
                          {e.status ? ` · ${e.status}` : ""}
                        </div>
                      </div>
                      <Badge variant="secondary" className="shrink-0 h-fit">
                        {e.source === "google" ? "Google" : "Deadline"}
                      </Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>

      <EventDetailDialog
        open={detailOpen}
        onOpenChange={(o) => {
          setDetailOpen(o);
          if (!o) {
            setDetailEvent(null);
            setEditMode(false);
          }
        }}
        event={detailEvent}
        editMode={editMode}
        setEditMode={setEditMode}
        canEditDeadline={detailEvent ? canEditDeadline(detailEvent) : false}
        connected={connected}
        onSaved={() => {
          cache.invalidateCalendar();
          void load(true);
          setDetailOpen(false);
        }}
      />

      <AddGoogleEventDialog
        open={addGoogleOpen}
        onOpenChange={setAddGoogleOpen}
        onCreated={(startIso) => {
          const d = new Date(startIso);
          if (!Number.isNaN(d.getTime())) setViewMonth(startOfMonth(d));
          cache.invalidateCalendar();
          void load(true);
        }}
      />

      <AddDeadlineDialog
        open={addDeadlineOpen}
        onOpenChange={setAddDeadlineOpen}
        onCreated={() => {
          cache.invalidateCalendar();
          cache.invalidateDeadlines();
          void load(true);
        }}
      />
    </>
  );
}

function EventDetailDialog({
  open,
  onOpenChange,
  event,
  editMode,
  setEditMode,
  canEditDeadline,
  connected,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  event: CalEvent | null;
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  canEditDeadline: boolean;
  connected: boolean;
  onSaved: () => void;
}) {
  const [gTitle, setGTitle] = useState("");
  const [gDesc, setGDesc] = useState("");
  const [gLoc, setGLoc] = useState("");
  const [gAllDay, setGAllDay] = useState(false);
  const [gStart, setGStart] = useState("");
  const [gEnd, setGEnd] = useState("");

  const [dCompany, setDCompany] = useState("");
  const [dRole, setDRole] = useState("");
  const [dElig, setDElig] = useState("");
  const [dNotes, setDNotes] = useState("");
  const [dLinks, setDLinks] = useState("");
  const [dDeadline, setDDeadline] = useState("");
  const [dStatus, setDStatus] = useState("pending");

  useEffect(() => {
    if (!event) return;
    if (event.source === "google") {
      setGTitle(event.title);
      setGDesc(event.description || "");
      setGLoc(event.location || "");
      setGAllDay(!!event.allDay);
      setGStart(event.allDay ? toDateInputValue(event.start) : toDatetimeLocalValue(event.start));
      setGEnd(
        event.end
          ? event.allDay
            ? toDateInputValue(event.end)
            : toDatetimeLocalValue(event.end)
          : ""
      );
    } else {
      setDCompany(event.company || "");
      setDRole(event.role || "");
      setDElig(event.eligibility || "");
      setDNotes(event.notes || "");
      setDLinks((event.links || []).join("\n"));
      setDDeadline(toDatetimeLocalValue(event.start));
      setDStatus(event.status || "pending");
    }
  }, [event]);

  if (!event) return null;

  const ev = event;

  async function saveGoogle() {
    if (!connected) return;
    const body: Record<string, unknown> = {
      title: gTitle,
      description: gDesc || undefined,
      location: gLoc || undefined,
      allDay: gAllDay,
      start: gAllDay ? gStart : new Date(gStart).toISOString(),
      end: gEnd ? (gAllDay ? gEnd : new Date(gEnd).toISOString()) : undefined,
    };
    const res = await fetch(`/api/calendar/events/${encodeURIComponent(ev.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success("Event updated");
      onSaved();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || "Update failed");
    }
  }

  async function deleteGoogle() {
    if (!confirm("Delete this event from Google Calendar?")) return;
    const res = await fetch(`/api/calendar/events/${encodeURIComponent(ev.id)}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Event deleted");
      onSaved();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || "Delete failed");
    }
  }

  async function saveDeadline() {
    const res = await fetch(`/api/deadlines/${ev.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: dCompany,
        role: dRole,
        eligibility: dElig,
        notes: dNotes,
        deadline: new Date(dDeadline).toISOString(),
        status: dStatus,
        links: dLinks
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    });
    if (res.ok) {
      toast.success("Deadline updated");
      onSaved();
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || "Update failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{editMode ? "Edit event" : "Event details"}</DialogTitle>
        </DialogHeader>

        {!editMode && (
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Title</p>
              <p className="font-medium">{event.title}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">When</p>
              <p>
                {formatTime(event.start)}
                {event.end && event.source === "google" ? ` – ${formatTime(event.end)}` : null}{" "}
                <span className="text-muted-foreground">({formatDate(event.start)})</span>
              </p>
            </div>
            {event.location ? (
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p>{event.location}</p>
              </div>
            ) : null}
            {event.description ? (
              <div>
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{event.description}</p>
              </div>
            ) : null}
            {event.source === "placemint" && (
              <>
                {event.eligibility ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Eligibility</p>
                    <p className="whitespace-pre-wrap">{event.eligibility}</p>
                  </div>
                ) : null}
                {event.notes ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="whitespace-pre-wrap">{event.notes}</p>
                  </div>
                ) : null}
                {event.links && event.links.length > 0 ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Links</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {event.links.map((l) => (
                        <li key={l}>
                          <a href={l} className="text-primary underline break-all" target="_blank" rel="noreferrer">
                            {l}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
            {event.status && (
              <Badge variant="secondary">
                {event.source === "placemint" ? "Status: " : ""}
                {event.status}
              </Badge>
            )}
            {event.googleEventId && event.source === "placemint" && <Badge variant="outline">Synced to Google</Badge>}

            <div className="flex flex-wrap gap-2 pt-2">
              {event.htmlLink && (
                <Button variant="outline" size="sm" asChild>
                  <a href={event.htmlLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" /> Google Calendar
                  </a>
                </Button>
              )}
              {event.source === "google" && connected && (
                <>
                  <Button variant="glow" size="sm" onClick={() => setEditMode(true)}>
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={deleteGoogle}>
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                </>
              )}
              {event.source === "placemint" && canEditDeadline && (
                <Button variant="glow" size="sm" onClick={() => setEditMode(true)}>
                  <Pencil className="h-4 w-4 mr-1" /> Edit deadline
                </Button>
              )}
              {event.source === "placemint" && (
                <Button variant="outline" size="sm" asChild>
                  <Link href="/dashboard/deadlines">Deadlines module</Link>
                </Button>
              )}
            </div>
          </div>
        )}

        {editMode && event.source === "google" && (
          <div className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input value={gTitle} onChange={(e) => setGTitle(e.target.value)} />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={gLoc} onChange={(e) => setGLoc(e.target.value)} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={gDesc} onChange={(e) => setGDesc(e.target.value)} rows={3} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={gAllDay} onCheckedChange={setGAllDay} id="allday" />
              <Label htmlFor="allday">All day</Label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Start</Label>
                <Input
                  type={gAllDay ? "date" : "datetime-local"}
                  value={gStart}
                  onChange={(e) => setGStart(e.target.value)}
                />
              </div>
              <div>
                <Label>End</Label>
                <Input
                  type={gAllDay ? "date" : "datetime-local"}
                  value={gEnd}
                  onChange={(e) => setGEnd(e.target.value)}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">All-day end date is exclusive (next day), per Google Calendar.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditMode(false)}>
                Cancel
              </Button>
              <Button variant="glow" onClick={saveGoogle}>
                Save
              </Button>
            </div>
          </div>
        )}

        {editMode && event.source === "placemint" && canEditDeadline && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Company</Label>
                <Input value={dCompany} onChange={(e) => setDCompany(e.target.value)} />
              </div>
              <div>
                <Label>Role</Label>
                <Input value={dRole} onChange={(e) => setDRole(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Deadline</Label>
              <Input type="datetime-local" value={dDeadline} onChange={(e) => setDDeadline(e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={dStatus}
                onChange={(e) => setDStatus(e.target.value)}
              >
                {["pending", "applied", "oa_scheduled", "interview_scheduled", "missed", "rejected"].map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Eligibility</Label>
              <Textarea value={dElig} onChange={(e) => setDElig(e.target.value)} rows={2} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={dNotes} onChange={(e) => setDNotes(e.target.value)} rows={2} />
            </div>
            <div>
              <Label>Links (one per line)</Label>
              <Textarea value={dLinks} onChange={(e) => setDLinks(e.target.value)} rows={2} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditMode(false)}>
                Cancel
              </Button>
              <Button variant="glow" onClick={saveDeadline}>
                Save deadline
              </Button>
            </div>
          </div>
        )}

        {editMode && event.source === "placemint" && !canEditDeadline && (
          <p className="text-sm text-muted-foreground">This deadline cannot be edited here (global or not yours).</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddGoogleEventDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (startIso: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [end, setEnd] = useState(() => format(new Date(Date.now() + 3600000), "yyyy-MM-dd'T'HH:mm"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      title,
      description: description || undefined,
      location: location || undefined,
      allDay,
      start: allDay ? start.slice(0, 10) : new Date(start).toISOString(),
      end: end ? (allDay ? end.slice(0, 10) : new Date(end).toISOString()) : undefined,
    };
    const res = await fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      toast.success("Event created");
      onOpenChange(false);
      onCreated(allDay ? start.slice(0, 10) : new Date(start).toISOString());
      setTitle("");
      setDescription("");
      setLocation("");
    } else {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error || "Failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Google Calendar event</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Title</Label>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={allDay} onCheckedChange={setAllDay} id="new-allday" />
            <Label htmlFor="new-allday">All day</Label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Start</Label>
              <Input type={allDay ? "date" : "datetime-local"} value={allDay ? start.slice(0, 10) : start} onChange={(e) => setStart(e.target.value)} required />
            </div>
            <div>
              <Label>End</Label>
              <Input type={allDay ? "date" : "datetime-local"} value={allDay ? (end.slice(0, 10) || start.slice(0, 10)) : end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <Button type="submit" variant="glow" className="w-full">
            Create in Google Calendar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddDeadlineDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [deadline, setDeadline] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [notes, setNotes] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/deadlines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company,
        role,
        deadline,
        notes,
      }),
    });
    if (res.ok) {
      toast.success("Deadline added");
      onOpenChange(false);
      onCreated();
      setCompany("");
      setRole("");
      setNotes("");
    } else {
      toast.error("Could not add deadline");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New deadline</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Company</Label>
            <Input required value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <Label>Role</Label>
            <Input required value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <div>
            <Label>Deadline</Label>
            <Input type="datetime-local" required value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <Button type="submit" variant="glow" className="w-full">
            Save to Deadlines
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
