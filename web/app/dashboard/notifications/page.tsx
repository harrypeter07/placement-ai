"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  MessageSquare,
  Sparkles,
  Users,
  RefreshCw,
  Search,
} from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { LoadingButton } from "@/components/ui/loading-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useDashboardCache } from "@/store/use-dashboard-cache";
import { useCachedFetch } from "@/hooks/use-cached-fetch";

interface TelegramGroup {
  _id: string;
  groupId: string;
  title: string;
  username?: string;
  kind?: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  messageCount: number;
  monitoringEnabled?: boolean;
}

interface TelegramMsg {
  _id: string;
  groupId: string;
  messageId: string;
  text: string;
  senderName?: string;
  sentAt: string;
}

interface SystemNotif {
  _id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

interface PlacementInsight {
  _id: string;
  groupId: string;
  groupTitle?: string;
  rank: number;
  title: string;
  summary: string;
  urgency: string;
  category: string;
  confidence: number;
  deadlineId?: string;
  reminderCount?: number;
}

export default function NotificationsPage() {
  const cache = useDashboardCache();
  const [messages, setMessages] = useState<TelegramMsg[]>([]);
  const [systemNotifs, setSystemNotifs] = useState<SystemNotif[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [tab, setTab] = useState<"chats" | "insights" | "alerts">("chats");
  const [togglingGroupId, setTogglingGroupId] = useState<string | null>(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [runningInsights, setRunningInsights] = useState(false);
  const insightsRan = useRef(false);

  const {
    data: groups,
    loading: loadingGroups,
    refreshing: refreshingGroups,
    refresh: refreshGroups,
    setData: setGroups,
  } = useCachedFetch<TelegramGroup[]>({
    key: "telegram-groups",
    fetcher: async () => {
      const res = await fetch("/api/telegram/groups");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    getCached: () => cache.getTelegramGroups() as TelegramGroup[] | null,
    setCached: (d) => cache.setTelegramGroups(d),
    isFresh: () => cache.isTelegramGroupsFresh(),
    pollMs: 60_000,
  });

  const {
    data: insights,
    loading: loadingInsights,
    refresh: refreshInsights,
    setData: setInsights,
  } = useCachedFetch<PlacementInsight[]>({
    key: "telegram-insights",
    fetcher: async () => {
      const res = await fetch("/api/telegram/insights");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    getCached: () => cache.getInsights() as PlacementInsight[] | null,
    setCached: (d) => cache.setInsights(d),
    isFresh: () => cache.isInsightsFresh(),
  });

  const loadSystemNotifs = useCallback(async () => {
    const res = await fetch("/api/notifications");
    const data = await res.json();
    if (Array.isArray(data)) setSystemNotifs(data);
  }, []);

  const loadMessages = useCallback(async (groupId: string, background = false) => {
    if (!background) setLoadingMessages(true);
    try {
      const res = await fetch(
        `/api/telegram/messages?groupId=${encodeURIComponent(groupId)}&limit=80`
      );
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } finally {
      if (!background) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void loadSystemNotifs();
  }, [loadSystemNotifs]);

  useEffect(() => {
    if (!selectedGroupId) return;
    void loadMessages(selectedGroupId);
    const id = setInterval(() => void loadMessages(selectedGroupId, true), 20_000);
    return () => clearInterval(id);
  }, [selectedGroupId, loadMessages]);

  const runInsights = useCallback(async () => {
    setRunningInsights(true);
    try {
      const res = await fetch("/api/telegram/insights", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Insights failed");
      const list = Array.isArray(data.insights) ? data.insights : [];
      setInsights(list);
      cache.setInsights(list);
      cache.invalidateDeadlines();
      cache.invalidateReminders();
      cache.invalidateCalendar();
      const c = data.created;
      toast.success(
        `AI processed chats — ${list.length} insight(s), ${c?.deadlines ?? 0} deadline(s), ${c?.reminders ?? 0} reminder(s) auto-created`
      );
      if (data.processingNotes) {
        console.info("[insights]", data.processingNotes);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not run insights");
    } finally {
      setRunningInsights(false);
    }
  }, [cache, setInsights]);

  useEffect(() => {
    if (insightsRan.current || tab !== "insights") return;
    const monitored = (groups || []).filter((g) => g.monitoringEnabled);
    if (monitored.length === 0) return;
    insightsRan.current = true;
    void refreshInsights();
  }, [tab, groups, refreshInsights]);

  useEffect(() => {
    const monitored = (groups || []).filter((g) => g.monitoringEnabled);
    if (monitored.length === 0) return;
    const id = setInterval(async () => {
      try {
        const prefsRes = await fetch("/api/settings");
        const prefs = await prefsRes.json();
        if (prefs?.telegram?.autoInsights === false) return;
        await runInsights();
      } catch {
        /* ignore poll errors */
      }
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, [groups, runInsights]);

  async function toggleMonitoring(groupId: string, enabled: boolean) {
    setTogglingGroupId(groupId);
    try {
      const res = await fetch("/api/telegram/groups/monitor", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setGroups((prev) =>
        (prev || []).map((g) =>
          g.groupId === groupId ? { ...g, monitoringEnabled: enabled } : g
        )
      );
      toast.success(enabled ? "Monitoring on" : "Monitoring off");
      if (enabled) void runInsights();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update monitoring");
    } finally {
      setTogglingGroupId(null);
    }
  }

  const selectedGroup = (groups || []).find((g) => g.groupId === selectedGroupId);
  const showChatPanel = selectedGroupId !== null;
  const groupList = groups || [];
  const q = groupSearch.trim().toLowerCase();
  const filteredGroups = q
    ? groupList.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.groupId.includes(q) ||
          (g as { username?: string }).username?.toLowerCase().includes(q)
      )
    : groupList;
  const monitoredCount = groupList.filter((g) => g.monitoringEnabled).length;

  function selectGroup(groupId: string) {
    setSelectedGroupId(groupId);
    setMessages([]);
    void loadMessages(groupId);
  }

  function backToGroups() {
    setSelectedGroupId(null);
    setMessages([]);
  }

  return (
    <>
      <DashboardHeader title="Notifications" />
      <main className="p-4 lg:p-8">
        <div className="flex flex-wrap gap-2 mb-4 items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={tab === "chats" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setTab("chats");
                backToGroups();
              }}
            >
              <MessageSquare className="h-4 w-4 mr-1" /> Chats
            </Button>
            <Button variant={tab === "insights" ? "default" : "outline"} size="sm" onClick={() => setTab("insights")}>
              <Sparkles className="h-4 w-4 mr-1" /> AI insights
            </Button>
            <Button variant={tab === "alerts" ? "default" : "outline"} size="sm" onClick={() => setTab("alerts")}>
              <Bell className="h-4 w-4 mr-1" /> Alerts
              {systemNotifs.filter((n) => !n.read).length > 0 && (
                <Badge variant="critical" className="ml-2 h-5 px-1.5">
                  {systemNotifs.filter((n) => !n.read).length}
                </Badge>
              )}
            </Button>
          </div>
          <div className="flex gap-2">
            <LoadingButton
              variant="outline"
              size="sm"
              loading={refreshingGroups}
              onClick={() => void refreshGroups()}
            >
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </LoadingButton>
            <LoadingButton variant="glow" size="sm" loading={runningInsights} onClick={() => void runInsights()}>
              <Sparkles className="h-4 w-4 mr-1" /> Run AI now
            </LoadingButton>
          </div>
        </div>

        {tab === "insights" ? (
          <div className="space-y-3 max-w-3xl">
            <p className="text-sm text-muted-foreground">
              Gemini ranks placement updates from monitored groups, then auto-creates deadlines & reminders. Configure
              message count in{" "}
              <Link href="/dashboard/settings" className="text-primary underline">
                Settings → Telegram AI
              </Link>
              . View results in{" "}
              <Link href="/dashboard/deadlines" className="text-primary underline">
                Placements
              </Link>
              .
            </p>
            {loadingInsights && !(insights?.length) ? (
              <Skeleton className="h-48 rounded-xl" />
            ) : !insights?.length ? (
              <Card className="glass">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No insights yet. Turn on monitoring for a group, then tap <strong>Run AI now</strong>.
                </CardContent>
              </Card>
            ) : (
              insights.map((ins) => (
                <Card key={ins._id} className="glass border-primary/20">
                  <CardContent className="p-4">
                    <div className="flex justify-between gap-2 flex-wrap">
                      <div>
                        <span className="text-xs text-muted-foreground">#{ins.rank}</span>
                        <h3 className="font-semibold">{ins.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{ins.summary}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant={ins.urgency === "critical" ? "critical" : "secondary"}>{ins.urgency}</Badge>
                        <Badge variant="outline">{ins.category}</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {ins.groupTitle || ins.groupId}
                      {ins.deadlineId ? " · deadline created" : ""}
                      {(ins.reminderCount ?? 0) > 0 ? ` · ${ins.reminderCount} reminder(s)` : ""}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : tab === "alerts" ? (
          <div className="space-y-3 max-w-2xl">
            {systemNotifs.length === 0 ? (
              <Card className="glass">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No system alerts
                </CardContent>
              </Card>
            ) : (
              systemNotifs.map((n) => (
                <Card key={n._id} className={cn("glass", !n.read && "border-primary/30")}>
                  <CardContent className="p-4">
                    <div className="flex justify-between gap-2">
                      <p className="font-medium">{n.title}</p>
                      <Badge variant="outline">{n.type}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-2">{formatDate(n.createdAt)}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          <div className="grid lg:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-12rem)] min-h-[480px]">
            <Card className={cn("glass flex flex-col overflow-hidden", showChatPanel && "hidden lg:flex")}>
              <div className="p-4 border-b border-white/5 space-y-3">
                <div>
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Your Telegram groups
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Groups sync automatically from the worker — no env editing. Turn{" "}
                    <strong>Monitor</strong> ON for groups you want AI to watch.
                    {monitoredCount > 0 && (
                      <span className="text-primary"> · {monitoredCount} monitored</span>
                    )}
                  </p>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search groups..."
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
              </div>
              <ScrollArea className="flex-1">
                {loadingGroups && !groupList.length ? (
                  <div className="p-3 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 rounded-lg" />
                    ))}
                  </div>
                ) : groupList.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="font-medium">No groups synced yet</p>
                    <p className="mt-2 text-xs">
                      Start the Telegram worker on Render. It discovers all groups/channels on your
                      account and syncs them here within a few minutes.
                    </p>
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No groups match &quot;{groupSearch}&quot;
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {filteredGroups.map((g) => (
                      <div
                        key={g.groupId}
                        className={cn(
                          "rounded-lg p-3 border transition-colors",
                          selectedGroupId === g.groupId
                            ? "bg-primary/15 border-primary/30"
                            : "border-transparent hover:bg-accent/50"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            className="flex-1 text-left min-w-0"
                            onClick={() => selectGroup(g.groupId)}
                          >
                            <p className="font-medium text-sm truncate">{g.title}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {g.lastMessagePreview || "No messages yet"}
                            </p>
                          </button>
                          <div className="flex flex-col items-center gap-1 shrink-0">
                            <Switch
                              checked={!!g.monitoringEnabled}
                              disabled={togglingGroupId === g.groupId}
                              onCheckedChange={(v) => void toggleMonitoring(g.groupId, v)}
                              aria-label={`Monitor ${g.title}`}
                            />
                            <Label className="text-[9px] text-muted-foreground">Monitor</Label>
                          </div>
                        </div>
                        <div className="flex justify-between items-center mt-2 pl-0">
                          <span className="text-[10px] text-muted-foreground">
                            {g.messageCount} msg{g.messageCount !== 1 ? "s" : ""}
                          </span>
                          {g.monitoringEnabled && (
                            <Badge variant="success" className="text-[9px] h-4 px-1">
                              AI on
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </Card>

            <Card className={cn("glass flex flex-col overflow-hidden", !showChatPanel && "hidden lg:flex")}>
              {!selectedGroup ? (
                <CardContent className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                  <div className="text-center">
                    <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    Select a group to view messages
                  </div>
                </CardContent>
              ) : (
                <>
                  <div className="p-4 border-b border-white/5 flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="lg:hidden shrink-0" onClick={backToGroups}>
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold truncate">{selectedGroup.title}</h2>
                      <p className="text-xs text-muted-foreground">{selectedGroup.groupId}</p>
                    </div>
                  </div>
                  <ScrollArea className="flex-1 p-4">
                    {loadingMessages ? (
                      <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-16 rounded-lg" />
                        ))}
                      </div>
                    ) : messages.length === 0 ? (
                      <p className="text-center text-sm text-muted-foreground py-12">No messages stored yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {messages.map((m) => (
                          <div key={m._id} className="rounded-xl border border-white/5 bg-muted/30 p-3">
                            {m.senderName && (
                              <p className="text-xs font-medium text-primary mb-1">{m.senderName}</p>
                            )}
                            <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
                            <p className="text-[10px] text-muted-foreground mt-2 text-right">
                              {formatDate(m.sentAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </>
              )}
            </Card>
          </div>
        )}
      </main>
    </>
  );
}

