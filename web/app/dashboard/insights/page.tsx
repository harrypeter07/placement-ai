/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Settings2, RefreshCw, Building2, Clock, ExternalLink, ChevronRight } from "lucide-react";
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

  const [activeTab, setActiveTab] = useState<"feed" | "tracker">("feed");
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

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

  const toggleCompanyExpand = (coKey: string) => {
    setExpandedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(coKey)) next.delete(coKey);
      else next.add(coKey);
      return next;
    });
  };

  async function updateDeadlineStatus(id: string, newStatus: string) {
    try {
      const res = await fetch(`/api/deadlines/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      toast.success("Status updated successfully");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error updating status");
    }
  }

  return (
    <>
      <DashboardHeader title="AI Insights & Trackers" />
      <main className="p-4 lg:p-8 space-y-6 max-w-3xl pb-24">
        <p className="text-sm text-muted-foreground">
          Analyze monitored Telegram channels, auto-schedule calendar entries, and monitor company-wise placement schedules.
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
            <Building2 className="h-3.5 w-3.5 mr-1.5 text-emerald-400" /> Company Timelines ({companyTimelines.length})
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
          <div className="space-y-4">
            {companyTimelines.length === 0 ? (
              <Card className="glass">
                <CardContent className="py-12 text-center text-muted-foreground">
                  No active company timelines found. Apply some AI insights to generate timelines.
                </CardContent>
              </Card>
            ) : (
              companyTimelines.map((group) => {
                const isExpanded = expandedCompanies.has(group.key);
                const nextDeadline = group.list.find((d) => new Date(d.deadline_date).getTime() > Date.now()) || group.list[0];

                return (
                  <Card
                    key={group.key}
                    className="glass border-white/5 hover:border-white/10 transition-all overflow-hidden"
                  >
                    {/* Collapsed Thin Header Cell */}
                    <div
                      className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-white/[0.04] transition-colors"
                      onClick={() => toggleCompanyExpand(group.key)}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <Building2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        <h3 className="font-semibold text-sm text-foreground truncate">{group.company}</h3>
                        <Badge variant="outline" className="text-[10px] shrink-0 font-medium bg-emerald-500/10 text-emerald-300 border-emerald-500/20">
                          {group.list.length} date{group.list.length !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-3 shrink-0">
                        {nextDeadline && (
                          <span className="text-[10px] text-muted-foreground bg-white/5 px-2 py-0.5 rounded font-mono">
                            Next: {new Date(nextDeadline.deadline_date).toLocaleDateString("en-IN", { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                        <ChevronRight className={cn("h-4 w-4 text-muted-foreground/60 transition-transform duration-300", isExpanded && "rotate-90 text-foreground")} />
                      </div>
                    </div>

                    {/* Expanded timelines / details block */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-white/5 space-y-4 bg-white/[0.01]">
                        <div className="space-y-4 pt-2">
                          {group.list.map((dl) => (
                            <div
                              key={dl.id}
                              className="relative pl-6 pb-2 border-l border-white/10 last:border-0 last:pb-0"
                            >
                              {/* Timeline Point */}
                              <div className="absolute -left-[6.5px] top-1.5 h-3.5 w-3.5 rounded-full border border-emerald-400 bg-black flex items-center justify-center">
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              </div>

                              <div className="space-y-2">
                                <div className="flex items-start justify-between flex-wrap gap-2">
                                  <div>
                                    <h4 className="text-sm font-semibold text-foreground">
                                      {dl.role || "Hiring Drive"}
                                    </h4>
                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                                      <Clock className="h-3 w-3" />
                                      <span>Deadline: {new Date(dl.deadline_date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {/* Inline Status Toggle select */}
                                    <select
                                      value={dl.status}
                                      onChange={(e) => void updateDeadlineStatus(dl.id, e.target.value)}
                                      className="bg-black/50 border border-white/10 text-foreground text-[10px] rounded px-2 py-1 focus:outline-none focus:border-primary cursor-pointer font-medium"
                                    >
                                      <option value="pending">⏳ Pending</option>
                                      <option value="completed">✅ Applied</option>
                                      <option value="missed">❌ Missed</option>
                                    </select>
                                  </div>
                                </div>

                                {dl.eligibility && (
                                  <p className="text-xs text-muted-foreground bg-white/5 p-2 rounded border border-white/5 leading-relaxed">
                                    <strong>Eligibility:</strong> {dl.eligibility}
                                  </p>
                                )}

                                {/* Links */}
                                {dl.links && dl.links.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 pt-1">
                                    {dl.links.map((link: string, lIdx: number) => (
                                      <Button
                                        key={lIdx}
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-[10px] border-white/10 bg-white/5 text-primary hover:bg-white/10"
                                        asChild
                                      >
                                        <a href={link} target="_blank" rel="noopener noreferrer">
                                          <ExternalLink className="h-3 w-3 mr-1" /> Register / Form Link
                                        </a>
                                      </Button>
                                    ))}
                                  </div>
                                )}

                                {/* Collapsible Announcement snippet */}
                                {dl.notes && (
                                  <div className="pt-1.5">
                                    <details className="group/details">
                                      <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground list-none flex items-center gap-1 select-none font-medium">
                                        <ChevronRight className="h-3 w-3 transition-transform duration-200 group-open/details:rotate-90" />
                                        <span>Show original Telegram text</span>
                                      </summary>
                                      <p className="text-[11px] whitespace-pre-wrap text-muted-foreground bg-black/30 p-2.5 rounded border border-white/5 leading-relaxed mt-1.5 font-mono max-h-48 overflow-y-auto">
                                        {dl.notes.replace(/^From Telegram insight: [^\n]+\n/i, "")}
                                      </p>
                                    </details>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        )}
      </main>
    </>
  );
}
