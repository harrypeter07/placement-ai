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
import { insightIdString } from "@/lib/insight-utils";

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
  const [tab, setTab] = useState<"chats" | "alerts">("chats");
  const [togglingGroupId, setTogglingGroupId] = useState<string | null>(null);
  const [groupSearch, setGroupSearch] = useState("");
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [analyzingGroup, setAnalyzingGroup] = useState(false);
  const [groupFilter, setGroupFilter] = useState<"all" | "monitored">("all");
  const [groupInsights, setGroupInsights] = useState<PlacementInsight[]>([]);
  const [insightNotes, setInsightNotes] = useState("");
  const [analyzedMsgCount, setAnalyzedMsgCount] = useState<number | undefined>();
  const [applyingInsights, setApplyingInsights] = useState(false);
  const [analyzeLimit, setAnalyzeLimit] = useState(25);
  const prefsLoaded = useRef(false);

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

  const loadSystemNotifs = useCallback(async () => {
    const res = await fetch("/api/notifications");
    const data = await res.json();
    if (Array.isArray(data)) setSystemNotifs(data);
  }, []);

  const loadMessages = useCallback(async (groupId: string, background = false, limit = 80) => {
    if (!background) setLoadingMessages(true);
    try {
      const res = await fetch(
        `/api/telegram/messages?groupId=${encodeURIComponent(groupId)}&limit=${Math.min(100, limit)}`
      );
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
    } finally {
      if (!background) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    void loadSystemNotifs();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((p) => {
        if (p?.telegram?.insightMessageCount) {
          setAnalyzeLimit(p.telegram.insightMessageCount);
        }
        prefsLoaded.current = true;
      })
      .catch(() => {
        prefsLoaded.current = true;
      });
  }, [loadSystemNotifs]);

  useEffect(() => {
    if (!selectedGroupId) return;
    void loadMessages(selectedGroupId);
    const id = setInterval(() => void loadMessages(selectedGroupId, true), 20_000);
    return () => clearInterval(id);
  }, [selectedGroupId, loadMessages]);

  const reloadGroupInsights = useCallback(async (groupId: string) => {
    const res = await fetch(`/api/telegram/insights?groupId=${encodeURIComponent(groupId)}`);
    const d = await res.json();
    const list = Array.isArray(d) ? d : [];
    setGroupInsights(list);
    return list;
  }, []);

  const setDeadlineIds = useCallback(
    async (ids: string[], pinToOverview: boolean) => {
      const clean = ids.map(insightIdString).filter(Boolean);
      if (!clean.length) {
        toast.error("This item has no parseable deadline to set");
        return;
      }
      setApplyingInsights(true);
      try {
        const res = await fetch("/api/telegram/insights/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            insightIds: clean,
            createDeadlines: true,
            createReminders: true,
            pinToOverview,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        toast.success(
          `Set ${data.applied} deadline(s) — ${data.created?.reminders ?? 0} reminder(s)`
        );
        cache.invalidateDeadlines();
        cache.invalidateReminders();
        if (selectedGroupId) await reloadGroupInsights(selectedGroupId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      } finally {
        setApplyingInsights(false);
      }
    },
    [cache, reloadGroupInsights, selectedGroupId]
  );

  const dismissInsightIds = useCallback(
    async (ids: string[]) => {
      const clean = ids.map(insightIdString).filter(Boolean);
      if (!clean.length) return;
      setApplyingInsights(true);
      try {
        const res = await fetch("/api/telegram/insights/dismiss", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ insightIds: clean }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Dismiss failed");
        if (selectedGroupId) await reloadGroupInsights(selectedGroupId);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Dismiss failed");
      } finally {
        setApplyingInsights(false);
      }
    },
    [reloadGroupInsights, selectedGroupId]
  );

  const runInsights = useCallback(
    async (groupId?: string, applyMode: "preview" | "all" = "preview") => {
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
        if (data.processingNotes) {
          if (data.geminiConfigured === false) {
            toast.warning(data.processingNotes, { duration: 8000 });
          } else {
            toast.message(data.processingNotes);
          }
        }
        if (data.messagesFetched > 0) {
          toast.message(`Fetched ${data.messagesFetched} message(s) from Telegram`);
        }

        if (groupId) {
          setGroupInsights(list);
          setTab("chats");
          await loadMessages(groupId, false, analyzeLimit);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not run insights");
      } finally {
        setAnalyzingGroup(false);
      }
    },
    [cache, analyzeLimit]
  );

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
      if (enabled) {
        toast.message("Monitor on — open the chat and tap Analyze");
      }
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
    void loadMessages(groupId, false, analyzeLimit);
    void reloadGroupInsights(groupId);
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
          </div>
        </div>

        {tab === "alerts" ? (
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
                  <strong className="text-foreground">1.</strong> Turn <strong>Monitor ON</strong> (green switch on the
                  right of each group).
                </p>
                <p>
                  <strong className="text-foreground">2.</strong> Select a group → <strong>Analyze</strong> (loads
                  messages + runs AI). Only items with real deadlines get <strong>Set deadline</strong>.
                </p>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,360px)_1fr] gap-4 min-h-[520px]">
            <Card
              className={cn(
                "glass flex flex-col overflow-hidden min-h-[400px]",
                showChatPanel ? "max-xl:hidden" : "flex"
              )}
            >
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
                          <div
                            className="flex flex-col items-center gap-1 shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Switch
                              checked={!!g.monitoringEnabled}
                              disabled={togglingGroupId === g.groupId}
                              onCheckedChange={(v) => void toggleMonitoring(g.groupId, v)}
                              aria-label={`Monitor ${g.title}`}
                            />
                            <span
                              className={cn(
                                "text-[10px] font-semibold whitespace-nowrap",
                                g.monitoringEnabled ? "text-emerald-400" : "text-muted-foreground"
                              )}
                            >
                              Monitor
                            </span>
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

            <Card
              className={cn(
                "glass flex flex-col overflow-hidden min-h-[400px]",
                !showChatPanel ? "max-xl:hidden" : "flex"
              )}
            >
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
                      <div
                        className="flex flex-col items-center gap-1 shrink-0 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Switch
                          checked={!!selectedGroup.monitoringEnabled}
                          disabled={togglingGroupId === selectedGroup.groupId}
                          onCheckedChange={(v) => void toggleMonitoring(selectedGroup.groupId, v)}
                        />
                        <span className="text-[10px] font-semibold text-foreground">Monitor</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <LoadingButton
                        size="sm"
                        variant="glow"
                        loading={analyzingGroup}
                        onClick={() => void runInsights(selectedGroup.groupId)}
                      >
                        <Sparkles className="h-4 w-4 mr-1" /> Analyze ({analyzeLimit} msgs)
                      </LoadingButton>
                      <span className="text-xs text-muted-foreground">
                        Loads from Telegram, then analyzes. Count in{" "}
                        <Link href="/dashboard/settings" className="text-primary underline">
                          Settings
                        </Link>
                        .
                      </span>
                    </div>
                  </div>
                  <ScrollArea className="flex-1 p-4 max-h-[40vh]">
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
                          loading={analyzingGroup}
                          onClick={() => void runInsights(selectedGroup.groupId)}
                        >
                          <Sparkles className="h-4 w-4 mr-1" /> Analyze ({analyzeLimit} msgs)
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
                    <div className="p-4 border-t border-white/5 overflow-y-auto max-h-[50vh]">
                      <InsightsAnalysisPanel
                        insights={groupInsights}
                        analyzedMessageCount={analyzedMsgCount}
                        processingNotes={insightNotes}
                        applying={applyingInsights}
                        onSetDeadline={(id, opts) => setDeadlineIds([id], opts.pinToOverview)}
                        onSetAllDeadlines={(ids, opts) => setDeadlineIds(ids, opts.pinToOverview)}
                        onDismiss={(ids) => dismissInsightIds(ids)}
                      />
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

