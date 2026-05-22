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
  Download,
  Info,
} from "lucide-react";
import { TelegramChatMessage } from "@/components/dashboard/telegram-chat-message";
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
import {
  InsightsAnalysisPanel,
  type InsightRow,
} from "@/components/telegram/insights-analysis-panel";

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
  mediaType?: string;
  hasMedia?: boolean;
}

interface SystemNotif {
  _id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

type PlacementInsight = InsightRow;

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
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [fetchingMessages, setFetchingMessages] = useState(false);
  const [analyzingGroup, setAnalyzingGroup] = useState(false);
  const [groupFilter, setGroupFilter] = useState<"all" | "monitored">("all");
  const [groupInsights, setGroupInsights] = useState<PlacementInsight[]>([]);
  const [insightNotes, setInsightNotes] = useState("");
  const [analyzedMsgCount, setAnalyzedMsgCount] = useState<number | undefined>();
  const [applyingInsights, setApplyingInsights] = useState(false);
  const [analyzeLimit, setAnalyzeLimit] = useState(25);
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

  const applyInsightIds = useCallback(
    async (ids: string[], pinToOverview: boolean) => {
      setApplyingInsights(true);
      try {
        const res = await fetch("/api/telegram/insights/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            insightIds: ids,
            createDeadlines: true,
            createReminders: true,
            pinToOverview,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Apply failed");
        toast.success(
          `Applied ${data.applied} — ${data.created?.deadlines ?? 0} deadlines, ${data.created?.reminders ?? 0} reminders`
        );
        cache.invalidateDeadlines();
        cache.invalidateReminders();
        void refreshInsights();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Apply failed");
      } finally {
        setApplyingInsights(false);
      }
    },
    [cache, refreshInsights]
  );

  const runInsights = useCallback(
    async (groupId?: string, applyMode: "preview" | "all" = "preview") => {
      setRunningInsights(true);
      if (groupId) setAnalyzingGroup(true);
      try {
        const res = await fetch("/api/telegram/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groupId,
            messageLimit: analyzeLimit,
            applyMode,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Insights failed");
        const list = Array.isArray(data.insights) ? data.insights : [];
        setInsights(list);
        cache.setInsights(list);
        setInsightNotes(data.processingNotes || "");
        setAnalyzedMsgCount(data.analyzedMessageCount);

        if (applyMode === "all") {
          cache.invalidateDeadlines();
          cache.invalidateReminders();
          cache.invalidateCalendar();
          const c = data.created;
          toast.success(
            `Applied ${list.length} insight(s) — ${c?.deadlines ?? 0} deadline(s), ${c?.reminders ?? 0} reminder(s)`
          );
        } else {
          toast.success(
            `${list.length} insight(s) ready — review titles, deadlines & reminder times below, then Apply`
          );
        }
        if (data.processingNotes) toast.message(data.processingNotes);

        if (groupId) {
          setGroupInsights(list);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not run insights");
      } finally {
        setRunningInsights(false);
        setAnalyzingGroup(false);
      }
    },
    [cache, setInsights, analyzeLimit]
  );

  const fetchMessagesFromTelegram = useCallback(
    async (groupId: string) => {
      setFetchingMessages(true);
      try {
        const res = await fetch("/api/telegram/messages/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupId, limit: 60 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Fetch failed");
        await loadMessages(groupId);
        await refreshGroups();
        toast.success(data.message || `Loaded ${data.fetched} messages`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load messages");
      } finally {
        setFetchingMessages(false);
      }
    },
    [loadMessages, refreshGroups]
  );

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
        const mode = prefs?.telegram?.insightsApplyMode === "all" ? "all" : "preview";
        await runInsights(undefined, mode);
      } catch {
        /* ignore poll errors */
      }
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, [groups, runInsights]);

  async function syncAllGroups() {
    setSyncingCatalog(true);
    try {
      const res = await fetch("/api/telegram/groups/discover", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      cache.setTelegramGroups([]);
      await refreshGroups();
      toast.success(data.message || `Synced ${data.synced} groups`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not sync groups";
      toast.error(msg);
      if (msg.includes("Connect Telegram")) {
        toast.message("Open Settings → Connect Telegram first");
      }
    } finally {
      setSyncingCatalog(false);
    }
  }

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
  const filteredGroups = (q
    ? groupList.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          g.groupId.includes(q) ||
          (g as { username?: string }).username?.toLowerCase().includes(q)
      )
    : groupList
  ).filter((g) => (groupFilter === "monitored" ? g.monitoringEnabled : true));
  const monitoredCount = groupList.filter((g) => g.monitoringEnabled).length;

  function selectGroup(groupId: string) {
    setSelectedGroupId(groupId);
    setMessages([]);
    setGroupInsights([]);
    void loadMessages(groupId);
    void fetch(`/api/telegram/insights?groupId=${encodeURIComponent(groupId)}`)
      .then((r) => r.json())
      .then((d) => setGroupInsights(Array.isArray(d) ? d : []));
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
          <div className="flex gap-2 flex-wrap">
            <LoadingButton
              variant="outline"
              size="sm"
              loading={syncingCatalog}
              onClick={() => void syncAllGroups()}
            >
              <Users className="h-4 w-4 mr-1" /> Sync all groups
            </LoadingButton>
            <LoadingButton
              variant="outline"
              size="sm"
              loading={refreshingGroups}
              onClick={() => void refreshGroups()}
            >
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh list
            </LoadingButton>
            <LoadingButton
              variant="glow"
              size="sm"
              loading={runningInsights && !analyzingGroup}
              onClick={() => void runInsights()}
            >
              <Sparkles className="h-4 w-4 mr-1" /> AI (monitored)
            </LoadingButton>
          </div>
        </div>

        {tab === "insights" ? (
          <div className="space-y-4 max-w-3xl">
            <p className="text-sm text-muted-foreground">
              See full AI output before applying. Set message count / date in{" "}
              <Link href="/dashboard/settings" className="text-primary underline">
                Settings
              </Link>{" "}
              or{" "}
              <Link href="/dashboard/insights" className="text-primary underline">
                AI Insights
              </Link>{" "}
              screen.
            </p>
            <Card className="glass">
              <CardContent className="pt-4 flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Messages per group</Label>
                  <Input
                    type="number"
                    className="h-8 w-24"
                    min={5}
                    max={100}
                    value={analyzeLimit}
                    onChange={(e) => setAnalyzeLimit(Number(e.target.value) || 25)}
                  />
                </div>
                <LoadingButton
                  variant="outline"
                  size="sm"
                  loading={runningInsights}
                  onClick={() => void runInsights(undefined, "all")}
                >
                  Quick apply all (skip preview)
                </LoadingButton>
              </CardContent>
            </Card>
            {loadingInsights && !(insights?.length) ? (
              <Skeleton className="h-48 rounded-xl" />
            ) : !insights?.length ? (
              <Card className="glass">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No insights yet. Turn on monitoring, load messages, then <strong>Run AI now</strong>.
                </CardContent>
              </Card>
            ) : (
              <InsightsAnalysisPanel
                insights={insights}
                analyzedMessageCount={analyzedMsgCount}
                processingNotes={insightNotes}
                applying={applyingInsights}
                onApplyAll={({ pinToOverview }) =>
                  applyInsightIds(
                    insights.filter((i) => i.status === "draft").map((i) => i._id),
                    pinToOverview
                  )
                }
                onApplySelected={(ids, { pinToOverview }) => applyInsightIds(ids, pinToOverview)}
              />
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
          <>
          <Card className="glass border-primary/20 mb-4">
            <CardContent className="p-4 flex gap-3 text-sm">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-muted-foreground space-y-1">
                <p>
                  <strong className="text-foreground">Monitor toggle</strong> (right of each group) = AI watches
                  only those groups for placements. You do not need to monitor everything.
                </p>
                <p>
                  Open a chat → <strong>Load messages</strong> from Telegram → <strong>Analyze this group</strong> for
                  insights stored per group.
                </p>
              </div>
            </CardContent>
          </Card>
          <div className="grid lg:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-14rem)] min-h-[480px]">
            <Card className={cn("glass flex flex-col overflow-hidden", showChatPanel && "hidden lg:flex")}>
              <div className="p-4 border-b border-white/5 space-y-3">
                <div>
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Groups & channels
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {groupList.length > 0 ? (
                      <>
                        <strong>{groupList.length}</strong> group(s)/channel(s) in catalog.
                        Tap <strong>Sync all groups</strong> to load every chat from your Telegram account.
                      </>
                    ) : (
                      <>
                        Tap <strong>Sync all groups</strong> (after{" "}
                        <Link href="/dashboard/settings#connect-telegram" className="text-primary underline">
                          Connect Telegram
                        </Link>
                        ) to import all groups — not only old env IDs.
                      </>
                    )}
                    {monitoredCount > 0 && (
                      <span className="text-primary"> · {monitoredCount} monitored</span>
                    )}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant={groupFilter === "all" ? "default" : "outline"}
                    className="h-7 text-xs flex-1"
                    onClick={() => setGroupFilter("all")}
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant={groupFilter === "monitored" ? "default" : "outline"}
                    className="h-7 text-xs flex-1"
                    onClick={() => setGroupFilter("monitored")}
                  >
                    Monitored ({monitoredCount})
                  </Button>
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
                  <div className="p-6 text-center text-sm text-muted-foreground space-y-3">
                    <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="font-medium">No groups in catalog yet</p>
                    <p className="text-xs">
                      1. Connect Telegram in Settings
                      <br />
                      2. Click <strong>Sync all groups</strong> above to fetch every group/channel
                    </p>
                    <LoadingButton variant="glow" size="sm" loading={syncingCatalog} onClick={() => void syncAllGroups()}>
                      <Users className="h-4 w-4 mr-1" /> Sync all groups
                    </LoadingButton>
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
                            <p className="font-medium text-sm truncate flex items-center gap-1">
                              {g.title}
                              {g.kind === "channel" && (
                                <Badge variant="outline" className="text-[8px] h-4 px-1 shrink-0">
                                  channel
                                </Badge>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {g.username ? `@${g.username} · ` : ""}
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
                            <Label className="text-[9px] text-muted-foreground font-medium">AI Monitor</Label>
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
                  <div className="p-4 border-b border-white/5 space-y-3">
                    <div className="flex items-center gap-3">
                      <Button variant="ghost" size="icon" className="lg:hidden shrink-0" onClick={backToGroups}>
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <div className="min-w-0 flex-1">
                        <h2 className="font-semibold truncate">{selectedGroup.title}</h2>
                        <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          {selectedGroup.monitoringEnabled ? (
                            <Badge variant="success" className="text-[10px] h-5">
                              AI monitoring ON
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] h-5">
                              Monitoring OFF
                            </Badge>
                          )}
                          <span>{selectedGroup.messageCount} stored</span>
                        </p>
                      </div>
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <Switch
                          checked={!!selectedGroup.monitoringEnabled}
                          disabled={togglingGroupId === selectedGroup.groupId}
                          onCheckedChange={(v) => void toggleMonitoring(selectedGroup.groupId, v)}
                        />
                        <span className="text-[9px] text-muted-foreground">Monitor</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <LoadingButton
                        size="sm"
                        variant="outline"
                        loading={fetchingMessages}
                        onClick={() => void fetchMessagesFromTelegram(selectedGroup.groupId)}
                      >
                        <Download className="h-4 w-4 mr-1" /> Load messages
                      </LoadingButton>
                      <LoadingButton
                        size="sm"
                        variant="glow"
                        loading={analyzingGroup}
                        onClick={() => void runInsights(selectedGroup.groupId)}
                      >
                        <Sparkles className="h-4 w-4 mr-1" /> Analyze this group
                      </LoadingButton>
                    </div>
                  </div>
                  <ScrollArea className="flex-1 p-4">
                    {loadingMessages && !messages.length ? (
                      <div className="space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Skeleton key={i} className="h-16 rounded-lg" />
                        ))}
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center text-sm text-muted-foreground py-12 space-y-3">
                        <p>No messages in database for this chat.</p>
                        <LoadingButton
                          variant="glow"
                          size="sm"
                          loading={fetchingMessages}
                          onClick={() => void fetchMessagesFromTelegram(selectedGroup.groupId)}
                        >
                          <Download className="h-4 w-4 mr-1" /> Load messages from Telegram
                        </LoadingButton>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {messages.map((m) => (
                          <TelegramChatMessage key={m._id} message={m} />
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                  {groupInsights.length > 0 && (
                    <div className="p-3 border-t border-white/5 max-h-56 overflow-y-auto space-y-2">
                      <p className="text-xs font-semibold flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> {groupInsights.length} insight(s) for this group
                      </p>
                      {groupInsights.map((ins) => (
                        <div key={ins._id} className="text-xs rounded-lg bg-primary/10 p-2 space-y-1">
                          <div className="flex gap-1 flex-wrap">
                            <Badge className="text-[8px] h-4">{ins.urgency}</Badge>
                            {ins.status === "draft" && (
                              <Badge variant="outline" className="text-[8px] h-4">
                                draft
                              </Badge>
                            )}
                          </div>
                          <span className="font-medium block">{ins.title}</span>
                          <p className="text-muted-foreground">{ins.summary}</p>
                          {ins.extractedDeadline?.company && (
                            <p className="text-primary/90">
                              Deadline: {ins.extractedDeadline.company} — {ins.extractedDeadline.role}
                            </p>
                          )}
                          {(ins.suggestedReminderOffsetsMinutes?.length ?? 0) > 0 && (
                            <p className="text-amber-400/90">
                              Reminders:{" "}
                              {ins.suggestedReminderOffsetsMinutes!
                                .slice(0, 4)
                                .map((m) =>
                                  m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`
                                )
                                .join(", ")}{" "}
                              before
                            </p>
                          )}
                        </div>
                      ))}
                      <Button
                        size="sm"
                        variant="link"
                        className="h-6 text-xs p-0"
                        onClick={() => setTab("insights")}
                      >
                        Open full insights tab →
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>
          </>
        )}
      </main>
    </>
  );
}

