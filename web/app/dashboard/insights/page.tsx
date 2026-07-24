/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { 
  Sparkles, 
  Settings2, 
  RefreshCw, 
  Building2, 
  Clock, 
  ExternalLink, 
  ChevronRight, 
  ChevronLeft,
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Film, 
  CheckCircle2, 
  AlertCircle,
  Calendar
} from "lucide-react";
import { DashboardHeader } from "@/components/dashboard/sidebar";
import { InsightsAnalysisPanel, type InsightRow } from "@/components/telegram/insights-analysis-panel";
import { insightIdString } from "@/lib/insight-utils";
import { LoadingButton } from "@/components/ui/loading-button";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export default function InsightsPage() {
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [messageLimit, setMessageLimit] = useState(25);
  const [sinceDate, setSinceDate] = useState("");
  const [notes, setNotes] = useState("");
  const [analyzedCount, setAnalyzedCount] = useState<number | undefined>();
  const autoRan = useRef(false);

  const [deadlines, setDeadlines] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"feed" | "tracker">("feed");

  // Timeline Studio States
  const [selectedCompanyKey, setSelectedCompanyKey] = useState<string | null>(null);
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const load = useCallback(() => {
    setLoading(true);
    const p1 = fetch("/api/telegram/insights", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setInsights(d);
      })
      .catch((e) => console.error("Error loading insights:", e));

    const p2 = fetch("/api/deadlines", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setDeadlines(d);
      })
      .catch((e) => console.error("Error loading deadlines:", e));

    Promise.all([p1, p2]).finally(() => setLoading(false));
  }, []);

  const runAnalysis = useCallback(
    async (limitOverride?: number) => {
      setRunning(true);
      try {
        const res = await fetch("/api/telegram/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageLimit: limitOverride ?? messageLimit,
            sinceDate: sinceDate || undefined,
            applyMode: "preview",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Analysis failed");
        const list = Array.isArray(data.insights) ? data.insights : [];
        setInsights(list);
        setNotes(data.processingNotes || "");
        setAnalyzedCount(data.analyzedMessageCount);
        toast.success(
          `Generated ${list.length} insight(s) from ${data.analyzedMessageCount ?? "?"} messages — review below`
        );
        if (data.messagesFetched > 0) {
          toast.message(`Loaded ${data.messagesFetched} message(s) from Telegram`);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not analyze");
      } finally {
        setRunning(false);
      }
    },
    [messageLimit, sinceDate]
  );

  useEffect(() => {
    load();
    fetch("/api/settings")
      .then((r) => r.json())
      .then((p) => {
        const limit = p.telegram?.insightMessageCount ?? 25;
        setMessageLimit(limit);
        if (p.telegram?.insightSinceDate) {
          setSinceDate(new Date(p.telegram.insightSinceDate).toISOString().slice(0, 10));
        }
        if (p.telegram?.autoInsights !== false && !autoRan.current) {
          autoRan.current = true;
          void runAnalysis(limit);
        }
      });
  }, [load, runAnalysis]);

  async function setDeadlineIds(ids: string[], pinToOverview: boolean) {
    const clean = ids.map(insightIdString).filter(Boolean);
    if (!clean.length) {
      toast.error("No valid deadlines to set");
      return;
    }
    setApplying(true);
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
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setApplying(false);
    }
  }

  async function dismissIds(ids: string[]) {
    const clean = ids.map(insightIdString).filter(Boolean);
    if (!clean.length) return;
    setApplying(true);
    try {
      const res = await fetch("/api/telegram/insights/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insightIds: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dismiss failed");
      toast.message(`Dismissed ${data.dismissed} item(s)`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dismiss failed");
    } finally {
      setApplying(false);
    }
  }

  const companyTimelines = useCallback(() => {
    const groups: Record<string, any[]> = {};
    deadlines.forEach((dl) => {
      const co = (dl.company || "Placement Update").trim();
      const key = co.toLowerCase();
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(dl);
    });
    return Object.entries(groups).map(([key, list]) => ({
      key,
      company: list[0].company || "Placement Update",
      list: list.sort((a, b) => new Date(a.deadline_date).getTime() - new Date(b.deadline_date).getTime()),
    })).sort((a, b) => a.company.localeCompare(b.company));
  }, [deadlines])();

  // Set default selected company if not set
  useEffect(() => {
    if (companyTimelines.length > 0 && !selectedCompanyKey) {
      setSelectedCompanyKey(companyTimelines[0].key);
    }
  }, [companyTimelines, selectedCompanyKey]);

  const activeGroup = companyTimelines.find((g) => g.key === selectedCompanyKey) || companyTimelines[0];
  const activeEvents = activeGroup?.list || [];
  const currentEvent = activeEvents[activeStepIdx] || activeEvents[0];

  // Auto-play / Tour effect across timeline steps
  useEffect(() => {
    if (!isPlaying || !activeEvents.length) return;
    const timer = setInterval(() => {
      setActiveStepIdx((prev) => {
        if (prev >= activeEvents.length - 1) {
          setIsPlaying(false);
          return 0;
        }
        return prev + 1;
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [isPlaying, activeEvents.length]);

  async function updateDeadlineStatus(id: string, newStatus: string) {
    try {
      const res = await fetch(`/api/deadlines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      toast.success("Status updated successfully");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error updating status");
    }
  }

  return (
    <>
      <DashboardHeader title="AI Insights & Trackers" />
      <main className="p-4 lg:p-8 space-y-6 max-w-5xl pb-24">
        <p className="text-sm text-muted-foreground">
          Analyze monitored Telegram channels, auto-schedule calendar entries, and monitor company-wise placement schedules in an interactive studio editor.
        </p>

        {/* Custom Tab Switcher */}
        <div className="flex bg-white/5 p-1 rounded-lg border border-white/10 w-fit gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 text-xs font-semibold px-4 transition-all duration-200",
              activeTab === "feed"
                ? "bg-primary/20 border border-primary/30 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("feed")}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1.5 text-primary" /> AI Insights Feed
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 text-xs font-semibold px-4 transition-all duration-200",
              activeTab === "tracker"
                ? "bg-primary/20 border border-primary/30 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab("tracker")}
          >
            <Film className="h-3.5 w-3.5 mr-1.5 text-emerald-400" /> Timeline Studio ({companyTimelines.length})
          </Button>
        </div>

        {activeTab === "feed" ? (
          <>
            <Card className="glass">
              <CardContent className="pt-6 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Messages per group to analyze</Label>
                    <Input
                      type="number"
                      min={5}
                      max={100}
                      value={messageLimit}
                      onChange={(e) => setMessageLimit(Number(e.target.value) || 25)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Only messages since (optional)</Label>
                    <Input type="date" value={sinceDate} onChange={(e) => setSinceDate(e.target.value)} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <LoadingButton variant="glow" loading={running} onClick={() => void runAnalysis(messageLimit)}>
                    <Sparkles className="h-4 w-4 mr-1" /> Analyze monitored groups
                  </LoadingButton>
                  <Button variant="outline" size="sm" onClick={load}>
                    <RefreshCw className="h-4 w-4 mr-1" /> Refresh list
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/dashboard/notifications">
                      <Settings2 className="h-4 w-4 mr-1" /> Notifications / chats
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {loading && !insights.length ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : (
              <InsightsAnalysisPanel
                insights={insights}
                analyzedMessageCount={analyzedCount}
                processingNotes={notes}
                applying={applying}
                onSetDeadline={(id, { pinToOverview }) => setDeadlineIds([id], pinToOverview)}
                onSetAllDeadlines={(ids, { pinToOverview }) => setDeadlineIds(ids, pinToOverview)}
                onDismiss={(ids) => dismissIds(ids)}
              />
            )}

            {!loading && !insights.length && (
              <Card className="glass">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No insights yet. Run analysis to parse monitored Telegram groups.
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <div className="space-y-6">
            {companyTimelines.length === 0 ? (
              <Card className="glass">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No active company timelines found. Apply some AI insights to generate timelines.
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Company Selector Chips Bar */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                  <span className="text-xs font-semibold text-muted-foreground shrink-0 flex items-center gap-1 mr-1">
                    <Building2 className="h-3.5 w-3.5 text-primary" /> Company Drive:
                  </span>
                  {companyTimelines.map((group) => (
                    <button
                      key={group.key}
                      onClick={() => {
                        setSelectedCompanyKey(group.key);
                        setActiveStepIdx(0);
                        setIsPlaying(false);
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap flex items-center gap-1.5",
                        group.key === activeGroup?.key
                          ? "bg-primary/20 border-primary text-foreground shadow-md shadow-primary/10"
                          : "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10"
                      )}
                    >
                      <span>{group.company}</span>
                      <span className="text-[10px] bg-black/40 px-1.5 py-0.2 rounded font-mono text-emerald-400">
                        {group.list.length}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Video Editor Stage Preview Box */}
                <div className="bg-zinc-950 border border-white/10 rounded-2xl p-6 shadow-2xl space-y-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 h-40 w-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

                  {/* Stage Top Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                          {activeGroup?.company}
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
                            Active Drive
                          </Badge>
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          Recruitment Event {activeStepIdx + 1} of {activeEvents.length}
                        </p>
                      </div>
                    </div>

                    {/* Stage Progress Bar Badge */}
                    <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                          <span>PROGRESS</span>
                          <span>{Math.round(((activeStepIdx + 1) / activeEvents.length) * 100)}%</span>
                        </div>
                        <div className="w-28 h-2 bg-white/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-emerald-500 to-primary transition-all duration-300"
                            style={{ width: `${((activeStepIdx + 1) / activeEvents.length) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stage Canvas Player Screen */}
                  {currentEvent ? (
                    <div className="space-y-4 bg-black/60 rounded-xl p-5 border border-white/5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-mono tracking-widest text-primary font-bold">
                            Stage Preview Card
                          </span>
                          <h3 className="text-xl font-bold text-foreground">
                            {currentEvent.role || "Hiring Drive"}
                          </h3>
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-0.5">
                            <Clock className="h-3.5 w-3.5 text-emerald-400" />
                            <strong>Deadline:</strong> {new Date(currentEvent.deadline_date).toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })}
                          </p>
                        </div>

                        {/* Live Status Selector */}
                        <div className="flex items-center gap-2 bg-white/5 p-2 rounded-lg border border-white/10">
                          <Label className="text-xs text-muted-foreground font-medium">Status:</Label>
                          <select
                            value={currentEvent.status || "pending"}
                            onChange={(e) => void updateDeadlineStatus(currentEvent.id, e.target.value)}
                            className="bg-zinc-900 border border-white/20 text-foreground text-xs rounded px-2.5 py-1 focus:outline-none focus:border-primary cursor-pointer font-semibold"
                          >
                            <option value="pending">⏳ Pending</option>
                            <option value="applied">✅ Applied</option>
                            <option value="oa_scheduled">📝 OA Scheduled</option>
                            <option value="interview_scheduled">🎯 Interview Scheduled</option>
                            <option value="rejected">❌ Rejected</option>
                            <option value="missed">⚠️ Missed</option>
                          </select>
                        </div>
                      </div>

                      {/* Eligibility Section */}
                      {currentEvent.eligibility && (
                        <div className="p-3 bg-white/5 rounded-lg border border-white/5 text-xs text-muted-foreground leading-relaxed">
                          <strong className="text-foreground">Eligibility Criteria:</strong> {currentEvent.eligibility}
                        </div>
                      )}

                      {/* Form / Registration Link Buttons */}
                      {currentEvent.links && currentEvent.links.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {currentEvent.links.map((link: string, lIdx: number) => (
                            <Button
                              key={lIdx}
                              variant="glow"
                              size="sm"
                              className="text-xs font-semibold"
                              asChild
                            >
                              <a href={link} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open Application / Form Link
                              </a>
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* Source Message Preview Box */}
                      {currentEvent.notes && (
                        <details className="group/details pt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground list-none flex items-center gap-1 font-medium select-none">
                            <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-open/details:rotate-90 text-primary" />
                            <span>Inspect Raw Announcement Text</span>
                          </summary>
                          <div className="mt-2 text-xs font-mono text-muted-foreground bg-zinc-900/90 p-3 rounded-lg border border-white/5 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                            {currentEvent.notes.replace(/^From Telegram insight: [^\n]+\n/i, "")}
                          </div>
                        </details>
                      )}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-muted-foreground text-sm">
                      Select a valid step from the timeline track below.
                    </div>
                  )}

                  {/* Stage Bottom Scrubber Controls Bar */}
                  <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/10">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 border-white/10"
                        onClick={() => setActiveStepIdx(0)}
                        disabled={activeStepIdx === 0}
                      >
                        <SkipBack className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-white/10 px-3"
                        onClick={() => setActiveStepIdx((prev) => Math.max(0, prev - 1))}
                        disabled={activeStepIdx === 0}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" /> Prev Step
                      </Button>
                      <Button
                        variant={isPlaying ? "glow" : "outline"}
                        size="sm"
                        className="h-8 text-xs px-4"
                        onClick={() => setIsPlaying(!isPlaying)}
                      >
                        {isPlaying ? (
                          <>
                            <Pause className="h-3.5 w-3.5 mr-1.5 fill-current" /> Pause Tour
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5 mr-1.5 fill-current" /> Auto Tour
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-white/10 px-3"
                        onClick={() => setActiveStepIdx((prev) => Math.min(activeEvents.length - 1, prev + 1))}
                        disabled={activeStepIdx >= activeEvents.length - 1}
                      >
                        Next Step <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 border-white/10"
                        onClick={() => setActiveStepIdx(activeEvents.length - 1)}
                        disabled={activeStepIdx >= activeEvents.length - 1}
                      >
                        <SkipForward className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="text-xs font-mono text-muted-foreground">
                      Step <span className="text-foreground font-bold">{activeStepIdx + 1}</span> / {activeEvents.length}
                    </div>
                  </div>

                  {/* Horizontal Timeline Track Bar */}
                  <div className="space-y-3 pt-4 border-t border-white/5">
                    <div className="flex items-center justify-between text-xs font-mono text-muted-foreground">
                      <span className="flex items-center gap-1.5 font-semibold text-foreground">
                        <Film className="h-3.5 w-3.5 text-emerald-400" /> TIMELINE TRACK SCRUBBER
                      </span>
                      <span>Click any node to jump</span>
                    </div>

                    <div className="relative py-4 px-2 bg-black/40 rounded-xl border border-white/5 overflow-x-auto">
                      {/* Connecting Progress Line */}
                      <div className="absolute top-1/2 left-8 right-8 h-1 bg-white/10 -translate-y-1/2 rounded" />
                      <div 
                        className="absolute top-1/2 left-8 h-1 bg-gradient-to-r from-emerald-500 to-primary -translate-y-1/2 rounded transition-all duration-300"
                        style={{
                          width: activeEvents.length > 1
                            ? `${(activeStepIdx / (activeEvents.length - 1)) * 85}%`
                            : "100%"
                        }}
                      />

                      {/* Nodes Container */}
                      <div className="relative flex items-center justify-between min-w-[500px] px-4">
                        {activeEvents.map((ev, idx) => {
                          const isActive = idx === activeStepIdx;
                          const isDone = ev.status === "applied" || idx < activeStepIdx;

                          return (
                            <button
                              key={ev.id || idx}
                              onClick={() => {
                                setActiveStepIdx(idx);
                                setIsPlaying(false);
                              }}
                              className="group flex flex-col items-center gap-2 focus:outline-none"
                            >
                              {/* Step Node Dot */}
                              <div
                                className={cn(
                                  "h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all duration-200 relative",
                                  isActive
                                    ? "border-primary bg-primary/20 text-foreground scale-110 shadow-[0_0_12px_rgba(99,102,241,0.5)] ring-4 ring-primary/20"
                                    : isDone
                                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                                    : "border-white/20 bg-zinc-900 text-muted-foreground group-hover:border-white/40"
                                )}
                              >
                                {isDone && !isActive ? (
                                  <CheckCircle2 className="h-4 w-4" />
                                ) : (
                                  <span className="text-xs font-bold font-mono">{idx + 1}</span>
                                )}

                                {isActive && (
                                  <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping" />
                                )}
                              </div>

                              {/* Label under node */}
                              <div className="text-center space-y-0.5">
                                <p className={cn(
                                  "text-xs font-semibold max-w-[100px] truncate transition-colors",
                                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                                )}>
                                  {ev.role || `Step ${idx + 1}`}
                                </p>
                                <p className="text-[10px] font-mono text-muted-foreground/80">
                                  {new Date(ev.deadline_date).toLocaleDateString("en-IN", { day: 'numeric', month: 'short' })}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}

